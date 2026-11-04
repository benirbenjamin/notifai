const express = require('express');
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { enforceTaskQuota } = require('../middleware/quotaGuard');

const router = express.Router();
router.use(authenticateToken);

// List tasks with filtering, search, and countdown timers
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, priority, category, isCompleted, search } = req.query;

    let sql = `
      SELECT 
        t.*,
        COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as subtasks
      FROM tasks t
      LEFT JOIN subtasks s ON t.id = s.task_id
      WHERE t.user_id = $1 AND t.deleted_at IS NULL
    `;
    const params = [userId];
    let paramIndex = 2;

    if (type) {
      sql += ` AND t.type = $${paramIndex++}`;
      params.push(type);
    }
    if (priority) {
      sql += ` AND t.priority = $${paramIndex++}`;
      params.push(priority);
    }
    if (category) {
      sql += ` AND t.category = $${paramIndex++}`;
      params.push(category);
    }
    if (isCompleted !== undefined) {
      sql += ` AND t.is_completed = $${paramIndex++}`;
      params.push(isCompleted === 'true');
    }
    if (search) {
      sql += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` GROUP BY t.id ORDER BY t.is_completed ASC, t.due_date ASC NULLS LAST, t.created_at DESC`;

    const tasksRes = await query(sql, params);

    // Compute stats
    const statsRes = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_completed = true) as completed,
        COUNT(*) FILTER (WHERE is_completed = false) as pending,
        COUNT(*) FILTER (WHERE is_completed = false AND due_date < CURRENT_TIMESTAMP) as overdue
      FROM tasks 
      WHERE user_id = $1 AND deleted_at IS NULL
    `, [userId]);

    res.json({
      success: true,
      tasks: tasksRes.rows,
      stats: statsRes.rows[0]
    });
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Dedicated endpoint: Today's Tasks (for Android Home Screen Note Panel & Dashboard)
router.get('/today', async (req, res) => {
  try {
    const userId = req.user.id;

    const sql = `
      SELECT 
        t.id, t.title, t.description, t.type, t.priority, t.due_date, 
        t.start_time, t.end_time, t.is_completed, t.progress_percentage
      FROM tasks t
      WHERE 
        t.user_id = $1 
        AND t.deleted_at IS NULL
        AND (
          (t.due_date::date = CURRENT_DATE)
          OR (t.is_completed = false AND t.due_date < CURRENT_TIMESTAMP)
          OR (t.is_completed = false AND t.due_date IS NULL)
        )
      ORDER BY t.is_completed ASC, t.due_date ASC NULLS LAST
      LIMIT 20;
    `;

    const resTasks = await query(sql, [userId]);
    res.json({
      success: true,
      tasks: resTasks.rows,
      count: resTasks.rows.length
    });
  } catch (error) {
    console.error('Fetch today tasks error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Create Task — Protected by Task Limit Quota!
router.post('/', enforceTaskQuota, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      description,
      type = 'general',
      category,
      priority = 'medium',
      startTime,
      endTime,
      dueDate,
      reminderTime,
      reminderMinutes = 0,
      totalAmount = 0,
      paidAmount = 0,
      targetItem,
      recurringType
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Task title is required' });
    }

    const remainingAmount = Math.max(0, parseFloat(totalAmount || 0) - parseFloat(paidAmount || 0));

    // Calculate default reminder time if not explicitly provided
    let calculatedReminderTime = reminderTime ? new Date(reminderTime) : null;
    if (!calculatedReminderTime && dueDate && reminderMinutes > 0) {
      calculatedReminderTime = new Date(new Date(dueDate).getTime() - reminderMinutes * 60 * 1000);
    }

    const result = await query(`
      INSERT INTO tasks (
        user_id, title, description, type, category, priority,
        start_time, end_time, due_date, reminder_time, reminder_minutes,
        total_amount, paid_amount, remaining_amount, target_item, recurring_type,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      userId,
      title.trim(),
      description || null,
      type,
      category || null,
      priority,
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null,
      dueDate ? new Date(dueDate) : null,
      calculatedReminderTime,
      parseInt(reminderMinutes || 0, 10),
      parseFloat(totalAmount || 0),
      parseFloat(paidAmount || 0),
      remainingAmount,
      targetItem || null,
      recurringType || null
    ]);

    res.status(201).json({
      success: true,
      task: result.rows[0],
      quota: req.quotaInfo
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Update Task
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const {
      title,
      description,
      type,
      category,
      priority,
      startTime,
      endTime,
      dueDate,
      reminderTime,
      reminderMinutes,
      progressPercentage,
      totalAmount,
      paidAmount,
      targetItem,
      recurringType
    } = req.body;

    const remainingAmount = Math.max(0, parseFloat(totalAmount || 0) - parseFloat(paidAmount || 0));

    const result = await query(`
      UPDATE tasks 
      SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        type = COALESCE($3, type),
        category = COALESCE($4, category),
        priority = COALESCE($5, priority),
        start_time = $6,
        end_time = $7,
        due_date = $8,
        reminder_time = $9,
        reminder_minutes = COALESCE($10, reminder_minutes),
        progress_percentage = COALESCE($11, progress_percentage),
        total_amount = COALESCE($12, total_amount),
        paid_amount = COALESCE($13, paid_amount),
        remaining_amount = $14,
        target_item = COALESCE($15, target_item),
        recurring_type = COALESCE($16, recurring_type),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17 AND user_id = $18 AND deleted_at IS NULL
      RETURNING *
    `, [
      title,
      description,
      type,
      category,
      priority,
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null,
      dueDate ? new Date(dueDate) : null,
      reminderTime ? new Date(reminderTime) : null,
      reminderMinutes !== undefined ? parseInt(reminderMinutes, 10) : null,
      progressPercentage !== undefined ? parseInt(progressPercentage, 10) : null,
      totalAmount !== undefined ? parseFloat(totalAmount) : null,
      paidAmount !== undefined ? parseFloat(paidAmount) : null,
      remainingAmount,
      targetItem,
      recurringType,
      taskId,
      userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Task not found' });
    }

    res.json({
      success: true,
      task: result.rows[0]
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Toggle Task Completion
router.patch('/:id/toggle', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;

    const result = await query(`
      UPDATE tasks 
      SET 
        is_completed = NOT is_completed,
        completed_at = CASE WHEN is_completed = false THEN CURRENT_TIMESTAMP ELSE NULL END,
        progress_percentage = CASE WHEN is_completed = false THEN 100 ELSE 0 END,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [taskId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Task not found' });
    }

    res.json({
      success: true,
      task: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle task error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Delete Task (Soft delete for sync reconcile)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;

    const result = await query(`
      UPDATE tasks 
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [taskId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Task not found' });
    }

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

module.exports = router;
