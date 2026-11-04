const { query } = require('../database/db');

/**
 * Middleware: Enforce Task Quota
 * Determines user's effective task limit:
 * 1. Checks active user_subscriptions (status = 'active' and end_date > NOW())
 * 2. If active subscription exists, uses sub.task_limit
 * 3. Otherwise falls back to subscription_plans (plan_id = user.plan_id or default Free = 10)
 * 4. Counts active (non-deleted) tasks created by this user
 * 5. If task count >= max allowed, blocks creation with HTTP 403 and upgrade options.
 */
async function enforceTaskQuota(req, res, next) {
  try {
    const userId = req.user.id;

    // 1. Get active subscription if any
    const subRes = await query(`
      SELECT task_limit, end_date, plan_id 
      FROM user_subscriptions 
      WHERE user_id = $1 AND status = 'active' AND end_date > CURRENT_TIMESTAMP 
      ORDER BY end_date DESC 
      LIMIT 1
    `, [userId]);

    let maxTasks = 10; // Default free limit
    let currentPlanName = 'Free Starter';

    if (subRes.rows.length > 0) {
      maxTasks = subRes.rows[0].task_limit;
      currentPlanName = 'Active Subscription';
    } else {
      // Check user's assigned plan in subscription_plans
      const planRes = await query(`
        SELECT name, max_tasks 
        FROM subscription_plans 
        WHERE id = $1
      `, [req.user.plan_id || 1]);

      if (planRes.rows.length > 0) {
        maxTasks = planRes.rows[0].max_tasks;
        currentPlanName = planRes.rows[0].name;
      }
    }

    // 2. Count active tasks
    const countRes = await query(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE user_id = $1 AND deleted_at IS NULL
    `, [userId]);

    const activeCount = parseInt(countRes.rows[0].count, 10);

    // Attach quota info to request for controllers
    req.quotaInfo = {
      activeCount,
      maxTasks,
      planName: currentPlanName,
      remaining: Math.max(0, maxTasks - activeCount)
    };

    if (activeCount >= maxTasks) {
      return res.status(403).json({
        error: 'TASK_LIMIT_REACHED',
        message: `You have reached your limit of ${maxTasks} tasks under the ${currentPlanName} plan. Please upgrade your subscription to create more tasks.`,
        currentCount: activeCount,
        maxTasks,
        planName: currentPlanName,
        upgradeRequired: true
      });
    }

    next();
  } catch (error) {
    console.error('Error in enforceTaskQuota middleware:', error);
    next(); // Pass on system error or continue gracefully
  }
}

module.exports = {
  enforceTaskQuota
};
