/**
 * Service Worker for Managinga Space PWA
 */

const CACHE_NAME = 'managinga-space-v1';
const urlsToCache = [
  '/',
  '/css/app.css',
  '/css/auth.css',
  '/js/app.js',
  '/js/push-notifications.js',
  '/manifest.json',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

// CDN resources to cache on-demand (not during install)
const cdnUrls = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install event
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Cache populated');
        return self.skipWaiting();
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip Chrome extension requests
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  // Skip CDN requests that might violate CSP during service worker execution
  if (event.request.url.includes('cdn.jsdelivr.net') || event.request.url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request).then(response => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Cache GET requests for static assets (only local assets)
          if (event.request.url.startsWith(self.location.origin) && 
              event.request.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
          }
          
          return response;
        }).catch(() => {
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          
          // Return placeholder for images
          if (event.request.destination === 'image') {
            return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f8f9fa"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#6c757d">Image unavailable</text></svg>', {
              headers: { 'Content-Type': 'image/svg+xml' }
            });
          }
        });
      })
  );
});

// Background Sync
self.addEventListener('sync', event => {
  console.log('Background sync event:', event.tag);
  
  if (event.tag === 'activity-sync') {
    event.waitUntil(syncActivities());
  }
});

// Push event for notifications
self.addEventListener('push', event => {
  console.log('Push message received:', event);
  
  let payload = {};
  
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = {
        title: 'Managinga Space',
        body: event.data.text() || 'You have a new notification',
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png'
      };
    }
  }
  
  const options = {
    body: payload.body || 'You have a new notification',
    icon: payload.icon || '/images/icon-192x192.png',
    badge: payload.badge || '/images/badge-72x72.png',
    data: payload.data || {},
    tag: payload.tag || 'default',
    renotify: true,
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Managinga Space', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  if (action === 'dismiss') {
    return;
  }
  
  let url = '/dashboard';
  
  if (action === 'view' && data.url) {
    url = data.url;
  } else if (action === 'complete' && data.activityId) {
    url = `/activities/${data.activityId}`;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If no window/tab is already open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Message event for communication with main thread
self.addEventListener('message', event => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Sync activities function
async function syncActivities() {
  try {
    console.log('Syncing activities...');
    
    // Get pending activities from IndexedDB
    const db = await openDB();
    const transaction = db.transaction(['pendingActivities'], 'readonly');
    const store = transaction.objectStore('pendingActivities');
    const pendingActivities = await store.getAll();
    
    for (const activity of pendingActivities) {
      try {
        // Try to sync each activity
        const response = await fetch('/api/activities', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(activity.data)
        });
        
        if (response.ok) {
          // Remove from pending if successful
          const deleteTransaction = db.transaction(['pendingActivities'], 'readwrite');
          const deleteStore = deleteTransaction.objectStore('pendingActivities');
          await deleteStore.delete(activity.id);
          
          console.log('Activity synced successfully:', activity.id);
        }
      } catch (error) {
        console.error('Failed to sync activity:', activity.id, error);
      }
    }
    
    console.log('Activity sync completed');
  } catch (error) {
    console.error('Activity sync failed:', error);
  }
}

// IndexedDB helper
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ManagingaSpaceDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingActivities')) {
        const store = db.createObjectStore('pendingActivities', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'activity-sync') {
    event.waitUntil(syncActivities());
  }
});

// Update cache strategy
const updateCache = async (request, response) => {
  const cache = await caches.open(CACHE_NAME);
  return cache.put(request, response.clone());
};

// Network first strategy for API calls
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      updateCache(request, response);
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
};

// Cache first strategy for static assets
const cacheFirst = async (request) => {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      updateCache(request, response);
    }
    return response;
  } catch (error) {
    throw error;
  }
};

console.log('Service Worker script loaded');
