/**
 * Create Admin User Script
 * Run this script to create the first admin user
 * Usage: node 
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');
const db = require('../config/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createAdmin() {
  try {
    console.log('🔧 Admin User Creation Script');
    console.log('================================\n');

    // Get admin details
    const email = await question('Enter admin email: ');
    const password = await question('Enter admin password (min 6 characters): ');
    const firstName = await question('Enter first name: ');
    const lastName = await question('Enter last name: ');

    // Validate input
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address');
    }
    
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    if (!firstName || !lastName) {
      throw new Error('First name and last name are required');
    }

    // Check if user already exists
    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert admin user
    const [result] = await db.query(`
      INSERT INTO users (
        email, password, first_name, last_name, 
        is_admin, plan_id, profile_completed,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, TRUE, 3, TRUE, NOW(), NOW())
    `, [email, hashedPassword, firstName, lastName]);

    console.log('\n✅ Admin user created successfully!');
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Name: ${firstName} ${lastName}`);
    console.log(`🆔 User ID: ${result.insertId}`);
    console.log('\n🚀 You can now login at: /auth/admin');

  } catch (error) {
    console.error('\n❌ Error creating admin user:', error.message);
  } finally {
    rl.close();
    process.exit();
  }
}

// Check database connection first
db.query('SELECT 1')
  .then(() => {
    console.log('✅ Database connection established');
    createAdmin();
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error.message);
    console.log('Please ensure your database is running and configuration is correct.');
    process.exit(1);
  });
