/**
 * Activity Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const Activity = require('../models/Activity');
const { requireAuth, checkPlanLimits, checkActivityLimit, redirectAdminToPanel } = require('../middleware/auth');
const NotificationService = require('../utils/notificationService');

const router = express.Router();

// Apply middleware to all activity routes
router.use(requireAuth);
// router.use(redirectAdminToPanel); // Redirect admin users to admin panel - temporarily disabled
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
router.get('/create', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const User = require('../models/User');
    const activityCount = await User.getActivityCount(userId);
    
    // Add activity count to user object
    const userWithCount = {
      ...req.session.user,
      plan: req.userPlan,
      activityCount: activityCount
    };
    
    res.render('activities/create', {
      title: 'Create Activity',
      errors: [],
      formData: {},
      userPlan: req.userPlan,
      user: userWithCount,
      appName: 'Managinga Space'
    });
  } catch (error) {
    console.error('Error loading create form:', error);
    res.render('activities/create', {
      title: 'Create Activity',
      errors: ['Error loading form'],
      formData: {},
      userPlan: req.userPlan,
      user: req.session.user,
      appName: 'Managinga Space'
    });
  }
});

// Handle create activity
router.post('/', checkActivityLimit, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('type').isIn(['general', 'payment', 'purchase', 'recurring', 'timed']).withMessage('Invalid activity type'),
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
  }),
  body('start_time').optional().custom((value, { req }) => {
    if (req.body.type === 'timed' && !value) {
      throw new Error('Start time is required for timed activities');
    }
    if (value) {
      const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      if (!datetimeLocalRegex.test(value)) {
        throw new Error('Invalid start time format');
      }
    }
    return true;
  }),
  body('end_time').optional().custom((value, { req }) => {
    if (req.body.type === 'timed' && !value) {
      throw new Error('End time is required for timed activities');
    }
    if (value && req.body.start_time) {
      const startTime = new Date(req.body.start_time);
      const endTime = new Date(value);
      if (endTime <= startTime) {
        throw new Error('End time must be after start time');
      }
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
      reminder_frequency, start_time, end_time
    } = req.body;

    // Create activity
    const activityId = await Activity.create({
      userId,
      title: title || '',
      description: description || '',
      type: type || 'task',
      category: category || null,
      priority: priority || 'low',
      dueDate: due_date ? due_date.replace('T', ' ') : null, // Keep as local datetime
      totalAmount: parseFloat(total_amount || 0) || 0, // Handle empty strings and ensure 0 default
      targetItem: type === 'purchase' ? target_item || null : null,
      recurringType: type === 'recurring' ? recurring_type || null : null,
      reminderFrequency: parseInt(reminder_frequency) || 24,
      startTime: type === 'timed' && start_time ? start_time.replace('T', ' ') : null, // Keep as local datetime
      endTime: type === 'timed' && end_time ? end_time.replace('T', ' ') : null // Keep as local datetime
    });

    // Send notification for activity creation
    try {
      await NotificationService.notifyActivityCreated(userId, {
        id: activityId,
        title: title || ''
      });
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
      // Don't fail the request if notification fails
    }

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
  }),
  body('start_time').optional().custom((value, { req }) => {
    if (value) {
      const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      if (!datetimeLocalRegex.test(value)) {
        throw new Error('Invalid start time format');
      }
    }
    return true;
  }),
  body('end_time').optional().custom((value, { req }) => {
    if (value && req.body.start_time) {
      const startTime = new Date(req.body.start_time);
      const endTime = new Date(value);
      if (endTime <= startTime) {
        throw new Error('End time must be after start time');
      }
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
      dueDate: due_date ? due_date.replace('T', ' ') : null, // Keep as local datetime
      reminderFrequency: parseInt(reminder_frequency) || 24
    };

    // Add type-specific fields
    const activity = await Activity.findById(activityId, userId);
    // Set amount for all activity types (not just payment)
    updateData.totalAmount = parseFloat(total_amount || 0) || 0;
    
    if (activity.type === 'payment') {
      updateData.remainingAmount = updateData.totalAmount - activity.paid_amount;
    }
    
    if (activity.type === 'purchase') {
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
      dueDate: due_date ? due_date.replace('T', ' ') : null, // Keep as local datetime
      reminderFrequency: parseInt(reminder_frequency) || 24
    };

    // Add type-specific fields
    const activity = await Activity.findById(activityId, userId);
    // Set amount for all activity types (not just payment)
    updateData.totalAmount = parseFloat(total_amount || 0) || 0;
    
    if (activity.type === 'payment') {
      updateData.remainingAmount = updateData.totalAmount - activity.paid_amount;
    }
    
    if (activity.type === 'purchase') {
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

// Delete activity
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    await Activity.delete(activityId, userId);

    // Send notification for activity deletion
    try {
      await NotificationService.notifyActivityDeleted(userId, activity);
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
      // Don't fail the request if notification fails
    }
    
    // If it's an AJAX request, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ success: true, message: 'Activity deleted successfully' });
    } else {
      // Otherwise redirect
      res.redirect('/activities?success=Activity deleted successfully');
    }
    
  } catch (error) {
    console.error('Delete activity error:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ error: 'Failed to delete activity' });
    } else {
      res.redirect('/activities?error=Failed to delete activity');
    }
  }
});

// Mark activity as complete
router.post('/:id/complete', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Mark as complete
    await Activity.update(activityId, {
      isCompleted: true,
      progressPercentage: 100,
      completedAt: new Date()
    }, userId);

    // Send notification for activity completion
    try {
      await NotificationService.notifyActivityCompleted(userId, activity);
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
      // Don't fail the request if notification fails
    }
    
    // If it's an AJAX request, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ success: true, message: 'Activity marked as complete' });
    } else {
      // Otherwise redirect
      res.redirect(`/activities/${activityId}?success=Activity marked as complete`);
    }
    
  } catch (error) {
    console.error('Complete activity error:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ error: 'Failed to mark activity as complete' });
    } else {
      res.redirect(`/activities?error=Failed to mark activity as complete`);
    }
  }
});

// Mark activity as incomplete
router.post('/:id/incomplete', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Mark as incomplete
    await Activity.update(activityId, {
      isCompleted: false,
      progressPercentage: 0,
      completedAt: null
    }, userId);
    
    // If it's an AJAX request, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ success: true, message: 'Activity marked as incomplete' });
    } else {
      // Otherwise redirect
      res.redirect(`/activities/${activityId}?success=Activity marked as incomplete`);
    }
    
  } catch (error) {
    console.error('Incomplete activity error:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ error: 'Failed to mark activity as incomplete' });
    } else {
      res.redirect(`/activities?error=Failed to mark activity as incomplete`);
    }
  }
});

// Delete activity (POST route for form submissions)
router.post('/:id/delete', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const activity = await Activity.findById(activityId, userId);
    
    if (!activity) {
      return res.redirect('/activities?error=Activity not found');
    }
    
    await Activity.delete(activityId, userId);

    // Send notification for activity deletion
    try {
      await NotificationService.notifyActivityDeleted(userId, activity);
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
      // Don't fail the request if notification fails
    }

    res.redirect('/activities?success=Activity deleted successfully');
    
  } catch (error) {
    console.error('Delete activity error:', error);
    res.redirect('/activities?error=Failed to delete activity');
  }
});

// Update activity progress
router.post('/:id/progress', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    const { progress } = req.body;
    
    const progressValue = parseInt(progress);
    if (progressValue < 0 || progressValue > 100) {
      return res.status(400).json({ success: false, message: 'Progress must be between 0 and 100' });
    }

    const activity = await Activity.findById(activityId, userId);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }
    
    // Update progress and completion status
    const updateData = {
      progressPercentage: progressValue,
      isCompleted: progressValue === 100
    };
    
    if (progressValue === 100) {
      updateData.completedAt = new Date();
    } else if (activity.is_completed) {
      updateData.completedAt = null;
    }
    
    await Activity.update(activityId, updateData, userId);
    
    res.json({ success: true, message: 'Progress updated successfully' });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ success: false, message: 'Failed to update progress' });
  }
});

// Duplicate activity
router.post('/:id/duplicate', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const activityId = req.params.id;
    
    const originalActivity = await Activity.findById(activityId, userId);
    if (!originalActivity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }
    
    // Create duplicate with modified title
    const duplicateData = {
      userId: userId,
      title: `${originalActivity.title} (Copy)`,
      description: originalActivity.description,
      type: originalActivity.type,
      category: originalActivity.category,
      priority: originalActivity.priority,
      dueDate: null, // Reset due date for duplicate
      totalAmount: originalActivity.total_amount,
      targetItem: originalActivity.target_item,
      recurringType: originalActivity.recurring_type,
      reminderFrequency: originalActivity.reminder_frequency_hours
    };
    
    const newActivityId = await Activity.create(duplicateData);
    
    res.json({ success: true, message: 'Activity duplicated successfully', activityId: newActivityId });
  } catch (error) {
    console.error('Duplicate activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to duplicate activity' });
  }
});

module.exports = router;
