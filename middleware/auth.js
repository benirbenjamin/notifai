/**
 * Authentication middleware
 */

const db = require('../config/database');

// Check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  // Ensure user has an id property
  if (!req.session.user.id && req.session.userId) {
    req.session.user.id = req.session.userId;
  }
  
  next();
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to access this area.',
      error: {}
    });
  }
  next();
};

// Redirect admin users to admin panel
const redirectAdminToPanel = (req, res, next) => {
  if (req.session.user && req.session.user.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  next();
};

// Check if user is guest (not authenticated)
const requireGuest = (req, res, next) => {
  if (req.session.user) {
    // Redirect based on user role
    if (req.session.user.isAdmin) {
      return res.redirect('/admin/dashboard');
    } else {
      return res.redirect('/dashboard');
    }
  }
  next();
};

// Check plan limits
const checkPlanLimits = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return next();
    }

    const userId = req.session.user.id;
    
    // Get user's current plan
    const [userPlan] = await db.query(`
      SELECT p.*, u.plan_id
      FROM users u
      JOIN plans p ON u.plan_id = p.id
      WHERE u.id = ?
    `, [userId]);

    if (!userPlan) {
      return next();
    }

    // Store plan info in request
    req.userPlan = userPlan;
    res.locals.userPlan = userPlan;
    
    next();
  } catch (error) {
    console.error('Error checking plan limits:', error);
    next();
  }
};

// Check activity creation limits
const checkActivityLimit = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return next();
    }

    const userId = req.session.user.id;
    
    // Get user's current plan
    const [userPlan] = await db.query(`
      SELECT p.max_activities, p.name, p.is_lifetime
      FROM users u
      JOIN plans p ON u.plan_id = p.id
      WHERE u.id = ?
    `, [userId]);

    if (!userPlan) {
      return next();
    }

    // If user has lifetime plan (unlimited activities), allow creation
    if (userPlan.is_lifetime || userPlan.max_activities >= 999999) {
      return next();
    }

    // Count user's current activities (both completed and incomplete)
    const [activityCount] = await db.query(`
      SELECT COUNT(*) as count
      FROM activities
      WHERE user_id = ?
    `, [userId]);

    if (activityCount.count >= userPlan.max_activities) {
      return res.status(403).json({
        success: false,
        message: `You have reached the maximum number of activities (${userPlan.max_activities}) for your ${userPlan.name} plan. Upgrade to Lifetime Premium for unlimited activities!`,
        planLimit: true,
        currentCount: activityCount.count,
        maxActivities: userPlan.max_activities,
        planName: userPlan.name
      });
    }

    next();
  } catch (error) {
    console.error('Error checking activity limit:', error);
    next();
  }
};

// Check activity permission for collaboration
const checkActivityPermission = async (activityId, userId, permission = 'view') => {
  try {
    const Collaboration = require('../models/Collaboration');
    return await Collaboration.checkPermission(activityId, userId, permission);
  } catch (error) {
    console.error('Error checking activity permission:', error);
    return false;
  }
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireGuest,
  redirectAdminToPanel,
  checkPlanLimits,
  checkActivityLimit,
  checkActivityPermission
};
