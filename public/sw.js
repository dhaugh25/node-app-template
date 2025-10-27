// public/sw.jsthe web
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/dashboard") // route exists in your server
  );
});
