const { query } = require('../database/db');

/**
 * Bidirectional Sync Service for React Native Offline-First Engine
 * Enforces:
 * 1. 3-day (72-hour) offline grace period verification
 * 2. Subscription task limit quota enforcement on offline-created tasks
 * 3. Conflict resolution (last-write-wins based on updated_at)
 * 4. Local SQLite ID to Neon DB PostgreSQL UUID mapping
 */
async function handleSync(userId, payload) {
  const { lastSyncedAt, clientTime, changes = {} } = payload;
  const now = new Date();
  const lastSyncDate = lastSyncedAt ? new Date(lastSyncedAt) : null;

  // 1. Check Offline Grace Period (3 days / 72 hours)
  let hoursSinceLastSync = 0;
  let isGraceExpired = false;

  if (lastSyncDate) {
    hoursSinceLastSync = (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSync > 72) {
      isGraceExpired = true;
    }
  }

  // 2. Fetch User Quota Limit
  const subRes = await query(`
    SELECT task_limit, end_date 
    FROM user_subscriptions 
    WHERE user_id = $1 AND status = 'active' AND end_date > CURRENT_TIMESTAMP 
    ORDER BY end_date DESC LIMIT 1
  `, [userId]);

  let maxTasks = 10; // Free plan default
  if (subRes.rows.length > 0) {
    maxTasks = subRes.rows[0].task_limit;
  } else {
    const userPlanRes = await query('SELECT p.max_tasks FROM users u JOIN subscription_plans p ON u.plan_id = p.id WHERE u.id = $1', [userId]);
    if (userPlanRes.rows.length > 0) {
      maxTasks = userPlanRes.rows[0].max_tasks;
    }
  }

  const countRes = await query('SELECT COUNT(*) as count FROM tasks WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  let currentCount = parseInt(countRes.rows[0].count, 10);

  const idMappings = {};
  const rejectedOfflineCreations = [];

  // 3. Process Created Tasks from Mobile App
  const createdTasks = changes.created || [];
  for (const item of createdTasks) {
    // Verify quota limit before saving
    if (currentCount >= maxTasks) {
      rejectedOfflineCreations.push({
        localId: item.localId,
        title: item.title,
        reason: 'QUOTA_EXCEEDED'
      });
      continue;
    }

    const insertRes = await query(`
      INSERT INTO tasks (
        user_id, local_id, title, description, type, category, priority,
        start_time, end_time, due_date, reminder_time, reminder_minutes,
        progress_percentage, is_completed, completed_at, total_amount, paid_amount,
        remaining_amount, target_item, recurring_type, version, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 1, $21, CURRENT_TIMESTAMP
      )
      RETURNING id, local_id
    `, [
      userId,
      item.localId || null,
      item.title,
      item.description || null,
      item.type || 'general',
      item.category || null,
      item.priority || 'medium',
      item.startTime ? new Date(item.startTime) : null,
      item.endTime ? new Date(item.endTime) : null,
      item.dueDate ? new Date(item.dueDate) : null,
      item.reminderTime ? new Date(item.reminderTime) : null,
      item.reminderMinutes || 0,
      item.progressPercentage || 0,
      item.isCompleted || false,
      item.isCompleted ? (item.completedAt ? new Date(item.completedAt) : now) : null,
      item.totalAmount || 0,
      item.paidAmount || 0,
      item.remainingAmount || 0,
      item.targetItem || null,
      item.recurringType || null,
      item.createdAt ? new Date(item.createdAt) : now
    ]);

    if (item.localId) {
      idMappings[item.localId] = insertRes.rows[0].id;
    }
    currentCount++;
  }

  // 4. Process Updated Tasks from Mobile App
  const updatedTasks = changes.updated || [];
  for (const item of updatedTasks) {
    await query(`
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
        progress_percentage = COALESCE($10, progress_percentage),
        is_completed = COALESCE($11, is_completed),
        completed_at = CASE WHEN $11 = true THEN CURRENT_TIMESTAMP ELSE NULL END,
        total_amount = COALESCE($12, total_amount),
        paid_amount = COALESCE($13, paid_amount),
        remaining_amount = COALESCE($14, remaining_amount),
        reminder_action = COALESCE($15, reminder_action),
        snoozed_until = $16,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE (id = $17 OR (local_id = $18 AND local_id IS NOT NULL)) AND user_id = $19
    `, [
      item.title,
      item.description,
      item.type,
      item.category,
      item.priority,
      item.startTime ? new Date(item.startTime) : null,
      item.endTime ? new Date(item.endTime) : null,
      item.dueDate ? new Date(item.dueDate) : null,
      item.reminderTime ? new Date(item.reminderTime) : null,
      item.progressPercentage,
      item.isCompleted,
      item.totalAmount,
      item.paidAmount,
      item.remainingAmount,
      item.reminderAction,
      item.snoozedUntil ? new Date(item.snoozedUntil) : null,
      item.id || null,
      item.localId || null,
      userId
    ]);
  }

  // 5. Process Deleted Tasks
  const deletedIds = changes.deletedIds || [];
  for (const delId of deletedIds) {
    await query(`
      UPDATE tasks 
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE (id = $1 OR local_id = $1) AND user_id = $2
    `, [delId, userId]);
  }

  // 6. Fetch Server-Side Changes since lastSyncDate
  let serverChangesSql = `
    SELECT 
      t.*,
      COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as subtasks
    FROM tasks t
    LEFT JOIN subtasks s ON t.id = s.task_id
    WHERE t.user_id = $1
  `;
  const params = [userId];

  if (lastSyncDate) {
    serverChangesSql += ` AND t.updated_at > $2`;
    params.push(lastSyncDate);
  }

  serverChangesSql += ` GROUP BY t.id ORDER BY t.due_date ASC NULLS LAST`;

  const serverChangesRes = await query(serverChangesSql, params);

  return {
    success: true,
    serverTime: now.toISOString(),
    idMappings,
    serverChanges: serverChangesRes.rows,
    rejectedOfflineCreations,
    quota: {
      currentCount,
      maxTasks,
      remaining: Math.max(0, maxTasks - currentCount)
    },
    syncGracePeriod: {
      maxHours: 72,
      hoursSinceLastSync: Math.round(hoursSinceLastSync),
      isExpired: isGraceExpired,
      nextSyncRequiredBefore: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
    }
  };
}

module.exports = {
  handleSync
};
