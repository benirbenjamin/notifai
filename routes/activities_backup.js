/**
 * Activity Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const Activity = require('../models/Activity');
const { requireAuth, checkPlanLimits, checkActivityLimit } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all activity routes
router.use(requireAuth);
router.use(checkPlanLimits);

// List all activities
router.get('/', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { type, category, priority, search, completed } = req.query;
    
    // Build filters
    const filters = {};
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (priority) filters.priority = priority;
    if (search) filters.search = search;
    if (completed !== undefined) filters.completed = completed === 'true';
    
    const activities = await Activity.findByUserId(userId, filters);
    
    // Get unique categories for filter dropdown
    const allActivities = await Activity.findByUserId(userId);
    const categories = [...new Set(allActivities.map(a => a.category).filter(Boolean))];
    
    // Calculate stats
    const stats = {
      total: allActivities.length,
      completed: allActivities.filter(a => a.is_completed).length,
      pending: allActivities.filter(a => !a.is_completed).length,
      overdue: allActivities.filter(a => !a.is_completed && a.due_date && new Date(a.due_date) < new Date()).length
    };
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(activities.length / limit);
    
    const pagination = {
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
    
    res.render('activities/index', {
      title: 'My Activities',
      activities: activities.slice(offset, offset + limit),
      categories,
      filters: req.query,
      userPlan: req.userPlan,
      stats,
      pagination,
      user: req.session.user,
      appName: 'Managinga Space'
    });

  } catch (error) {
    console.error('Activities list error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load activities',
      error: {},
      user: req.session.user,
      userPlan: req.userPlan,
      appName: 'Managinga Space'
    });
  }
});

// Show create form
router.get('/create', (req, res) => {
  res.render('activities/create', {
    title: 'Create Activity',
    errors: [],
    formData: {},
    userPlan: req.userPlan,
    user: req.session.user,
    appName: 'Managinga Space'
  });
});

// Handle create activity
router.post('/', checkActivityLimit, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('type').isIn(['general', 'payment', 'purchase', 'recurring']).withMessage('Invalid activity type'),
  body('priority').isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority level'),
  body('total_amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('due_date').optional().custom((value) => {
    if (!value) return true;
    const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (!datetimeLocalRegex.test(value) && !isoRegex.test(value)) {
      throw new Error('Invalid due date format');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.render('activities/create', {
        title: 'Create Activity',
        errors: errors.array(),
        formData: req.body,
        userPlan: req.userPlan,
        user: req.session.user,
        appName: 'Managinga Space'
      });
    }

    const userId = req.session.user.id;
    const {
      title, description, type, category, priority,
      due_date, total_amount, target_item, recurring_type,
      reminder_frequency
    } = req.body;

    // Create activity
    const activityId = await Activity.create({
      userId,
      title,
      description,
      type,
      category: category || null,
      priority,
      dueDate: due_date ? new Date(due_date).toISOString().slice(0, 19).replace('T', ' ') : null,
      totalAmount: type === 'payment' ? parseFloat(total_amount) || 0 : 0,
      targetItem: type === 'purchase' ? target_item : null,
      recurringType: type === 'recurring' ? recurring_type : null,
      reminderFrequency: parseInt(reminder_frequency) || 24
    });

    res.redirect('/activities?success=Activity created successfully');

  } catch (error) {
    console.error('Create activity error:', error);
    res.render('activities/create', {
      title: 'Create Activity',
      errors: [{ msg: 'An error occurred while creating the activity. Please try again.' }],
      formData: req.body,
      userPlan: req.userPlan,
      user: req.session.user,
      appName: 'Managinga Space'
    });
  }
});

// Show activity details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.status(404).render('error', {
        title: 'Activity Not Found',
        message: 'The activity you are looking for does not exist.',
        error: {},
        user: req.session.user,
        userPlan: req.userPlan,
        appName: 'Managinga Space'
      });
    }

    res.render('activities/view', {
      title: activity.title,
      activity,
      userPlan: req.userPlan,
      user: req.session.user,
      appName: 'Managinga Space'
    });

  } catch (error) {
    console.error('Activity details error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load activity details',
      error: {},
      user: req.session.user,
      userPlan: req.userPlan,
      appName: 'Managinga Space'
    });
  }
});

// Show edit form
router.get('/:id/edit', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.status(404).render('error', {
        title: 'Activity Not Found',
        message: 'The activity you are looking for does not exist.',
        error: {},
        user: req.session.user,
        userPlan: req.userPlan,
        appName: 'Managinga Space'
      });
    }

    res.render('activities/edit', {
      title: 'Edit Activity',
      activity,
      errors: [],
      userPlan: req.userPlan,
      user: req.session.user,
      appName: 'Managinga Space'
    });

  } catch (error) {
    console.error('Edit form error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Unable to load edit form',
      error: {},
      user: req.session.user,
      userPlan: req.userPlan,
      appName: 'Managinga Space'
    });
  }
});

// Handle edit activity (PUT)
router.put('/:id', [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('priority').isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority level'),
  body('total_amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('due_date').optional().custom((value) => {
    if (!value) return true;
    const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (!datetimeLocalRegex.test(value) && !isoRegex.test(value)) {
      throw new Error('Invalid due date format');
    }
    return true;
  })
], async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const activity = await Activity.findById(activityId, userId);
      return res.render('activities/edit', {
        title: 'Edit Activity',
        activity,
        errors: errors.array(),
        userPlan: req.userPlan,
        user: req.session.user,
        appName: 'Managinga Space'
      });
    }

    const {
      title, description, category, priority,
      due_date, total_amount, target_item, recurring_type,
      reminder_frequency, progress_percentage
    } = req.body;

    // Update activity
    const updateData = {
      title,
      description,
      category: category || null,
      priority,
      dueDate: due_date ? new Date(due_date).toISOString().slice(0, 19).replace('T', ' ') : null,
      reminderFrequency: parseInt(reminder_frequency) || 24
    };

    // Add type-specific fields
    const activity = await Activity.findById(activityId, userId);
    if (activity.type === 'payment') {
      updateData.totalAmount = parseFloat(total_amount) || 0;
      updateData.remainingAmount = updateData.totalAmount - activity.paid_amount;
    } else if (activity.type === 'purchase') {
      updateData.targetItem = target_item;
    } else if (activity.type === 'recurring') {
      updateData.recurringType = recurring_type;
    }

    // Update progress if provided
    if (progress_percentage !== undefined) {
      updateData.progressPercentage = parseInt(progress_percentage) || 0;
      updateData.isCompleted = updateData.progressPercentage === 100;
      if (updateData.isCompleted) {
        updateData.completedAt = new Date();
      }
    }

    await Activity.update(activityId, updateData, userId);

    res.redirect(`/activities/${activityId}?success=Activity updated successfully`);

  } catch (error) {
    console.error('Edit activity error:', error);
    try {
      const activity = await Activity.findById(req.params.id, req.session.user.id);
      res.render('activities/edit', {
        title: 'Edit Activity',
        activity,
        errors: [{ msg: 'An error occurred while updating the activity. Please try again.' }],
        userPlan: req.userPlan,
        user: req.session.user,
        appName: 'Managinga Space'
      });
    } catch (fetchError) {
      console.error('Error fetching activity for error page:', fetchError);
      res.redirect('/activities?error=Unable to update activity');
    }
  }
});

// Handle edit activity (POST fallback)
router.post('/:id', [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('priority').isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority level'),
  body('total_amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('due_date').optional().custom((value) => {
    if (!value) return true;
    const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (!datetimeLocalRegex.test(value) && !isoRegex.test(value)) {
      throw new Error('Invalid due date format');
    }
    return true;
  })
], async (req, res) => {
  // Same logic as PUT route
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const activity = await Activity.findById(activityId, userId);
      return res.render('activities/edit', {
        title: 'Edit Activity',
        activity,
        errors: errors.array(),
        userPlan: req.userPlan,
        user: req.session.user,
        appName: 'Managinga Space'
      });
    }

    const {
      title, description, category, priority,
      due_date, total_amount, target_item, recurring_type,
      reminder_frequency, progress_percentage
    } = req.body;

    // Update activity
    const updateData = {
      title,
      description,
      category: category || null,
      priority,
      dueDate: due_date ? new Date(due_date).toISOString().slice(0, 19).replace('T', ' ') : null,
      reminderFrequency: parseInt(reminder_frequency) || 24
    };

    // Add type-specific fields
    const activity = await Activity.findById(activityId, userId);
    if (activity.type === 'payment') {
      updateData.totalAmount = parseFloat(total_amount) || 0;
      updateData.remainingAmount = updateData.totalAmount - activity.paid_amount;
    } else if (activity.type === 'purchase') {
      updateData.targetItem = target_item;
    } else if (activity.type === 'recurring') {
      updateData.recurringType = recurring_type;
    }

    // Update progress if provided
    if (progress_percentage !== undefined) {
      updateData.progressPercentage = parseInt(progress_percentage) || 0;
      updateData.isCompleted = updateData.progressPercentage === 100;
      if (updateData.isCompleted) {
        updateData.completedAt = new Date();
      }
    }

    await Activity.update(activityId, updateData, userId);

    res.redirect(`/activities/${activityId}?success=Activity updated successfully`);

  } catch (error) {
    console.error('Edit activity error:', error);
    try {
      const activity = await Activity.findById(req.params.id, req.session.user.id);
      res.render('activities/edit', {
        title: 'Edit Activity',
        activity,
        errors: [{ msg: 'An error occurred while updating the activity. Please try again.' }],
        userPlan: req.userPlan,
        user: req.session.user,
        appName: 'Managinga Space'
      });
    } catch (fetchError) {
      console.error('Error fetching activity for error page:', fetchError);
      res.redirect('/activities?error=Unable to update activity');
    }
  }
});

module.exports = router;
