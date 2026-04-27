// ============================================================
//  PUBG KEYS — Service Worker
//  Stratégie : Cache First → réseau en fallback
//  Toutes les images sont embarquées dans index.html (base64)
//  donc l'app fonctionne 100% offline après la première visite.
// ============================================================

const CACHE_NAME = 'pubg-keys-v1';

// Ressources à précacher lors de l'installation
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// ── Installation : précache des assets essentiels ──────────
self.addEventListener('install', event => {
  console.log('[PUBG KEYS SW] Installation…');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[PUBG KEYS SW] Précache des ressources');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // Forcer l'activation immédiate sans attendre la fermeture des onglets
      return self.skipWaiting();
    })
  );
});

// ── Activation : nettoyage des anciens caches ──────────────
self.addEventListener('activate', event => {
  console.log('[PUBG KEYS SW] Activation…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[PUBG KEYS SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Prendre le contrôle de tous les clients immédiatement
      return self.clients.claim();
    })
  );
});

// ── Fetch : Cache First avec fallback réseau ───────────────
self.addEventListener('fetch', event => {
  // On ne gère que les requêtes GET
  if (event.request.method !== 'GET') return;

  // Ignorer les requêtes non-http (ex: chrome-extension://)
  if (!event.request.url.startsWith('http')) return;

  // Ignorer les fonts Google (elles ont leur propre cache)
  if (event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME + '-fonts').then(cache => {
        return cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Ressource trouvée en cache → on la retourne directement
        return cached;
      }

      // Pas en cache → on tente le réseau
      return fetch(event.request).then(response => {
        // On ne cache que les réponses valides
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });

        return response;
      }).catch(() => {
        // Réseau indisponible + pas en cache
        // Pour les navigations HTML, retourner index.html (shell app)
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        // Pour les autres ressources, retourner une réponse vide
        return new Response('', {
          status: 503,
          statusText: 'Service Unavailable — mode hors ligne'
        });
      });
    })
  );
});

// ── Message : forcer la mise à jour ───────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
