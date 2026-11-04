/**
 * User Model
 */

const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Create a new user
  static async create(userData) {
    const { email, password, firstName, lastName } = userData;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const result = await db.query(`
      INSERT INTO users (email, password, first_name, last_name, plan_id)
      VALUES (?, ?, ?, ?, 1)
    `, [email, hashedPassword, firstName, lastName]);
    
    // Return the full user object
    return await User.findById(result.insertId);
  }

  // Create user from Google OAuth
  static async createFromGoogle(googleData) {
    const { googleId, email, firstName, lastName, avatar } = googleData;
    
    // Generate a random password for OAuth users
    const randomPassword = Math.random().toString(36).slice(-12);
    const hashedPassword = await bcrypt.hash(randomPassword, 12);
    
    const result = await db.query(`
      INSERT INTO users (
        email, password, first_name, last_name, google_id, google_avatar,
        plan_id, profile_completed
      ) VALUES (?, ?, ?, ?, ?, ?, 1, FALSE)
    `, [email, hashedPassword, firstName, lastName, googleId, avatar]);
    
    return result.insertId;
  }

  // Find user by Google ID
  static async findByGoogleId(googleId) {
    const users = await db.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
    return users[0] || null;
  }

  // Link existing account with Google
  static async linkGoogleAccount(userId, googleId, avatar) {
    await db.query(`
      UPDATE users 
      SET google_id = ?, google_avatar = ? 
      WHERE id = ?
    `, [googleId, avatar, userId]);
  }

  // Find user by email
  static async findByEmail(email) {
    const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    return users[0] || null;
  }

  // Find user by ID
  static async findById(id) {
    const users = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return users[0] || null;
  }

  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Update user
  static async update(id, userData) {
    const fields = [];
    const values = [];
    
    Object.keys(userData).forEach(key => {
      if (userData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(userData[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(id);
    
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  }

  // Get user with plan details
  static async findWithPlan(id) {
    const users = await db.query(`
      SELECT u.*, p.name as plan_name, p.max_activities, p.has_push_notifications,
             p.has_attachments, p.has_recurring_tasks, p.has_categories,
             p.has_priority_levels, p.has_advanced_progress
      FROM users u
      JOIN plans p ON u.plan_id = p.id
      WHERE u.id = ?
    `, [id]);
    
    return users[0] || null;
  }

  // Update user plan
  static async updatePlan(userId, planId, subscriptionEnd = null) {
    await db.query(`
      UPDATE users 
      SET plan_id = ?, subscription_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [planId, subscriptionEnd, userId]);
  }

  // Mark trial as used
  static async markTrialUsed(userId) {
    await db.query(`
      UPDATE users 
      SET is_trial_used = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [userId]);
  }

  // Get all users (admin)
  static async getAll(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const users = await db.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin,
             u.created_at, u.trial_end, u.subscription_end,
             p.name as plan_name
      FROM users u
      JOIN plans p ON u.plan_id = p.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const [countResult] = await db.query('SELECT COUNT(*) as total FROM users');
    
    return {
      users,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit)
    };
  }

  // Get user statistics
  static async getStatistics(userId) {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_activities,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_activities,
        SUM(CASE WHEN is_completed = FALSE THEN 1 ELSE 0 END) as pending_activities,
        SUM(CASE WHEN type = 'payment' THEN total_amount ELSE 0 END) as total_payment_amount,
        SUM(CASE WHEN type = 'payment' THEN paid_amount ELSE 0 END) as total_paid_amount,
        SUM(CASE WHEN type = 'payment' THEN remaining_amount ELSE 0 END) as total_remaining_amount
      FROM activities
      WHERE user_id = ?
    `, [userId]);
    
    return stats[0];
  }

  // Check if user can create more activities
  static async canCreateActivity(userId) {
    const user = await User.findWithPlan(userId);
    if (!user) return false;
    
    // If user has lifetime plan, unlimited activities
    if (user.plan_id === 2) return true;
    
    // For free plan, check if under 10 activities limit
    const [countResult] = await db.query(
      'SELECT COUNT(*) as count FROM activities WHERE user_id = ?', 
      [userId]
    );
    
    return countResult.count < 10;
  }

  // Get user activity count
  static async getActivityCount(userId) {
    const [countResult] = await db.query(
      'SELECT COUNT(*) as count FROM activities WHERE user_id = ?', 
      [userId]
    );
    return countResult.count;
  }

  // Get user with plan details
  static async findWithPlan(userId) {
    const users = await db.query(`
      SELECT u.*, p.name as plan_name, p.max_activities, p.is_lifetime, p.price,
             p.has_push_notifications, p.has_attachments, p.has_recurring_tasks
      FROM users u 
      LEFT JOIN plans p ON u.plan_id = p.id 
      WHERE u.id = ?
    `, [userId]);
    
    return users[0] || null;
  }

  // Upgrade user to lifetime plan
  static async upgradeToLifetime(userId) {
    await db.query('UPDATE users SET plan_id = 2 WHERE id = ?', [userId]);
  }

  // Change password
  static async changePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
  }

  // Delete user
  static async delete(userId) {
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
  }

  // Complete user profile
  static async completeProfile(userId, profileData) {
    const {
      phone, countryCode, timezone, company, jobTitle,
      emailNotifications, smsNotifications, pushNotifications
    } = profileData;

    await db.query(`
      UPDATE users 
      SET 
        phone = ?,
        country_code = ?,
        timezone = ?,
        company = ?,
        job_title = ?,
        email_notifications = ?,
        sms_notifications = ?,
        push_notifications = ?,
        profile_completed = TRUE,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      phone, countryCode, timezone, company, jobTitle,
      emailNotifications, smsNotifications, pushNotifications,
      userId
    ]);
  }

  // Save OAuth information for a user
  static async saveOAuthInfo(userId, provider, providerId, providerData) {
    try {
      // Ensure no undefined values are passed to the database
      const googleId = providerId || null;
      const googleAvatar = (providerData && providerData.picture) ? providerData.picture : null;
      
      console.log('Saving OAuth info:', { userId, provider, googleId, googleAvatar });
      
      await db.query(`
        UPDATE users SET 
          google_id = ?,
          google_avatar = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [googleId, googleAvatar, userId]);
      
      console.log('OAuth info saved successfully');
    } catch (error) {
      console.error('Error saving OAuth info:', error);
      throw error;
    }
  }
}

module.exports = User;
