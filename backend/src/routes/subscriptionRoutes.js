const express = require('express');
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { initializePayment, verifyAndActivateSubscription, FLW_SECRET_HASH } = require('../services/flutterwaveService');

const router = express.Router();

// Public: Get all available plans with their 1, 3, 6, 12-month pricing tiers
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
      LEFT JOIN plan_duration_tiers t ON p.id = t.plan_id AND t.is_active = true
      WHERE p.is_active = true
      GROUP BY p.id
      ORDER BY p.max_tasks ASC;
    `);

    res.json({
      success: true,
      plans: plansRes.rows
    });
  } catch (error) {
    console.error('Fetch plans error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Authenticated: Get current user's active subscription details
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const subRes = await query(`
      SELECT s.*, p.name as plan_name, p.max_tasks 
      FROM user_subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > CURRENT_TIMESTAMP
      ORDER BY s.end_date DESC 
      LIMIT 1;
    `, [userId]);

    res.json({
      success: true,
      subscription: subRes.rows[0] || null
    });
  } catch (error) {
    console.error('Fetch current subscription error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Authenticated: Initialize Flutterwave Checkout
router.post('/initialize', authenticateToken, async (req, res) => {
  try {
    const { planId, tierId } = req.body;

    if (!planId || !tierId) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'planId and tierId are required' });
    }

    const planRes = await query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    const tierRes = await query('SELECT * FROM plan_duration_tiers WHERE id = $1 AND plan_id = $2', [tierId, planId]);
    if (tierRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Duration tier not found for this plan' });
    }

    const paymentResult = await initializePayment({
      user: req.user,
      plan: planRes.rows[0],
      tier: tierRes.rows[0]
    });

    res.json(paymentResult);
  } catch (error) {
    console.error('Initialize payment error:', error);
    res.status(500).json({ error: 'PAYMENT_INIT_ERROR', message: error.message });
  }
});

// Verify & Activate Payment (via Flutterwave redirect callback or client verification)
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const { transaction_id, tx_ref, mock, planId, tierId, duration, amount } = req.query;

    const result = await verifyAndActivateSubscription({
      transactionId: transaction_id,
      txRef: tx_ref,
      mock,
      planId,
      tierId,
      duration,
      amount,
      userId: req.user.id
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Verify subscription error:', error);
    res.status(500).json({ error: 'VERIFICATION_ERROR', message: error.message });
  }
});

// Flutterwave Webhook Listener
router.post('/webhook', async (req, res) => {
  try {
    const secretHash = req.headers['verif-hash'];
    if (!secretHash || secretHash !== FLW_SECRET_HASH) {
      return res.status(401).send('Unauthorized webhook call');
    }

    const event = req.body;
    if (event.event === 'charge.completed' && event.data.status === 'successful') {
      const { id: transactionId, tx_ref, amount, meta } = event.data;
      if (meta && meta.userId) {
        await verifyAndActivateSubscription({
          transactionId,
          txRef: tx_ref,
          amount,
          userId: meta.userId,
          planId: meta.planId,
          tierId: meta.tierId,
          duration: meta.durationMonths
        });
      }
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook error');
  }
});

module.exports = router;
