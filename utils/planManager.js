/**
 * Plan Manager Utility
 * Handles plan-related operations and trial management
 */

const db = require('../config/database');
const User = require('../models/User');

class PlanManager {
  // Check and handle trial expiry
  static async checkTrialExpiry() {
    try {
      console.log('🔍 Checking for expired trials...');
      
      // Find users with expired trials
      const expiredTrials = await db.query(`
        SELECT id, email, first_name, last_name, trial_end
        FROM users
        WHERE plan_id = 2 
          AND trial_end < NOW()
          AND is_trial_used = FALSE
      `);

      if (expiredTrials.length === 0) {
        console.log('✅ No expired trials found');
        return;
      }

      console.log(`📧 Found ${expiredTrials.length} expired trials`);

      for (const user of expiredTrials) {
        try {
          // Downgrade to free plan
          await User.updatePlan(user.id, 1); // Plan ID 1 is free plan
          await User.markTrialUsed(user.id);

          console.log(`✅ Downgraded user ${user.email} from trial to free plan`);

          // Optionally send notification email about trial expiry
          // await this.sendTrialExpiryEmail(user);

        } catch (error) {
          console.error(`❌ Failed to downgrade user ${user.id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('❌ Error checking trial expiry:', error);
    }
  }

  // Check if user can access feature based on their plan
  static async canAccessFeature(userId, feature) {
    try {
      const userPlan = await db.query(`
        SELECT p.*
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
      `, [userId]);

      if (!userPlan[0]) {
        return false;
      }

      const plan = userPlan[0];

      switch (feature) {
        case 'push_notifications':
          return plan.has_push_notifications;
        case 'attachments':
          return plan.has_attachments;
        case 'recurring_tasks':
          return plan.has_recurring_tasks;
        case 'categories':
          return plan.has_categories;
        case 'priority_levels':
          return plan.has_priority_levels;
        case 'advanced_progress':
          return plan.has_advanced_progress;
        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking feature access:', error);
      return false;
    }
  }

  // Get user's activity limit
  static async getActivityLimit(userId) {
    try {
      const userPlan = await db.query(`
        SELECT p.max_activities
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
      `, [userId]);

      return userPlan[0] ? userPlan[0].max_activities : 5; // Default to 5
    } catch (error) {
      console.error('Error getting activity limit:', error);
      return 5;
    }
  }

  // Check if user has reached activity limit
  static async hasReachedActivityLimit(userId) {
    try {
      const limit = await this.getActivityLimit(userId);
      
      // If unlimited (999999), never reached
      if (limit >= 999999) {
        return false;
      }

      const [count] = await db.query(`
        SELECT COUNT(*) as count
        FROM activities
        WHERE user_id = ? AND is_completed = FALSE
      `, [userId]);

      return count.count >= limit;
    } catch (error) {
      console.error('Error checking activity limit:', error);
      return false;
    }
  }

  // Get plan features comparison
  static async getPlanComparison() {
    try {
      const plans = await db.query(`
        SELECT * FROM plans 
        WHERE is_active = TRUE 
        ORDER BY price ASC
      `);

      return plans.map(plan => ({
        ...plan,
        features: {
          maxActivities: plan.max_activities >= 999999 ? 'Unlimited' : plan.max_activities,
          emailReminders: true, // All plans have email reminders
          pushNotifications: plan.has_push_notifications,
          attachments: plan.has_attachments,
          recurringTasks: plan.has_recurring_tasks,
          categories: plan.has_categories,
          priorityLevels: plan.has_priority_levels,
          advancedProgress: plan.has_advanced_progress
        }
      }));
    } catch (error) {
      console.error('Error getting plan comparison:', error);
      return [];
    }
  }

  // Calculate days remaining in trial
  static async getTrialDaysRemaining(userId) {
    try {
      const [user] = await db.query('SELECT trial_end FROM users WHERE id = ?', [userId]);
      
      if (!user || !user.trial_end) {
        return 0;
      }

      const trialEnd = new Date(user.trial_end);
      const now = new Date();
      const diffTime = trialEnd - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return Math.max(0, diffDays);
    } catch (error) {
      console.error('Error calculating trial days:', error);
      return 0;
    }
  }

  // Extend trial period (admin function)
  static async extendTrial(userId, additionalDays) {
    try {
      const [user] = await db.query('SELECT trial_end FROM users WHERE id = ?', [userId]);
      
      if (!user) {
        throw new Error('User not found');
      }

      let newTrialEnd;
      if (user.trial_end) {
        newTrialEnd = new Date(user.trial_end);
      } else {
        newTrialEnd = new Date();
      }
      
      newTrialEnd.setDate(newTrialEnd.getDate() + additionalDays);

      await db.query(`
        UPDATE users 
        SET trial_end = ?, plan_id = 2 
        WHERE id = ?
      `, [newTrialEnd, userId]);

      return true;
    } catch (error) {
      console.error('Error extending trial:', error);
      throw error;
    }
  }

  // Get subscription status
  static async getSubscriptionStatus(userId) {
    try {
      const [user] = await db.query(`
        SELECT u.plan_id, u.trial_end, u.subscription_end, u.is_trial_used, p.name as plan_name
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
      `, [userId]);

      if (!user) {
        return null;
      }

      const now = new Date();
      let status = 'active';
      let daysRemaining = null;
      let expiryDate = null;

      if (user.plan_name === 'Trial') {
        if (user.trial_end) {
          expiryDate = new Date(user.trial_end);
          const diffTime = expiryDate - now;
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (daysRemaining <= 0) {
            status = 'expired';
          } else if (daysRemaining <= 7) {
            status = 'expiring_soon';
          }
        }
      } else if (user.subscription_end) {
        expiryDate = new Date(user.subscription_end);
        const diffTime = expiryDate - now;
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 0) {
          status = 'expired';
        } else if (daysRemaining <= 7) {
          status = 'expiring_soon';
        }
      }

      return {
        planId: user.plan_id,
        planName: user.plan_name,
        status,
        daysRemaining,
        expiryDate,
        isTrialUsed: user.is_trial_used
      };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return null;
    }
  }

  // Send trial expiry warning emails
  static async sendTrialExpiryWarnings() {
    try {
      console.log('📧 Checking for trials expiring soon...');
      
      // Find users with trials expiring in 3 days
      const expiringTrials = await db.query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.trial_end,
               DATEDIFF(u.trial_end, NOW()) as days_remaining
        FROM users u
        WHERE u.plan_id = 2 
          AND u.trial_end BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY)
          AND u.is_trial_used = FALSE
      `);

      if (expiringTrials.length === 0) {
        console.log('✅ No trials expiring soon');
        return;
      }

      console.log(`📧 Found ${expiringTrials.length} trials expiring soon`);

      // TODO: Implement email sending for trial expiry warnings
      // This would use the same email service as reminders

      for (const user of expiringTrials) {
        console.log(`⚠️ Trial expiring for ${user.email} in ${user.days_remaining} days`);
      }

    } catch (error) {
      console.error('❌ Error sending trial expiry warnings:', error);
    }
  }

  // Get usage statistics for a user
  static async getUserUsageStats(userId) {
    try {
      const [activityUsage] = await db.query(`
        SELECT 
          COUNT(*) as total_activities,
          SUM(CASE WHEN is_completed = FALSE THEN 1 ELSE 0 END) as active_activities
        FROM activities
        WHERE user_id = ?
      `, [userId]);

      const limit = await this.getActivityLimit(userId);
      const usagePercentage = limit >= 999999 ? 0 : Math.round((activityUsage.active_activities / limit) * 100);

      return {
        totalActivities: activityUsage.total_activities,
        activeActivities: activityUsage.active_activities,
        activityLimit: limit,
        usagePercentage,
        isNearLimit: usagePercentage >= 80
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return {
        totalActivities: 0,
        activeActivities: 0,
        activityLimit: 5,
        usagePercentage: 0,
        isNearLimit: false
      };
    }
  }
}

module.exports = PlanManager;
