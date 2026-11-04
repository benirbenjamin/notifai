const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const NotificationService = require('../utils/notificationService');
const { requireAuth } = require('../middleware/auth');

// Configure VAPID keys for web push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@managingaspace.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Get VAPID public key for client
router.get('/api/vapid-key', (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null
  });
});

// Get unread notifications
router.get('/unread', requireAuth, async (req, res) => {
  try {
    const notifications = await NotificationService.getUnreadNotifications(req.session.user.id);
    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Error getting unread notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    await NotificationService.markAsRead(req.params.id, req.session.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

// Save push subscription
router.post('/push-subscription', requireAuth, async (req, res) => {
  try {
    const subscription = req.body;
    await NotificationService.savePushSubscription(req.session.user.id, subscription);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to save push subscription' });
  }
});

// Test notification (for development)
router.post('/test', requireAuth, async (req, res) => {
  try {
    await NotificationService.sendNotification(req.session.user.id, 'test', {
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working.'
    });
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: 'Failed to send test notification' });
  }
});

// API routes for push notifications (expected by frontend)
router.post('/api/push/subscribe', requireAuth, async (req, res) => {
  console.log('🔔 [notifications.js] Push subscribe route called for user:', req.session.user.id);
  try {
    const subscription = req.body;
    await NotificationService.savePushSubscription(req.session.user.id, subscription);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to save push subscription' });
  }
});

router.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  try {
    await NotificationService.removePushSubscription(req.session.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to remove push subscription' });
  }
});

router.post('/api/push/test', requireAuth, async (req, res) => {
  try {
    await NotificationService.sendNotification(req.session.user.id, 'test', {
      title: 'Test Push Notification',
      message: 'This is a test push notification to verify the system is working.'
    });
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, message: 'Failed to send test notification' });
  }
});

router.get('/api/push/vapid-public-key', (req, res) => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(500).json({ success: false, message: 'VAPID public key not configured' });
    }
    res.json({ success: true, publicKey });
  } catch (error) {
    console.error('Error getting VAPID public key:', error);
    res.status(500).json({ success: false, message: 'Failed to get VAPID public key' });
  }
});

// Debug route to check push notification status
router.get('/api/push/debug', requireAuth, async (req, res) => {
  try {
    const debugInfo = await NotificationService.debugUserPushStatus(req.session.user.id);
    res.json({ success: true, debugInfo });
  } catch (error) {
    console.error('Error getting debug info:', error);
    res.status(500).json({ success: false, message: 'Failed to get debug info' });
  }
});

// Debug endpoint to check push subscription status
router.get('/api/push/debug', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const debugInfo = await NotificationService.debugUserPushStatus(userId);
    res.json({ success: true, debugInfo });
  } catch (error) {
    console.error('Error getting debug info:', error);
    res.status(500).json({ success: false, message: 'Failed to get debug info' });
  }
});

module.exports = router;
