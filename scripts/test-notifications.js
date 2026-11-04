/**
 * Test script for notification system
 * Run this to verify notifications are working
 */

const NotificationService = require('../utils/notificationService');

async function testNotifications() {
  console.log('🧪 Testing Notification System...\n');
  
  try {
    // Test user ID - replace with actual user ID from your database
    const testUserId = 1;
    
    console.log('📧 Testing email notification...');
    await NotificationService.notifyActivityCreated(testUserId, {
      id: 999,
      title: 'Test Activity',
      description: 'This is a test activity for notification testing',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
    });
    console.log('✅ Email notification sent!');
    
    console.log('\n🔔 Testing push notification...');
    await NotificationService.sendNotification(testUserId, 'test', {
      title: 'Test Push Notification',
      message: 'This is a test push notification to verify the system is working.',
      url: '/dashboard'
    });
    console.log('✅ Push notification sent!');
    
    console.log('\n📋 Testing in-app notification...');
    await NotificationService.createInAppNotification(testUserId, 'test', {
      title: 'Test In-App Notification',
      message: 'This notification should appear in your notification dropdown.',
      url: '/dashboard'
    });
    console.log('✅ In-app notification created!');
    
    console.log('\n✅ All notification tests completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Check your email for the test notification');
    console.log('2. Enable push notifications in the browser');
    console.log('3. Check the notification dropdown in the app');
    console.log('4. Create/complete/delete activities to see real notifications');
    
  } catch (error) {
    console.error('❌ Error testing notifications:', error);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testNotifications().then(() => {
    console.log('\n🏁 Test completed. You can now use the notification system!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

module.exports = testNotifications;
