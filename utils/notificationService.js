/**
 * Notification Service
 * Handles all types of notifications: email, push, and in-app
 */

const nodemailer = require('nodemailer');
const webpush = require('web-push');
const db = require('../config/database');

// Configure web push with logging
console.log('🔧 Configuring VAPID details...');
console.log('📧 VAPID Subject:', process.env.VAPID_SUBJECT || 'mailto:admin@managinga.space');
console.log('🔑 VAPID Public Key:', process.env.VAPID_PUBLIC_KEY ? 'SET' : 'NOT SET');
console.log('🔐 VAPID Private Key:', process.env.VAPID_PRIVATE_KEY ? 'SET' : 'NOT SET');

// Check if VAPID keys are configured
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.warn('⚠️ VAPID keys not configured. Push notifications will not work.');
  console.warn('💡 Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment variables.');
} else {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@managinga.space',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ VAPID details configured successfully');
  } catch (error) {
    console.error('❌ Error configuring VAPID details:', error.message);
  }
}

// Create email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

class NotificationService {
  
  // Main notification method - handles all types
  static async sendNotification(userId, type, data) {
    try {
      console.log(`🔔 Sending notification to user ${userId}, type: ${type}`);
      
      // Get user preferences
      const userPrefs = await this.getUserNotificationPreferences(userId);
      console.log('📋 User notification preferences:', userPrefs);
      
      // Create in-app notification
      await this.createInAppNotification(userId, type, data);
      console.log('📱 In-app notification created for user', userId, ':', type);
      
      // Send email if enabled
      if (userPrefs.email_notifications) {
        await this.sendEmailNotification(userId, type, data);
        console.log('📧 Email notification sent');
      } else {
        console.log('📧 Email notifications disabled for user');
      }
      
      // Send push notification (enabled for all users regardless of plan)
      if (userPrefs.push_notifications) {
        console.log('🔔 Sending push notification...');
        try {
          await this.sendPushNotification(userId, type, data);
          console.log('🔔 Push notification sent successfully');
        } catch (error) {
          console.error('❌ Push notification failed, continuing with other notifications:', error.message);
        }
        console.log('🔔 Push notification sent');
      } else {
        console.log('🔔 Push notifications disabled for user:', {
          push_notifications: userPrefs.push_notifications
        });
      }
      
      console.log(`✅ Notification sent to user ${userId}: ${type}`);
    } catch (error) {
      console.error('❌ Notification service error:', error);
    }
  }

  // Activity-specific notifications
  static async notifyActivityCreated(userId, activity) {
    await this.sendNotification(userId, 'activity_created', {
      title: 'New Activity Created',
      message: `Your activity "${activity.title}" has been created successfully.`,
      activityId: activity.id,
      activityTitle: activity.title
    });
  }

  static async notifyActivityCompleted(userId, activity) {
    await this.sendNotification(userId, 'activity_completed', {
      title: '🎉 Activity Completed!',
      message: `Congratulations! You've completed "${activity.title}".`,
      activityId: activity.id,
      activityTitle: activity.title
    });
  }

  static async notifyActivityDue(userId, activity) {
    await this.sendNotification(userId, 'activity_due', {
      title: '⏰ Activity Due Soon',
      message: `Your activity "${activity.title}" is due soon. Don't forget to complete it!`,
      activityId: activity.id,
      activityTitle: activity.title
    });
  }

  static async notifyActivityOverdue(userId, activity) {
    await this.sendNotification(userId, 'activity_overdue', {
      title: '🚨 Activity Overdue',
      message: `Your activity "${activity.title}" is now overdue. Please complete it as soon as possible.`,
      activityId: activity.id,
      activityTitle: activity.title
    });
  }

  static async notifyActivityDeleted(userId, activity) {
    await this.sendNotification(userId, 'activity_deleted', {
      title: 'Activity Deleted',
      message: `Your activity "${activity.title}" has been deleted.`,
      activityTitle: activity.title
    });
  }

  static async notifyActivityUpdated(userId, activity) {
    await this.sendNotification(userId, 'activity_updated', {
      title: 'Activity Updated',
      message: `Your activity "${activity.title}" has been updated.`,
      activityId: activity.id,
      activityTitle: activity.title
    });
  }

  // Payment notifications
  static async notifyPaymentSuccess(userId, payment) {
    await this.sendNotification(userId, 'payment_success', {
      title: '💳 Payment Successful',
      message: `Your payment of $${payment.amount} has been processed successfully.`,
      amount: payment.amount
    });
  }

  static async notifyPaymentFailed(userId, payment) {
    await this.sendNotification(userId, 'payment_failed', {
      title: '❌ Payment Failed',
      message: `Your payment of $${payment.amount} could not be processed. Please try again.`,
      amount: payment.amount
    });
  }

  // Team notifications
  static async notifyTeamInvitation(userId, team, invitedBy) {
    await this.sendNotification(userId, 'team_invitation', {
      title: '👥 Team Invitation',
      message: `${invitedBy} has invited you to join the team "${team.name}".`,
      teamId: team.id,
      teamName: team.name
    });
  }

  // Get user notification preferences
  static async getUserNotificationPreferences(userId) {
    try {
      const [rows] = await db.query(`
        SELECT u.email_notifications, u.push_notifications
        FROM users u
        WHERE u.id = ?
      `, [userId]);
      
      const userPrefs = rows[0] || {
        email_notifications: true,
        push_notifications: true  // Default to true for all users
      };
      
      // Force push notifications to be enabled for all users regardless of plan
      userPrefs.has_push_notifications = true;
      
      return userPrefs;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return {
        email_notifications: true,
        push_notifications: true,
        has_push_notifications: true
      };
    }
  }

  // Create in-app notification
  static async createInAppNotification(userId, type, data) {
    try {
      // Map activity types to valid database enum values
      const validTypes = {
        'activity_created': 'activity_created',
        'activity_completed': 'activity_completed', 
        'activity_deleted': 'activity_deleted',
        'activity_reminder': 'activity_reminder',
        'activity_due': 'activity_reminder',
        'activity_overdue': 'activity_reminder',
        'daily_summary': 'system',
        'overdue_completion_check': 'system',
        'payment_added': 'payment_added',
        'subtask_completed': 'subtask_completed',
        'test': 'system'
      };
      
      const dbType = validTypes[type] || 'system';
      
      await db.query(`
        INSERT INTO notifications (user_id, type, title, content, data, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [userId, dbType, data.title, data.message, JSON.stringify(data)]);
      
      console.log(`📱 In-app notification created for user ${userId}: ${type}`);
    } catch (error) {
      console.error('Error creating in-app notification:', error);
    }
  }

  // Send email notification
  static async sendEmailNotification(userId, type, data) {
    try {
      // Get user email
      const [users] = await db.query('SELECT email, first_name FROM users WHERE id = ?', [userId]);
      if (!users[0]) return;

      const user = users[0];
      const emailTemplate = this.getEmailTemplate(type, data, user);

      await emailTransporter.sendMail({
        from: `"Managinga Space" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });

      console.log(`📧 Email sent to ${user.email}: ${data.title}`);
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  // Send push notification
  static async sendPushNotification(userId, type, data) {
    console.log(`🔔 Starting push notification for user ${userId}, type: ${type}`);
    
    // Check if VAPID is configured
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ Push notifications disabled: VAPID keys not configured');
      return;
    }
    
    try {
      // Get user's push subscriptions
      const result = await db.query(`
        SELECT * FROM push_subscriptions WHERE user_id = ? AND is_active = 1
      `, [userId]);

      console.log(`📱 Database query result:`, result);
      
      // Handle database result properly - result is already an array of subscriptions
      const subscriptions = Array.isArray(result) ? result : [];
      console.log(`📱 Found ${subscriptions.length} active push subscriptions for user ${userId}`);
      
      if (subscriptions.length === 0) {
        console.log(`❌ No active push subscriptions found for user ${userId}`);
        console.log(`💡 User needs to enable push notifications in the browser first`);
        return;
      }

      // Log subscription details (without sensitive data)
      subscriptions.forEach((sub, index) => {
        console.log(`📱 Subscription ${index + 1}:`, {
          id: sub.id,
          endpoint: sub.endpoint.substring(0, 50) + '...',
          hasP256dh: !!sub.p256dh_key,
          hasAuth: !!sub.auth_key,
          created: sub.created_at
        });
      });

      const payload = JSON.stringify({
        title: data.title,
        body: data.message,
        icon: '/images/logo.png',
        badge: '/images/logo.png',
        data: {
          type: type,
          url: this.getNotificationUrl(type, data)
        }
      });

      console.log(`📨 Push notification payload:`, JSON.parse(payload));

      let successCount = 0;
      let errorCount = 0;

      for (const subscription of subscriptions) {
        try {
          console.log(`📤 Sending push to subscription ${subscription.id}...`);
          
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh_key,
              auth: subscription.auth_key
            }
          }, payload);
          
          successCount++;
          console.log(`✅ Push sent successfully to subscription ${subscription.id}`);
          
        } catch (error) {
          errorCount++;
          console.error(`❌ Error sending push to subscription ${subscription.id}:`, error.message);
          console.error(`❌ Full error:`, error);
          
          // Remove invalid subscription
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`🗑️ Removing invalid subscription ${subscription.id}`);
            await db.query('DELETE FROM push_subscriptions WHERE id = ?', [subscription.id]);
          }
        }
      }

      console.log(`🔔 Push notification summary for user ${userId}: ${successCount} sent, ${errorCount} failed`);
      
    } catch (error) {
      console.error('❌ Error in sendPushNotification:', error);
      console.error('❌ Error stack:', error.stack);
    }
  }

  // Get email template based on notification type
  static getEmailTemplate(type, data, user) {
    const baseStyle = `
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; color: #007bff; margin-bottom: 20px; }
        .content { line-height: 1.6; }
        .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    `;

    const templates = {
      activity_created: {
        subject: `✅ Activity Created: ${data.activityTitle}`,
        html: `
          ${baseStyle}
          <div class="container">
            <h2 class="header">Activity Created Successfully!</h2>
            <div class="content">
              <p>Hi ${user.first_name},</p>
              <p>Your activity "<strong>${data.activityTitle}</strong>" has been created successfully.</p>
              <p>You can view and manage your activity using the link below:</p>
              <a href="${process.env.APP_URL}/activities/${data.activityId}" class="button">View Activity</a>
            </div>
            <div class="footer">
              <p>Best regards,<br>Managinga Space Team</p>
            </div>
          </div>
        `
      },
      activity_completed: {
        subject: `🎉 Activity Completed: ${data.activityTitle}`,
        html: `
          ${baseStyle}
          <div class="container">
            <h2 class="header">🎉 Congratulations!</h2>
            <div class="content">
              <p>Hi ${user.first_name},</p>
              <p>Great job! You've successfully completed your activity "<strong>${data.activityTitle}</strong>".</p>
              <p>Keep up the excellent work!</p>
              <a href="${process.env.APP_URL}/activities" class="button">View All Activities</a>
            </div>
            <div class="footer">
              <p>Best regards,<br>Managinga Space Team</p>
            </div>
          </div>
        `
      },
      activity_due: {
        subject: `⏰ Reminder: ${data.activityTitle} is due soon`,
        html: `
          ${baseStyle}
          <div class="container">
            <h2 class="header">⏰ Activity Due Soon</h2>
            <div class="content">
              <p>Hi ${user.first_name},</p>
              <p>This is a friendly reminder that your activity "<strong>${data.activityTitle}</strong>" is due soon.</p>
              <p>Don't forget to complete it!</p>
              <a href="${process.env.APP_URL}/activities/${data.activityId}" class="button">Complete Activity</a>
            </div>
            <div class="footer">
              <p>Best regards,<br>Managinga Space Team</p>
            </div>
          </div>
        `
      },
      activity_overdue: {
        subject: `🚨 Overdue: ${data.activityTitle}`,
        html: `
          ${baseStyle}
          <div class="container">
            <h2 class="header" style="color: #dc3545;">🚨 Activity Overdue</h2>
            <div class="content">
              <p>Hi ${user.first_name},</p>
              <p>Your activity "<strong>${data.activityTitle}</strong>" is now overdue.</p>
              <p>Please complete it as soon as possible to stay on track with your goals.</p>
              <a href="${process.env.APP_URL}/activities/${data.activityId}" class="button" style="background-color: #dc3545;">Complete Now</a>
            </div>
            <div class="footer">
              <p>Best regards,<br>Managinga Space Team</p>
            </div>
          </div>
        `
      },
      daily_summary: {
        subject: data.title,
        html: `
          ${baseStyle}
          <div class="container">
            <h2 class="header">${data.title}</h2>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Here's your daily task summary:</p>
              
              ${data.categories.overdue.length > 0 ? `
                <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545;">
                  <h3 style="color: #721c24; margin-top: 0;">🚨 Overdue Tasks (${data.categories.overdue.length})</h3>
                  <ul style="margin-bottom: 0;">
                    ${data.categories.overdue.slice(0, 5).map(activity => {
                      const daysOverdue = Math.floor((new Date() - new Date(activity.due_date || activity.end_time)) / (1000 * 60 * 60 * 24));
                      return `<li><strong>${activity.title}</strong> - ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue</li>`;
                    }).join('')}
                    ${data.categories.overdue.length > 5 ? `<li><em>... and ${data.categories.overdue.length - 5} more</em></li>` : ''}
                  </ul>
                </div>
              ` : ''}
              
              ${data.categories.dueToday.length > 0 ? `
                <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
                  <h3 style="color: #856404; margin-top: 0;">⏰ Due Today (${data.categories.dueToday.length})</h3>
                  <ul style="margin-bottom: 0;">
                    ${data.categories.dueToday.slice(0, 5).map(activity => 
                      `<li><strong>${activity.title}</strong></li>`
                    ).join('')}
                    ${data.categories.dueToday.length > 5 ? `<li><em>... and ${data.categories.dueToday.length - 5} more</em></li>` : ''}
                  </ul>
                </div>
              ` : ''}
              
              ${data.categories.dueTomorrow.length > 0 ? `
                <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #17a2b8;">
                  <h3 style="color: #0c5460; margin-top: 0;">📋 Due Tomorrow (${data.categories.dueTomorrow.length})</h3>
                  <ul style="margin-bottom: 0;">
                    ${data.categories.dueTomorrow.slice(0, 3).map(activity => 
                      `<li><strong>${activity.title}</strong></li>`
                    ).join('')}
                    ${data.categories.dueTomorrow.length > 3 ? `<li><em>... and ${data.categories.dueTomorrow.length - 3} more</em></li>` : ''}
                  </ul>
                </div>
              ` : ''}
              
              ${data.categories.dueThisWeek.length > 0 ? `
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #28a745;">
                  <h3 style="color: #155724; margin-top: 0;">📅 Due This Week (${data.categories.dueThisWeek.length})</h3>
                  <p style="margin-bottom: 0;">You have ${data.categories.dueThisWeek.length} task${data.categories.dueThisWeek.length > 1 ? 's' : ''} due within the next week.</p>
                </div>
              ` : ''}
              
              ${data.categories.overdue.length > 0 ? `
                <div style="background-color: #e2e3e5; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
                  <p style="margin: 0; font-size: 16px; color: #495057;">
                    <strong>❓ Have you completed any overdue tasks?</strong><br>
                    Please mark them as complete in the app to keep your progress updated.
                  </p>
                  <a href="${process.env.APP_URL}/activities" class="button" style="margin-top: 10px;">Update Tasks</a>
                </div>
              ` : `
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
                  <p style="margin: 0; font-size: 16px; color: #155724;">
                    <strong>🎉 Keep up the great work!</strong><br>
                    Your tasks are well managed.
                  </p>
                </div>
              `}
              
              <a href="${process.env.APP_URL}/activities" class="button">View All Activities</a>
            </div>
            <div class="footer">
              <p>This is your daily task summary sent at 8:00 PM.</p>
              <p>To modify notification preferences, <a href="${process.env.APP_URL}/settings">click here</a>.</p>
              <p>Best regards,<br>Managinga Space Team</p>
            </div>
          </div>
        `
      },
      overdue_completion_check: {
        subject: '🤔 Task Completion Check - Please Update',
        html: `
          ${baseStyle}
          <div class="container">
            <h2 class="header">🤔 Task Completion Check</h2>
            <div class="content">
              <p>Hi there,</p>
              <p>You have <strong>${data.activities.length}</strong> overdue task${data.activities.length > 1 ? 's' : ''} that may have been completed:</p>
              
              <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <ul>
                  ${data.activities.map(activity => 
                    `<li><strong>${activity.title}</strong> - ${activity.daysPastDue} day${activity.daysPastDue > 1 ? 's' : ''} past due</li>`
                  ).join('')}
                </ul>
              </div>
              
              <p><strong>Have you completed any of these tasks?</strong></p>
              <p>If so, please take a moment to mark them as complete in the app. This helps keep your progress accurate and your dashboard clean.</p>
              
              <a href="${process.env.APP_URL}/activities" class="button">Update Task Status</a>
            </div>
            <div class="footer">
              <p>Regular updates help us provide better task management insights.</p>
              <p>Best regards,<br>Managinga Space Team</p>
            </div>
          </div>
        `
      }
    };

    return templates[type] || {
      subject: data.title,
      html: `
        ${baseStyle}
        <div class="container">
          <h2 class="header">${data.title}</h2>
          <div class="content">
            <p>Hi ${user.first_name},</p>
            <p>${data.message}</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>Managinga Space Team</p>
          </div>
        </div>
      `
    };
  }

  // Get notification URL based on type
  static getNotificationUrl(type, data) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    
    switch (type) {
      case 'activity_created':
      case 'activity_due':
      case 'activity_overdue':
      case 'activity_updated':
        return `${baseUrl}/activities/${data.activityId}`;
      case 'activity_completed':
      case 'activity_deleted':
        return `${baseUrl}/activities`;
      case 'team_invitation':
        return `${baseUrl}/teams`;
      case 'payment_success':
      case 'payment_failed':
        return `${baseUrl}/payments`;
      default:
        return `${baseUrl}/dashboard`;
    }
  }

  // Get unread notifications for user
  static async getUnreadNotifications(userId) {
    try {
      const [notifications] = await db.query(`
        SELECT * FROM notifications 
        WHERE user_id = ? AND is_read = 0 
        ORDER BY created_at DESC 
        LIMIT 10
      `, [userId]);
      
      return notifications;
    } catch (error) {
      console.error('Error getting unread notifications:', error);
      return [];
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    try {
      await db.query(`
        UPDATE notifications 
        SET is_read = 1, read_at = NOW() 
        WHERE id = ? AND user_id = ?
      `, [notificationId, userId]);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Save push subscription
  static async savePushSubscription(userId, subscription) {
    try {
      await db.query(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
        p256dh_key = VALUES(p256dh_key),
        auth_key = VALUES(auth_key),
        is_active = 1
      `, [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
      
      console.log(`✅ Push subscription saved for user ${userId}`);
    } catch (error) {
      console.error('Error saving push subscription:', error);
    }
  }

  // Remove push subscription
  static async removePushSubscription(userId) {
    try {
      await db.query(`
        UPDATE push_subscriptions 
        SET is_active = 0 
        WHERE user_id = ?
      `, [userId]);
      
      console.log(`❌ Push subscription removed for user ${userId}`);
    } catch (error) {
      console.error('Error removing push subscription:', error);
    }
  }

  // Debug method to check user's push subscription status
  static async debugUserPushStatus(userId) {
    try {
      console.log(`🔍 Debugging push status for user ${userId}`);
      
      // Check user preferences
      const userPrefs = await this.getUserNotificationPreferences(userId);
      console.log(`👤 User preferences:`, userPrefs);
      
      // Check push subscriptions
      const [subscriptions] = await db.query(`
        SELECT id, endpoint, created_at, is_active 
        FROM push_subscriptions 
        WHERE user_id = ?
      `, [userId]);
      
      console.log(`📱 Push subscriptions (${subscriptions.length}):`, subscriptions);
      
      // Check VAPID configuration
      console.log(`🔑 VAPID configured:`, {
        publicKey: !!process.env.VAPID_PUBLIC_KEY,
        privateKey: !!process.env.VAPID_PRIVATE_KEY,
        subject: process.env.VAPID_SUBJECT
      });
      
      return {
        userPrefs,
        subscriptions,
        vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
      };
      
    } catch (error) {
      console.error('Error debugging push status:', error);
      return null;
    }
  }
}

module.exports = NotificationService;
