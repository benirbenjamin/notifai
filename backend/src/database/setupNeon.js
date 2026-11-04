const { pool } = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupNeonDatabase() {
  console.log('🐘 Initializing Neon DB (PostgreSQL) schema for Notifai space...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(50),
        role VARCHAR(20) DEFAULT 'USER', -- USER, ADMIN
        email_notifications BOOLEAN DEFAULT TRUE,
        push_notifications BOOLEAN DEFAULT TRUE,
        plan_id INT DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Subscription Plans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        max_tasks INT NOT NULL DEFAULT 10, -- Task limit quota
        has_push BOOLEAN DEFAULT TRUE,
        has_email BOOLEAN DEFAULT TRUE,
        has_offline BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Plan Duration Tiers (1 month, 3 months, 6 months, 12 months)
    await client.query(`
      CREATE TABLE IF NOT EXISTS plan_duration_tiers (
        id SERIAL PRIMARY KEY,
        plan_id INT REFERENCES subscription_plans(id) ON DELETE CASCADE,
        duration_months INT NOT NULL, -- 1, 3, 6, 12
        price NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. User Subscriptions (Tracks paid plan, duration, flutterwave transaction, task limit)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        plan_id INT REFERENCES subscription_plans(id),
        tier_id INT REFERENCES plan_duration_tiers(id),
        duration_months INT NOT NULL,
        start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        task_limit INT NOT NULL,
        amount_paid NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        payment_provider VARCHAR(50) DEFAULT 'flutterwave',
        flutterwave_tx_ref VARCHAR(255),
        flutterwave_transaction_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active', -- active, expired, cancelled
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Tasks table (Replaces legacy activities, supports offline sync, timed, payment, reminder)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        local_id VARCHAR(100), -- device local SQLite ID
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) DEFAULT 'general', -- general, timed, payment, purchase, recurring
        category VARCHAR(100),
        priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        due_date TIMESTAMP WITH TIME ZONE,
        reminder_time TIMESTAMP WITH TIME ZONE,
        reminder_minutes INT DEFAULT 0,
        progress_percentage INT DEFAULT 0,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP WITH TIME ZONE,
        
        -- Payment tracking
        total_amount NUMERIC(10, 2) DEFAULT 0.00,
        paid_amount NUMERIC(10, 2) DEFAULT 0.00,
        remaining_amount NUMERIC(10, 2) DEFAULT 0.00,
        
        -- Purchase & Recurring
        target_item VARCHAR(255),
        recurring_type VARCHAR(50), -- daily, weekly, monthly
        
        -- Reminder Overlay & Snooze status
        reminder_action VARCHAR(50) DEFAULT 'NONE', -- NONE, OKAY_I_KNOW, REMIND_30_MIN, DONT_REMIND
        snoozed_until TIMESTAMP WITH TIME ZONE,
        last_reminder_sent_at TIMESTAMP WITH TIME ZONE,
        
        -- Offline Sync metadata
        version INT DEFAULT 1,
        deleted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Subtasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Reminders queue & log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_sent BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP WITH TIME ZONE,
        action_taken VARCHAR(50) DEFAULT 'NONE', -- OKAY_I_KNOW, REMIND_30_MIN, DONT_REMIND
        snoozed_until TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Push Tokens for Expo Mobile App & Web Push
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        platform VARCHAR(20) NOT NULL, -- android, ios, web
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Notifications history
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        type VARCHAR(50) DEFAULT 'task_reminder',
        is_read BOOLEAN DEFAULT FALSE,
        data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 10. App Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_reminder_time ON tasks(reminder_time);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reminders_trigger_at ON reminders(trigger_at, is_sent);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON user_subscriptions(user_id, status);`);

    await client.query('COMMIT');
    console.log('✅ Neon DB PostgreSQL tables and indexes created successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Neon DB Schema initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function seedInitialData() {
  console.log('🌱 Seeding initial plans, duration tiers, and admin user...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Seed Subscription Plans
    const plansResult = await client.query(`
      INSERT INTO subscription_plans (id, name, description, max_tasks, has_push, has_email, has_offline, is_active)
      VALUES 
        (1, 'Free Starter', 'Free access with up to 10 active tasks', 10, true, true, true, true),
        (2, 'Pro Productivity', 'Expanded limit up to 100 active tasks with full deadline alerts', 100, true, true, true, true),
        (3, 'Power Unlimited', 'Unlimited tasks (up to 10,000 tasks) with priority notifications', 10000, true, true, true, true)
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        max_tasks = EXCLUDED.max_tasks,
        description = EXCLUDED.description;
    `);

    // Reset sequence for subscription_plans if needed
    await client.query(`SELECT setval(pg_get_serial_sequence('subscription_plans', 'id'), (SELECT MAX(id) FROM subscription_plans));`);

    // 2. Seed Duration Tiers: 1 month, 3 months, 6 months, 12 months for Plan 2 (Pro) and Plan 3 (Power)
    // Clear and re-insert tiers
    const tierCheck = await client.query(`SELECT COUNT(*) FROM plan_duration_tiers`);
    if (parseInt(tierCheck.rows[0].count) === 0) {
      // Pro Plan Tiers (Plan ID 2)
      await client.query(`
        INSERT INTO plan_duration_tiers (plan_id, duration_months, price, currency)
        VALUES 
          (2, 1, 4.99, 'USD'),
          (2, 3, 12.99, 'USD'),
          (2, 6, 23.99, 'USD'),
          (2, 12, 44.99, 'USD'),
          (3, 1, 9.99, 'USD'),
          (3, 3, 26.99, 'USD'),
          (3, 6, 49.99, 'USD'),
          (3, 12, 89.99, 'USD');
      `);
    }

    // 3. Seed Admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@notifai.space';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, plan_id)
      VALUES ($1, $2, 'Admin', 'Notifai', 'ADMIN', 3)
      ON CONFLICT (email) DO UPDATE SET 
        role = 'ADMIN',
        plan_id = 3;
    `, [adminEmail, passwordHash]);

    // 4. Seed Default App Settings
    await client.query(`
      INSERT INTO app_settings (key, value, description)
      VALUES 
        ('app_name', 'Notifai space', 'Official application name'),
        ('offline_sync_grace_hours', '72', 'Max hours allowed without internet before forced sync'),
        ('default_reminder_minutes', '30', 'Default advance reminder alert in minutes'),
        ('flutterwave_currency', 'USD', 'Default currency for subscription transactions')
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('🎉 Initial seed completed successfully!');
    console.log(`🔑 Admin Login: ${adminEmail} | Password: ${adminPassword}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding error:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  setupNeonDatabase()
    .then(() => seedInitialData())
    .then(() => {
      console.log('✅ Setup script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { setupNeonDatabase, seedInitialData };
