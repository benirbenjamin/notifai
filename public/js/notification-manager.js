/**
 * Push Notification Permission Manager
 * Handles PWA installation and push notification permissions
 */

class NotificationManager {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.registration = null;
    this.vapidPublicKey = null;
    this.deferredPrompt = null;
    
    this.setupEventDelegation();
    this.init();
  }

  setupEventDelegation() {
    console.log('📱 Setting up event delegation for notification buttons...');
    
    // Use event delegation to handle button clicks
    document.addEventListener('click', (event) => {
      console.log('🖱️ Document click detected:', event.target);
      
      const action = event.target.getAttribute('data-action');
      console.log('🔍 Data action found:', action);
      
      if (!action) {
        // Check if clicked inside a button with data-action
        const button = event.target.closest('[data-action]');
        if (button) {
          const buttonAction = button.getAttribute('data-action');
          console.log('🔍 Found button with action:', buttonAction);
          this.handleButtonAction(buttonAction, event);
          return;
        }
        return;
      }

      this.handleButtonAction(action, event);
    });
  }

  handleButtonAction(action, event) {
    console.log('🎯 Handling button action:', action);
    
    switch (action) {
      case 'request-notifications':
        console.log('📱 Request notifications button clicked');
        event.preventDefault();
        this.requestNotificationPermission();
        break;
      case 'deny-notifications':
        console.log('❌ Deny notifications button clicked');
        event.preventDefault();
        this.denyNotifications();
        break;
      case 'install-pwa':
        console.log('📲 Install PWA button clicked');
        event.preventDefault();
        this.installPWA();
        break;
      case 'dismiss-pwa':
        console.log('🚫 Dismiss PWA button clicked');
        event.preventDefault();
        this.dismissPWAInstall();
        break;
      default:
        console.log('❓ Unknown action:', action);
    }
  }

  async init() {
    if (!this.isSupported) {
      console.log('Push notifications not supported');
      return;
    }

    // Listen for PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA install prompt available');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showPWAInstallOption();
    });

    // Check if already installed
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed');
      this.deferredPrompt = null;
      this.hidePWAInstallOption();
    });

    // Register service worker
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered successfully');
      
      // Check if already subscribed
      await this.checkExistingSubscription();
      
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  async checkExistingSubscription() {
    if (!this.registration) return;

    try {
      const subscription = await this.registration.pushManager.getSubscription();
      if (subscription) {
        console.log('Already subscribed to push notifications');
        this.showNotificationStatus(true);
      } else {
        // Show permission request after a short delay
        setTimeout(() => {
          this.showNotificationPermissionPrompt();
        }, 2000);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }

  showNotificationPermissionPrompt() {
    console.log('🔔 showNotificationPermissionPrompt called');
    console.log('📱 Current notification permission:', Notification.permission);
    
    // Check if user has already been asked and declined
    const permissionAsked = localStorage.getItem('notification-permission-asked');
    const permissionDenied = localStorage.getItem('notification-permission-denied');
    
    if (permissionAsked === 'true' && permissionDenied === 'true') {
      console.log('💭 User already declined notifications, not showing prompt again');
      return;
    }
    
    // Check if permission already granted
    if (Notification.permission === 'granted') {
      console.log('✅ Permission already granted, requesting push subscription');
      this.requestPushSubscription();
      return;
    }

    // Check if permission denied
    if (Notification.permission === 'denied') {
      console.log('❌ Permission denied, showing error status');
      this.showNotificationStatus(false, 'Notifications are blocked. Please enable them in your browser settings.');
      return;
    }

    console.log('📱 Creating permission modal...');
    // Show custom permission modal
    this.createPermissionModal();
  }

  createPermissionModal() {
    console.log('🎭 createPermissionModal called');
    
    // Remove existing modal if any
    const existingModal = document.getElementById('notification-permission-modal');
    if (existingModal) {
      console.log('🗑️ Removing existing modal');
      existingModal.remove();
    }

    const modalHTML = `
      <div class="modal fade" id="notification-permission-modal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title">
                <i class="bi bi-bell text-primary me-2"></i>
                Enable Notifications
              </h5>
            </div>
            <div class="modal-body text-center">
              <div class="mb-4">
                <div class="notification-icon mb-3">
                  <i class="bi bi-bell-fill text-primary" style="font-size: 3rem;"></i>
                </div>
                <h6 class="mb-3">Stay updated with your activities!</h6>
                <p class="text-muted mb-0">
                  Get instant notifications when:
                </p>
                <ul class="list-unstyled mt-3 text-start">
                  <li class="mb-2">
                    <i class="bi bi-check-circle text-success me-2"></i>
                    Activities are due soon
                  </li>
                  <li class="mb-2">
                    <i class="bi bi-check-circle text-success me-2"></i>
                    Team members update shared activities
                  </li>
                  <li class="mb-2">
                    <i class="bi bi-check-circle text-success me-2"></i>
                    Important reminders and updates
                  </li>
                </ul>
              </div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-outline-secondary" data-action="deny-notifications">
                Maybe Later
              </button>
              <button type="button" class="btn btn-primary" data-action="request-notifications">
                <i class="bi bi-bell me-1"></i>
                Enable Notifications
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('✅ Modal HTML inserted into document');
    
    // Show modal
    const modalElement = document.getElementById('notification-permission-modal');
    if (modalElement) {
      console.log('✅ Modal element found, creating Bootstrap modal');
      const modal = new bootstrap.Modal(modalElement);
      
      // Add event listener for when modal is hidden (dismissed without action)
      modalElement.addEventListener('hidden.bs.modal', () => {
        console.log('📱 Modal dismissed without explicit action');
        // Only mark as asked if user didn't take any action
        const permissionAsked = localStorage.getItem('notification-permission-asked');
        if (!permissionAsked) {
          localStorage.setItem('notification-permission-asked', 'true');
          localStorage.setItem('notification-permission-denied', 'true');
          console.log('💭 Marking notification permission as dismissed');
        }
      });
      
      modal.show();
      console.log('✅ Modal show() called');
    } else {
      console.error('❌ Modal element not found after insertion');
    }
  }

  async requestNotificationPermission() {
    console.log('🔔 requestNotificationPermission called');
    
    // Close modal first if it exists
    this.closePermissionModal();
    
    try {
      console.log('📱 Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('📱 Permission result:', permission);
      
      // Mark that user has been asked
      localStorage.setItem('notification-permission-asked', 'true');
      
      if (permission === 'granted') {
        console.log('✅ Notification permission granted');
        // Clear the denied flag if it was set before
        localStorage.removeItem('notification-permission-denied');
        await this.requestPushSubscription();
        this.showNotificationStatus(true, 'Notifications enabled successfully!');
      } else {
        console.log('❌ Notification permission denied');
        localStorage.setItem('notification-permission-denied', 'true');
        this.showNotificationStatus(false, 'Notifications were not enabled.');
      }
    } catch (error) {
      console.error('❌ Error requesting permission:', error);
      this.showNotificationStatus(false, 'Error enabling notifications.');
    }
  }

  async requestPushSubscription() {
    console.log('🔑 requestPushSubscription called');
    
    if (!this.registration) {
      console.error('❌ Service worker not registered');
      this.showNotificationStatus(false, 'Service worker not available.');
      return;
    }

    try {
      console.log('🌐 Fetching VAPID public key...');
      // Get VAPID public key from server
      const response = await fetch('/notifications/api/vapid-key');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('🔑 VAPID key response:', data);
      
      const { publicKey } = data;
      if (!publicKey) {
        throw new Error('No VAPID public key received');
      }
      
      this.vapidPublicKey = publicKey;
      console.log('✅ VAPID public key set:', publicKey.substring(0, 20) + '...');

      console.log('📱 Subscribing to push manager...');
      // Subscribe to push manager
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey)
      });

      console.log('📤 Sending subscription to server...', subscription);
      // Send subscription to server
      const subscribeResponse = await fetch('/notifications/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription)
      });

      if (!subscribeResponse.ok) {
        throw new Error(`Failed to save subscription: ${subscribeResponse.status}`);
      }

      console.log('✅ Push subscription successful');
      
      // Send a test notification
      console.log('🧪 Sending test notification...');
      this.sendTestNotification();

    } catch (error) {
      console.error('❌ Error subscribing to push notifications:', error);
      this.showNotificationStatus(false, 'Error setting up push notifications: ' + error.message);
    }
  }

  async sendTestNotification() {
    console.log('🧪 sendTestNotification called');
    try {
      const response = await fetch('/notifications/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('✅ Test notification sent successfully');
      } else {
        console.error('❌ Failed to send test notification:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error sending test notification:', error);
    }
  }

  denyNotifications() {
    console.log('denyNotifications called');
    this.closePermissionModal();
    this.showNotificationStatus(false, 'You can enable notifications later in your browser settings or by clicking the bell icon.');
    
    // Store preference
    localStorage.setItem('notification-permission-asked', 'true');
    localStorage.setItem('notification-permission-denied', 'true');
  }

  // Method to reset notification permission state (for settings or manual reset)
  resetNotificationPermission() {
    console.log('🔄 Resetting notification permission state');
    localStorage.removeItem('notification-permission-asked');
    localStorage.removeItem('notification-permission-denied');
    console.log('✅ Notification permission state reset');
  }

  closePermissionModal() {
    const modal = document.getElementById('notification-permission-modal');
    if (modal) {
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) {
        bsModal.hide();
      }
      setTimeout(() => modal.remove(), 300);
    }
  }

  showNotificationStatus(enabled, message = null) {
    const statusHTML = `
      <div class="alert alert-${enabled ? 'success' : 'warning'} alert-dismissible fade show notification-status" role="alert">
        <i class="bi bi-${enabled ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
        ${message || (enabled ? 'Notifications are enabled' : 'Notifications are disabled')}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;

    // Remove existing status
    const existingStatus = document.querySelector('.notification-status');
    if (existingStatus) {
      existingStatus.remove();
    }

    // Add new status
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.insertAdjacentHTML('afterbegin', statusHTML);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        const status = document.querySelector('.notification-status');
        if (status) {
          status.remove();
        }
      }, 5000);
    }
  }

  // PWA Installation
  showPWAInstallOption() {
    // Check if already asked recently
    const lastAsked = localStorage.getItem('pwa-install-asked');
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

    if (lastAsked && (now - parseInt(lastAsked)) < oneWeek) {
      return; // Don't ask again for a week
    }

    setTimeout(() => {
      this.createPWAInstallModal();
    }, 5000); // Show after 5 seconds
  }

  createPWAInstallModal() {
    const modalHTML = `
      <div class="modal fade" id="pwa-install-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title">
                <i class="bi bi-phone text-primary me-2"></i>
                Install Managinga Space
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center">
              <div class="mb-4">
                <div class="pwa-icon mb-3">
                  <i class="bi bi-download text-primary" style="font-size: 3rem;"></i>
                </div>
                <h6 class="mb-3">Install for better experience!</h6>
                <p class="text-muted mb-0">
                  Install Managinga Space as an app for:
                </p>
                <ul class="list-unstyled mt-3 text-start">
                  <li class="mb-2">
                    <i class="bi bi-check-circle text-success me-2"></i>
                    Faster loading and offline access
                  </li>
                  <li class="mb-2">
                    <i class="bi bi-check-circle text-success me-2"></i>
                    App-like experience
                  </li>
                  <li class="mb-2">
                    <i class="bi bi-check-circle text-success me-2"></i>
                    Quick access from home screen
                  </li>
                </ul>
              </div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" data-action="dismiss-pwa">
                Not Now
              </button>
              <button type="button" class="btn btn-primary" data-action="install-pwa">
                <i class="bi bi-download me-1"></i>
                Install App
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('pwa-install-modal'));
    modal.show();
  }

  async installPWA() {
    console.log('installPWA called');
    if (!this.deferredPrompt) {
      console.log('PWA install prompt not available');
      return;
    }

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('PWA install accepted');
      } else {
        console.log('PWA install dismissed');
      }
      
      this.deferredPrompt = null;
      this.closePWAInstallModal();
      
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  }

  dismissPWAInstall() {
    console.log('dismissPWAInstall called');
    localStorage.setItem('pwa-install-asked', Date.now().toString());
    this.closePWAInstallModal();
  }

  closePWAInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) {
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) {
        bsModal.hide();
      }
      setTimeout(() => modal.remove(), 300);
    }
  }

  hidePWAInstallOption() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) {
      modal.remove();
    }
  }

  // Utility function
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

// Initialize when DOM is loaded
let notificationManager;
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing NotificationManager...');
  try {
    notificationManager = new NotificationManager();
    // Export for global access after creation
    window.notificationManager = notificationManager;
    
    // Debug: Test if instance is available
    console.log('✅ NotificationManager instance created:', notificationManager);
    console.log('✅ Global window.notificationManager:', window.notificationManager);
    
    // Test method availability
    console.log('✅ Available methods:', {
      requestNotificationPermission: typeof notificationManager.requestNotificationPermission,
      denyNotifications: typeof notificationManager.denyNotifications,
      resetNotificationPermission: typeof notificationManager.resetNotificationPermission,
      installPWA: typeof notificationManager.installPWA,
      dismissPWAInstall: typeof notificationManager.dismissPWAInstall
    });
    
  } catch (error) {
    console.error('❌ Error initializing NotificationManager:', error);
  }
});

// Add test function for debugging
window.testNotificationManager = function() {
  console.log('🧪 Testing NotificationManager...');
  console.log('Instance exists:', !!window.notificationManager);
  
  if (window.notificationManager) {
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.notificationManager)));
    console.log('🧪 Calling requestNotificationPermission...');
    window.notificationManager.requestNotificationPermission();
  } else {
    console.error('❌ NotificationManager not available');
  }
};

// Add test function to force show modal
window.forceShowNotificationModal = function() {
  console.log('🧪 Force showing notification modal...');
  if (window.notificationManager) {
    window.notificationManager.createPermissionModal();
  } else {
    console.error('❌ NotificationManager not available');
  }
};

// Add function to reset notification permission (useful for testing or user settings)
window.resetNotificationPermission = function() {
  console.log('🔄 Resetting notification permission from console...');
  if (window.notificationManager) {
    window.notificationManager.resetNotificationPermission();
    console.log('✅ Notification permission reset. Refresh the page to see the prompt again.');
  } else {
    console.error('❌ NotificationManager not available');
  }
};

// Add test function to check service worker
window.testServiceWorker = function() {
  console.log('🧪 Testing Service Worker...');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      console.log('Service Worker registrations:', registrations);
    });
  } else {
    console.log('❌ Service Worker not supported');
  }
};

// Add debug function for push notifications
window.debugPushNotifications = async function() {
  console.log('🔍 Debugging Push Notifications...');
  
  try {
    // Check browser support
    console.log('📱 Browser support:');
    console.log('  - Service Worker:', 'serviceWorker' in navigator);
    console.log('  - Push Manager:', 'PushManager' in window);
    console.log('  - Notifications:', 'Notification' in window);
    console.log('  - Notification permission:', Notification.permission);
    
    // Check service worker registration
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      console.log('🔧 Service Worker registration:', registration);
      
      if (registration && registration.pushManager) {
        const subscription = await registration.pushManager.getSubscription();
        console.log('📱 Current push subscription:', subscription);
        
        if (subscription) {
          console.log('📱 Subscription details:');
          console.log('  - Endpoint:', subscription.endpoint);
          console.log('  - Keys:', subscription.keys);
        }
      }
    }
    
    // Check server-side debug info
    const response = await fetch('/notifications/api/push/debug');
    const debugInfo = await response.json();
    console.log('🌐 Server-side debug info:', debugInfo);
    
  } catch (error) {
    console.error('❌ Error debugging push notifications:', error);
  }
};
