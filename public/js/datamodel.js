// DATAMODEL: talks to server, caches state; no DOM work.
const DataModel = (function () {
  let token = null;

  // caches
  let users = [];
  let classes = [];

  // notifications (client-side gate)
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

    // USERS
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
        console.log('DataModel.getClasses: calling /api/classes with headers', authHeaders());
        const r = await fetch('/api/classes', { headers: authHeaders() });
        console.log('DataModel.getClasses: response status', r.status, r.statusText);
        let body = {};
        try { body = await r.json(); } catch(e) { 
          console.warn('getClasses: response not JSON or empty', e);
          body = {};
        }
        console.log('DataModel.getClasses: parsed body', body);
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
      const r = await fetch('/api/classes', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      const body = await safeJson(r);
      if (!r.ok) {
        const msg = body && body.message ? body.message : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      if (body.class) {
        // keep local cache in sync (new classes at front)
        classes.unshift(body.class);
        return body.class;
      }
      return body;
    },

    updateClass: async function (id, payload) {
      if (!token) throw new Error('Token not set');
      try {
        const resp = await fetch(`/api/classes/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });

        // Log status & headers
        console.groupCollapsed(`DataModel.updateClass -> id=${id} status=${resp.status}`);
        try {
          // log a few response headers that matter
          console.log('Content-Type:', resp.headers.get('content-type'));
          console.log('Cache-Control:', resp.headers.get('cache-control'));
        } catch(e){ console.warn('header read failed', e); }

        // Read raw text (so we can inspect non-JSON responses)
        const raw = await resp.text().catch(() => '');
        console.log('Raw response text:', raw);

        // Try to parse JSON (if any)
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) {
          console.warn('JSON parse failed:', e);
          body = {};
        }
        console.log('Parsed body:', body);

        if (!resp.ok) {
          const msg = (body && body.message) ? body.message : `HTTP ${resp.status}`;
          console.error('Server responded with error for updateClass:', msg);
          console.groupEnd();
          throw new Error(msg);
        }

        // Success path: if server returned the class object, update cache
        if (body && body.class) {
          if (Array.isArray(classes)) classes = classes.map(c => (c.id === body.class.id ? body.class : c));
          console.log('updateClass successful, returned class:', body.class);
          console.groupEnd();
          return body.class;
        }

        // If server returned something else (e.g. empty 204), treat as success
        console.log('updateClass ok — no class in body, returning full body:', body);
        console.groupEnd();
        return body;
      } catch (err) {
        console.error('updateClass caught error:', err);
        throw err;
      }
    },

    deleteClass: async function (id) {
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
        // remove from local cache
        classes = classes.filter(c => c.id !== id);
        return true;
      } catch (err) {
        console.error('deleteClass error:', err);
        throw err;
      }
    },

    // Notification prefs round-trip (optional; server endpoints already exist)
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
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ enabled, pausedUntil })
      });
      if (!r.ok) return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
      const d = await safeJson(r);
      notifEnabled = !!d.enabled;
      notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
      return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
    },

    // expose
    _state() { return { users, classes, notifEnabled, notifPausedUntil }; }
  };
})();
// test for push