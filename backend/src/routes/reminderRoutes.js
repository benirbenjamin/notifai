const express = require('express');
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Handle interactive reminder response:
 * 1. OKAY_I_KNOW: user acknowledges task
 * 2. REMIND_30_MIN: user snoozes deadline alert by 30 minutes
 * 3. DONT_REMIND: user silences future reminders for this task
 */
async function processReminderAction(taskId, action, userId = null) {
  const validActions = ['OKAY_I_KNOW', 'REMIND_30_MIN', 'DONT_REMIND'];
  if (!validActions.includes(action)) {
    throw new Error('Invalid reminder action. Must be OKAY_I_KNOW, REMIND_30_MIN, or DONT_REMIND');
  }

  let snoozedUntil = null;
  let responseMessage = '';

  if (action === 'OKAY_I_KNOW') {
    responseMessage = 'Great! We noted that you are aware of this task.';
  } else if (action === 'REMIND_30_MIN') {
    // Add 30 minutes to current time
    snoozedUntil = new Date(Date.now() + 30 * 60 * 1000);
    responseMessage = 'Reminder snoozed! We will alert you again in 30 minutes.';
  } else if (action === 'DONT_REMIND') {
    responseMessage = 'Reminders disabled for this task.';
  }

  let updateSql = `
    UPDATE tasks 
    SET 
      reminder_action = $1,
      snoozed_until = $2,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `;
  const params = [action, snoozedUntil, taskId];

  if (userId) {
    updateSql += ` AND user_id = $4`;
    params.push(userId);
  }

  updateSql += ` RETURNING id, title, reminder_action, snoozed_until`;

  const result = await query(updateSql, params);

  if (result.rows.length === 0) {
    throw new Error('Task not found or access denied');
  }

  return {
    task: result.rows[0],
    action,
    message: responseMessage,
    snoozedUntil
  };
}

// JSON API endpoint (Used by React Native Mobile App & Web App)
router.post('/action', authenticateToken, async (req, res) => {
  try {
    const { taskId, action } = req.body;
    if (!taskId || !action) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'taskId and action are required' });
    }

    const result = await processReminderAction(taskId, action, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Reminder action error:', error);
    res.status(400).json({ error: 'BAD_REQUEST', message: error.message });
  }
});

// Browser 1-click URL endpoint (Used by Email Notifications)
router.get('/action/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { action } = req.query;

    if (!taskId || !action) {
      return res.status(400).send('Invalid request: missing task ID or action.');
    }

    const result = await processReminderAction(taskId, action);

    // Render a clean response card
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Notifai space Reminder Acknowledged</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background-color: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 32px; border-radius: 12px; max-width: 450px; text-align: center; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          h1 { color: #38bdf8; font-size: 24px; margin-bottom: 12px; }
          p { color: #cbd5e1; font-size: 16px; line-height: 1.5; }
          .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: bold; background: #38bdf8; color: #0f172a; margin-top: 10px; }
          .btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚡ Notifai space</h1>
          <p><strong>Task:</strong> ${result.task.title}</p>
          <div class="badge">${result.action.replace(/_/g, ' ')}</div>
          <p style="margin-top: 18px;">${result.message}</p>
          ${result.snoozedUntil ? `<p style="color: #94a3b8; font-size: 13px;">New alert scheduled for: ${new Date(result.snoozedUntil).toLocaleTimeString()}</p>` : ''}
          <a href="/" class="btn">Open App</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(400).send(`Error processing reminder action: ${error.message}`);
  }
});

// Vercel Cron Endpoint (Runs serverless deadline checks)
router.get('/cron', async (req, res) => {
  try {
    const { checkAndSendTaskReminders } = require('../services/reminderWorker');
    await checkAndSendTaskReminders();
    res.json({ success: true, message: 'Deadline reminder check completed.' });
  } catch (error) {
    console.error('Vercel cron reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
