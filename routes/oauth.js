/**
 * OAuth Routes
 * Handles Google OAuth authentication
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const User = require('../models/User');
const Collaboration = require('../models/Collaboration');
const bcrypt = require('bcryptjs');

// Google OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Initiate Google OAuth flow
 */
router.get('/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  // Store collaboration token or redirect URL in session
  if (req.query.token) {
    req.session.collaborationToken = req.query.token;
  }
  if (req.query.redirect) {
    req.session.oauthRedirect = req.query.redirect;
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: req.query.state || 'default'
  });

  res.redirect(url);
});

/**
 * Handle Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.redirect('/auth/login?error=oauth_error');
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await oauth2Client.getToken(code);
    if (!tokenResponse || !tokenResponse.tokens) {
      console.error('No tokens received from Google:', tokenResponse);
      return res.redirect('/auth/login?error=oauth_token_error');
    }
    oauth2Client.setCredentials(tokenResponse.tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    
    console.log('Google user data received:', JSON.stringify(data, null, 2));

    if (!data.email || !data.verified_email) {
      return res.redirect('/auth/login?error=email_not_verified');
    }

    let user = await User.findByEmail(data.email);
    let isNewUser = false;

    if (!user) {
      // Create new user account
      console.log('Creating new user for email:', data.email);
      const randomPassword = Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = await User.create({
        email: data.email,
        password: hashedPassword,
        firstName: data.given_name || data.name?.split(' ')[0] || 'User',
        lastName: data.family_name || data.name?.split(' ').slice(1).join(' ') || ''
      });

      console.log('New user created:', user);

      // Save OAuth info
      await User.saveOAuthInfo(user.id, 'google', data.id, data);
      isNewUser = true;
    } else {
      // Update OAuth info for existing user
      console.log('Updating OAuth info for existing user:', user.id);
      await User.saveOAuthInfo(user.id, 'google', data.id, data);
    }

    console.log('Setting session for user:', user);
    
    // Set session
    req.session.userId = user.id;
    req.session.user = user;
    
    console.log('Session set - userId:', req.session.userId, 'user:', req.session.user);

    // Save session and then handle redirects
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        } else {
          console.log('Session saved successfully');
          resolve();
        }
      });
    });

    // Handle collaboration invitation if token exists
    if (req.session.collaborationToken) {
      try {
        const invitation = await Collaboration.acceptInvitation(req.session.collaborationToken, user.id);
        req.session.collaborationToken = null;
        
        return res.redirect(`/activities/${invitation.activity_id}?welcome=collaboration`);
      } catch (error) {
        console.error('Error accepting collaboration:', error);
        // Continue with normal flow
      }
    }

    // Handle custom redirect
    if (req.session.oauthRedirect) {
      const redirectUrl = req.session.oauthRedirect;
      req.session.oauthRedirect = null;
      return res.redirect(redirectUrl);
    }

    // Default redirect based on user role
    if (user.is_admin) {
      res.redirect('/admin/dashboard');
    } else if (isNewUser) {
      res.redirect('/dashboard?welcome=true');
    } else {
      res.redirect('/dashboard');
    }

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/auth/login?error=oauth_failed');
  }
});

/**
 * Link Google account to existing user
 */
router.get('/google/link', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }

  const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: 'link_account'
  });

  res.redirect(url);
});

/**
 * Unlink Google account
 */
router.post('/google/unlink', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  try {
    await User.removeOAuthInfo(req.session.userId, 'google');
    res.json({ success: true, message: 'Google account unlinked successfully' });
  } catch (error) {
    console.error('Error unlinking Google account:', error);
    res.status(500).json({ success: false, message: 'Failed to unlink account' });
  }
});

/**
 * Handle collaboration invitation with signup
 */
router.get('/collaborate/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const invitation = await Collaboration.getInvitationByToken(token);
    
    if (!invitation) {
      return res.render('error', {
        title: 'Invalid Invitation',
        message: 'This collaboration invitation is invalid or has expired.',
        user: req.session.user
      });
    }

    if (invitation.status !== 'pending') {
      return res.render('error', {
        title: 'Invitation Already Used',
        message: 'This collaboration invitation has already been used.',
        user: req.session.user
      });
    }

    // If user is already logged in
    if (req.session.userId) {
      try {
        await Collaboration.acceptInvitation(token, req.session.userId);
        return res.redirect(`/activities/${invitation.activity_id}?welcome=collaboration`);
      } catch (error) {
        return res.render('error', {
          title: 'Collaboration Error',
          message: error.message,
          user: req.session.user
        });
      }
    }

    // Show collaboration invitation page
    res.render('auth/collaboration-invite', {
      title: 'Collaboration Invitation',
      invitation,
      token,
      googleOAuthUrl: `/auth/google?token=${token}`
    });

  } catch (error) {
    console.error('Error handling collaboration invitation:', error);
    res.render('error', {
      title: 'Server Error',
      message: 'An error occurred while processing your invitation.',
      user: req.session.user
    });
  }
});

module.exports = router;
