/**
 * Dashboard Routes
 */

const express = require('express');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, checkPlanLimits, redirectAdminToPanel } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all dashboard routes
router.use(requireAuth);
// router.use(redirectAdminToPanel); // Redirect admin users to admin panel - temporarily disabled
router.use(checkPlanLimits);

// Main dashboard
router.get('/', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get dashboard statistics
    const stats = await Activity.getDashboardStats(userId);
    
    // Get recent activities
    const recentActivities = await Activity.findByUserId(userId, { limit: 5 });
    
    // Get upcoming activities (due in next 7 days)
    const upcomingActivities = await Activity.findByUserId(userId, {
      completed: false,
      limit: 10
    });
    
    // Filter upcoming activities by due date
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const filteredUpcoming = upcomingActivities.filter(activity => {
      if (!activity.due_date) return false;
      const dueDate = new Date(activity.due_date);
      return dueDate >= now && dueDate <= nextWeek;
    });
    
    // Get overdue activities
    const overdueActivities = upcomingActivities.filter(activity => {
      if (!activity.due_date || activity.is_completed) return false;
      return new Date(activity.due_date) < now;
    });
    
    // Get payment activities
    const paymentActivities = await Activity.findByUserId(userId, {
      type: 'payment',
      completed: false,
      limit: 5
    });
    
    // Calculate completion rate
    const completionRate = stats.total_activities > 0 
      ? Math.round((stats.completed_activities / stats.total_activities) * 100)
      : 0;
    
    // Get user with plan details
    const userWithPlan = await User.findWithPlan(userId);
    
    res.render('dashboard/index', {
      title: 'Dashboard',
      stats,
      recentActivities,
      upcomingActivities: filteredUpcoming,
      overdueActivities,
      paymentActivities,
      completionRate,
      userPlan: userWithPlan,
      welcome: req.query.welcome === 'true'
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load dashboard',
      error: {}
    });
  }
});

// Analytics page
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get comprehensive statistics
    const stats = await Activity.getDashboardStats(userId);
    
    // Get activities by type
    const activitiesByType = await Activity.findByUserId(userId);
    const typeStats = {
      general: activitiesByType.filter(a => a.type === 'general').length,
      payment: activitiesByType.filter(a => a.type === 'payment').length,
      purchase: activitiesByType.filter(a => a.type === 'purchase').length,
      recurring: activitiesByType.filter(a => a.type === 'recurring').length
    };
    
    // Get activities by priority
    const priorityStats = {
      low: activitiesByType.filter(a => a.priority === 'low').length,
      medium: activitiesByType.filter(a => a.priority === 'medium').length,
      high: activitiesByType.filter(a => a.priority === 'high').length,
      urgent: activitiesByType.filter(a => a.priority === 'urgent').length
    };
    
    // Get completion trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const completedActivities = activitiesByType.filter(a => 
      a.is_completed && new Date(a.completed_at) >= thirtyDaysAgo
    );
    
    // Calculate productivity score
    const totalTasks = stats.total_activities;
    const completedTasks = stats.completed_activities;
    const onTimeCompletions = completedActivities.filter(a => 
      !a.due_date || new Date(a.completed_at) <= new Date(a.due_date)
    ).length;
    
    const productivityScore = totalTasks > 0 
      ? Math.round(((completedTasks * 0.7) + (onTimeCompletions * 0.3)) / totalTasks * 100)
      : 0;
    
    // Get strongest category (most completed tasks)
    const categoryStats = {};
    activitiesByType.forEach(activity => {
      if (activity.category) {
        if (!categoryStats[activity.category]) {
          categoryStats[activity.category] = { total: 0, completed: 0 };
        }
        categoryStats[activity.category].total++;
        if (activity.is_completed) {
          categoryStats[activity.category].completed++;
        }
      }
    });
    
    let strongestCategory = 'General Tasks';
    let highestCompletionRate = 0;
    
    Object.keys(categoryStats).forEach(category => {
      const rate = categoryStats[category].completed / categoryStats[category].total;
      if (rate > highestCompletionRate) {
        highestCompletionRate = rate;
        strongestCategory = category;
      }
    });
    
    // Generate AI-like insights
    const insights = generateInsights(stats, productivityScore, strongestCategory, typeStats);
    
    // Calculate additional analytics data
    const activitiesThisMonth = activitiesByType.filter(a => {
      const activityDate = new Date(a.created_at);
      const now = new Date();
      return activityDate.getMonth() === now.getMonth() && activityDate.getFullYear() === now.getFullYear();
    }).length;
    
    const averageProgress = activitiesByType.length > 0 
      ? Math.round(activitiesByType.reduce((sum, a) => sum + (a.progress_percentage || 0), 0) / activitiesByType.length)
      : 0;
    
    // Generate monthly trend data (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthActivities = activitiesByType.filter(a => {
        const activityDate = new Date(a.completed_at || a.created_at);
        return activityDate.getMonth() === date.getMonth() && 
               activityDate.getFullYear() === date.getFullYear() &&
               a.is_completed;
      }).length;
      monthlyTrend.push(monthActivities);
    }
    
    // Create analytics object for the view
    const analytics = {
      totalActivities: stats.total_activities || 0,
      completedActivities: stats.completed_activities || 0,
      pendingActivities: stats.pending_activities || 0,
      overdueActivities: stats.overdue_activities || 0,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      averageProgress: averageProgress,
      activitiesThisMonth: activitiesThisMonth,
      productivityScore: productivityScore,
      strongestCategory: strongestCategory,
      typeBreakdown: typeStats,
      priorityBreakdown: priorityStats,
      monthlyTrend: monthlyTrend
    };
    
    res.render('dashboard/analytics', {
      title: 'Analytics',
      analytics,
      stats,
      typeStats,
      priorityStats,
      categoryStats,
      productivityScore,
      strongestCategory,
      insights,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load analytics',
      error: {}
    });
  }
});

// Profile page
router.get('/profile', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userWithPlan = await User.findWithPlan(userId);
    
    res.render('dashboard/profile', {
      title: 'Profile',
      user: userWithPlan,
      success: req.query.success,
      errors: []
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load profile',
      error: {}
    });
  }
});

// Update profile
router.post('/profile', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { firstName, lastName, email } = req.body;
    
    // Basic validation
    if (!firstName || !lastName || !email) {
      const userWithPlan = await User.findWithPlan(userId);
      return res.render('dashboard/profile', {
        title: 'Profile',
        user: userWithPlan,
        errors: [{ msg: 'All fields are required' }]
      });
    }
    
    // Check if email is already taken by another user
    const existingUser = await User.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      const userWithPlan = await User.findWithPlan(userId);
      return res.render('dashboard/profile', {
        title: 'Profile',
        user: userWithPlan,
        errors: [{ msg: 'Email is already taken by another user' }]
      });
    }
    
    // Update user
    await User.update(userId, {
      first_name: firstName,
      last_name: lastName,
      email: email
    });
    
    // Update session
    req.session.user.firstName = firstName;
    req.session.user.lastName = lastName;
    req.session.user.email = email;
    
    res.redirect('/dashboard/profile?success=Profile updated successfully');

  } catch (error) {
    console.error('Profile update error:', error);
    const userWithPlan = await User.findWithPlan(req.session.user.id);
    res.render('dashboard/profile', {
      title: 'Profile',
      user: userWithPlan,
      errors: [{ msg: 'An error occurred while updating profile' }]
    });
  }
});

// Helper function to generate insights
function generateInsights(stats, productivityScore, strongestCategory, typeStats) {
  const insights = [];
  
  if (productivityScore >= 80) {
    insights.push({
      type: 'success',
      title: 'Excellent Performance! 🎉',
      message: `You're doing fantastic with a ${productivityScore}% productivity score! Keep up the great work.`
    });
  } else if (productivityScore >= 60) {
    insights.push({
      type: 'info',
      title: 'Good Progress 👍',
      message: `Your productivity score is ${productivityScore}%. Consider focusing on completing tasks on time to boost your score.`
    });
  } else {
    insights.push({
      type: 'warning',
      title: 'Room for Improvement 📈',
      message: `Your productivity score is ${productivityScore}%. Try breaking large tasks into smaller, manageable subtasks.`
    });
  }
  
  if (strongestCategory !== 'General Tasks') {
    insights.push({
      type: 'success',
      title: `You Excel at ${strongestCategory}! ⭐`,
      message: `You have the highest completion rate in ${strongestCategory}. Consider taking on more tasks in this area.`
    });
  }
  
  if (typeStats.payment > 0) {
    insights.push({
      type: 'info',
      title: 'Financial Tracking 💰',
      message: `You're actively tracking ${typeStats.payment} payment-related activities. Great job staying on top of your finances!`
    });
  }
  
  if (stats.overdue_activities > 0) {
    insights.push({
      type: 'warning',
      title: 'Overdue Tasks Alert ⚠️',
      message: `You have ${stats.overdue_activities} overdue activities. Consider reviewing and prioritizing these tasks.`
    });
  }
  
  return insights;
}

module.exports = router;
