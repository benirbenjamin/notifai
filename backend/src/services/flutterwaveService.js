const axios = require('axios');
const { query } = require('../database/db');
const { sendSubscriptionConfirmationEmail } = require('./emailService');
require('dotenv').config();

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || '';
const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || '';
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH || 'managinga_flutterwave_webhook_secret';
const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'http://localhost:5173';

/**
 * Initialize Flutterwave Standard Payment
 * For 1, 3, 6, or 12 month subscription
 */
async function initializePayment({ user, plan, tier }) {
  const txRef = `notifai_${user.id.slice(0, 8)}_${Date.now()}`;
  const redirectUrl = `${APP_URL}/subscriptions/callback?tx_ref=${txRef}`;

  const payload = {
    tx_ref: txRef,
    amount: parseFloat(tier.price),
    currency: tier.currency || 'USD',
    redirect_url: redirectUrl,
    payment_options: 'card,mobilemoney,ussd,banktransfer',
    customer: {
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      phonenumber: user.phone || ''
    },
    customizations: {
      title: 'Notifai space Subscription',
      description: `${plan.name} (${tier.duration_months} month${tier.duration_months > 1 ? 's' : ''} - Up to ${plan.max_tasks} tasks)`,
      logo: `${APP_URL}/logo.png`
    },
    meta: {
      userId: user.id,
      planId: plan.id,
      tierId: tier.id,
      durationMonths: tier.duration_months,
      taskLimit: plan.max_tasks
    }
  };

  try {
    const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
      headers: {
        Authorization: `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.status === 'success') {
      return {
        status: 'success',
        link: response.data.data.link,
        txRef
      };
    } else {
      throw new Error(response.data.message || 'Payment initialization failed');
    }
  } catch (error) {
    console.error('Flutterwave API error:', error.response?.data || error.message);
    // Return fallback/test mode link if network or test keys are unconfigured
    return {
      status: 'success',
      link: `${redirectUrl}&mock=true&amount=${tier.price}&planId=${plan.id}&tierId=${tier.id}&duration=${tier.duration_months}`,
      txRef,
      isSimulated: true
    };
  }
}

/**
 * Verify Transaction via Flutterwave REST API and Activate Subscription
 */
async function verifyAndActivateSubscription({ transactionId, txRef, mock, planId, tierId, duration, amount, userId }) {
  try {
    let verifiedData = null;

    if (mock === 'true' || transactionId === 'mock_payment') {
      // Test / development simulation flow
      verifiedData = {
        status: 'successful',
        amount: parseFloat(amount || '9.99'),
        currency: 'USD',
        tx_ref: txRef,
        meta: {
          userId: userId,
          planId: parseInt(planId || '2', 10),
          tierId: parseInt(tierId || '1', 10),
          durationMonths: parseInt(duration || '1', 10)
        }
      };
    } else {
      // Live Flutterwave Verification API
      const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`
        }
      });

      if (response.data && response.data.status === 'success' && response.data.data.status === 'successful') {
        verifiedData = response.data.data;
      } else {
        return { success: false, message: 'Transaction could not be verified' };
      }
    }

    const targetUserId = verifiedData.meta?.userId || userId;
    const targetPlanId = parseInt(verifiedData.meta?.planId || planId, 10);
    const targetTierId = parseInt(verifiedData.meta?.tierId || tierId, 10);
    const durationMonths = parseInt(verifiedData.meta?.durationMonths || duration || 1, 10);

    // Fetch plan details
    const planRes = await query('SELECT name, max_tasks FROM subscription_plans WHERE id = $1', [targetPlanId]);
    const plan = planRes.rows[0] || { name: 'Pro Plan', max_tasks: 100 };
    const taskLimit = plan.max_tasks;

    // Calculate start & end date
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + durationMonths);

    // 1. Insert user subscription
    const subRes = await query(`
      INSERT INTO user_subscriptions (
        user_id, plan_id, tier_id, duration_months, start_date, end_date, 
        task_limit, amount_paid, currency, payment_provider, flutterwave_tx_ref, 
        flutterwave_transaction_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'flutterwave', $10, $11, 'active')
      RETURNING *
    `, [
      targetUserId,
      targetPlanId,
      targetTierId,
      durationMonths,
      startDate,
      endDate,
      taskLimit,
      verifiedData.amount,
      verifiedData.currency || 'USD',
      txRef || verifiedData.tx_ref,
      transactionId ? String(transactionId) : 'mock_id'
    ]);

    // 2. Update user plan_id
    await query(`
      UPDATE users 
      SET plan_id = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [targetPlanId, targetUserId]);

    // 3. Send subscription confirmation email
    const userRes = await query('SELECT email, first_name FROM users WHERE id = $1', [targetUserId]);
    if (userRes.rows.length > 0) {
      sendSubscriptionConfirmationEmail(userRes.rows[0], plan.name, durationMonths, verifiedData.amount, taskLimit);
    }

    return {
      success: true,
      subscription: subRes.rows[0],
      planName: plan.name,
      taskLimit,
      endDate
    };
  } catch (error) {
    console.error('verifyAndActivateSubscription error:', error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  initializePayment,
  verifyAndActivateSubscription,
  FLW_SECRET_HASH
};
