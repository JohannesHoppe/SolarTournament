// The service worker of the notification when a public tournament opens (see src/net/push.ts):
// shows what a push carries (its title and text in the Host's language and its buttons, see
// src/net/pushtext.ts) and opens the tournaments' list when it is clicked; a button pauses the
// subscription at /push for an hour or until tomorrow morning. It does nothing else: no cache.

self.addEventListener('push', (event) => {
  let text = { title: 'SolarTournament', body: '', url: '/#tournaments', actions: [] };
  try {
    text = { ...text, ...event.data.json() };
  } catch {
    // a push without a readable text still shows the game's name
  }
  event.waitUntil(self.registration.showNotification(text.title, { body: text.body, icon: '/icon-180.png', tag: 'tournament-open', data: { url: text.url }, actions: text.actions }));
});

// when a pause ends (s since 1970), as snoozeUntil in src/net/pushtext.ts reckons it: an hour, or 8 o'clock on the device's clock
function snoozeUntil(pause, nowMs) {
  if (pause === 'hour') return Math.floor(nowMs / 1000) + 3600;
  const morning = new Date(nowMs);
  morning.setHours(8, 0, 0, 0);
  if (morning.getTime() <= nowMs) morning.setDate(morning.getDate() + 1);
  return Math.floor(morning.getTime() / 1000);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'hour' || event.action === 'morning') {
    const until = snoozeUntil(event.action, Date.now());
    event.waitUntil(
      self.registration.pushManager.getSubscription().then((subscription) =>
        subscription ? fetch('/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snooze: subscription.endpoint, until }) }) : undefined,
      ),
    );
    return;
  }
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
  // only a page of the game itself
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
