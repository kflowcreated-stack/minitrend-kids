self.addEventListener('push', (event) => {
  if (!event.data) return;
  event.stopImmediatePropagation();

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { notification: { title: 'MiniTrend Kids 🎁', body: event.data.text() } };
  }

  const noti = payload.notification || {};
  const data = payload.data || {};
  const title = noti.title || data.title || 'MiniTrend Kids 🎁';
  const body = noti.body || data.body || '';
  const icon = noti.icon || data.icon || './icon.png?v=3';
  const badge = noti.badge || data.badge || './badge.png?v=1';
  const linkUrl = data.url || (payload.fcmOptions && payload.fcmOptions.link) || './?role=customer';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      badge: badge,
      tag: 'mt-fcm-' + Date.now(),
      renotify: true,
      silent: false,
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      data: { url: linkUrl }
    })
  );
});

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDyb--Qc9tic7g8GOzVWYi8vpLMSfTaI5U",
  authDomain: "minitrend-kids.firebaseapp.com",
  projectId: "minitrend-kids",
  storageBucket: "minitrend-kids.firebasestorage.app",
  messagingSenderId: "523213115439",
  appId: "1:523213115439:web:0e97b742e7d067943f36da"
});

try {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(() => {});
} catch (e) {}

const CACHE_NAME = 'minitrend-kids-v15';
const STATE_CACHE = 'minitrend-noti-state-v1';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzjiat7rNkOGkQYjf3RT6rC4g5AdXiVtraecqUTG8wXcu4l6Dm1mmtnXpVhaxjAzsrd/exec';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json?v=4',
  './icon.png?v=3',
  './badge.png?v=1',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== STATE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

async function displaySystemNotification(title, body, tag) {
  try {
    await self.registration.showNotification(title || 'MiniTrend Kids 🧸', {
      body: body || '',
      icon: './icon.png?v=3',
      badge: './badge.png?v=1',
      tag: tag || ('mt-noti-' + Date.now()),
      renotify: true,
      silent: false,
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      data: { url: './?role=customer' }
    });
  } catch (e) {}
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './?role=customer';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'minitrend-noti-sync') {
    event.waitUntil(checkRemoteBroadcastInSW());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'minitrend-noti-sync') {
    event.waitUntil(checkRemoteBroadcastInSW());
  }
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_SYSTEM_NOTI') {
    const { title, body, tag, delayMs } = event.data;
    if (delayMs && delayMs > 0) {
      event.waitUntil(
        new Promise((resolve) => {
          setTimeout(async () => {
            await displaySystemNotification(title, body, tag);
            resolve();
          }, delayMs);
        })
      );
    } else {
      event.waitUntil(displaySystemNotification(title, body, tag));
    }
  }

  if (event.data.type === 'CHECK_REMOTE_NOTI') {
    event.waitUntil(checkRemoteBroadcastInSW());
  }
});

async function checkRemoteBroadcastInSW() {
  try {
    const res = await fetch(APPS_SCRIPT_URL + '?action=checkOrders&ids=&t=' + Date.now());
    const data = await res.json();
    if (!data || !data.latestNoti || !data.latestNoti.id) return;

    const stateCache = await caches.open(STATE_CACHE);
    const prevRes = await stateCache.match('last-noti-id');
    const prevId = prevRes ? await prevRes.text() : '';

    if (prevId !== data.latestNoti.id) {
      await stateCache.put('last-noti-id', new Response(data.latestNoti.id));
      await displaySystemNotification(
        data.latestNoti.title || 'MiniTrend Kids 🎁',
        data.latestNoti.message,
        data.latestNoti.id
      );
    }
  } catch (e) {}
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (
    req.method !== 'GET' ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('docs.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(async () => {
          if (settled) return;
          const cached =
            (await caches.match('./index.html', { ignoreSearch: true })) ||
            (await caches.match('./', { ignoreSearch: true }));
          if (cached) {
            settled = true;
            resolve(cached);
          }
        }, 1500);

        fetch(req)
          .then((networkRes) => {
            clearTimeout(timer);
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
            }
            if (!settled) {
              settled = true;
              resolve(networkRes);
            }
          })
          .catch(async () => {
            clearTimeout(timer);
            if (!settled) {
              settled = true;
              const cached =
                (await caches.match('./index.html', { ignoreSearch: true })) ||
                (await caches.match('./', { ignoreSearch: true }));
              resolve(cached || Response.error());
            }
          });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cachedRes) => {
      const networkFetch = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => cachedRes);

      return cachedRes || networkFetch;
    })
  );
});
