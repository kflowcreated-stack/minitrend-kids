const CACHE_NAME = "minitrend-app-shell-v8";
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

// ==================== NATIVE PUSH NOTIFICATION (WORKS EVEN WHEN SCREEN OFF) ====================
self.addEventListener("push", function(event) {
  var payload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (e) {
    payload = {
      notification: {
        title: "MiniTrend Kids 🎁",
        body: event.data ? event.data.text() : ""
      }
    };
  }

  var d = payload.data || {};
  var n = payload.notification || {};
  var title = d.title || n.title || "MiniTrend Kids 🎁";
  var body = d.body || n.body || "";
  var targetUrl = d.url || (payload.fcmOptions && payload.fcmOptions.link) || (self.location.origin + "/");
  var tagId = d.tag || d.notiId || n.tag || ("mt-" + Date.now());

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: d.icon || n.icon || (self.location.origin + "/icon.png?v=3"),
      badge: d.badge || n.badge || (self.location.origin + "/badge.png?v=1"),
      tag: tagId,
      renotify: true,
      requireInteraction: false,
      vibrate: [300, 100, 300],
      data: { url: targetUrl }
    })
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  var targetUrl = (event.notification && event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : (self.location.origin + "/");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
