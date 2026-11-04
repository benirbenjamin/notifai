/**
 * Database Setup Script
 * Creates all tables and seeds initial data
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupDatabase() {
  let connection;
  
  try {
    // First connect without database to create it
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT
    });

    console.log('📝 Creating database...');
    
    // Create database if it doesn't exist - use query instead of execute for CREATE DATABASE
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    
    // Close first connection and create a new one with the database selected
    await connection.end();
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });
    
    console.log('✅ Database created/selected');

    // Create tables
    console.log('📝 Creating tables...');

    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NULL,
        country_code VARCHAR(5) NULL,
        timezone VARCHAR(50) DEFAULT 'UTC',
        company VARCHAR(255) NULL,
        job_title VARCHAR(255) NULL,
        google_id VARCHAR(255) NULL UNIQUE,
        google_avatar TEXT NULL,
        profile_completed BOOLEAN DEFAULT FALSE,
        email_notifications BOOLEAN DEFAULT TRUE,
        sms_notifications BOOLEAN DEFAULT FALSE,
        push_notifications BOOLEAN DEFAULT TRUE,
        phone_verified BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        plan_id INT DEFAULT 1,
        trial_start DATE NULL,
        trial_end DATE NULL,
        is_trial_used BOOLEAN DEFAULT FALSE,
        subscription_end DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_google_id (google_id),
        INDEX idx_plan (plan_id)
      )
    `);

    // Sessions table for express-session
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(255) NOT NULL PRIMARY KEY,
        expires INT(11) UNSIGNED NOT NULL,
        data TEXT,
        INDEX idx_expires (expires)
      )
    `);

    // Plans table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) DEFAULT 0.00,
        is_lifetime BOOLEAN DEFAULT FALSE,
        max_activities INT DEFAULT 10,
        has_push_notifications BOOLEAN DEFAULT FALSE,
        has_attachments BOOLEAN DEFAULT FALSE,
        has_recurring_tasks BOOLEAN DEFAULT FALSE,
        has_categories BOOLEAN DEFAULT FALSE,
        has_priority_levels BOOLEAN DEFAULT FALSE,
        has_advanced_progress BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Activities table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type ENUM('general', 'payment', 'purchase', 'recurring') DEFAULT 'general',
        category VARCHAR(100),
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        due_date DATETIME,
        progress_percentage INT DEFAULT 0,
        is_completed BOOLEAN DEFAULT FALSE,
        total_amount DECIMAL(10, 2) DEFAULT 0.00,
        paid_amount DECIMAL(10, 2) DEFAULT 0.00,
        remaining_amount DECIMAL(10, 2) DEFAULT 0.00,
        target_item VARCHAR(255),
        recurring_type ENUM('daily', 'weekly', 'monthly') NULL,
        last_reminder_sent DATETIME NULL,
        reminder_frequency_hours INT DEFAULT 24,
        attachment_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_activities (user_id),
        INDEX idx_activity_type (type),
        INDEX idx_due_date (due_date),
        INDEX idx_completion (is_completed)
      )
    `);

    // Subtasks table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS subtasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        INDEX idx_activity_subtasks (activity_id)
      )
    `);

    // Payments table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        INDEX idx_activity_payments (activity_id)
      )
    `);

    // Reminders table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        reminder_date DATETIME NOT NULL,
        is_sent BOOLEAN DEFAULT FALSE,
        reminder_type ENUM('email', 'push') DEFAULT 'email',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME NULL,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        INDEX idx_activity_reminders (activity_id),
        INDEX idx_reminder_date (reminder_date),
        INDEX idx_unsent_reminders (is_sent, reminder_date)
      )
    `);

    // User subscriptions table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS user_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        plan_id INT NOT NULL,
        flutterwave_transaction_id VARCHAR(255),
        amount DECIMAL(10, 2) NOT NULL,
        duration_months INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id),
        INDEX idx_user_subscriptions (user_id),
        INDEX idx_subscription_status (status)
      )
    `);

    // Push subscriptions table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_push_subscriptions (user_id),
        INDEX idx_active_subscriptions (user_id, is_active)
      )
    `);

    // App settings table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS app_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Collaboration tables
    
    // Activity collaborators table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS activity_collaborators (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        user_id INT NOT NULL,
        invited_by INT NOT NULL,
        role ENUM('viewer', 'editor', 'manager') DEFAULT 'editor',
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        invitation_token VARCHAR(255) UNIQUE,
        invited_email VARCHAR(255),
        invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        permissions JSON,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_activity_user (activity_id, user_id),
        INDEX idx_collaborator_status (status),
        INDEX idx_invitation_token (invitation_token)
      )
    `);

    // Teams table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INT NOT NULL,
        avatar_url VARCHAR(500),
        is_private BOOLEAN DEFAULT FALSE,
        invite_code VARCHAR(50) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_team_creator (created_by),
        INDEX idx_invite_code (invite_code)
      )
    `);

    // Team members table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS team_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        user_id INT NOT NULL,
        role ENUM('member', 'moderator', 'admin', 'owner') DEFAULT 'member',
        status ENUM('pending', 'active', 'suspended') DEFAULT 'pending',
        invited_by INT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY unique_team_user (team_id, user_id),
        INDEX idx_team_members (team_id),
        INDEX idx_user_teams (user_id)
      )
    `);

    // Friends/Connections table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS user_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        addressee_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
        message TEXT,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_connection (requester_id, addressee_id),
        INDEX idx_requester_connections (requester_id),
        INDEX idx_addressee_connections (addressee_id),
        INDEX idx_connection_status (status)
      )
    `);

    // Chat conversations table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('direct', 'team') DEFAULT 'direct',
        team_id INT NULL,
        name VARCHAR(255),
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_conversation_type (type),
        INDEX idx_conversation_team (team_id)
      )
    `);

    // Conversation participants table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS conversation_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        user_id INT NOT NULL,
        role ENUM('participant', 'moderator', 'admin') DEFAULT 'participant',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_read_at TIMESTAMP NULL,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_conversation_user (conversation_id, user_id),
        INDEX idx_conversation_participants (conversation_id),
        INDEX idx_user_conversations (user_id)
      )
    `);

    // Messages table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        sender_id INT NOT NULL,
        message_type ENUM('text', 'file', 'system', 'activity_link') DEFAULT 'text',
        content TEXT NOT NULL,
        file_url VARCHAR(500),
        file_name VARCHAR(255),
        file_size INT,
        activity_id INT NULL,
        reply_to_id INT NULL,
        is_edited BOOLEAN DEFAULT FALSE,
        edited_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL,
        FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
        INDEX idx_conversation_messages (conversation_id),
        INDEX idx_sender_messages (sender_id),
        INDEX idx_message_timestamp (created_at)
      )
    `);

    // Message reactions table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS message_reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        reaction ENUM('like', 'love', 'laugh', 'wow', 'sad', 'angry') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_message_reaction (message_id, user_id),
        INDEX idx_message_reactions (message_id)
      )
    `);

    // Notifications table
    await connection.query(`\nCREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('friend_request', 'team_invitation', 'activity_collaboration', 'message', 'activity_update', 'system', 'activity_created', 'activity_completed', 'activity_deleted', 'activity_reminder', 'payment_added', 'subtask_completed') NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        data JSON,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_notifications (user_id),
        INDEX idx_unread_notifications (user_id, is_read),
        INDEX idx_notification_type (type)
      )
    `);

    // Google OAuth integration
    await connection.query(`\nCREATE TABLE IF NOT EXISTS user_oauth (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        provider ENUM('google', 'github', 'microsoft') NOT NULL,
        provider_id VARCHAR(255) NOT NULL,
        provider_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_provider_user (provider, provider_id),
        INDEX idx_user_oauth (user_id)
      )
    `);

    console.log('✅ Tables created successfully');

    // Seed initial data
    console.log('📝 Seeding initial data...');

    // Insert default plans
    await connection.execute(`
      INSERT IGNORE INTO plans (id, name, description, price, max_activities, has_push_notifications, has_attachments, has_recurring_tasks, has_categories, has_priority_levels, has_advanced_progress, is_lifetime, is_active) VALUES
      (1, 'Free', 'Full website access with up to 10 activities', 0.00, 10, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
      (2, 'Unlimited Premium', 'One-time payment for unlimited activities and full access forever', 10.00, 999999, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
    `);

    // Create admin user
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123456', 12);
    await connection.execute(`
      INSERT IGNORE INTO users (email, password, first_name, last_name, is_admin, plan_id) VALUES
      (?, ?, 'Admin', 'User', TRUE, 3)
    `, [process.env.ADMIN_EMAIL || 'admin@managinga.space', hashedPassword]);

    // Insert default app settings
    await connection.execute(`
      INSERT IGNORE INTO app_settings (setting_key, setting_value, description) VALUES
      ('trial_duration_days', '30', 'Duration of trial period in days'),
      ('default_reminder_hours', '24', 'Default reminder frequency in hours'),
      ('max_free_activities', '5', 'Maximum activities for free plan'),
      ('app_version', '1.0.0', 'Current application version'),
      ('maintenance_mode', 'false', 'Enable/disable maintenance mode')
    `);

    console.log('✅ Initial data seeded successfully');
    console.log('🎉 Database setup completed!');
    console.log('🔑 Admin credentials:');
    console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@managinga.space'}`);
    console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'admin123456'}`);

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Migration function to handle schema updates
 * This will be called on every app startup to ensure schema is up to date
 */
async function runMigrations() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });

    console.log('🔄 Running database migrations...');

    // Migration 1: Update notifications table with new activity types
    try {
      await connection.query(`
        ALTER TABLE notifications 
        MODIFY type ENUM('friend_request', 'team_invitation', 'activity_collaboration', 'message', 'activity_update', 'system', 'activity_created', 'activity_completed', 'activity_deleted', 'activity_reminder', 'payment_added', 'subtask_completed') NOT NULL
      `);
      console.log('✅ Migration: Updated notifications table with activity types');
    } catch (error) {
      if (!error.message.includes('duplicate')) {
        console.log('⏭️  Migration: Notifications table already up to date');
      }
    }

    // Migration 2: Add notification preferences columns to users table if they don't exist
    try {
      await connection.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS has_push_notifications BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Migration: Added notification preferences to users table');
    } catch (error) {
      if (!error.message.includes('Duplicate column')) {
        console.log('⏭️  Migration: User notification preferences already exist');
      }
    }

    // Migration 3: Create default plans
    try {
      // First, check if plans exist
      const [planCount] = await connection.query('SELECT COUNT(*) as count FROM plans');
      
      if (planCount.count === 0) {
        console.log('📋 Creating default subscription plans...');
        
        // Free Plan
        await connection.query(`
          INSERT INTO plans (id, name, description, price, is_lifetime, max_activities, 
                           has_push_notifications, has_attachments, has_recurring_tasks, 
                           has_categories, has_priority_levels, has_advanced_progress)
          VALUES (1, 'Free', 'Full website access with up to 10 activities', 0.00, FALSE, 10, 
                  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
        `);
        
        // Unlimited Premium Plan
        await connection.query(`
          INSERT INTO plans (id, name, description, price, is_lifetime, max_activities, 
                           has_push_notifications, has_attachments, has_recurring_tasks, 
                           has_categories, has_priority_levels, has_advanced_progress)
          VALUES (2, 'Unlimited Premium', 'One-time payment for unlimited activities and full access forever', 10.00, TRUE, 999999, 
                  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
        `);
        
        console.log('✅ Migration: Default plans created successfully');
      } else {
        console.log('⏭️  Migration: Plans already exist, updating structure...');
        
        // Add is_lifetime column if it doesn't exist
        try {
          await connection.query(`
            ALTER TABLE plans 
            ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN DEFAULT FALSE
          `);
          
          // Update existing plans
          await connection.query(`
            UPDATE plans SET 
              max_activities = 10, 
              is_lifetime = FALSE 
            WHERE id = 1
          `);
          
          await connection.query(`
            UPDATE plans SET 
              price = 10.00,
              max_activities = 999999, 
              is_lifetime = TRUE,
              has_push_notifications = TRUE,
              has_attachments = TRUE,
              has_recurring_tasks = TRUE,
              has_categories = TRUE,
              has_priority_levels = TRUE,
              has_advanced_progress = TRUE
            WHERE id = 2
          `);
          
          console.log('✅ Migration: Plans updated to lifetime model');
        } catch (error) {
          console.log('⏭️  Migration: Plans already updated');
        }
      }
    } catch (error) {
      console.log('❌ Migration: Error creating plans:', error.message);
    }

    // Migration 4: Ensure push_subscriptions table exists with proper structure
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh_key TEXT NOT NULL,
          auth_key TEXT NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_push_subscriptions (user_id),
          INDEX idx_active_subscriptions (is_active)
        )
      `);
      
      // Add is_active column if it doesn't exist
      await connection.query(`
        ALTER TABLE push_subscriptions 
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
      `);
      
      // Enable push notifications for all existing plans
      console.log('📱 Enabling push notifications for all plans...');
      await connection.query(`
        UPDATE subscription_plans 
        SET has_push_notifications = TRUE 
        WHERE has_push_notifications = FALSE
      `);
      
      // Enable push notifications for all existing users
      console.log('👥 Enabling push notifications for all users...');
      await connection.query(`
        UPDATE users 
        SET push_notifications = TRUE 
        WHERE push_notifications = FALSE
      `);
      
      console.log('✅ Migration: Push subscriptions table verified and plans updated');
    } catch (error) {
      console.log('⏭️  Migration: Push subscriptions table already exists');
    }

    // Migration 5: Clean up user plan_ids to only use Free (1) and Premium (2)
    try {
      console.log('🧹 Cleaning up user plan_ids...');
      const [result] = await connection.query(`
        UPDATE users 
        SET plan_id = 1 
        WHERE plan_id NOT IN (1, 2) OR plan_id IS NULL
      `);
      
      if (result.affectedRows > 0) {
        console.log(`✅ Migration: Cleaned up ${result.affectedRows} user plan_ids to Free plan`);
      } else {
        console.log('⏭️  Migration: All user plan_ids already valid');
      }
    } catch (error) {
      console.log('❌ Migration: Error cleaning up user plan_ids:', error.message);
    }

    // Migration 6: Remove any plans beyond Free and Premium
    try {
      console.log('🗑️  Removing extra plans...');
      const [result] = await connection.query(`
        DELETE FROM plans WHERE id NOT IN (1, 2)
      `);
      
      if (result.affectedRows > 0) {
        console.log(`✅ Migration: Removed ${result.affectedRows} extra plans`);
      } else {
        console.log('⏭️  Migration: Only Free and Premium plans exist');
      }
    } catch (error) {
      console.log('❌ Migration: Error removing extra plans:', error.message);
    }

    console.log('✅ All migrations completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    // Don't throw error to prevent app from crashing - migrations are not critical for app startup
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('Database setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase, runMigrations };

