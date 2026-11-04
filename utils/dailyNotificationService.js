/**
 * Daily Notification Service
 * Sends comprehensive daily notifications at 8 PM for activities due/overdue
 */

const NotificationService = require('./notificationService');
const db = require('../config/database');

class DailyNotificationService {
  
  /**
   * Send daily summary notifications at 8 PM
   * Checks for activities that are:
   * - Due today
   * - Due tomorrow
   * - Overdue
   * - Due within the next 3 days
   */
  static async sendDailyNotifications() {
    try {
      console.log('🌅 Starting daily notification check at 8 PM...');
      
      // Get all users who have activities
      const users = await this.getUsersWithActivities();
      
      if (users.length === 0) {
        console.log('📭 No users with activities found');
        return;
      }

      console.log(`👥 Found ${users.length} users to check for notifications`);

      for (const user of users) {
        try {
          await this.sendUserDailyNotification(user);
        } catch (error) {
          console.error(`❌ Failed to send daily notification to user ${user.id}:`, error);
        }
      }

      console.log('✅ Daily notification check completed');
    } catch (error) {
      console.error('❌ Error in daily notification service:', error);
    }
  }

  /**
   * Get all users who have activities and notifications enabled
   */
  static async getUsersWithActivities() {
    const query = `
      SELECT DISTINCT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.timezone,
        u.email_notifications,
        u.push_notifications
      FROM users u
      INNER JOIN activities a ON u.id = a.user_id
      WHERE u.email_notifications = TRUE 
        OR u.push_notifications = TRUE
    `;
    
    const [users] = await db.query(query);
    return users;
  }

  /**
   * Send daily notification summary to a specific user
   */
  static async sendUserDailyNotification(user) {
    // Get user's activities that need attention
    const activities = await this.getUserActivitiesForNotification(user.id);
    
    if (activities.length === 0) {
      console.log(`📭 No activities needing notification for user ${user.first_name || user.email}`);
      return;
    }

    // Categorize activities
    const categorized = this.categorizeActivities(activities);
    
    // Only send notification if there are important activities
    if (categorized.total === 0) {
      return;
    }

    console.log(`📱 Sending daily notification to ${user.first_name || user.email}:`, {
      overdue: categorized.overdue.length,
      dueToday: categorized.dueToday.length,
      dueTomorrow: categorized.dueTomorrow.length,
      dueThisWeek: categorized.dueThisWeek.length
    });

    // Prepare notification data
    const notificationData = this.prepareNotificationData(categorized, user);
    
    // Send the notification
    await NotificationService.sendNotification(user.id, 'daily_summary', notificationData);
  }

  /**
   * Get user's activities that need notification
   */
  static async getUserActivitiesForNotification(userId) {
    const query = `
      SELECT 
        id,
        title,
        description,
        type,
        priority,
        due_date,
        end_time,
        start_time,
        is_completed,
        progress_percentage,
        created_at
      FROM activities 
      WHERE user_id = ? 
        AND is_completed = FALSE
        AND (
          due_date <= DATE_ADD(NOW(), INTERVAL 7 DAY)
          OR end_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)
          OR due_date < NOW()
          OR end_time < NOW()
        )
      ORDER BY 
        CASE 
          WHEN due_date < NOW() OR end_time < NOW() THEN 1  -- Overdue first
          WHEN DATE(due_date) = CURDATE() OR DATE(end_time) = CURDATE() THEN 2  -- Due today
          WHEN DATE(due_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) 
            OR DATE(end_time) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 3  -- Due tomorrow
          ELSE 4  -- Due later
        END,
        priority = 'urgent' DESC,
        priority = 'high' DESC,
        priority = 'medium' DESC,
        due_date ASC,
        end_time ASC
    `;
    
    const [activities] = await db.query(query, [userId]);
    return activities;
  }

  /**
   * Categorize activities by urgency
   */
  static categorizeActivities(activities) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const categorized = {
      overdue: [],
      dueToday: [],
      dueTomorrow: [],
      dueThisWeek: [],
      total: 0
    };

    activities.forEach(activity => {
      const dueDate = activity.due_date ? new Date(activity.due_date) : null;
      const endTime = activity.end_time ? new Date(activity.end_time) : null;
      const effectiveDate = endTime || dueDate;

      if (!effectiveDate) return;

      // Check if overdue
      if (effectiveDate < now) {
        categorized.overdue.push(activity);
      }
      // Check if due today
      else if (effectiveDate >= today && effectiveDate < tomorrow) {
        categorized.dueToday.push(activity);
      }
      // Check if due tomorrow
      else if (effectiveDate >= tomorrow && effectiveDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
        categorized.dueTomorrow.push(activity);
      }
      // Check if due this week
      else if (effectiveDate < nextWeek) {
        categorized.dueThisWeek.push(activity);
      }
    });

    categorized.total = categorized.overdue.length + categorized.dueToday.length + 
                      categorized.dueTomorrow.length + categorized.dueThisWeek.length;

    return categorized;
  }

  /**
   * Prepare notification data for sending
   */
  static prepareNotificationData(categorized, user) {
    const { overdue, dueToday, dueTomorrow, dueThisWeek } = categorized;
    
    // Create title based on most urgent items
    let title = '📅 Daily Task Summary';
    if (overdue.length > 0) {
      title = `🚨 ${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''}!`;
    } else if (dueToday.length > 0) {
      title = `⏰ ${dueToday.length} Task${dueToday.length > 1 ? 's' : ''} Due Today`;
    } else if (dueTomorrow.length > 0) {
      title = `📋 ${dueTomorrow.length} Task${dueTomorrow.length > 1 ? 's' : ''} Due Tomorrow`;
    }

    // Create summary message
    let message = `Hello ${user.first_name || 'there'}! Here's your task summary:\n\n`;
    
    if (overdue.length > 0) {
      message += `🚨 ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}:\n`;
      overdue.slice(0, 3).forEach(activity => {
        const daysOverdue = Math.floor((new Date() - new Date(activity.due_date || activity.end_time)) / (1000 * 60 * 60 * 24));
        message += `  • ${activity.title} (${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue)\n`;
      });
      if (overdue.length > 3) {
        message += `  • ... and ${overdue.length - 3} more\n`;
      }
      message += '\n';
    }

    if (dueToday.length > 0) {
      message += `⏰ ${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today:\n`;
      dueToday.slice(0, 3).forEach(activity => {
        message += `  • ${activity.title}\n`;
      });
      if (dueToday.length > 3) {
        message += `  • ... and ${dueToday.length - 3} more\n`;
      }
      message += '\n';
    }

    if (dueTomorrow.length > 0) {
      message += `📋 ${dueTomorrow.length} task${dueTomorrow.length > 1 ? 's' : ''} due tomorrow:\n`;
      dueTomorrow.slice(0, 2).forEach(activity => {
        message += `  • ${activity.title}\n`;
      });
      if (dueTomorrow.length > 2) {
        message += `  • ... and ${dueTomorrow.length - 2} more\n`;
      }
      message += '\n';
    }

    if (dueThisWeek.length > 0 && (overdue.length + dueToday.length + dueTomorrow.length) < 5) {
      message += `📅 ${dueThisWeek.length} task${dueThisWeek.length > 1 ? 's' : ''} due this week\n\n`;
    }

    // Add call to action for overdue tasks
    if (overdue.length > 0) {
      message += "❓ Have you completed any of these overdue tasks? Please mark them as complete in the app.";
    } else {
      message += "Keep up the great work! 🎉";
    }

    return {
      title,
      message,
      categories: categorized,
      userName: user.first_name || 'User',
      totalTasks: categorized.total,
      urgencyLevel: overdue.length > 0 ? 'critical' : dueToday.length > 0 ? 'high' : 'medium'
    };
  }

  /**
   * Send completion reminder for overdue tasks
   */
  static async sendOverdueCompletionReminder(userId, overdueActivities) {
    if (overdueActivities.length === 0) return;

    const notificationData = {
      title: '🤔 Task Completion Check',
      message: `You have ${overdueActivities.length} overdue task${overdueActivities.length > 1 ? 's' : ''}. Have you completed any of these? Please update your progress in the app.`,
      activities: overdueActivities.map(activity => ({
        id: activity.id,
        title: activity.title,
        daysPastDue: Math.floor((new Date() - new Date(activity.due_date || activity.end_time)) / (1000 * 60 * 60 * 24))
      })),
      actionRequired: true
    };

    await NotificationService.sendNotification(userId, 'overdue_completion_check', notificationData);
  }

  /**
   * Test function to check notifications for a specific user
   */
  static async testUserNotification(userId) {
    console.log(`🧪 Testing daily notification for user ${userId}...`);
    
    const user = await this.getUserById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    await this.sendUserDailyNotification(user);
    console.log('✅ Test notification sent');
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId) {
    const query = `
      SELECT 
        id, email, first_name, last_name, timezone,
        email_notifications, push_notifications
      FROM users 
      WHERE id = ?
    `;
    
    const [users] = await db.query(query, [userId]);
    return users[0] || null;
  }
}

module.exports = DailyNotificationService;
