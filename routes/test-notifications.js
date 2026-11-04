/**
 * Test route for notifications
 * Add this to test notification functionality
 */

const express = require('express');
const router = express.Router();
const NotificationService = require('../utils/notificationService');
const { requireAuth } = require('../middleware/auth');

// Test notification endpoint
router.post('/test-notification', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Send a test notification
    await NotificationService.sendNotification(userId, 'test', {
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working properly.',
      url: '/dashboard'
    });
    
    res.json({ 
      success: true, 
      message: 'Test notification sent! Check your email and push notifications.' 
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send test notification',
      details: error.message 
    });
  }
});

// Check notification status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user preferences
    const userPrefs = await NotificationService.getUserNotificationPreferences(userId);
    
    // Get push subscriptions count
    const [subscriptions] = await require('../config/database').query(
      'SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ? AND is_active = 1',
      [userId]
    );
    
    res.json({
      success: true,
      preferences: userPrefs,
      pushSubscriptions: subscriptions[0].count,
      vapidKey: process.env.VAPID_PUBLIC_KEY ? 'Configured' : 'Missing'
    });
  } catch (error) {
    console.error('Error getting notification status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get notification status' 
    });
  }
});

module.exports = router;
