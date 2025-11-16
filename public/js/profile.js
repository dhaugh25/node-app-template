// ================= PROFILE NOTIFICATION CONTROLLER (ADD-ONLY) =================
(function () {
  const toggleBtn = document.getElementById('notifToggleBtn');
  const toggleStateLabel = document.getElementById('notifToggleState');
  const pauseUntilInput = document.getElementById('pauseUntilInput');
  const applyPauseBtn = document.getElementById('applyPauseBtn');
  const clearPauseBtn = document.getElementById('clearPauseBtn');
  const askBrowserPermBtn = document.getElementById('askBrowserPermBtn');
  const nextStatus = document.getElementById('nextStatus');

  if (!toggleBtn) {
    console.error('Profile: notif toggle button not found (id="notifToggleBtn").');
    return;
  }

  // safe wrapper for model.notifications API (if present)
  const modelApi = (typeof model !== 'undefined' && model.notifications && typeof model.notifications.load === 'function' && typeof model.notifications.save === 'function')
    ? model.notifications
    : null;

  // local fallback keys
  const STORAGE_KEY = 'courseconnect_notifications_prefs_v1';

  async function loadPrefs() {
    if (modelApi) {
      try {
        const prefs = await modelApi.load();
        // Expect prefs.enabled boolean and prefs.pausedUntil (Date|null) or ISO string
        return {
          enabled: !!prefs.enabled,
          pausedUntil: prefs.pausedUntil ? (prefs.pausedUntil instanceof Date ? prefs.pausedUntil.toISOString() : String(prefs.pausedUntil)) : null
        };
      } catch (e) {
        console.warn('profile: model.notifications.load() failed, falling back to localStorage', e);
      }
    }

    // fallback: read localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { enabled: false, pausedUntil: null };
      const parsed = JSON.parse(raw);
      return { enabled: !!parsed.enabled, pausedUntil: parsed.pausedUntil || null };
    } catch (e) {
      console.error('profile: failed to parse stored prefs', e);
      return { enabled: false, pausedUntil: null };
    }
  }

  async function savePrefs(prefs) {
    // prefs: { enabled: bool, pausedUntil: ISO|null }
    if (modelApi) {
      try {
        // normalize pausedUntil to null or ISO string (model implementation can adapt)
        await modelApi.save({
          enabled: !!prefs.enabled,
          pausedUntil: prefs.pausedUntil ? prefs.pausedUntil : null
        });
        return true;
      } catch (e) {
        console.warn('profile: model.notifications.save() failed, saving locally', e);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: !!prefs.enabled,
        pausedUntil: prefs.pausedUntil || null
      }));
      return true;
    } catch (e) {
      console.error('profile: failed to save prefs to localStorage', e);
      return false;
    }
  }

  // UI sync
  function setToggleUI(on, pausedUntilIso = null) {
    const enabled = !!on;
    toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    const label = enabled ? 'Notifications enabled' : 'Notifications disabled';
    toggleBtn.textContent = label;
    if (toggleStateLabel) toggleStateLabel.textContent = label;

    // pause controls only relevant when enabled
    if (pauseUntilInput) pauseUntilInput.disabled = !enabled;
    if (applyPauseBtn) applyPauseBtn.disabled = !enabled;
    if (clearPauseBtn) clearPauseBtn.disabled = !enabled;

    // set pause input value (keep as local datetime string if provided)
    if (pauseUntilInput) {
      pauseUntilInput.value = pausedUntilIso ? (pausedUntilIso.slice(0, 16)) : '';
    }

    // small status summary
    if (nextStatus) {
      if (!enabled) nextStatus.textContent = 'Notifications are disabled.';
      else if (pausedUntilIso) {
        const dt = new Date(pausedUntilIso);
        nextStatus.textContent = `Paused until ${isNaN(dt.getTime()) ? pausedUntilIso : dt.toLocaleString()}.`;
      } else nextStatus.textContent = 'Notifications are enabled with no pause.';
    }
  }

  // Request permission (only when enabling) and push a notification to confirm change
  async function pushToggleNotification(on) {
    try {
      if (!('Notification' in window)) {
        console.warn('Browser notifications not supported.');
        return;
      }

      // when enabling, prompt if default
      if (on && Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          console.warn('User did not grant notification permission.');
          return;
        }
      }

      if (Notification.permission !== 'granted') {
        // can't show notifications
        console.info('Notification permission not granted; skipping push.');
        return;
      }

      const title = on ? 'Notifications enabled' : 'Notifications disabled';
      const body = on ? 'You will receive app notifications.' : 'You will not receive app notifications.';

      // Prefer service worker-based notifications if a worker is registered.
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          reg.showNotification(title, { body, icon: '/images/sparky.png', tag: 'prefs-notify' });
          return;
        }
      }

      // otherwise use Notification constructor
      new Notification(title, { body, icon: '/images/sparky.png', tag: 'prefs-notify' });
    } catch (err) {
      console.error('profile: pushToggleNotification failed', err);
    }
  }

  // Handler when toggle button is clicked
  toggleBtn.addEventListener('click', async () => {
    // current state
    const curPressed = toggleBtn.getAttribute('aria-pressed') === 'true';
    const newState = !curPressed;

    // optimistic UI
    setToggleUI(newState, pauseUntilInput ? pauseUntilInput.value || null : null);

    // persist
    try {
      await savePrefs({ enabled: newState, pausedUntil: pauseUntilInput ? (pauseUntilInput.value || null) : null });
    } catch (e) {
      console.error('profile: failed to save prefs', e);
    }

    // try to push notification about the change
    await pushToggleNotification(newState);
  });

  // Pause controls
  if (applyPauseBtn) {
    applyPauseBtn.addEventListener('click', async () => {
      const pausedIso = pauseUntilInput && pauseUntilInput.value ? pauseUntilInput.value : null;
      // read current enabled state from UI
      const enabled = toggleBtn.getAttribute('aria-pressed') === 'true';
      setToggleUI(enabled, pausedIso);

      try {
        await savePrefs({ enabled, pausedUntil: pausedIso });
      } catch (e) {
        console.error('profile: failed to save pause', e);
      }

      // optionally notify user
      if (Notification.permission === 'granted') {
        const msg = pausedIso ? `Paused until ${new Date(pausedIso).toLocaleString()}` : 'Pause applied';
        try { new Notification('Notifications paused', { body: msg }); } catch (ignore) {}
      }
    });
  }

  if (clearPauseBtn) {
    clearPauseBtn.addEventListener('click', async () => {
      const enabled = toggleBtn.getAttribute('aria-pressed') === 'true';
      if (pauseUntilInput) pauseUntilInput.value = '';
      setToggleUI(enabled, null);
      try {
        await savePrefs({ enabled, pausedUntil: null });
      } catch (e) {
        console.error('profile: failed to clear pause', e);
      }
      if (Notification.permission === 'granted') {
        try { new Notification('Pause cleared', { body: 'Notifications resume.' }); } catch (ignore) {}
      }
    });
  }

  if (askBrowserPermBtn) {
    askBrowserPermBtn.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        alert('Browser notifications not supported.');
        return;
      }
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          alert('Permission granted — you can now receive browser notifications.');
        } else {
          alert('Permission not granted.');
        }
      } catch (e) {
        console.error('profile: permission request failed', e);
        alert('Permission request failed — see console.');
      }
    });
  }

  // Initialize: load stored prefs and update UI
  (async function init() {
    const prefs = await loadPrefs();
    setToggleUI(prefs.enabled, prefs.pausedUntil);
    console.info('profile: notification prefs initialized', prefs, modelApi ? '(using modelApi)' : '(using localStorage)');
  })();

})();