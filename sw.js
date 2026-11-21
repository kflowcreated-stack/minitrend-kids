const NOTI_STATE_CACHE = 'minitrend-noti-state-v1';
const APPS_SCRIPT_ORDER_URL = 'https://script.google.com/macros/s/AKfycbzjiat7rNkOGkQYjf3RT6rC4g5AdXiVtraecqUTG8wXcu4l6Dm1mmtnXpVhaxjAzsrd/exec';
const ICON_URL = 'https://kflowcreated-stack.github.io/minitrend-kids/icon.png?v=3';
const BADGE_URL = 'https://kflowcreated-stack.github.io/minitrend-kids/badge.png?v=1';
const DEFAULT_URL = 'https://kflowcreated-stack.github.io/minitrend-kids/?role=customer';

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== NOTI_STATE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Firebase Push ဝင်လာသည့်အခါ ၁ ကြိမ်တည်းသာ ပြသပေးမည့် စနစ်
self.addEventListener('push', function(event) {
  event.waitUntil((async function() {
    let payload = {};
    try {
      if (event.data) {
        payload = event.data.json();
      }
    } catch (e) {
      try {
        payload = { data: { body: event.data.text() } };
      } catch (err) {}
    }

    const d = payload.data || {};
    const n = payload.notification || {};
    const title = d.title || n.title || 'MiniTrend Kids 🎁';
    const body = d.body || n.body || '';
    const url = d.url || (payload.fcmOptions && payload.fcmOptions.link) || DEFAULT_URL;
    const tag = d.tag || d.notiId || ('mt-' + title + '-' + body).substring(0, 64);

    let isDuplicate = false;
    try {
      const cache = await caches.open(NOTI_STATE_CACHE);
      const seenKey = 'seen-' + encodeURIComponent(tag);
      const prevResp = await cache.match(seenKey);
      if (prevResp) {
        const prevTime = parseInt(await prevResp.text(), 10) || 0;
        if (Date.now() - prevTime < 60000) {
          isDuplicate = true;
        }
      }
      await cache.put(seenKey, new Response(String(Date.now())));
      if (d.notiId) {
        await cache.put('last-noti-id', new Response(String(d.notiId)));
      }
    } catch (e) {}

    const options = {
      body: body,
      icon: d.icon || ICON_URL,
      badge: d.badge || BADGE_URL,
      tag: tag,
      renotify: false,
      silent: isDuplicate,
      requireInteraction: !isDuplicate,
      data: { url: url }
    };
    if (!isDuplicate) {
      options.vibrate = [300, 150, 300];
    }

    await self.registration.showNotification(title, options);
  })());
});

async function checkRemoteBroadcast() {
  try {
    const res = await fetch(APPS_SCRIPT_ORDER_URL + '?action=checkOrders&t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (!data || data.status !== 'ok' || !data.latestNoti || !data.latestNoti.id || !data.latestNoti.message) {
      return;
    }

    const noti = data.latestNoti;
    const cache = await caches.open(NOTI_STATE_CACHE);
    const lastResp = await cache.match('last-noti-id');
    const lastId = lastResp ? (await lastResp.text()).trim() : '';

    if (lastId === String(noti.id)) {
      return;
    }

    await cache.put('last-noti-id', new Response(String(noti.id)));
    await cache.put('seen-' + encodeURIComponent(noti.id), new Response(String(Date.now())));

    await self.registration.showNotification(noti.title || 'MiniTrend Kids 🎁', {
      body: noti.message,
      icon: ICON_URL,
      badge: BADGE_URL,
      tag: String(noti.id),
      renotify: false,
      vibrate: [300, 150, 300],
      data: { url: DEFAULT_URL }
    });
  } catch (e) {}
}

self.addEventListener('message', function(event) {
  const msg = event.data || {};
  if (msg.type === 'SHOW_SYSTEM_NOTI') {
    const delay = Number(msg.delayMs || 0);
    const showFn = function() {
      return self.registration.showNotification(msg.title || 'MiniTrend Kids 🧸', {
        body: msg.body || '',
        icon: ICON_URL,
        badge: BADGE_URL,
        tag: msg.tag || ('mt-' + Date.now()),
        renotify: false,
        vibrate: [250, 120, 250],
        data: { url: msg.url || DEFAULT_URL }
      });
    };
    event.waitUntil(
      delay > 0
        ? new Promise(function(resolve) { setTimeout(function() { showFn().then(resolve); }, delay); })
        : showFn()
    );
  } else if (msg.type === 'CHECK_REMOTE_NOTI') {
    event.waitUntil(checkRemoteBroadcast());
  }
});

self.addEventListener('sync', function(event) {
  if (event.tag === 'minitrend-noti-sync') {
    event.waitUntil(checkRemoteBroadcast());
  }
});

self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'minitrend-noti-sync') {
    event.waitUntil(checkRemoteBroadcast());
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || DEFAULT_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
