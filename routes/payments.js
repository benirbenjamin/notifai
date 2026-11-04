/**
 * Payment Routes - Subscription Management
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { requireAuth, checkPlanLimits, redirectAdminToPanel } = require('../middleware/auth');
const currencyConverter = require('../utils/currencyConverter');
const db = require('../config/database');

const router = express.Router();

// Apply middleware to all payment routes
router.use(requireAuth);
// router.use(redirectAdminToPanel); // Redirect admin users to admin panel - temporarily disabled
router.use(checkPlanLimits);

// Plans page
router.get('/plans', async (req, res) => {
  try {
    const plans = await db.query(`
      SELECT * FROM plans 
      WHERE is_active = TRUE AND id IN (1, 2)
      ORDER BY price ASC
    `);
    
    const userId = req.session.user.id;
    const userWithPlan = await User.findWithPlan(userId);
    
    // Get currency data for frontend
    const currencyData = await currencyConverter.getCurrencyData(10); // $10 base amount
    
    console.log('💰 CURRENCY DATA DEBUG:');
    console.log('currencyData type:', typeof currencyData);
    console.log('currencyData keys:', Object.keys(currencyData || {}));
    console.log('currencyData content:', JSON.stringify(currencyData, null, 2));
    
    res.render('payments/plans', {
      title: 'Subscription Plans',
      plans,
      currentPlan: userWithPlan,
      currencyData,
      flutterwavePublicKey: process.env.FLW_PUBLIC_KEY,
      query: req.query
    });

  } catch (error) {
    console.error('Plans page error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load plans',
      error: {}
    });
  }
});

// Currency conversion API endpoint
router.get('/api/currency/:currency', async (req, res) => {
  try {
    const { currency } = req.params;
    const baseAmount = parseFloat(req.query.amount) || 10;
    
    const conversion = await currencyConverter.convertFromUSD(baseAmount, currency.toUpperCase());
    const formatted = currencyConverter.formatCurrency(conversion.convertedAmount, currency.toUpperCase());
    
    res.json({
      success: true,
      conversion: {
        ...conversion,
        formatted
      }
    });
  } catch (error) {
    console.error('Currency conversion error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Initiate lifetime subscription payment
router.post('/subscribe', [
  body('planId').notEmpty().withMessage('Plan ID is required'),
  body('currency').optional().isIn(['USD', 'NGN', 'KES', 'UGX', 'RWF', 'GHS', 'ZAR', 'EUR', 'GBP']).withMessage('Invalid currency selected')
], async (req, res) => {
  try {
    console.log('=== PAYMENT DEBUG START ===');
    console.log('Full request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg,
        validationErrors: errors.array()
      });
    }

    const userId = req.session.user.id;
    const { planId, currency, duration } = req.body;
    
    console.log('🎯 EXTRACTED REQUEST VALUES:');
    console.log('Extracted values:', { 
      userId, 
      planId, 
      currency,
      duration,
      planIdType: typeof planId,
      planIdParsed: parseInt(planId)
    });
    
    // Get plan details
    const planQuery = 'SELECT * FROM plans WHERE id = ? AND is_active = TRUE';
    console.log('Executing query:', planQuery, 'with planId:', planId);
    
    const [planResults] = await db.query(planQuery, [parseInt(planId)]);
    
    console.log('🔍 RAW DATABASE RESPONSE DEBUG:');
    console.log('typeof planResults:', typeof planResults);
    console.log('Array.isArray(planResults):', Array.isArray(planResults));
    console.log('planResults:', planResults);
    console.log('planResults.length:', planResults ? planResults.length : 'null');
    
    if (!planResults || planResults.length === 0) {
      console.log('❌ Plan not found or inactive');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid plan selected' 
      });
    }

    // Handle both array and object responses from database
    let plan;
    if (Array.isArray(planResults)) {
      plan = planResults[0];
      console.log('✅ Database returned array, using first element');
    } else {
      plan = planResults;
      console.log('✅ Database returned object, using directly');
    }
    
    console.log('🎯 EXTRACTED PLAN OBJECT:');
    console.log('plan:', plan);
    console.log('typeof plan:', typeof plan);
    console.log('plan.id:', plan ? plan.id : 'undefined');
    console.log('plan.price:', plan ? plan.price : 'undefined');
    
    if (!plan) {
      console.log('❌ Plan object is null/undefined after extraction');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid plan data' 
      });
    }

    // Only allow upgrading to premium plan (plan ID 2)
    const parsedPlanId = parseInt(planId);
    console.log('Checking plan ID:', { planId, parsedPlanId, expected: 2 });
    
    if (parsedPlanId !== 2) {
      console.log('❌ Invalid plan ID - not premium plan');
      return res.status(400).json({ 
        success: false, 
        message: 'Only premium plan upgrades are available' 
      });
    }

    // Ensure it's the premium plan with correct price
    const planPrice = parseFloat(plan.price);
    console.log('Price validation:', { 
      isLifetime: plan.is_lifetime, 
      planPrice, 
      expected: 10.00,
      priceMatch: planPrice === 10.00 
    });
    
    if (!plan.is_lifetime || planPrice !== 10.00) {
      console.log('❌ Plan validation failed');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid premium plan configuration' 
      });
    }

    // Validate duration for lifetime plan
    console.log('Duration validation:', { duration, expected: 'lifetime' });
    if (duration !== 'lifetime') {
      console.log('❌ Invalid duration for lifetime plan');
      return res.status(400).json({ 
        success: false, 
        message: 'This is a lifetime plan, duration must be "lifetime"' 
      });
    }

    console.log('✅ All validations passed, proceeding with payment...');

    // Check if user already has this plan
    const user = await User.findById(userId);
    if (user.plan_id === planId) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have this plan' 
      });
    }

    // Multicurrency handling: Payment in selected currency, storage in USD
    let paymentAmount = plan.price; // Amount to send to Flutterwave
    let paymentCurrency = currency || 'USD'; // Currency for Flutterwave payment
    const storageAmountUSD = parseFloat(plan.price); // Always store USD amount for consistency
    
    console.log('💰 MULTICURRENCY PROCESSING:');
    console.log('Original plan price (USD):', plan.price);
    console.log('Selected payment currency:', paymentCurrency);
    console.log('Currency from request body:', currency);
    console.log('paymentCurrency !== "USD"?', paymentCurrency !== 'USD');
    
    if (paymentCurrency !== 'USD') {
      try {
        console.log('🔄 Converting from USD to', paymentCurrency);
        const conversion = await currencyConverter.convertFromUSD(plan.price, paymentCurrency);
        paymentAmount = conversion.convertedAmount;
        
        console.log('💱 Raw conversion result:', conversion);
        
        // Round appropriately for different currencies
        if (['UGX', 'RWF'].includes(paymentCurrency)) {
          paymentAmount = Math.round(paymentAmount); // Whole numbers for African currencies
          console.log('🔢 Rounded for African currency:', paymentAmount);
        } else {
          paymentAmount = Math.round(paymentAmount * 100) / 100; // 2 decimal places
          console.log('🔢 Rounded to 2 decimals:', paymentAmount);
        }
        
        console.log('✅ Currency conversion successful:', {
          originalUSD: plan.price,
          convertedAmount: paymentAmount,
          paymentCurrency: paymentCurrency,
          conversionRate: conversion.rate,
          storageAmountUSD: storageAmountUSD
        });
      } catch (error) {
        console.error('❌ Currency conversion error:', error);
        // Fallback to USD if conversion fails
        paymentAmount = plan.price;
        paymentCurrency = 'USD';
        console.log('⚠️ Using fallback currency: USD due to conversion error');
      }
    } else {
      console.log('✅ Payment in USD, no conversion needed');
    }

    // Create transaction reference
    const tx_ref = `SUB_${userId}_${Date.now()}`;
    
    console.log('💳 PAYMENT PREPARATION:');
    console.log('Transaction reference:', tx_ref);
    console.log('Payment amount:', paymentAmount, paymentCurrency);
    console.log('Storage amount:', storageAmountUSD, 'USD');

    // Prepare Flutterwave payment payload
    const paymentPayload = {
      public_key: process.env.FLW_PUBLIC_KEY,
      tx_ref: tx_ref,
      amount: paymentAmount.toString(), // Amount in selected currency (e.g., RWF)
      currency: paymentCurrency, // Currency for payment (e.g., RWF)
      payment_options: 'card,mobilemoney,ussd',
      redirect_url: `${process.env.APP_URL}/payments/verify`,
      customer: {
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      },
      customizations: {
        title: 'Managinga Space Subscription',
        description: `${plan.name} Plan - Lifetime Access`,
        logo: `${process.env.APP_URL}/images/logo.png`
      },
      meta: {
        user_id: userId,
        plan_id: planId,
        duration: duration,
        original_amount_usd: storageAmountUSD, // Always store USD for consistency
        payment_amount: paymentAmount, // Amount paid in selected currency
        payment_currency: paymentCurrency // Currency used for payment
      }
    };
    
    console.log('� Final payment payload:', JSON.stringify(paymentPayload, null, 2));

    
    console.log('📤 Final payment payload:', JSON.stringify(paymentPayload, null, 2));

    // Initialize payment with Flutterwave
    const response = await axios.post('https://api.flutterwave.com/v3/payments', paymentPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.status === 'success') {
      res.json({
        success: true,
        paymentUrl: response.data.data.link,
        transactionRef: tx_ref
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to initialize payment'
      });
    }

  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request'
    });
  }
});

// Verify payment
router.get('/verify', async (req, res) => {
  try {
    const { transaction_id, tx_ref, status } = req.query;
    
    console.log('💳 PAYMENT VERIFICATION:');
    console.log('Transaction ID:', transaction_id);
    console.log('TX Reference:', tx_ref);
    console.log('Status:', status);
    
    if (status !== 'successful') {
      console.log('❌ Payment status not successful');
      return res.redirect('/payments/plans?error=Payment was not successful');
    }

    // Verify transaction with Flutterwave
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: {
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`
      }
    });

    const transaction = response.data.data;
    
    console.log('🔍 Flutterwave transaction data:', {
      status: transaction.status,
      tx_ref: transaction.tx_ref,
      amount: transaction.amount,
      currency: transaction.currency,
      meta: transaction.meta
    });
    
    if (transaction.status === 'successful' && transaction.tx_ref === tx_ref) {
      const { user_id, plan_id, original_amount_usd, payment_amount, payment_currency } = transaction.meta;
      
      console.log('💰 Processing successful payment:', {
        user_id,
        plan_id,
        payment_amount,
        payment_currency,
        original_amount_usd
      });
      
      // For lifetime subscription, no end date needed
      await db.query(`
        UPDATE users 
        SET plan_id = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [plan_id, user_id]);

      // Create a payment record - store both payment amount and USD equivalent
      await db.query(`
        INSERT INTO user_subscriptions 
        (user_id, plan_id, flutterwave_transaction_id, amount, currency, amount_usd, duration_months, start_date, end_date, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `, [
        user_id, 
        plan_id, 
        transaction_id, 
        payment_amount || transaction.amount, // Amount paid in payment currency
        payment_currency || transaction.currency, // Currency used for payment
        original_amount_usd || 10.00, // USD equivalent for consistency
        999999, // Large number to represent lifetime (999999 months ≈ 83,333 years)
        new Date(), // start_date
        new Date(2099, 11, 31) // end_date - far future date for lifetime
      ]);

      console.log('✅ Payment processed successfully - user upgraded to premium');

      // Update session
      if (req.session.user && req.session.user.id == user_id) {
        req.session.user.planId = parseInt(plan_id);
      }

      res.redirect('/payments/success');
    } else {
      console.log('❌ Payment verification failed');
      res.redirect('/payments/plans?error=Payment verification failed');
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.redirect('/payments/plans?error=An error occurred during payment verification');
  }
});

// Payment success page
router.get('/success', (req, res) => {
  res.render('payments/success', {
    title: 'Payment Successful',
    message: 'Your subscription has been activated successfully!'
  });
});

// Subscription history
router.get('/history', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const subscriptions = await db.query(`
      SELECT s.*, p.name as plan_name
      FROM user_subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `, [userId]);

    res.render('payments/history', {
      title: 'Subscription History',
      subscriptions
    });

  } catch (error) {
    console.error('Subscription history error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load subscription history',
      error: {}
    });
  }
});

// Cancel subscription
router.post('/cancel', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Find active subscription
    const [subscription] = await db.query(`
      SELECT * FROM user_subscriptions 
      WHERE user_id = ? AND status = 'active' 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [userId]);

    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Update subscription status and downgrade user to free plan
    await db.transaction([
      {
        sql: `UPDATE user_subscriptions 
              SET status = 'cancelled' 
              WHERE id = ?`,
        params: [subscription.id]
      },
      {
        sql: `UPDATE users 
              SET plan_id = 1, subscription_end = NULL 
              WHERE id = ?`,
        params: [userId]
      }
    ]);

    // Update session
    req.session.user.planId = 1;

    res.redirect('/payments/plans?success=downgraded');

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while cancelling subscription'
    });
  }
});

// Switch to free plan
router.post('/switch-to-free', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Update user to free plan
    await db.query(`
      UPDATE users 
      SET plan_id = 1, subscription_end = NULL 
      WHERE id = ?
    `, [userId]);

    // Update session
    req.session.user.planId = 1;

    res.redirect('/payments/plans?success=switched_to_free');

  } catch (error) {
    console.error('Switch to free plan error:', error);
    res.redirect('/payments/plans?error=failed_to_switch');
  }
});

// API endpoint for currency conversion
router.get('/api/convert', async (req, res) => {
  try {
    const { amount, from, to } = req.query;
    
    if (!amount || !from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: amount, from, to'
      });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    let convertedAmount;
    let rate;

    if (from === 'USD' && to === 'RWF') {
      convertedAmount = await currencyConverter.convertToRWF(numAmount);
      rate = await currencyConverter.getExchangeRate();
    } else if (from === 'RWF' && to === 'USD') {
      convertedAmount = await currencyConverter.convertToUSD(numAmount);
      rate = await currencyConverter.getExchangeRate();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported currency conversion'
      });
    }

    res.json({
      success: true,
      originalAmount: numAmount,
      convertedAmount: convertedAmount,
      fromCurrency: from,
      toCurrency: to,
      exchangeRate: rate,
      formattedAmount: currencyConverter.formatAmount(convertedAmount, to)
    });

  } catch (error) {
    console.error('Currency conversion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert currency'
    });
  }
});

module.exports = router;
