/**
 * Service Worker for Push Notifications and PWA
 * Managinga Space
 */

const CACHE_NAME = 'managinga-space-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/activities',
  '/css/app.css',
  '/css/auth.css',
  '/js/app.js',
  '/js/notification-manager.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Failed to cache resources:', error);
      })
  );
  self.skipWaiting(); // Activate immediately
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control immediately
});

// Fetch event with network-first strategy for dynamic content
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip requests with no-cache
  if (event.request.headers.get('cache-control') === 'no-cache') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Try network first for API calls and dynamic content
        if (event.request.url.includes('/api/') || 
            event.request.url.includes('/notifications/') ||
            event.request.url.includes('/dashboard') ||
            event.request.url.includes('/activities')) {
          
          return fetch(event.request)
            .then((response) => {
              // Cache successful responses
              if (response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => {
              // Fallback to cache if network fails
              return cache.match(event.request);
            });
        }
        
        // Cache first for static assets
        return cache.match(event.request)
          .then((response) => {
            if (response) {
              return response; // Return cached version
            }
            
            // Fetch from network and cache
            return fetch(event.request)
              .then((response) => {
                if (response.status === 200) {
                  cache.put(event.request, response.clone());
                }
                return response;
              });
          });
      })
  );
});

// Push event - Handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push received:', event);
  
  let notificationData = {
    title: 'Managinga Space',
    message: 'You have a new notification',
    icon: '/images/icon-192x192.png',
    badge: '/images/badge-72x72.png',
    tag: 'default',
    requireInteraction: false,
    actions: []
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        message: data.message || data.body || notificationData.message,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.tag || notificationData.tag,
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
        data: data.data || {}
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData.message = event.data.text();
    }
  }

  const notificationOptions = {
    body: notificationData.message,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    actions: notificationData.actions,
    data: notificationData.data,
    vibrate: [200, 100, 200], // Vibration pattern
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  // Handle action clicks
  if (event.action) {
    console.log('Action clicked:', event.action);
    
    switch (event.action) {
      case 'view':
        event.waitUntil(
          clients.openWindow(event.notification.data.url || '/dashboard')
        );
        break;
      case 'dismiss':
        // Just close, no action needed
        break;
      default:
        event.waitUntil(
          clients.openWindow('/dashboard')
        );
        break;
    }
  } else {
    // Default click action
    const url = event.notification.data?.url || '/dashboard';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Check if there's already a window/tab open with the target URL
          for (const client of clientList) {
            if (client.url.includes(url.split('?')[0]) && 'focus' in client) {
              return client.focus();
            }
          }
          
          // If no existing window, open a new one
          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        })
    );
  }
});

// Background sync for offline functionality
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'activity-sync') {
    event.waitUntil(
      // Handle offline activity synchronization
      syncActivities()
    );
  }
});

// Function to sync offline activities
async function syncActivities() {
  try {
    // This would sync any offline-created activities
    // Implementation depends on your offline storage strategy
    console.log('Syncing offline activities...');
  } catch (error) {
    console.error('Failed to sync activities:', error);
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
