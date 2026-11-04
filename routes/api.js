/**
 * API Routes for AJAX and mobile functionality
 */

const express = require('express');
const webpush = require('web-push');
const { body, validationResult } = require('express-validator');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, checkPlanLimits } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// Apply middleware to all API routes
router.use(requireAuth);
router.use(checkPlanLimits);

// Configure web push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Get user dashboard data (for AJAX updates)
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const stats = await Activity.getDashboardStats(userId);
    const recentActivities = await Activity.findByUserId(userId, { limit: 5 });
    
    res.json({
      success: true,
      data: {
        stats,
        recentActivities
      }
    });

  } catch (error) {
    console.error('API dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get activities with filtering
router.get('/activities', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const filters = req.query;
    
    const activities = await Activity.findByUserId(userId, filters);
    
    res.json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('API activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Quick create activity (simplified)
router.post('/activities/quick', [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('type').optional().isIn(['general', 'payment', 'purchase', 'recurring']).withMessage('Invalid type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const userId = req.session.user.id;
    const { title, type = 'general', dueDate } = req.body;
    
    const activityId = await Activity.create({
      userId,
      title,
      description: '',
      type,
      category: null,
      priority: 'medium',
      dueDate: dueDate || null,
      totalAmount: 0,
      targetItem: null,
      recurringType: null,
      reminderFrequency: 24
    });

    res.json({
      success: true,
      message: 'Activity created successfully',
      activityId
    });

  } catch (error) {
    console.error('API quick create error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update activity progress
router.put('/activities/:id/progress', [
  body('progress').isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const userId = req.session.user.id;
    const activityId = req.params.id;
    const { progress } = req.body;
    
    const updateData = {
      progressPercentage: progress,
      isCompleted: progress === 100
    };
    
    if (progress === 100) {
      updateData.completedAt = new Date();
    }

    const success = await Activity.update(activityId, updateData, userId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Progress updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

  } catch (error) {
    console.error('API update progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Subscribe to push notifications
router.post('/push/subscribe', [
  body('endpoint').notEmpty().withMessage('Endpoint is required'),
  body('keys.p256dh').notEmpty().withMessage('P256DH key is required'),
  body('keys.auth').notEmpty().withMessage('Auth key is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const userId = req.session.user.id;
    const { endpoint, keys } = req.body;
    
    // Push notifications are now available for all users
    console.log('🔔 Processing push subscription for user:', userId);

    // Remove existing subscription for this user
    await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
    console.log('🗑️ Removed existing push subscriptions for user:', userId);
    
    // Add new subscription
    await db.query(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key) VALUES (?, ?, ?, ?)',
      [userId, endpoint, keys.p256dh, keys.auth]
    );
    console.log('✅ Successfully saved push subscription for user:', userId);

    res.json({
      success: true,
      message: 'Push notification subscription successful'
    });

  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Unsubscribe from push notifications
router.post('/push/unsubscribe', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);

    res.json({
      success: true,
      message: 'Push notification unsubscribed successfully'
    });

  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Send test push notification
router.post('/push/test', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user's push subscription
    const [subscription] = await db.query(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: 'No push subscription found'
      });
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key
      }
    };

    const payload = JSON.stringify({
      title: 'Test Notification',
      body: 'This is a test notification from Managinga Space!',
      icon: '/images/icon-192x192.png',
      badge: '/images/badge-72x72.png',
      tag: 'test',
      data: {
        url: '/dashboard'
      }
    });

    await webpush.sendNotification(pushSubscription, payload);

    res.json({
      success: true,
      message: 'Test notification sent successfully'
    });

  } catch (error) {
    console.error('Send test push error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification'
    });
  }
});

// Get user statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const stats = await User.getStatistics(userId);
    const dashboardStats = await Activity.getDashboardStats(userId);

    res.json({
      success: true,
      data: {
        ...stats,
        ...dashboardStats
      }
    });

  } catch (error) {
    console.error('API stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Search activities
router.get('/search', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { q: query, limit = 10 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const activities = await Activity.findByUserId(userId, {
      search: query.trim(),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('API search error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get activity details
router.get('/activities/:id', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    // Get payment history if it's a payment activity
    let payments = [];
    if (activity.type === 'payment') {
      payments = await Activity.getPayments(activityId);
    }

    res.json({
      success: true,
      data: {
        activity,
        payments
      }
    });

  } catch (error) {
    console.error('API activity details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Bulk update activities
router.put('/activities/bulk', [
  body('activityIds').isArray({ min: 1 }).withMessage('At least one activity ID is required'),
  body('action').isIn(['complete', 'incomplete', 'delete']).withMessage('Invalid action')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const userId = req.session.user.id;
    const { activityIds, action } = req.body;
    
    let successCount = 0;
    
    for (const activityId of activityIds) {
      try {
        let success = false;
        
        switch (action) {
          case 'complete':
            success = await Activity.markCompleted(activityId, userId);
            break;
          case 'incomplete':
            success = await Activity.markIncomplete(activityId, userId);
            break;
          case 'delete':
            success = await Activity.delete(activityId, userId);
            break;
        }
        
        if (success) successCount++;
      } catch (error) {
        console.error(`Error processing activity ${activityId}:`, error);
      }
    }

    res.json({
      success: true,
      message: `${successCount} activities processed successfully`,
      processedCount: successCount,
      totalCount: activityIds.length
    });

  } catch (error) {
    console.error('API bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
