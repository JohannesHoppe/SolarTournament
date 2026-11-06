// The service worker of the notification when a public tournament opens (see src/net/push.ts):
// shows what a push carries (its title and text in the Host's language, see src/net/pushtext.ts)
// and opens the tournaments' list when it is clicked. It does nothing else: no cache, no fetch.

self.addEventListener('push', (event) => {
  let text = { title: 'SolarTournament', body: '', url: '/#tournaments' };
  try {
    text = { ...text, ...event.data.json() };
  } catch {
    // a push without a readable text still shows the game's name
  }
  event.waitUntil(self.registration.showNotification(text.title, { body: text.body, icon: '/icon-180.png', tag: 'tournament-open', data: { url: text.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
  // only a page of the game itself
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
