// Pass-through Service Worker zur Aktivierung der PWA-Installation
// Ohne riskantes Caching, um veraltete Assets oder Update-Probleme zu vermeiden.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Leitet Anfragen normal an das Netzwerk weiter, erfüllt aber die PWA-Kriterien.
  event.respondWith(fetch(event.request));
});
