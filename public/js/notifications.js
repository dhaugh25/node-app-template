// public/js/notifications.js
export async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support desktop notifications.");
    return false;
  }
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  return permission === "granted";
}

export async function notify({ title, body, icon, tag, useServiceWorker = true }) {
  const granted = await enableNotifications();
  if (!granted) return;

  const options = {
    body,
    icon: icon || "/images/sparky.png", // uses your existing icon path
    tag,                                // prevents duplicates if you reuse the same tag
  };

  try {
    // Prefer Service Worker so notifications work even when the page is backgrounded
    if (useServiceWorker && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    // Fallback to page-level notification
    new Notification(title, options);
  } catch (err) {
    console.error("Notification error:", err);
  }
}
