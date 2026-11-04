const { checkAndSendTaskReminders } = require('../services/reminderWorker');

console.log('🧪 Running one-off deadline reminder worker check...');

checkAndSendTaskReminders()
  .then(() => {
    console.log('✨ Test finished.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
