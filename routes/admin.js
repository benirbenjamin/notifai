/**
 * Admin Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Activity = require('../models/Activity');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// Apply middleware to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

// Admin dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Get overall statistics
    const [userStats] = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_admin = TRUE THEN 1 ELSE 0 END) as admin_users,
        SUM(CASE WHEN plan_id = 1 THEN 1 ELSE 0 END) as free_users,
        SUM(CASE WHEN plan_id = 2 THEN 1 ELSE 0 END) as premium_users
      FROM users
    `);

    const [activityStats] = await db.query(`
      SELECT 
        COUNT(*) as total_activities,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_activities,
        SUM(CASE WHEN type = 'payment' THEN 1 ELSE 0 END) as payment_activities,
        SUM(CASE WHEN type = 'purchase' THEN 1 ELSE 0 END) as purchase_activities,
        SUM(CASE WHEN type = 'recurring' THEN 1 ELSE 0 END) as recurring_activities
      FROM activities
    `);

    const [subscriptionStats] = await db.query(`
      SELECT 
        COUNT(*) as total_subscriptions,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions,
        SUM(amount) as total_revenue
      FROM user_subscriptions
    `);

    // Get recent users
    const recentUsers = await db.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, p.name as plan_name
      FROM users u
      JOIN plans p ON u.plan_id = p.id
      WHERE u.is_admin = FALSE
      ORDER BY u.created_at DESC
      LIMIT 10
    `);

    // Get recent premium users (no more trial system)
    const recentPremiumUsers = recentUsers.filter(u => u.plan_name === 'Unlimited Premium');

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      userStats,
      activityStats,
      subscriptionStats,
      recentUsers,
      expiringTrials: [] // No more trials
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load admin dashboard',
      error: {}
    });
  }
});

// Users management
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || '';
    const planFilter = req.query.plan || '';
    
    const result = await User.getAll(page, 20);
    
    // Apply filters if needed
    let filteredUsers = result.users;
    if (search) {
      filteredUsers = filteredUsers.filter(user => 
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.first_name.toLowerCase().includes(search.toLowerCase()) ||
        user.last_name.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (planFilter) {
      filteredUsers = filteredUsers.filter(user => 
        user.plan_name.toLowerCase() === planFilter.toLowerCase()
      );
    }

    // Get all plans for filter dropdown
    const plans = await db.query('SELECT * FROM plans WHERE is_active = TRUE');

    res.render('admin/users', {
      title: 'Users Management',
      users: filteredUsers,
      plans,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total
      },
      filters: { search, planFilter }
    });

  } catch (error) {
    console.error('Admin users error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load users',
      error: {}
    });
  }
});

// User details
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findWithPlan(userId);
    if (!user) {
      return res.status(404).render('error', {
        title: 'User Not Found',
        message: 'The user you are looking for does not exist.',
        error: {}
      });
    }

    // Get user statistics
    const userStats = await User.getStatistics(userId);
    
    // Get user's recent activities
    const recentActivities = await Activity.findByUserId(userId, { limit: 10 });
    
    // Get user's subscriptions
    const subscriptions = await db.query(`
      SELECT s.*, p.name as plan_name
      FROM user_subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `, [userId]);

    res.render('admin/user-details', {
      title: `User: ${user.first_name} ${user.last_name}`,
      user,
      userStats,
      recentActivities,
      subscriptions
    });

  } catch (error) {
    console.error('Admin user details error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load user details',
      error: {}
    });
  }
});

// Update user plan
router.post('/users/:id/plan', [
  body('planId').isInt({ min: 1 }).withMessage('Invalid plan selected'),
  body('subscriptionMonths').optional().isInt({ min: 1 }).withMessage('Invalid subscription duration')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg 
      });
    }

    const userId = req.params.id;
    const { planId, subscriptionMonths } = req.body;
    
    // Verify plan exists
    const [plan] = await db.query('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Plan not found' 
      });
    }

    let subscriptionEnd = null;
    if (subscriptionMonths && parseInt(subscriptionMonths) > 0) {
      subscriptionEnd = new Date();
      subscriptionEnd.setMonth(subscriptionEnd.getMonth() + parseInt(subscriptionMonths));
    }

    await User.updatePlan(userId, planId, subscriptionEnd);

    res.json({ 
      success: true, 
      message: 'User plan updated successfully' 
    });

  } catch (error) {
    console.error('Update user plan error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Plans management
router.get('/plans', async (req, res) => {
  try {
    const plans = await db.query('SELECT * FROM plans ORDER BY price ASC');

    res.render('admin/plans', {
      title: 'Plans Management',
      plans,
      errors: [],
      formData: {}
    });

  } catch (error) {
    console.error('Admin plans error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load plans',
      error: {}
    });
  }
});

// Create/Update plan
router.post('/plans', [
  body('name').trim().isLength({ min: 1 }).withMessage('Plan name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('maxActivities').isInt({ min: 1 }).withMessage('Max activities must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const plans = await db.query('SELECT * FROM plans ORDER BY price ASC');
      return res.render('admin/plans', {
        title: 'Plans Management',
        plans,
        errors: errors.array(),
        formData: req.body
      });
    }

    const {
      id, name, description, price, maxActivities,
      hasPushNotifications, hasAttachments, hasRecurringTasks,
      hasCategories, hasPriorityLevels, hasAdvancedProgress, isActive
    } = req.body;

    const planData = {
      name,
      description: description || null,
      price: parseFloat(price),
      max_activities: parseInt(maxActivities),
      has_push_notifications: hasPushNotifications === 'on',
      has_attachments: hasAttachments === 'on',
      has_recurring_tasks: hasRecurringTasks === 'on',
      has_categories: hasCategories === 'on',
      has_priority_levels: hasPriorityLevels === 'on',
      has_advanced_progress: hasAdvancedProgress === 'on',
      is_active: isActive !== 'off'
    };

    if (id) {
      // Update existing plan
      const fields = Object.keys(planData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(planData);
      values.push(id);
      
      await db.query(`UPDATE plans SET ${fields} WHERE id = ?`, values);
    } else {
      // Create new plan
      const fields = Object.keys(planData).join(', ');
      const placeholders = Object.keys(planData).map(() => '?').join(', ');
      
      await db.query(`INSERT INTO plans (${fields}) VALUES (${placeholders})`, Object.values(planData));
    }

    res.redirect('/admin/plans?success=Plan saved successfully');

  } catch (error) {
    console.error('Save plan error:', error);
    const plans = await db.query('SELECT * FROM plans ORDER BY price ASC');
    res.render('admin/plans', {
      title: 'Plans Management',
      plans,
      errors: [{ msg: 'An error occurred while saving the plan' }],
      formData: req.body
    });
  }
});

// Settings management
router.get('/settings', async (req, res) => {
  try {
    const settings = await db.query('SELECT * FROM app_settings ORDER BY setting_key ASC');
    
    // Convert to object for easier template usage
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.setting_key] = setting.setting_value;
    });

    res.render('admin/settings', {
      title: 'App Settings',
      settings: settingsObj,
      errors: [],
      success: req.query.success
    });

  } catch (error) {
    console.error('Admin settings error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load settings',
      error: {}
    });
  }
});

// Update settings
router.post('/settings', async (req, res) => {
  try {
    const updates = [];
    
    // Process each setting
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        updates.push({
          sql: `UPDATE app_settings SET setting_value = ? WHERE setting_key = ?`,
          params: [req.body[key], key]
        });
      }
    });

    if (updates.length > 0) {
      await db.transaction(updates);
    }

    res.redirect('/admin/settings?success=Settings updated successfully');

  } catch (error) {
    console.error('Update settings error:', error);
    const settings = await db.query('SELECT * FROM app_settings ORDER BY setting_key ASC');
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.setting_key] = setting.setting_value;
    });
    
    res.render('admin/settings', {
      title: 'App Settings',
      settings: settingsObj,
      errors: [{ msg: 'An error occurred while updating settings' }]
    });
  }
});

// Analytics
router.get('/analytics', async (req, res) => {
  try {
    // Get comprehensive analytics data
    const [userGrowth] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const [activityTrends] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_activities,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_activities
      FROM activities
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const [revenueTrends] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        SUM(amount) as revenue
      FROM user_subscriptions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND status = 'active'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    res.render('admin/analytics', {
      title: 'Analytics',
      userGrowth,
      activityTrends,
      revenueTrends
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load analytics',
      error: {}
    });
  }
});

// API endpoint for quick stats (used by admin navbar)
router.get('/api/quick-stats', async (req, res) => {
  try {
    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE is_admin = FALSE');
    const [activityCount] = await db.query('SELECT COUNT(*) as count FROM activities');

    res.json({
      success: true,
      totalUsers: userCount.count || 0,
      totalActivities: activityCount.count || 0
    });
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    res.json({
      success: false,
      totalUsers: 0,
      totalActivities: 0
    });
  }
});

// Subscriptions management
router.get('/subscriptions', async (req, res) => {
  try {
    const subscriptions = await db.query(`
      SELECT s.*, u.email, u.first_name, u.last_name, p.name as plan_name
      FROM user_subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN plans p ON s.plan_id = p.id
      ORDER BY s.created_at DESC
    `);

    res.render('admin/subscriptions', {
      title: 'Subscriptions Management',
      subscriptions
    });

  } catch (error) {
    console.error('Admin subscriptions error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load subscriptions',
      error: {}
    });
  }
});

// Activities management
router.get('/activities', async (req, res) => {
  try {
    const activities = await db.query(`
      SELECT a.*, u.email, u.first_name, u.last_name
      FROM activities a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);

    res.render('admin/activities', {
      title: 'Activities Management',
      activities
    });

  } catch (error) {
    console.error('Admin activities error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load activities',
      error: {}
    });
  }
});

// Notifications management
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await db.query(`
      SELECT r.*, a.title as activity_title, u.email, u.first_name, u.last_name
      FROM reminders r
      JOIN activities a ON r.activity_id = a.id
      JOIN users u ON a.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 100
    `);

    res.render('admin/notifications', {
      title: 'Notifications Management',
      notifications
    });

  } catch (error) {
    console.error('Admin notifications error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load notifications',
      error: {}
    });
  }
});

module.exports = router;
