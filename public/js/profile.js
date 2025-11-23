// PROFILE PAGE CONTROLLER: profile info + notification prefs
(function () {
  const notifToggle = document.getElementById('notifToggle');
  const pauseUntilInput = document.getElementById('pauseUntilInput');
  const applyPauseBtn = document.getElementById('applyPauseBtn');
  const clearPauseBtn = document.getElementById('clearPauseBtn');
  const askBrowserPermBtn = document.getElementById('askBrowserPermBtn');
  const nextStatus = document.getElementById('nextStatus');

  // Profile fields
  const profileEmail = document.getElementById('profileEmail');
  const profileName = document.getElementById('profileName');
  const profileMajor = document.getElementById('profileMajor');
  const profileYear = document.getElementById('profileYear');
  const profileGpa = document.getElementById('profileGpa');
  const profileBio = document.getElementById('profileBio');
  const profileClassCount = document.getElementById('profileClassCount');
  const profileForm = document.getElementById('profileForm');
  const profileMsg = document.getElementById('profileMsg');

  function updatePauseUIState() {
    if (!notifToggle) return;
    const on = notifToggle.checked;
    if (pauseUntilInput) pauseUntilInput.disabled = !on;
    if (applyPauseBtn) applyPauseBtn.disabled = !on;
    if (clearPauseBtn) clearPauseBtn.disabled = !on;

    const paused = pauseUntilInput && pauseUntilInput.value;
    if (!nextStatus) return;
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
      if (!window.model || !window.model.notifications) return;
      const prefs = await window.model.notifications.load();
      if (notifToggle) notifToggle.checked = !!prefs.enabled;

      if (pauseUntilInput) {
        pauseUntilInput.value = prefs.pausedUntil
          ? new Date(prefs.pausedUntil.getTime() - (new Date().getTimezoneOffset() * 60000))
              .toISOString()
              .slice(0, 16)
          : '';
      }

      updatePauseUIState();
    } catch (e) {
      console.error('[profile] load prefs failed', e);
    }
  }

  async function initProfileUI() {
    try {
      const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
      if (!token) {
        window.location.href = '/';
        return;
      }
      DataModel.setToken(token);

      const p = await DataModel.getProfile();
      if (profileEmail) profileEmail.value = p.email || '';
      if (profileName) profileName.value = p.fullName || '';
      if (profileMajor) profileMajor.value = p.major || '';
      if (profileYear) profileYear.value = p.academicYear || '';
      if (profileGpa) profileGpa.value = (p.gpa !== null && p.gpa !== undefined) ? p.gpa : '';
      if (profileBio) profileBio.value = p.bio || '';
      if (profileClassCount) profileClassCount.textContent =
        (p.classCount || 0) + ' classes in your dashboard';
    } catch (e) {
      console.error('[profile] load profile failed', e);
      if (profileMsg) {
        profileMsg.textContent = e.message || 'Failed to load profile.';
        profileMsg.style.color = 'var(--err, #f97373)';
      }
    }
  }

  // --- Event wiring ---

  if (notifToggle) {
    notifToggle.addEventListener('change', async () => {
      try {
        const enabled = notifToggle.checked;
        const pausedUntil = pauseUntilInput ? (pauseUntilInput.value || null) : null;
        await window.model.notifications.save({ enabled, pausedUntil });
        updatePauseUIState();
      } catch (e) {
        console.error('[profile] toggle failed', e);
        notifToggle.checked = !notifToggle.checked;
        updatePauseUIState();
      }
    });
  }

  if (applyPauseBtn) {
    applyPauseBtn.addEventListener('click', async () => {
      try {
        const enabled = notifToggle ? notifToggle.checked : true;
        const pausedUntil = pauseUntilInput ? (pauseUntilInput.value || null) : null;
        await window.model.notifications.save({ enabled, pausedUntil });
        updatePauseUIState();
      } catch (e) {
        console.error('[profile] pause failed', e);
      }
    });
  }

  if (clearPauseBtn) {
    clearPauseBtn.addEventListener('click', async () => {
      try {
        const enabled = notifToggle ? notifToggle.checked : true;
        await window.model.notifications.save({ enabled, pausedUntil: null });
        if (pauseUntilInput) pauseUntilInput.value = '';
        updatePauseUIState();
      } catch (e) {
        console.error('[profile] clear pause failed', e);
      }
    });
  }

  if (askBrowserPermBtn) {
    askBrowserPermBtn.addEventListener('click', async () => {
      try {
        if (!('Notification' in window)) {
          alert('Browser notifications not supported.');
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('Permission not granted.');
        } else if (window.model.notifications.allowedNow()) {
          new Notification('Notifications enabled', { body: 'Thanks for enabling notifications!' });
        }
      } catch (e) {
        console.error('[profile] browser perm failed', e);
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (profileMsg) {
        profileMsg.textContent = '';
        profileMsg.style.color = '#cbd5e1';
      }

      const payload = {
        fullName: profileName?.value || '',
        major: profileMajor?.value || '',
        academicYear: profileYear?.value || '',
        gpa: profileGpa?.value || '',
        bio: profileBio?.value || ''
      };

      try {
        await DataModel.saveProfile(payload);
        if (profileMsg) {
          profileMsg.textContent = 'Profile saved.';
          profileMsg.style.color = '#bbf7d0';
        }
      } catch (e) {
        console.error('[profile] save failed', e);
        if (profileMsg) {
          profileMsg.textContent = e.message || 'Failed to save profile.';
          profileMsg.style.color = 'var(--err, #f97373)';
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initProfileUI();
      initNotificationUI();
    });
  } else {
    initProfileUI();
    initNotificationUI();
  }
})();
