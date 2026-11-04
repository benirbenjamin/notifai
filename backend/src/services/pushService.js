const { Expo } = require('expo-server-sdk');
const webpush = require('web-push');
const { query } = require('../database/db');
require('dotenv').config();

// Create Expo client for Mobile Push Notifications
const expo = new Expo();

// Configure Web Push if keys are provided
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@notifai.space',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Dispatch Push Notification for a Task Deadline / Reminder
 * Triggers interactive actions: OKAY_I_KNOW, REMIND_30_MIN, DONT_REMIND
 */
async function sendTaskPushNotification(userId, task) {
  try {
    // 1. Fetch user's registered push tokens (both Expo mobile tokens & Web Push endpoints)
    const tokenRes = await query(
      'SELECT token, platform FROM push_tokens WHERE user_id = $1',
      [userId]
    );

    if (tokenRes.rows.length === 0) {
      return { sent: 0, message: 'No registered push tokens found for user' };
    }

    const expoTokens = [];
    const webTokens = [];

    for (const row of tokenRes.rows) {
      if (row.platform === 'android' || row.platform === 'ios' || Expo.isExpoPushToken(row.token)) {
        expoTokens.push(row.token);
      } else {
        webTokens.push(row.token);
      }
    }

    // 2. Dispatch to Expo (React Native Mobile App)
    if (expoTokens.length > 0) {
      const messages = expoTokens.map(token => ({
        to: token,
        sound: 'default',
        priority: 'high',
        channelId: 'task-reminders', // Android Notification Channel
        title: `⏰ Task Deadline: ${task.title}`,
        body: task.description ? task.description.slice(0, 100) : 'Tap to confirm or snooze this task.',
        data: {
          taskId: task.id,
          title: task.title,
          dueDate: task.due_date,
          priority: task.priority,
          type: 'TASK_REMINDER_OVERLAY',
          actions: [
            { id: 'OKAY_I_KNOW', title: 'Okay I know' },
            { id: 'REMIND_30_MIN', title: 'Remind in 30 min' },
            { id: 'DONT_REMIND', title: "Don't remind" }
          ]
        },
        // Android specific full-screen intent / heads up config
        android: {
          channelId: 'task-reminders',
          priority: 'max',
          vibrate: [0, 250, 250, 250],
          color: '#38bdf8'
        },
        categoryIdentifier: 'TASK_REMINDER_CATEGORY'
      }));

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          console.log(`📱 Expo push notifications sent to ${chunk.length} devices:`, ticketChunk);
        } catch (error) {
          console.error('Error sending Expo push batch:', error);
        }
      }
    }

    // 3. Dispatch to Web Push if any
    for (const webSubStr of webTokens) {
      try {
        const sub = JSON.parse(webSubStr);
        await webpush.sendNotification(
          sub,
          JSON.stringify({
            title: `⏰ Task Deadline: ${task.title}`,
            body: task.description || 'Deadline reminder from Notifai space',
            taskId: task.id,
            url: `/tasks?highlight=${task.id}`
          })
        );
      } catch (err) {
        console.error('Web Push send error:', err.message);
      }
    }

    return { sent: expoTokens.length + webTokens.length };
  } catch (error) {
    console.error('sendTaskPushNotification error:', error);
    return { error: error.message };
  }
}

module.exports = {
  sendTaskPushNotification
};
