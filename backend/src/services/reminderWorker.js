const cron = require('node-cron');
const { query } = require('../database/db');
const { sendDeadlineReminderEmail } = require('./emailService');
const { sendTaskPushNotification } = require('./pushService');

let isRunning = false;

async function checkAndSendTaskReminders() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Select tasks needing notification
    const sql = `
      SELECT 
        t.*,
        u.email,
        u.first_name,
        u.last_name,
        u.email_notifications,
        u.push_notifications
      FROM tasks t
      JOIN users u ON t.user_id = u.id
      WHERE 
        t.is_completed = FALSE
        AND t.deleted_at IS NULL
        AND t.reminder_action != 'DONT_REMIND'
        AND (
          -- Snoozed reminder has reached its time
          (t.snoozed_until IS NOT NULL AND t.snoozed_until <= CURRENT_TIMESTAMP)
          OR
          -- Custom reminder time reached and not previously notified
          (t.snoozed_until IS NULL AND t.reminder_time IS NOT NULL AND t.reminder_time <= CURRENT_TIMESTAMP AND (t.last_reminder_sent_at IS NULL OR t.last_reminder_sent_at < t.reminder_time))
          OR
          -- Due date reached and not notified within the last 12 hours
          (t.snoozed_until IS NULL AND t.reminder_time IS NULL AND t.due_date IS NOT NULL AND t.due_date <= CURRENT_TIMESTAMP AND (t.last_reminder_sent_at IS NULL OR t.last_reminder_sent_at < CURRENT_TIMESTAMP - INTERVAL '12 hours'))
        )
      LIMIT 50;
    `;

    const res = await query(sql);

    if (res.rows.length > 0) {
      console.log(`⏰ [Reminder Worker] Found ${res.rows.length} task(s) needing deadline reminders.`);

      for (const task of res.rows) {
        const user = {
          id: task.user_id,
          email: task.email,
          first_name: task.first_name,
          last_name: task.last_name
        };

        // 1. Send Email Notification
        if (task.email_notifications) {
          await sendDeadlineReminderEmail(user, task);
        }

        // 2. Send Mobile / Web Push Notification
        if (task.push_notifications) {
          await sendTaskPushNotification(task.user_id, task);
        }

        // 3. Insert reminder audit log
        await query(`
          INSERT INTO reminders (task_id, user_id, trigger_at, is_sent, sent_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP, true, CURRENT_TIMESTAMP)
        `, [task.id, task.user_id]);

        // 4. Update task metadata (clear snoozed_until and mark last_reminder_sent_at)
        await query(`
          UPDATE tasks 
          SET 
            last_reminder_sent_at = CURRENT_TIMESTAMP,
            snoozed_until = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [task.id]);

        console.log(`✅ [Reminder Worker] Successfully processed reminder for task: "${task.title}" (ID: ${task.id})`);
      }
    }
  } catch (error) {
    console.error('❌ [Reminder Worker] Error executing checkAndSendTaskReminders:', error.message);
  } finally {
    isRunning = false;
  }
}

// Start recurring scheduler (runs every 60 seconds)
function startReminderScheduler() {
  console.log('⏰ Starting Notifai space Deadline Reminder Worker (Runs every 60 seconds)...');
  
  // Run on startup after 5 seconds
  setTimeout(() => {
    checkAndSendTaskReminders();
  }, 5000);

  // Every minute
  cron.schedule('* * * * *', () => {
    checkAndSendTaskReminders();
  });
}

module.exports = {
  startReminderScheduler,
  checkAndSendTaskReminders
};
