const CACHE_NAME = "momentum-static-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = payload.title || "Momentum";
  const body = payload.body || "Time to check your progress.";
  const url = payload.url || self.registration.scope;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag || "momentum-reminder",
      renotify: true,
      data: { url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(url));
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

function readPushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}
