/**
 * Push Notifications Handler
 */

class PushNotificationManager {
  constructor() {
    this.vapidPublicKey = null;
    this.isSubscribed = false;
    this.swRegistration = null;
    
    this.init();
  }
  
  async init() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return;
    }
    
    if (!('PushManager' in window)) {
      console.warn('Push messaging not supported');
      return;
    }
    
    try {
      // Get service worker registration
      this.swRegistration = await navigator.serviceWorker.getRegistration();
      
      if (!this.swRegistration) {
        console.warn('No service worker registration found');
        return;
      }
      
      // Get VAPID public key
      await this.getVapidKey();
      
      // Check current subscription status
      await this.updateSubscriptionStatus();
      
      // Setup UI
      this.setupUI();
      
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  }
  
  async getVapidKey() {
    try {
      // In a real app, you'd fetch this from your server
      // For now, we'll use the environment variable
      this.vapidPublicKey = window.VAPID_PUBLIC_KEY || null;
      
      if (!this.vapidPublicKey) {
        console.warn('VAPID public key not found');
      }
    } catch (error) {
      console.error('Failed to get VAPID key:', error);
    }
  }
  
  async updateSubscriptionStatus() {
    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      this.isSubscribed = !(subscription === null);
      
      if (this.isSubscribed) {
        console.log('User is subscribed to push notifications');
        await this.updateServerSubscription(subscription);
      } else {
        console.log('User is not subscribed to push notifications');
      }
      
    } catch (error) {
      console.error('Failed to update subscription status:', error);
    }
  }
  
  setupUI() {
    const toggle = document.getElementById('pushNotificationsToggle');
    
    if (!toggle) {
      return;
    }
    
    // Set initial state
    toggle.checked = this.isSubscribed;
    
    // Handle toggle changes
    toggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await this.subscribeUser();
      } else {
        await this.unsubscribeUser();
      }
    });
  }
  
  async subscribeUser() {
    if (!this.vapidPublicKey) {
      alert('Push notifications are not properly configured');
      return;
    }
    
    try {
      // Request permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        alert('Permission for push notifications was denied');
        return;
      }
      
      // Subscribe user
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });
      
      console.log('User subscribed to push notifications:', subscription);
      
      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);
      
      this.isSubscribed = true;
      this.updateToggleState(true);
      
      showToast('Push notifications enabled!', 'success');
      
    } catch (error) {
      console.error('Failed to subscribe user:', error);
      this.updateToggleState(false);
      showToast('Failed to enable push notifications', 'danger');
    }
  }
  
  async unsubscribeUser() {
    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await this.removeSubscriptionFromServer();
        console.log('User unsubscribed from push notifications');
      }
      
      this.isSubscribed = false;
      this.updateToggleState(false);
      
      showToast('Push notifications disabled', 'info');
      
    } catch (error) {
      console.error('Failed to unsubscribe user:', error);
      showToast('Failed to disable push notifications', 'danger');
    }
  }
  
  async sendSubscriptionToServer(subscription) {
    try {
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
        credentials: 'same-origin'
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to save subscription');
      }
      
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
      throw error;
    }
  }
  
  async updateServerSubscription(subscription) {
    try {
      // Update existing subscription on server
      await this.sendSubscriptionToServer(subscription);
    } catch (error) {
      console.error('Failed to update server subscription:', error);
    }
  }
  
  async removeSubscriptionFromServer() {
    try {
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.warn('Failed to remove subscription from server:', result.message);
      }
      
    } catch (error) {
      console.error('Failed to remove subscription from server:', error);
    }
  }
  
  updateToggleState(enabled) {
    const toggle = document.getElementById('pushNotificationsToggle');
    if (toggle) {
      toggle.checked = enabled;
    }
  }
  
  // Test push notification
  async sendTestNotification() {
    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast('Test notification sent!', 'success');
      } else {
        showToast(result.message || 'Failed to send test notification', 'danger');
      }
      
    } catch (error) {
      console.error('Failed to send test notification:', error);
      showToast('Failed to send test notification', 'danger');
    }
  }
  
  // Utility function to convert VAPID key
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  }
}

// Initialize push notification manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if user has push notification feature
  const userHasPushFeature = document.getElementById('pushNotificationsToggle');
  
  if (userHasPushFeature) {
    window.pushManager = new PushNotificationManager();
  }
});

// Add test notification button functionality
document.addEventListener('DOMContentLoaded', () => {
  const testButton = document.getElementById('testPushNotification');
  
  if (testButton) {
    testButton.addEventListener('click', async (e) => {
      e.preventDefault();
      
      if (window.pushManager) {
        await window.pushManager.sendTestNotification();
      } else {
        showToast('Push notifications not available', 'warning');
      }
    });
  }
});

// Handle notification clicks when app is open
navigator.serviceWorker?.addEventListener('message', event => {
  if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
    const data = event.data.payload;
    
    // Handle different notification actions
    if (data.action === 'complete' && data.activityId) {
      // Navigate to activity and mark as complete
      window.location.href = `/activities/${data.activityId}`;
    } else if (data.url) {
      // Navigate to specified URL
      window.location.href = data.url;
    }
  }
});

// Export for global access
if (typeof window !== 'undefined') {
  window.PushNotificationManager = PushNotificationManager;
}
