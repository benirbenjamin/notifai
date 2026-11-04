/**
 * Daily Notification Test Route
 * For testing the daily notification system
 */

const express = require('express');
const router = express.Router();
const DailyNotificationService = require('../utils/dailyNotificationService');
const { requireAuth } = require('../middleware/auth');

// Daily notifications settings page
router.get('/', requireAuth, async (req, res) => {
  try {
    res.render('notifications/daily', {
      title: 'Daily Notifications',
      user: req.user
    });
  } catch (error) {
    console.error('Error loading daily notifications page:', error);
    res.status(500).render('error', {
      title: 'Error',
      error: { status: 500, message: 'Failed to load page' }
    });
  }
});

// Test daily notification for current user
router.post('/test-daily', requireAuth, async (req, res) => {
  try {
    console.log(`🧪 Testing daily notification for user ${req.user.id}...`);
    
    await DailyNotificationService.testUserNotification(req.user.id);
    
    res.json({
      success: true,
      message: 'Daily notification test sent successfully! Check your email and push notifications.'
    });
  } catch (error) {
    console.error('Error testing daily notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

// Test daily notifications for all users (admin only)
router.post('/test-daily-all', requireAuth, async (req, res) => {
  try {
    // Check if user is admin (you may want to add proper admin middleware)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    console.log('🧪 Testing daily notifications for all users...');
    
    await DailyNotificationService.sendDailyNotifications();
    
    res.json({
      success: true,
      message: 'Daily notifications sent to all eligible users!'
    });
  } catch (error) {
    console.error('Error testing daily notifications for all users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notifications'
    });
  }
});

// Get user's notification preview (what would be sent)
router.get('/preview-daily', requireAuth, async (req, res) => {
  try {
    const activities = await DailyNotificationService.getUserActivitiesForNotification(req.user.id);
    const categorized = DailyNotificationService.categorizeActivities(activities);
    
    res.json({
      success: true,
      preview: {
        totalActivities: activities.length,
        categories: {
          overdue: categorized.overdue.length,
          dueToday: categorized.dueToday.length,
          dueTomorrow: categorized.dueTomorrow.length,
          dueThisWeek: categorized.dueThisWeek.length
        },
        wouldSendNotification: categorized.total > 0,
        activities: {
          overdue: categorized.overdue.map(a => ({ id: a.id, title: a.title, due_date: a.due_date, end_time: a.end_time })),
          dueToday: categorized.dueToday.map(a => ({ id: a.id, title: a.title, due_date: a.due_date, end_time: a.end_time })),
          dueTomorrow: categorized.dueTomorrow.map(a => ({ id: a.id, title: a.title, due_date: a.due_date, end_time: a.end_time })),
          dueThisWeek: categorized.dueThisWeek.map(a => ({ id: a.id, title: a.title, due_date: a.due_date, end_time: a.end_time }))
        }
      }
    });
  } catch (error) {
    console.error('Error getting notification preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification preview'
    });
  }
});

module.exports = router;
