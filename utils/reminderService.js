/**
 * Reminder Service
 * Handles email and push notification reminders
 */

const nodemailer = require('nodemailer');
const webpush = require('web-push');
const Activity = require('../models/Activity');
const db = require('../config/database');

// Configure web push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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

class ReminderService {
  // Check and send all due reminders
  static async checkAndSendReminders() {
    try {
      console.log('🔔 Checking for due reminders...');
      
      const activitiesNeedingReminders = await Activity.getActivitiesNeedingReminders();
      
      if (activitiesNeedingReminders.length === 0) {
        console.log('✅ No reminders to send');
        return;
      }

      console.log(`📧 Found ${activitiesNeedingReminders.length} activities needing reminders`);

      for (const activity of activitiesNeedingReminders) {
        try {
          // Send email reminder (available for all plans)
          await this.sendEmailReminder(activity);
          
          // Send push notification (only for premium users)
          const userPlan = await db.query(`
            SELECT p.has_push_notifications
            FROM users u
            JOIN plans p ON u.plan_id = p.id
            WHERE u.id = ?
          `, [activity.user_id]);

          if (userPlan[0] && userPlan[0].has_push_notifications) {
            await this.sendPushReminder(activity);
          }

          // Update last reminder sent
          await Activity.updateLastReminderSent(activity.id);
          
          console.log(`✅ Reminder sent for activity: ${activity.title}`);
          
        } catch (error) {
          console.error(`❌ Failed to send reminder for activity ${activity.id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('❌ Error in reminder service:', error);
    }
  }

  // Send email reminder
  static async sendEmailReminder(activity) {
    const dueDate = new Date(activity.due_date);
    const now = new Date();
    const isOverdue = dueDate < now;
    const daysDiff = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    let subject, urgencyClass, statusText;
    
    if (isOverdue) {
      subject = `⚠️ OVERDUE: ${activity.title}`;
      urgencyClass = 'overdue';
      statusText = `This task was due ${Math.abs(daysDiff)} day(s) ago`;
    } else if (daysDiff <= 1) {
      subject = `🚨 DUE TODAY: ${activity.title}`;
      urgencyClass = 'due-today';
      statusText = 'This task is due today';
    } else if (daysDiff <= 3) {
      subject = `⏰ Due Soon: ${activity.title}`;
      urgencyClass = 'due-soon';
      statusText = `This task is due in ${daysDiff} day(s)`;
    } else {
      subject = `📅 Reminder: ${activity.title}`;
      urgencyClass = 'upcoming';
      statusText = `This task is due in ${daysDiff} day(s)`;
    }

    const emailHtml = this.generateEmailTemplate(activity, statusText, urgencyClass);

    const mailOptions = {
      from: `"${process.env.APP_NAME}" <${process.env.EMAIL_USER}>`,
      to: activity.email,
      subject: subject,
      html: emailHtml
    };

    await emailTransporter.sendMail(mailOptions);
  }

  // Send push notification reminder
  static async sendPushReminder(activity) {
    try {
      const pushSubscriptions = await db.query(
        'SELECT * FROM push_subscriptions WHERE user_id = ?',
        [activity.user_id]
      );

      if (pushSubscriptions.length === 0) {
        return; // No push subscriptions for this user
      }

      const dueDate = new Date(activity.due_date);
      const now = new Date();
      const isOverdue = dueDate < now;
      const daysDiff = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      let title, body, tag;
      
      if (isOverdue) {
        title = '⚠️ Overdue Task';
        body = `"${activity.title}" was due ${Math.abs(daysDiff)} day(s) ago`;
        tag = 'overdue';
      } else if (daysDiff <= 1) {
        title = '🚨 Task Due Today';
        body = `"${activity.title}" is due today`;
        tag = 'due-today';
      } else {
        title = '📅 Task Reminder';
        body = `"${activity.title}" is due in ${daysDiff} day(s)`;
        tag = 'reminder';
      }

      const payload = JSON.stringify({
        title,
        body,
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png',
        tag,
        data: {
          url: `/activities/${activity.id}`,
          activityId: activity.id
        },
        actions: [
          {
            action: 'view',
            title: 'View Task'
          },
          {
            action: 'complete',
            title: 'Mark Complete'
          }
        ]
      });

      // Send to all user's subscriptions
      const sendPromises = pushSubscriptions.map(subscription => {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh_key,
            auth: subscription.auth_key
          }
        };

        return webpush.sendNotification(pushSubscription, payload)
          .catch(error => {
            console.error('Failed to send push notification:', error);
            // Remove invalid subscription
            if (error.statusCode === 410 || error.statusCode === 404) {
              db.query('DELETE FROM push_subscriptions WHERE id = ?', [subscription.id]);
            }
          });
      });

      await Promise.all(sendPromises);

    } catch (error) {
      console.error('Push notification error:', error);
    }
  }

  // Generate email template
  static generateEmailTemplate(activity, statusText, urgencyClass) {
    const progressBar = this.generateProgressBar(activity.progress_percentage || 0);
    const typeIcon = this.getActivityTypeIcon(activity.type);
    const priorityBadge = this.getPriorityBadge(activity.priority);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Task Reminder</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .status { padding: 15px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; text-align: center; }
          .overdue { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .due-today { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
          .due-soon { background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
          .upcoming { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .activity-card { border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .activity-title { font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #333; }
          .activity-meta { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
          .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .badge-primary { background-color: #007bff; color: white; }
          .badge-warning { background-color: #ffc107; color: #212529; }
          .badge-danger { background-color: #dc3545; color: white; }
          .badge-success { background-color: #28a745; color: white; }
          .progress-container { margin: 15px 0; }
          .progress-bar { width: 100%; height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden; }
          .progress-fill { height: 100%; background: linear-gradient(90deg, #28a745, #20c997); transition: width 0.3s ease; }
          .btn { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 5px; }
          .btn:hover { background-color: #0056b3; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Task Reminder</h1>
            <p>Don't forget about your important task!</p>
          </div>
          
          <div class="content">
            <div class="status ${urgencyClass}">
              ${statusText}
            </div>
            
            <div class="activity-card">
              <div class="activity-title">
                ${typeIcon} ${activity.title}
              </div>
              
              <div class="activity-meta">
                ${priorityBadge}
                <span class="badge badge-primary">${activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}</span>
                ${activity.category ? `<span class="badge badge-primary">${activity.category}</span>` : ''}
              </div>
              
              ${activity.description ? `<p><strong>Description:</strong> ${activity.description}</p>` : ''}
              
              <div class="progress-container">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span><strong>Progress:</strong></span>
                  <span>${activity.progress_percentage || 0}%</span>
                </div>
                ${progressBar}
              </div>
              
              <p><strong>Due Date:</strong> ${new Date(activity.due_date).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
              
              ${activity.type === 'payment' ? `
                <p><strong>Total Amount:</strong> $${activity.total_amount}</p>
                <p><strong>Remaining:</strong> $${activity.remaining_amount}</p>
              ` : ''}
              
              ${activity.type === 'purchase' && activity.target_item ? `
                <p><strong>Target Item:</strong> ${activity.target_item}</p>
              ` : ''}
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.APP_URL}/activities/${activity.id}" class="btn">View Task</a>
              <a href="${process.env.APP_URL}/activities" class="btn">All Tasks</a>
            </div>
          </div>
          
          <div class="footer">
            <p>This reminder was sent by ${process.env.APP_NAME}</p>
            <p>Manage your notifications in your <a href="${process.env.APP_URL}/dashboard/profile">profile settings</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate progress bar HTML
  static generateProgressBar(percentage) {
    return `
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
    `;
  }

  // Get activity type icon
  static getActivityTypeIcon(type) {
    const icons = {
      general: '📋',
      payment: '💰',
      purchase: '🛒',
      recurring: '🔄'
    };
    return icons[type] || '📋';
  }

  // Get priority badge
  static getPriorityBadge(priority) {
    const badges = {
      low: '<span class="badge badge-success">Low Priority</span>',
      medium: '<span class="badge badge-primary">Medium Priority</span>',
      high: '<span class="badge badge-warning">High Priority</span>',
      urgent: '<span class="badge badge-danger">Urgent</span>'
    };
    return badges[priority] || badges.medium;
  }

  // Send manual reminder for specific activity
  static async sendManualReminder(activityId, userId) {
    try {
      const activity = await Activity.findById(activityId, userId);
      
      if (!activity) {
        throw new Error('Activity not found');
      }

      // Get user details
      const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user[0]) {
        throw new Error('User not found');
      }

      // Add user email to activity object
      activity.email = user[0].email;
      activity.first_name = user[0].first_name;
      activity.last_name = user[0].last_name;

      // Send email reminder
      await this.sendEmailReminder(activity);

      // Send push notification if user has premium plan
      const userPlan = await db.query(`
        SELECT p.has_push_notifications
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
      `, [userId]);

      if (userPlan[0] && userPlan[0].has_push_notifications) {
        await this.sendPushReminder(activity);
      }

      return true;
    } catch (error) {
      console.error('Manual reminder error:', error);
      throw error;
    }
  }
}

module.exports = ReminderService;
