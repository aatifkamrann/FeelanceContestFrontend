/*
 * The portal's service worker. It does one thing: receive push messages and
 * show them. No fetch handler, no caching — pages load the way they always
 * did, and nothing here can serve a stale one.
 *
 * The payload is the JSON the API's Pushes.Payload writes: title, body, the
 * portal-relative path a tap opens, a tag (so repeats about the same event
 * replace each other in the tray) and an optional icon.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Winners Portal';
  const options = {
    body: data.body || '',
    data: { path: data.path || '/' },
  };
  if (data.tag) options.tag = data.tag;
  if (data.icon) options.icon = data.icon;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || '/';
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      for (const client of windows) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(url).then((navigated) => navigated && navigated.focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Where the API is: same-origin, unless the page registered this worker
// with ?api=<origin> because the API has a hostname of its own — then the
// cookie has to be asked for, as it does from a page.
const API = new URL(self.location.href).searchParams.get('api') || '';
const apiFetch = (path, init) => fetch(API + path, Object.assign({ credentials: 'include' }, init));

// The push service rotated the subscription under us: subscribe again with
// the portal's key and tell the API, so this device keeps hearing. Best
// effort — if it fails, the Notifications page shows push as off here and
// one switch turns it back on.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    apiFetch('/api/notifications')
      .then((res) => (res.ok ? res.json() : null))
      .then((prefs) => {
        if (!prefs || !prefs.pushKey) return null;
        return self.registration.pushManager
          .subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(prefs.pushKey) })
          .then((sub) => {
            const json = sub.toJSON();
            return apiFetch('/api/notifications/devices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: sub.endpoint,
                p256dh: json.keys && json.keys.p256dh,
                auth: json.keys && json.keys.auth,
                label: null,
              }),
            });
          });
      })
      .catch(() => undefined),
  );
});

function base64UrlToBytes(text) {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
