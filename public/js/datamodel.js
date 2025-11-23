// DATAMODEL: talks to server, caches state; no DOM work.
const DataModel = (function () {
  let token = null;

  // caches
  let users = [];
  let classes = [];
  let profile = null;
  let community = [];

  // notifications (client-side cache of server prefs)
  let notifEnabled = true;
  let notifPausedUntil = null;

  // === single place to control auth header format ===
  function authHeaders() {
    if (!token) return { 'Content-Type': 'application/json' };
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    };
  }

  // small helper to parse JSON or return empty object
  async function safeJson(resp) {
    try { return await resp.json(); } catch (e) { return {}; }
  }

  return {
    setToken(t) { token = t; },

    // USERS (used by People panel on dashboard)
    async getUsers() {
      if (!token) return [];
      const r = await fetch('/api/users', { headers: authHeaders() });
      if (!r.ok) return [];
      const data = await safeJson(r);
      users = data.emails || [];
      return users;
    },

    // CLASSES (Study system)
    async getClasses() {
      if (!token) {
        console.warn('DataModel.getClasses: no token set');
        return [];
      }
      try {
        const r = await fetch('/api/classes', { headers: authHeaders() });
        let body = {};
        try { body = await r.json(); } catch (e) {
          console.warn('getClasses: response not JSON or empty', e);
          body = {};
        }
        if (!r.ok) {
          console.error('getClasses: non-OK response', r.status, body);
          return [];
        }
        classes = body.classes || [];
        return classes;
      } catch (err) {
        console.error('getClasses network error', err);
        return [];
      }
    },

    async addClass(payload) {
      if (!token) throw new Error('Token not set');
      const r = await fetch('/api/classes', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const body = await safeJson(r);
      if (!r.ok) {
        const msg = body && body.message ? body.message : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      if (body.class) {
        classes.unshift(body.class);
        return body.class;
      }
      return body;
    },

    async updateClass(id, payload) {
      if (!token) throw new Error('Token not set');
      try {
        const resp = await fetch(`/api/classes/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });

        let body = {};
        try { body = await resp.json(); } catch (e) { body = {}; }

        if (!resp.ok) {
          const msg = (body && body.message) ? body.message : `HTTP ${resp.status}`;
          throw new Error(msg);
        }

        if (body && body.class) {
          classes = Array.isArray(classes)
            ? classes.map(c => (c.id === body.class.id ? body.class : c))
            : [body.class];
          return body.class;
        }
        return body;
      } catch (err) {
        console.error('updateClass caught error:', err);
        throw err;
      }
    },

    async deleteClass(id) {
      if (!token) throw new Error('Token not set');
      try {
        const resp = await fetch(`/api/classes/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        if (!resp.ok) {
          const j = await safeJson(resp);
          throw new Error(j.message || `HTTP ${resp.status}`);
        }
        classes = classes.filter(c => c.id !== id);
        return true;
      } catch (err) {
        console.error('deleteClass error:', err);
        throw err;
      }
    },

    // Notification prefs round-trip
    async getNotificationPrefs() {
      if (!token) return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
      const r = await fetch('/api/notifications/prefs', { headers: authHeaders() });
      if (!r.ok) return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
      const d = await safeJson(r);
      notifEnabled = !!d.enabled;
      notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
      return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
    },

    async setNotificationPrefs({ enabled, pausedUntil }) {
      const r = await fetch('/api/notifications/prefs', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ enabled, pausedUntil })
      });
      if (!r.ok) return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
      const d = await safeJson(r);
      notifEnabled = !!d.enabled;
      notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
      return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
    },

    // PROFILE
    async getProfile() {
      if (!token) throw new Error('Token not set');
      const r = await fetch('/api/profile', { headers: authHeaders() });
      const body = await safeJson(r);
      if (!r.ok) {
        throw new Error(body.message || 'Failed to load profile.');
      }
      profile = body.profile || null;
      return profile;
    },

    async saveProfile(payload) {
      if (!token) throw new Error('Token not set');
      const r = await fetch('/api/profile', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const body = await safeJson(r);
      if (!r.ok) {
        throw new Error(body.message || 'Failed to save profile.');
      }
      // Optimistically keep last payload merged
      profile = { ...(profile || {}), ...(payload || {}) };
      return body;
    },

    // COMMUNITY / FRIENDS
    async getCommunity() {
      if (!token) throw new Error('Token not set');
      const r = await fetch('/api/community', { headers: authHeaders() });
      const body = await safeJson(r);
      if (!r.ok) {
        throw new Error(body.message || 'Failed to load community.');
      }
      community = body.community || [];
      return community;
    },

    async requestFriend(toEmail) {
      if (!token) throw new Error('Token not set');
      const r = await fetch('/api/friends/request', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ toEmail })
      });
      const body = await safeJson(r);
      if (!r.ok) throw new Error(body.message || 'Failed to send request.');
      return body;
    },

    async respondFriend(fromEmail, action) {
      if (!token) throw new Error('Token not set');
      const r = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ fromEmail, action })
      });
      const body = await safeJson(r);
      if (!r.ok) throw new Error(body.message || 'Failed to update request.');
      return body;
    },

    // expose internal for notifications helper
    _state() {
      return { users, classes, profile, community, notifEnabled, notifPausedUntil };
    }
  };
})();

// Attach to window for controllers
window.DataModel = DataModel;

// Bridge object for existing profile.js notification code
window.model = window.model || {};
window.model.notifications = {
  async load() {
    return await DataModel.getNotificationPrefs();
  },
  async save(prefs) {
    return await DataModel.setNotificationPrefs(prefs);
  },
  allowedNow() {
    const state = DataModel._state();
    if (!state.notifEnabled) return false;
    if (!state.notifPausedUntil) return true;
    return state.notifPausedUntil <= new Date();
  }
};
