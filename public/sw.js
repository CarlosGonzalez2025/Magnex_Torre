// Service Worker for Torre de Control PWA
const CACHE_NAME = 'torre-control-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                console.log('[SW] Service worker installed');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - network first, then cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip API requests (always fetch from network)
    if (event.request.url.includes('/api/') ||
        event.request.url.includes('supabase') ||
        event.request.url.includes('coltrack') ||
        event.request.url.includes('flotasnet')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone the response
                const responseClone = response.clone();

                // Cache successful responses
                if (response.status === 200) {
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                }

                return response;
            })
            .catch(() => {
                // If network fails, try cache
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }

                        // If no cache, return offline page for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }

                        return new Response('Sin conexión', {
                            status: 503,
                            statusText: 'Service Unavailable',
                        });
                    });
            })
    );
});

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'Torre de Control',
        body: 'Nueva notificación',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            vibrate: [200, 100, 200],
            tag: data.tag || 'default',
            data: data.data,
            actions: data.actions || [],
            requireInteraction: true,
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.notification.tag);

    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Focus existing window if available
                for (const client of clientList) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }

                // Otherwise open new window
                if (clients.openWindow) {
                    const url = event.notification.data?.url || '/';
                    return clients.openWindow(url);
                }
            })
    );
});

// Background sync event (for offline actions)
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-alerts') {
        event.waitUntil(syncAlerts());
    }
});

// Sync pending alerts when back online
async function syncAlerts() {
    try {
        // Get pending items from IndexedDB
        // Send to server
        console.log('[SW] Syncing pending alerts...');
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

// Periodic background sync (for regular updates)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-alerts') {
        event.waitUntil(checkForNewAlerts());
    }
});

async function checkForNewAlerts() {
    try {
        // Check for new critical alerts
        console.log('[SW] Checking for new alerts...');
    } catch (error) {
        console.error('[SW] Alert check failed:', error);
    }
}
