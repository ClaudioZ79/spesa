// Service worker: tiene in cache la pagina e le librerie così l'app si apre anche senza rete.
// Non tocca le chiamate ai database e al login (Firestore ha una sua cache offline).
const CACHE = 'spesa-v1';
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'https://cdn.jsdelivr.net/npm/firebase@10.12.5/firebase-app-compat.js', 'https://cdn.jsdelivr.net/npm/firebase@10.12.5/firebase-firestore-compat.js', 'https://cdn.jsdelivr.net/npm/firebase@10.12.5/firebase-auth-compat.js'];
// Librerie e font con indirizzo versionato: una volta salvati non cambiano.
const ESTERNI = ['cdn.jsdelivr.net', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE && n.startsWith('spesa-')).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Pagina: prima la rete (così gli aggiornamenti arrivano subito), ma dopo 4 secondi si usa la copia salvata.
function reteOCache(req) {
  return new Promise((ok) => {
    let finito = false;
    const dallaCache = () => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./'));
    const t = setTimeout(() => dallaCache().then((r) => { if (r && !finito) { finito = true; ok(r); } }), 4000);
    fetch(req).then((r) => {
      clearTimeout(t);
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
      if (!finito) { finito = true; ok(r); }
    }).catch(() => {
      clearTimeout(t);
      dallaCache().then((r) => { if (!finito) { finito = true; ok(r || Response.error()); } });
    });
  });
}

// File statici: dalla copia salvata subito, aggiornata in sottofondo.
function cacheEAggiorna(req) {
  return caches.match(req).then((trovato) => {
    const rete = fetch(req).then((r) => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
      return r;
    }).catch(() => trovato || Response.error());
    return trovato || rete;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(req.mode === 'navigate' ? reteOCache(req) : cacheEAggiorna(req));
  } else if (ESTERNI.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith(cacheEAggiorna(req));
  }
});
