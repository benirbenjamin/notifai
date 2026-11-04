/**
 * Activity Model
 */

const db = require('../config/database');

class Activity {
  // Create a new activity
  static async create(activityData) {
    const {
      userId, title, description, type, category, priority,
      dueDate, totalAmount, targetItem, recurringType, reminderFrequency,
      startTime, endTime
    } = activityData;

    // Ensure no undefined values are passed to the database
    const result = await db.query(`
      INSERT INTO activities (
        user_id, title, description, type, category, priority,
        due_date, total_amount, remaining_amount, target_item,
        recurring_type, reminder_frequency_hours, start_time, end_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId || null,
      title || '',
      description || '',
      type || 'task',
      category || null,
      priority || 'low',
      dueDate || null,
      totalAmount || 0,
      totalAmount || 0,
      targetItem || null,
      recurringType || null,
      reminderFrequency || 24,
      startTime || null,
      endTime || null
    ]);

    return result.insertId;
  }

  // Find activity by ID
  static async findById(id, userId = null) {
    let query = `
      SELECT a.*, 
             GROUP_CONCAT(s.id ORDER BY s.id) as subtask_ids,
             GROUP_CONCAT(s.title ORDER BY s.id SEPARATOR '|||') as subtask_titles,
             GROUP_CONCAT(s.is_completed ORDER BY s.id) as subtask_completed
      FROM activities a
      LEFT JOIN subtasks s ON a.id = s.activity_id
      WHERE a.id = ?
    `;
    
    const params = [id];
    
    if (userId) {
      query += ' AND a.user_id = ?';
      params.push(userId);
    }
    
    query += ' GROUP BY a.id';
    
    const activities = await db.query(query, params);
    
    if (activities.length === 0) return null;
    
    const activity = activities[0];
    
    // Parse subtasks
    activity.subtasks = [];
    if (activity.subtask_ids) {
      const ids = activity.subtask_ids.split(',');
      const titles = activity.subtask_titles.split('|||');
      const completed = activity.subtask_completed.split(',');
      
      activity.subtasks = ids.map((id, index) => ({
        id: parseInt(id),
        title: titles[index],
        is_completed: completed[index] === '1'
      }));
    }
    
    // Clean up the result
    delete activity.subtask_ids;
    delete activity.subtask_titles;
    delete activity.subtask_completed;
    
    return activity;
  }

  // Get activities by user ID
  static async findByUserId(userId, filters = {}) {
    let query = `
      SELECT a.*, 
             COUNT(s.id) as subtask_count,
             SUM(CASE WHEN s.is_completed = TRUE THEN 1 ELSE 0 END) as completed_subtasks
      FROM activities a
      LEFT JOIN subtasks s ON a.id = s.activity_id
      WHERE a.user_id = ?
    `;
    
    const params = [userId];
    
    // Apply filters
    if (filters.type) {
      query += ' AND a.type = ?';
      params.push(filters.type);
    }
    
    if (filters.category) {
      query += ' AND a.category = ?';
      params.push(filters.category);
    }
    
    if (filters.priority) {
      query += ' AND a.priority = ?';
      params.push(filters.priority);
    }
    
    if (filters.completed !== undefined) {
      query += ' AND a.is_completed = ?';
      params.push(filters.completed);
    }
    
    if (filters.search) {
      query += ' AND (a.title LIKE ? OR a.description LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    
    query += ' GROUP BY a.id ORDER BY a.created_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }
    
    return await db.query(query, params);
  }

  // Update activity
  static async update(id, activityData, userId = null) {
    const fields = [];
    const values = [];
    
    Object.keys(activityData).forEach(key => {
      if (activityData[key] !== undefined) {
        const dbField = this.camelToSnake(key);
        fields.push(`${dbField} = ?`);
        values.push(activityData[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(id);
    let query = `UPDATE activities SET ${fields.join(', ')} WHERE id = ?`;
    
    if (userId) {
      query += ' AND user_id = ?';
      values.push(userId);
    }
    
    const result = await db.query(query, values);
    return result.affectedRows > 0;
  }

  // Mark activity as completed
  static async markCompleted(id, userId) {
    const result = await db.query(`
      UPDATE activities 
      SET is_completed = TRUE, progress_percentage = 100, completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `, [id, userId]);
    
    return result.affectedRows > 0;
  }

  // Mark activity as incomplete
  static async markIncomplete(id, userId) {
    const result = await db.query(`
      UPDATE activities 
      SET is_completed = FALSE, completed_at = NULL
      WHERE id = ? AND user_id = ?
    `, [id, userId]);
    
    return result.affectedRows > 0;
  }

  // Delete activity
  static async delete(id, userId = null) {
    let query = 'DELETE FROM activities WHERE id = ?';
    const params = [id];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    const result = await db.query(query, params);
    return result.affectedRows > 0;
  }

  // Add payment
  static async addPayment(activityId, amount, notes = '') {
    await db.transaction([
      {
        sql: 'INSERT INTO payments (activity_id, amount, notes) VALUES (?, ?, ?)',
        params: [activityId, amount, notes]
      },
      {
        sql: `UPDATE activities 
              SET paid_amount = paid_amount + ?, 
                  remaining_amount = total_amount - (paid_amount + ?)
              WHERE id = ?`,
        params: [amount, amount, activityId]
      }
    ]);
    
    // Check if fully paid and mark as completed
    const [activity] = await db.query('SELECT * FROM activities WHERE id = ?', [activityId]);
    if (activity && activity.remaining_amount <= 0) {
      await this.markCompleted(activityId, activity.user_id);
    }
  }

  // Get payment history
  static async getPayments(activityId) {
    return await db.query(`
      SELECT * FROM payments 
      WHERE activity_id = ? 
      ORDER BY payment_date DESC
    `, [activityId]);
  }

  // Add subtask
  static async addSubtask(activityId, title) {
    const result = await db.query(`
      INSERT INTO subtasks (activity_id, title) VALUES (?, ?)
    `, [activityId, title]);
    
    return result.insertId;
  }

  // Toggle subtask completion
  static async toggleSubtask(subtaskId, activityId) {
    await db.query(`
      UPDATE subtasks 
      SET is_completed = NOT is_completed,
          completed_at = CASE WHEN is_completed = FALSE THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ? AND activity_id = ?
    `, [subtaskId, activityId]);
    
    // Update activity progress based on subtasks
    await this.updateProgressFromSubtasks(activityId);
  }

  // Update activity progress based on subtasks
  static async updateProgressFromSubtasks(activityId) {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_subtasks,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_subtasks
      FROM subtasks
      WHERE activity_id = ?
    `, [activityId]);
    
    if (stats.total_subtasks > 0) {
      const progressPercentage = Math.round((stats.completed_subtasks / stats.total_subtasks) * 100);
      
      await db.query(`
        UPDATE activities 
        SET progress_percentage = ?, 
            is_completed = ?,
            completed_at = CASE WHEN ? = 100 THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `, [progressPercentage, progressPercentage === 100, progressPercentage, activityId]);
    }
  }

  // Get activities that need reminders
  static async getActivitiesNeedingReminders() {
    const now = new Date();
    
    return await db.query(`
      SELECT a.*, u.email, u.first_name, u.last_name
      FROM activities a
      JOIN users u ON a.user_id = u.id
      WHERE a.is_completed = FALSE 
        AND a.due_date IS NOT NULL
        AND a.due_date > NOW()
        AND (
          a.last_reminder_sent IS NULL 
          OR a.last_reminder_sent < DATE_SUB(NOW(), INTERVAL a.reminder_frequency_hours HOUR)
        )
    `);
  }

  // Update last reminder sent
  static async updateLastReminderSent(activityId) {
    await db.query(`
      UPDATE activities 
      SET last_reminder_sent = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [activityId]);
  }

  // Get dashboard statistics
  static async getDashboardStats(userId) {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_activities,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_activities,
        SUM(CASE WHEN is_completed = FALSE THEN 1 ELSE 0 END) as pending_activities,
        SUM(CASE WHEN is_completed = FALSE AND due_date < NOW() THEN 1 ELSE 0 END) as overdue_activities,
        SUM(CASE WHEN type = 'payment' THEN total_amount ELSE 0 END) as total_payment_amount,
        SUM(CASE WHEN type = 'payment' THEN paid_amount ELSE 0 END) as total_paid_amount,
        SUM(CASE WHEN type = 'payment' THEN remaining_amount ELSE 0 END) as total_remaining_amount,
        AVG(progress_percentage) as average_progress
      FROM activities
      WHERE user_id = ?
    `, [userId]);
    
    return stats[0];
  }

  // Helper method to convert camelCase to snake_case
  static camelToSnake(str) {
    // Special field mappings
    const fieldMap = {
      'reminderFrequency': 'reminder_frequency_hours',
      'progressPercentage': 'progress_percentage',
      'isCompleted': 'is_completed',
      'totalAmount': 'total_amount',
      'paidAmount': 'paid_amount',
      'remainingAmount': 'remaining_amount',
      'targetItem': 'target_item',
      'recurringType': 'recurring_type',
      'dueDate': 'due_date',
      'userId': 'user_id',
      'completedAt': 'completed_at',
      'lastReminderSent': 'last_reminder_sent',
      'attachmentPath': 'attachment_path',
      'startTime': 'start_time',
      'endTime': 'end_time'
    };
    
    if (fieldMap[str]) {
      return fieldMap[str];
    }
    
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

module.exports = Activity;
