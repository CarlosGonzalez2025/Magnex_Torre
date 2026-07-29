// Service Worker for Torre de Control PWA
// Subir este número en cada despliegue que cambie los estáticos: el evento
// `activate` borra las cachés cuyo nombre no coincida, y así los usuarios
// reciben la versión nueva sin tener que forzar una recarga con Ctrl+F5.
// v2 = migración de Tailwind desde el CDN externo al CSS compilado.
// v3 = pantalla offline real y caché permanente para los archivos con hash.
const CACHE_NAME = 'torre-control-v3';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
// OFFLINE_URL debe estar aquí: es la pantalla que se muestra cuando no hay red
// ni copia en caché, así que tiene que haberse guardado de antemano.
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    OFFLINE_URL,
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

// Guarda en caché sin dejar que un fallo rompa la respuesta al usuario.
// cache.put lanza excepción con esquemas no soportados (chrome-extension://,
// data:...) y cuando se agota la cuota de almacenamiento.
function guardarEnCache(request, response) {
    if (!response || response.status !== 200 || response.type === 'opaque') {
        return;
    }
    const copia = response.clone();
    caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, copia))
        .catch(() => { /* almacenamiento lleno o no cacheable: se ignora */ });
}

// Respuesta de último recurso cuando no hay red ni copia guardada.
function respuestaSinConexion(request) {
    if (request.mode === 'navigate') {
        return caches.match(OFFLINE_URL)
            .then((offline) => offline || new Response(
                '<h1>Sin conexión</h1>',
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            ));
    }
    return new Response('Sin conexión', {
        status: 503,
        statusText: 'Service Unavailable',
    });
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Solo http/https: peticiones de extensiones del navegador reventaban
    // cache.put y ensuciaban la consola con errores.
    if (!request.url.startsWith('http')) {
        return;
    }

    // Skip API requests (always fetch from network)
    if (request.url.includes('/api/') ||
        request.url.includes('supabase') ||
        request.url.includes('coltrack') ||
        request.url.includes('flotasnet')) {
        return;
    }

    const url = new URL(request.url);

    // Los archivos de /assets/ llevan un hash de contenido en el nombre, así
    // que nunca cambian: si cambia el contenido, cambia el nombre. Servirlos
    // desde la caché evita una petición de red por archivo en cada visita.
    // El resto sigue con la estrategia original de red primero, para que los
    // despliegues nuevos se recojan de inmediato.
    const esArchivoConHash = url.origin === self.location.origin
        && url.pathname.startsWith('/assets/');

    if (esArchivoConHash) {
        event.respondWith(
            caches.match(request).then((enCache) => {
                if (enCache) {
                    return enCache;
                }
                return fetch(request)
                    .then((response) => {
                        guardarEnCache(request, response);
                        return response;
                    })
                    .catch(() => respuestaSinConexion(request));
            })
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                guardarEnCache(request, response);
                return response;
            })
            .catch(() => {
                // If network fails, try cache
                return caches.match(request)
                    .then((cachedResponse) => cachedResponse || respuestaSinConexion(request));
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
