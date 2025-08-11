/**
 * Picasso Chat Widget Service Worker
 * Phase 3.3: Mobile Safari Compatibility & PWA Support
 * 
 * Provides offline conversation caching using Phase 3.2 conversation manager
 */

const CACHE_NAME = 'picasso-chat-v1';
const STATIC_CACHE_NAME = 'picasso-static-v1';
const DYNAMIC_CACHE_NAME = 'picasso-dynamic-v1';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/widget-frame.html',
  '/manifest.json',
  '/favicon.ico'
];

// API endpoints to cache responses
const API_CACHE_PATTERNS = [
  /\/Master_Function\?action=get_config/,
  /\/Master_Function\?action=health_check/
];

self.addEventListener('install', (event) => {
  console.log('🔧 Picasso Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('❌ Failed to cache static assets:', error);
      })
  );
  
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('⚡ Picasso Service Worker: Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME &&
                cacheName !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Take control of all clients immediately
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle different types of requests
  if (request.method !== 'GET') {
    // For non-GET requests (POST chat messages), try network first
    event.respondWith(handleNonGetRequest(request));
    return;
  }
  
  // Static assets - cache first
  if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset))) {
    event.respondWith(handleStaticRequest(request));
    return;
  }
  
  // API requests - network first with fallback
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.href))) {
    event.respondWith(handleAPIRequest(request));
    return;
  }
  
  // Everything else - network first
  event.respondWith(handleDynamicRequest(request));
});

/**
 * Handle static asset requests (cache first strategy)
 */
async function handleStaticRequest(request) {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('❌ Static request failed:', error);
    return new Response('Static asset unavailable', { status: 503 });
  }
}

/**
 * Handle API requests (network first with cache fallback)
 */
async function handleAPIRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    throw new Error(`Network response not ok: ${networkResponse.status}`);
    
  } catch (error) {
    console.log('🔄 Network failed, trying cache for:', request.url);
    
    // Try cache fallback
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('📦 Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // If it's a config request, return a minimal fallback
    if (request.url.includes('get_config')) {
      return new Response(JSON.stringify({
        tenant_hash: 'offline',
        subscription_tier: 'Basic',
        chat_title: 'Chat Assistant (Offline)',
        welcome_message: 'You are currently offline. Your conversation will be saved and sent when connection is restored.',
        branding: {
          primary_color: '#3b82f6',
          background_color: '#ffffff'
        },
        features: {
          offline_mode: true
        }
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    return new Response('Service unavailable', { status: 503 });
  }
}

/**
 * Handle non-GET requests (POST chat messages)
 */
async function handleNonGetRequest(request) {
  try {
    // Try network first
    return await fetch(request);
  } catch (error) {
    // If offline, store the request for later sync
    if (request.url.includes('chat') && request.method === 'POST') {
      await storeOfflineMessage(request);
      
      // Return a success response with offline indicator
      return new Response(JSON.stringify({
        content: 'Your message has been saved and will be sent when connection is restored.',
        session_id: 'offline_' + Date.now(),
        offline: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    return new Response('Request failed - offline', { status: 503 });
  }
}

/**
 * Handle dynamic requests (network first)
 */
async function handleDynamicRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Try cache fallback
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response('Content unavailable offline', { status: 503 });
  }
}

/**
 * Store offline messages for later sync
 * Integrates with Phase 3.2 conversation manager
 */
async function storeOfflineMessage(request) {
  try {
    const requestData = await request.clone().json();
    
    const offlineMessage = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: requestData,
      timestamp: Date.now(),
      id: 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };
    
    // Store in IndexedDB for persistence
    const db = await openDB();
    const transaction = db.transaction(['offline_messages'], 'readwrite');
    const store = transaction.objectStore('offline_messages');
    await store.add(offlineMessage);
    
    console.log('💾 Stored offline message:', offlineMessage.id);
  } catch (error) {
    console.error('❌ Failed to store offline message:', error);
  }
}

/**
 * Open IndexedDB for offline message storage
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('picasso_offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('offline_messages')) {
        const store = db.createObjectStore('offline_messages', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
  });
}

/**
 * Sync offline messages when back online
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-messages') {
    console.log('🔄 Syncing offline messages...');
    event.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['offline_messages'], 'readwrite');
    const store = transaction.objectStore('offline_messages');
    const messages = await store.getAll();
    
    for (const message of messages) {
      try {
        const response = await fetch(message.url, {
          method: message.method,
          headers: message.headers,
          body: JSON.stringify(message.body)
        });
        
        if (response.ok) {
          await store.delete(message.id);
          console.log('✅ Synced offline message:', message.id);
        }
      } catch (error) {
        console.error('❌ Failed to sync message:', message.id, error);
      }
    }
  } catch (error) {
    console.error('❌ Failed to sync offline messages:', error);
  }
}

/**
 * Handle background sync when connection is restored
 */
self.addEventListener('online', () => {
  console.log('🌐 Back online - triggering sync');
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then(registration => {
      return registration.sync.register('offline-messages');
    });
  }
});

console.log('🚀 Picasso Service Worker: Loaded successfully');