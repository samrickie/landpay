const cacheName = 'landpay-shell-v1';
const shell = ['./','./index.html','./style.css','./app.mjs','./model.mjs','./storage.mjs','./pdf.mjs','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell))));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('landpay-shell-') && key !== cacheName).map(key => caches.delete(key))))
])));
const urls = new Set(shell.map(path => new URL(path,self.registration.scope).href));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && urls.has(new URL(event.request.url).origin + new URL(event.request.url).pathname)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match('./index.html')).then(response => response || fetch(event.request)));
  } else if (urls.has(event.request.url)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(event.request)).then(response => response || fetch(event.request)));
  }
});

