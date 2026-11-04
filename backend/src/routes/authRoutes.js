const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'All required fields must be provided' });
    }

    // Check duplicate
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'EMAIL_EXISTS', message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userRes = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role, plan_id)
      VALUES ($1, $2, $3, $4, $5, 'USER', 1)
      RETURNING id, email, first_name, last_name, role, plan_id, created_at
    `, [email.toLowerCase().trim(), passwordHash, firstName, lastName, phone || null]);

    const user = userRes.rows[0];
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      user,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email and password are required' });
    }

    const userRes = await query(`
      SELECT u.*, p.name as plan_name, p.max_tasks 
      FROM users u
      LEFT JOIN subscription_plans p ON u.plan_id = p.id
      WHERE u.email = $1
    `, [email.toLowerCase().trim()]);

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const token = generateToken(user);

    // Fetch active subscription if any
    const subRes = await query(`
      SELECT * FROM user_subscriptions 
      WHERE user_id = $1 AND status = 'active' AND end_date > CURRENT_TIMESTAMP 
      ORDER BY end_date DESC LIMIT 1
    `, [user.id]);

    delete user.password_hash;

    res.json({
      success: true,
      token,
      user,
      subscription: subRes.rows[0] || null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Admin Login
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' });
    }

    const user = userRes.rows[0];
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied: not an administrator' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' });
    }

    const token = generateToken(user);
    delete user.password_hash;

    res.json({
      success: true,
      token,
      user
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Get current user profile & subscription
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get active subscription
    const subRes = await query(`
      SELECT s.*, p.name as plan_name 
      FROM user_subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > CURRENT_TIMESTAMP 
      ORDER BY s.end_date DESC LIMIT 1
    `, [userId]);

    // Get task counts
    const taskCountRes = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_completed = true) as completed,
        COUNT(*) FILTER (WHERE is_completed = false) as pending,
        COUNT(*) FILTER (WHERE is_completed = false AND due_date < CURRENT_TIMESTAMP) as overdue
      FROM tasks 
      WHERE user_id = $1 AND deleted_at IS NULL
    `, [userId]);

    const activeSub = subRes.rows[0];
    const planRes = await query('SELECT * FROM subscription_plans WHERE id = $1', [req.user.plan_id || 1]);
    const plan = planRes.rows[0] || { name: 'Free Starter', max_tasks: 10 };

    const effectiveLimit = activeSub ? activeSub.task_limit : plan.max_tasks;
    const currentTasks = parseInt(taskCountRes.rows[0].total, 10);

    res.json({
      user: req.user,
      subscription: activeSub || null,
      plan,
      quota: {
        currentTasks,
        maxTasks: effectiveLimit,
        remaining: Math.max(0, effectiveLimit - currentTasks),
        isLimitReached: currentTasks >= effectiveLimit
      },
      stats: taskCountRes.rows[0]
    });
  } catch (error) {
    console.error('Me endpoint error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Register Push Token (Expo mobile app or Web Push)
router.post('/push-token', authenticateToken, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'MISSING_TOKEN', message: 'Token is required' });
    }

    await query(`
      INSERT INTO push_tokens (user_id, token, platform, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (token) DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, token, platform || 'android']);

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('Push token registration error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

module.exports = router;
