const nodemailer = require('nodemailer');
require('dotenv').config();

// Create Nodemailer transport
// Works seamlessly in Render environment, local dev, or standard SMTP
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'mail.benix.space',
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER || 'admin@benix.space',
    pass: process.env.EMAIL_PASS || ''
  },
  tls: {
    rejectUnauthorized: false
  }
});

const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'http://localhost:5173';
const FROM_EMAIL = process.env.EMAIL_FROM || `"Notifai space" <${process.env.EMAIL_USER || 'admin@benix.space'}>`;

/**
 * Send Task Deadline Reminder Email with 1-click action buttons
 */
async function sendDeadlineReminderEmail(user, task) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const deadlineText = task.due_date ? new Date(task.due_date).toLocaleString() : 'Today';

  const actionBaseUrl = `${APP_URL}/api/reminders/action/${task.id}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
        .card { background-color: #1e293b; border-radius: 12px; padding: 28px; max-width: 580px; margin: 0 auto; border: 1px solid #334155; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; }
        .title { color: #38bdf8; font-size: 22px; font-weight: 700; margin: 0; }
        .badge { background-color: ${isOverdue ? '#ef4444' : '#f59e0b'}; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; }
        .task-box { background-color: #0f172a; border-radius: 8px; padding: 18px; margin: 20px 0; border-left: 4px solid #38bdf8; }
        .task-title { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 6px; }
        .task-desc { color: #94a3b8; font-size: 14px; margin-bottom: 12px; }
        .meta-line { color: #cbd5e1; font-size: 13px; margin: 4px 0; }
        .btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
        .btn { display: inline-block; text-align: center; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
        .btn-primary { background-color: #10b981; color: #ffffff; }
        .btn-snooze { background-color: #3b82f6; color: #ffffff; }
        .btn-cancel { background-color: #475569; color: #cbd5e1; }
        .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 class="title">⚡ Notifai space</h2>
          <span class="badge">${isOverdue ? '⚠️ OVERDUE' : '⏰ DUE SOON'}</span>
        </div>
        <p>Hello <strong>${user.first_name || 'User'}</strong>,</p>
        <p>This is a high-priority deadline alert for your task:</p>
        
        <div class="task-box">
          <div class="task-title">${task.title}</div>
          ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}
          <div class="meta-line">📅 <strong>Deadline:</strong> ${deadlineText}</div>
          <div class="meta-line">🎯 <strong>Priority:</strong> ${(task.priority || 'medium').toUpperCase()}</div>
          <div class="meta-line">🏷️ <strong>Type:</strong> ${(task.type || 'general').toUpperCase()}</div>
          ${task.total_amount > 0 ? `<div class="meta-line">💰 <strong>Amount:</strong> $${task.paid_amount} / $${task.total_amount} (Remaining: $${task.remaining_amount})</div>` : ''}
        </div>

        <p style="font-size: 14px; color: #cbd5e1;">Please confirm your reminder action:</p>

        <table width="100%" cellpadding="6" cellspacing="0" style="margin-top: 10px;">
          <tr>
            <td>
              <a href="${actionBaseUrl}?action=OKAY_I_KNOW" class="btn btn-primary" style="display:block; text-align:center; padding:12px; background:#10b981; color:#fff; border-radius:6px; text-decoration:none; font-weight:bold;">✅ Okay I know</a>
            </td>
          </tr>
          <tr>
            <td>
              <a href="${actionBaseUrl}?action=REMIND_30_MIN" class="btn btn-snooze" style="display:block; text-align:center; padding:12px; background:#3b82f6; color:#fff; border-radius:6px; text-decoration:none; font-weight:bold;">⏰ Remind me in 30 minutes</a>
            </td>
          </tr>
          <tr>
            <td>
              <a href="${actionBaseUrl}?action=DONT_REMIND" class="btn btn-cancel" style="display:block; text-align:center; padding:12px; background:#475569; color:#cbd5e1; border-radius:6px; text-decoration:none;">🔕 Don't remind</a>
            </td>
          </tr>
        </table>

        <div class="footer">
          Notifai space • Smart Task & Offline Management Ecosystem<br>
          <a href="${APP_URL}" style="color: #38bdf8; text-decoration:none;">Open Notifai space Dashboard</a>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: user.email,
      subject: `${isOverdue ? '⚠️ Overdue' : '⏰ Reminder'}: ${task.title} - Notifai space`,
      html: htmlContent
    });
    console.log(`✉️ Email reminder sent to ${user.email} (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`❌ Email send failed to ${user.email}:`, error.message);
    return false;
  }
}

/**
 * Send Subscription Confirmation Email
 */
async function sendSubscriptionConfirmationEmail(user, planName, durationMonths, amount, taskLimit) {
  const htmlContent = `
    <div style="font-family: sans-serif; background-color: #0f172a; color: #fff; padding: 24px;">
      <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 10px;">
        <h2 style="color: #38bdf8;">🎉 Subscription Confirmed!</h2>
        <p>Hi ${user.first_name},</p>
        <p>Thank you for subscribing to <strong>${planName}</strong> on <strong>Notifai space</strong>.</p>
        <ul>
          <li><strong>Duration:</strong> ${durationMonths} month(s)</li>
          <li><strong>Task Limit:</strong> Up to ${taskLimit} active tasks</li>
          <li><strong>Amount Paid:</strong> $${amount}</li>
          <li><strong>Status:</strong> Active</li>
        </ul>
        <p>You can now create and manage more tasks with zero restrictions!</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: user.email,
      subject: `🎉 Subscription Activated: ${planName} (${durationMonths} Mo) - Notifai space`,
      html: htmlContent
    });
  } catch (err) {
    console.error('Subscription email send error:', err.message);
  }
}

module.exports = {
  transporter,
  sendDeadlineReminderEmail,
  sendSubscriptionConfirmationEmail
};
