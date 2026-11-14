/* Sangeet Diary's service worker: the app opens offline and at once.
 * - The page: from the network when it answers within 3 s (so a new build shows the next time you open it), else the
 *   copy kept from the last visit.
 * - The manifest, icons, the grand piano's notes (piano.json) and the pieces from the books (book.js): kept with
 *   this build's version.
 * - Google Fonts (the stylesheet and the font files): the kept copy at once, refreshed behind it, so the fonts are
 *   there offline too.
 * Nothing else is touched: the helper's /api, audio, uploads and other sites go straight to the network. */
const VERSION = '356d7d19a1';
const SHELL = 'shell-' + VERSION, FONTS = 'fonts-v1';
const FILES = ['sangeet-diary.html', 'piano.json', 'book.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// the network's answer is kept whenever it comes, even after 3 s, so the next open has it
const fresh = (req, ms) => {
  const net = fetch(req, { cache: 'no-store' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put('sangeet-diary.html', copy)); }
    return r.ok ? r : Promise.reject(new Error(r.status));
  });
  return Promise.race([net, new Promise((ok, no) => setTimeout(() => no(new Error('slow')), ms))]);
};

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (req.mode === 'navigate' || /\/(index|sangeet-diary)\.html$|\/$/.test(url.pathname)) {
      e.respondWith(fresh(req, 3000).catch(() => caches.match('sangeet-diary.html', { cacheName: SHELL }).then(r => r || caches.match('sangeet-diary.html')).then(r => r || fetch(req))));
      return;
    }
    if (FILES.some(f => url.pathname.endsWith('/' + f))) e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const kept = await c.match(req);
      const got = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => kept);
      return kept || got;
    }));
  }
});
