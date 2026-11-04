const express = require('express');
const { query } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);
router.use(requireAdmin);

// Admin Dashboard Overview Statistics
router.get('/stats', async (req, res) => {
  try {
    const usersCount = await query('SELECT COUNT(*) FROM users');
    const tasksCount = await query('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL');
    const overdueTasks = await query('SELECT COUNT(*) FROM tasks WHERE is_completed = false AND due_date < CURRENT_TIMESTAMP AND deleted_at IS NULL');
    const activeSubs = await query("SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active' AND end_date > CURRENT_TIMESTAMP");
    const totalRevenue = await query("SELECT COALESCE(SUM(amount_paid), 0) as total FROM user_subscriptions WHERE status = 'active'");

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(usersCount.rows[0].count, 10),
        totalTasks: parseInt(tasksCount.rows[0].count, 10),
        overdueTasks: parseInt(overdueTasks.rows[0].count, 10),
        activeSubscriptions: parseInt(activeSubs.rows[0].count, 10),
        totalRevenue: parseFloat(totalRevenue.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Admin: Get all plans and their configurable duration tiers (1, 3, 6, 12 months)
router.get('/plans', async (req, res) => {
  try {
    const plansRes = await query(`
      SELECT 
        p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', t.id,
              'duration_months', t.duration_months,
              'price', t.price,
              'currency', t.currency,
              'is_active', t.is_active
            ) ORDER BY t.duration_months ASC
          ) FILTER (WHERE t.id IS NOT NULL), '[]'
        ) as tiers
      FROM subscription_plans p
      LEFT JOIN plan_duration_tiers t ON p.id = t.plan_id
      GROUP BY p.id
      ORDER BY p.id ASC;
    `);

    res.json({
      success: true,
      plans: plansRes.rows
    });
  } catch (error) {
    console.error('Admin get plans error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Admin: Create new Plan
router.post('/plans', async (req, res) => {
  try {
    const { name, description, maxTasks = 50, hasPush = true, hasEmail = true, hasOffline = true } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Plan name is required' });
    }

    const planRes = await query(`
      INSERT INTO subscription_plans (name, description, max_tasks, has_push, has_email, has_offline, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `, [name, description || null, parseInt(maxTasks, 10), hasPush, hasEmail, hasOffline]);

    res.status(201).json({
      success: true,
      plan: planRes.rows[0]
    });
  } catch (error) {
    console.error('Admin create plan error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Admin: Update Plan details and Task Limit Quota
router.put('/plans/:id', async (req, res) => {
  try {
    const planId = req.params.id;
    const { name, description, maxTasks, isActive } = req.body;

    const planRes = await query(`
      UPDATE subscription_plans 
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        max_tasks = COALESCE($3, max_tasks),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [
      name,
      description,
      maxTasks !== undefined ? parseInt(maxTasks, 10) : null,
      isActive !== undefined ? Boolean(isActive) : null,
      planId
    ]);

    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    res.json({
      success: true,
      plan: planRes.rows[0]
    });
  } catch (error) {
    console.error('Admin update plan error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Admin: Configure or Update Duration Tier (1, 3, 6, 12 months) for a Plan
router.post('/plans/:id/tiers', async (req, res) => {
  try {
    const planId = req.params.id;
    const { durationMonths, price, currency = 'USD' } = req.body;

    if (!durationMonths || price === undefined) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'durationMonths and price are required' });
    }

    const duration = parseInt(durationMonths, 10);
    if (![1, 3, 6, 12].includes(duration)) {
      return res.status(400).json({ error: 'INVALID_DURATION', message: 'Duration must be 1, 3, 6, or 12 months' });
    }

    // Upsert tier for this plan & duration
    const existingTier = await query(
      'SELECT id FROM plan_duration_tiers WHERE plan_id = $1 AND duration_months = $2',
      [planId, duration]
    );

    let tierResult;
    if (existingTier.rows.length > 0) {
      tierResult = await query(`
        UPDATE plan_duration_tiers 
        SET price = $1, currency = $2, is_active = true, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3
        RETURNING *
      `, [parseFloat(price), currency, existingTier.rows[0].id]);
    } else {
      tierResult = await query(`
        INSERT INTO plan_duration_tiers (plan_id, duration_months, price, currency, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING *
      `, [planId, duration, parseFloat(price), currency]);
    }

    res.json({
      success: true,
      tier: tierResult.rows[0]
    });
  } catch (error) {
    console.error('Admin configure tier error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Admin: List all Users with Subscription status & task counts
router.get('/users', async (req, res) => {
  try {
    const usersRes = await query(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
        p.name as plan_name,
        COALESCE(s.task_limit, p.max_tasks, 10) as current_limit,
        s.status as subscription_status,
        s.end_date as subscription_end_date,
        COUNT(t.id) as task_count
      FROM users u
      LEFT JOIN subscription_plans p ON u.plan_id = p.id
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active' AND s.end_date > CURRENT_TIMESTAMP
      LEFT JOIN tasks t ON u.id = t.user_id AND t.deleted_at IS NULL
      GROUP BY u.id, p.name, p.max_tasks, s.task_limit, s.status, s.end_date
      ORDER BY u.created_at DESC;
    `);

    res.json({
      success: true,
      users: usersRes.rows
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

module.exports = router;
