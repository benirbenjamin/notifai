/**
 * Authentication Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { requireGuest, requireAuth } = require('../middleware/auth');
const NotificationService = require('../utils/notificationService');

const router = express.Router();

// Login page (Google OAuth only)
router.get('/login', requireGuest, (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    error: req.query.error
  });
});

// Admin login page
router.get('/admin', requireGuest, (req, res) => {
  res.render('auth/admin-login', {
    title: 'Admin Login',
    error: req.query.error,
    errors: [],
    formData: {}
  });
});

// Handle admin login
router.post('/admin', [
  requireGuest,
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.render('auth/admin-login', {
      title: 'Admin Login',
      errors: errors.array(),
      formData: req.body
    });
  }

  try {
    const { email, password } = req.body;
    
    // Find user by email and check if admin
    const user = await User.findByEmail(email);
    
    if (!user || !user.is_admin) {
      return res.render('auth/admin-login', {
        title: 'Admin Login',
        errors: [{ msg: 'Invalid admin credentials' }],
        formData: req.body
      });
    }
    
    // Check password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.render('auth/admin-login', {
        title: 'Admin Login',
        errors: [{ msg: 'Invalid admin credentials' }],
        formData: req.body
      });
    }
    
    // Set session
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_admin: user.is_admin,
      plan_id: user.plan_id
    };
    req.session.isAdmin = true;
    
    // Send login notification
    try {
      await NotificationService.sendNotification(user.id, 'login', {
        title: '🔐 Admin Login Successful',
        message: `Welcome back! You have successfully logged into the admin panel at ${new Date().toLocaleString()}.`,
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png',
        tag: 'admin-login',
        requireInteraction: false,
        data: {
          type: 'admin-login',
          timestamp: new Date().toISOString(),
          url: '/admin/dashboard'
        }
      });
      console.log('✅ Admin login notification sent successfully');
    } catch (notificationError) {
      console.error('⚠️ Failed to send admin login notification:', notificationError);
      // Don't fail the login if notification fails
    }
    
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Admin login error:', error);
    res.render('auth/admin-login', {
      title: 'Admin Login',
      errors: [{ msg: 'An error occurred during login' }],
      formData: req.body
    });
  }
});

// Google OAuth redirect (for backward compatibility)
router.get('/google', requireGuest, (req, res) => {
  // Preserve any query parameters
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const redirectUrl = queryString ? `/oauth/google?${queryString}` : '/oauth/google';
  res.redirect(redirectUrl);
});

// Profile completion page
router.get('/complete-profile', requireAuth, async (req, res) => {
  // Check if profile is already completed
  if (req.user.profile_completed) {
    const redirect = req.query.redirect || '/dashboard';
    return res.redirect(redirect);
  }

  res.render('auth/complete-profile', {
    title: 'Complete Profile',
    user: req.user
  });
});

// Handle profile completion
router.post('/complete-profile', [
  requireAuth,
  body('phone').isLength({ min: 10, max: 15 }).withMessage('Phone number must be 10-15 digits'),
  body('country_code').notEmpty().withMessage('Country code is required'),
  body('timezone').notEmpty().withMessage('Timezone is required')
], async (req, res) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.render('auth/complete-profile', {
      title: 'Complete Profile',
      user: req.user,
      errors: errors.array(),
      formData: req.body
    });
  }

  try {
    const profileData = {
      phone: req.body.phone,
      countryCode: req.body.country_code,
      timezone: req.body.timezone,
      company: req.body.company || null,
      jobTitle: req.body.job_title || null,
      emailNotifications: !!req.body.email_notifications,
      smsNotifications: !!req.body.sms_notifications,
      pushNotifications: !!req.body.push_notifications
    };

    await User.completeProfile(req.user.id, profileData);

    // Update session user
    const updatedUser = await User.findById(req.user.id);
    req.session.user = updatedUser;
    req.session.userId = updatedUser.id; // Ensure session consistency

    // Redirect based on user role or intended page
    if (updatedUser.is_admin) {
      res.redirect('/admin/dashboard?welcome=profile_completed');
    } else {
      const redirect = req.query.redirect || '/dashboard';
      res.redirect(redirect + '?welcome=profile_completed');
    }

  } catch (error) {
    console.error('Profile completion error:', error);
    res.render('auth/complete-profile', {
      title: 'Complete Profile',
      user: req.user,
      error: 'Failed to save profile. Please try again.',
      formData: req.body
    });
  }
});

// Handle login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.render('auth/login', {
        title: 'Login',
        errors: errors.array(),
        formData: req.body
      });
    }

    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findByEmail(email);
    
    if (!user) {
      return res.render('auth/login', {
        title: 'Login',
        errors: [{ msg: 'Invalid email or password' }],
        formData: req.body
      });
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password);
    
    if (!isValidPassword) {
      return res.render('auth/login', {
        title: 'Login',
        errors: [{ msg: 'Invalid email or password' }],
        formData: req.body
      });
    }

    // Create session
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: user.is_admin,
      planId: user.plan_id
    };

    // Send login notification
    try {
      await NotificationService.sendNotification(user.id, 'login', {
        title: '🎉 Welcome Back!',
        message: `You have successfully logged into Managinga Space at ${new Date().toLocaleString()}. Ready to manage your activities?`,
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png',
        tag: 'user-login',
        requireInteraction: false,
        data: {
          type: 'user-login',
          timestamp: new Date().toISOString(),
          url: '/dashboard'
        }
      });
      console.log('✅ User login notification sent successfully');
    } catch (notificationError) {
      console.error('⚠️ Failed to send user login notification:', notificationError);
      // Don't fail the login if notification fails
    }

    // Redirect based on user role
    if (user.is_admin) {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/dashboard');
    }

  } catch (error) {
    console.error('Login error:', error);
    res.render('auth/login', {
      title: 'Login',
      errors: [{ msg: 'An error occurred. Please try again.' }],
      formData: req.body
    });
  }
});

// Handle registration
router.post('/register', [
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.render('auth/register', {
        title: 'Register',
        errors: errors.array(),
        formData: req.body
      });
    }

    const { firstName, lastName, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    
    if (existingUser) {
      return res.render('auth/register', {
        title: 'Register',
        errors: [{ msg: 'An account with this email already exists' }],
        formData: req.body
      });
    }

    // Create new user with free plan
    const userId = await User.create({
      email,
      password,
      firstName,
      lastName
    });

    // Get the created user to check admin status
    const createdUser = await User.findById(userId);

    // Create session
    req.session.userId = userId;
    req.session.user = {
      id: userId,
      email,
      firstName,
      lastName,
      isAdmin: createdUser.is_admin || false,
      planId: createdUser.plan_id || 1 // Default to free plan
    };

    // Send welcome notification
    try {
      await NotificationService.sendNotification(userId, 'welcome', {
        title: '🎊 Welcome to Managinga Space!',
        message: `Hi ${firstName}! Your account has been created successfully. You're all set to start managing your activities and achieving your goals!`,
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png',
        tag: 'welcome',
        requireInteraction: true,
        actions: [
          {
            action: 'get-started',
            title: 'Get Started',
            icon: '/images/action-start.png'
          }
        ],
        data: {
          type: 'welcome',
          timestamp: new Date().toISOString(),
          url: '/dashboard?welcome=true'
        }
      });
      console.log('✅ Welcome notification sent successfully');
    } catch (notificationError) {
      console.error('⚠️ Failed to send welcome notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    // Redirect based on user role
    if (createdUser.is_admin) {
      res.redirect('/admin/dashboard?welcome=true');
    } else {
      res.redirect('/dashboard?welcome=true');
    }

  } catch (error) {
    console.error('Registration error:', error);
    res.render('auth/register', {
      title: 'Register',
      errors: [{ msg: 'An error occurred. Please try again.' }],
      formData: req.body
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// Forgot password page
router.get('/forgot-password', requireGuest, (req, res) => {
  res.render('auth/forgot-password', {
    title: 'Forgot Password',
    errors: [],
    formData: {},
    success: false
  });
});

// Handle forgot password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.render('auth/forgot-password', {
        title: 'Forgot Password',
        errors: errors.array(),
        formData: req.body,
        success: false
      });
    }

    const { email } = req.body;
    const user = await User.findByEmail(email);
    
    // Always show success message for security
    res.render('auth/forgot-password', {
      title: 'Forgot Password',
      errors: [],
      formData: {},
      success: true
    });

    // TODO: Implement email sending for password reset
    // For now, just log the reset request
    if (user) {
      console.log(`Password reset requested for user: ${email}`);
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.render('auth/forgot-password', {
      title: 'Forgot Password',
      errors: [{ msg: 'An error occurred. Please try again.' }],
      formData: req.body,
      success: false
    });
  }
});

// Google OAuth callback redirect
router.get('/google/callback', (req, res) => {
  // Forward the callback to the OAuth routes with all query parameters
  const queryString = new URLSearchParams(req.query).toString();
  res.redirect(`/oauth/google/callback?${queryString}`);
});

module.exports = router;
