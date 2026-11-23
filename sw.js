const CACHE_NAME = "minitrend-app-shell-v7";
const CORE_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png?v=3",
  "./badge.png?v=1",
  "./shop/",
  "./delivery/"
];

// Always bypass cache for Admin Panel, Cloudflare Proxy & live API calls
function isBypassUrl(urlStr) {
  return (
    urlStr.indexOf("role=admin") !== -1 ||
    urlStr.indexOf("/api/") !== -1 ||
    urlStr.indexOf("script.google.com") !== -1 ||
    urlStr.indexOf("script.googleusercontent.com") !== -1 ||
    urlStr.indexOf("fcm.googleapis.com") !== -1 ||
    urlStr.indexOf("firebaseinstallations.googleapis.com") !== -1 ||
    urlStr.indexOf("googleapis.com/google.firestore") !== -1
  );
}

// Cacheable external CDN & product image hosts for instant open
function isCacheableExternal(urlObj) {
  const host = urlObj.hostname;
  return (
    host === "cdn.tailwindcss.com" ||
    host === "www.gstatic.com" ||
    host === "lh3.googleusercontent.com" ||
    host.endsWith(".googleusercontent.com")
  );
}

self.addEventListener("install", function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        CORE_SHELL_ASSETS.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Stale-While-Revalidate for Customer/Shop/Delivery instant launch (Admin always live)
self.addEventListener("fetch", function(event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const urlStr = req.url;
  if (!urlStr.startsWith("http") || isBypassUrl(urlStr)) return;

  const urlObj = new URL(urlStr);
  const isSameOrigin = urlObj.origin === self.location.origin;
  if (!isSameOrigin && !isCacheableExternal(urlObj)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req, { ignoreSearch: isSameOrigin && urlObj.pathname.endsWith("/") }).then(function(cachedRes) {
        const networkPromise = fetch(req).then(function(netRes) {
          if (netRes && (netRes.status === 200 || netRes.type === "opaque")) {
            cache.put(req, netRes.clone()).catch(function() {});
          }
          return netRes;
        }).catch(function() {
          return cachedRes;
        });

        return cachedRes || networkPromise;
      });
    })
  );
});

// ==================== FIREBASE CLOUD MESSAGING ====================
try {
  importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

  if (!firebase.apps.length) {
    firebase.initializeApp({
      apiKey: "AIzaSyDyb--Qc9tic7g8GOzVWYi8vpLMSfTaI5U",
      authDomain: "minitrend-kids.firebaseapp.com",
      projectId: "minitrend-kids",
      storageBucket: "minitrend-kids.firebasestorage.app",
      messagingSenderId: "523213115439",
      appId: "1:523213115439:web:0e97b742e7d067943f36da"
    });
  }

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function(payload) {
    const d = payload.data || {};
    const n = payload.notification || {};
    const title = d.title || n.title || "MiniTrend Kids 🎁";
    const body = d.body || n.body || "";
    const targetUrl = d.url || (self.location.origin + "/");

    return self.registration.showNotification(title, {
      body: body,
      icon: d.icon || (self.location.origin + "/icon.png?v=3"),
      badge: d.badge || (self.location.origin + "/badge.png?v=1"),
      tag: d.tag || d.notiId || ("mt-" + Date.now()),
      vibrate: [200, 100, 200],
      data: { url: targetUrl }
    });
  });
} catch (err) {}

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : (self.location.origin + "/");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
