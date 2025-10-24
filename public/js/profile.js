// ================= PROFILE NOTIFICATION CONTROLLER (ADD-ONLY) =================
(function () {
  const notifToggle = document.getElementById('notifToggle');
  const pauseUntilInput = document.getElementById('pauseUntilInput');
  const applyPauseBtn = document.getElementById('applyPauseBtn');
  const clearPauseBtn = document.getElementById('clearPauseBtn');
  const askBrowserPermBtn = document.getElementById('askBrowserPermBtn');
  const nextStatus = document.getElementById('nextStatus');

  function updatePauseUIState() {
    const on = notifToggle.checked;
    pauseUntilInput.disabled = !on;
    applyPauseBtn.disabled = !on;
    clearPauseBtn.disabled = !on;

    const paused = pauseUntilInput.value;
    if (!on) {
      nextStatus.textContent = 'Notifications are disabled.';
    } else if (paused) {
      nextStatus.textContent = `Paused until ${new Date(paused).toLocaleString()}.`;
    } else {
      nextStatus.textContent = 'Notifications are enabled with no pause.';
    }
  }

  async function initNotificationUI() {
    try {
      const prefs = await model.notifications.load();
      notifToggle.checked = !!prefs.enabled;

      pauseUntilInput.value = prefs.pausedUntil
        ? new Date(prefs.pausedUntil.getTime() - (new Date().getTimezoneOffset() * 60000))
            .toISOString()
            .slice(0, 16)
        : '';

      updatePauseUIState();
    } catch (e) {
      console.error('[profile] load prefs failed', e);
    }
  }

  notifToggle.addEventListener('change', async () => {
    try {
      const enabled = notifToggle.checked;
      const pausedUntil = pauseUntilInput.value || null;
      await model.notifications.save({ enabled, pausedUntil });
      updatePauseUIState();
    } catch (e) {
      console.error('[profile] toggle failed', e);
      notifToggle.checked = !notifToggle.checked; // revert
      updatePauseUIState();
    }
  });

  applyPauseBtn.addEventListener('click', async () => {
    try {
      const enabled = notifToggle.checked;
      const pausedUntil = pauseUntilInput.value || null;
      await model.notifications.save({ enabled, pausedUntil });
      updatePauseUIState();
    } catch (e) {
      console.error('[profile] pause failed', e);
    }
  });

  clearPauseBtn.addEventListener('click', async () => {
    try {
      const enabled = notifToggle.checked;
      await model.notifications.save({ enabled, pausedUntil: null });
      pauseUntilInput.value = '';
      updatePauseUIState();
    } catch (e) {
      console.error('[profile] clear pause failed', e);
    }
  });

  askBrowserPermBtn.addEventListener('click', async () => {
    try {
      if (!('Notification' in window)) {
        alert('Browser notifications not supported.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Permission not granted.');
      } else if (model.notifications.allowedNow()) {
        // quick test notification if not paused/disabled
        new Notification('Notifications enabled', { body: 'Thanks for enabling notifications!' });
      }
    } catch (e) {
      console.error('[profile] browser perm failed', e);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationUI);
  } else {
    initNotificationUI();
  }
})();
// =============== END PROFILE NOTIFICATION CONTROLLER (ADD-ONLY) ===============
