// DATAMODEL: talks to server, caches state; no DOM work.
const DataModel = (function () {
  let token = null;

  // caches
  let users = [];
  let classes = [];

  // notifications (client-side gate)
  let notifEnabled = true;
  let notifPausedUntil = null;

  function authHeaders() {
    return { 'Authorization': token, 'Content-Type': 'application/json' };
  }

  return {
    setToken(t){ token = t; },

    // USERS
    async getUsers(){
      if (!token) return [];
      const r = await fetch('/api/users', { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type':'application/json' }});
      if (!r.ok) return [];
      const data = await r.json();
      users = data.emails || [];
      return users;
    },

    // CLASSES (Study system)
    async getClasses(){
      if (!token) return [];
      const r = await fetch('/api/classes', { headers: authHeaders() });
      if (!r.ok) return [];
      const data = await r.json();
      classes = data.classes || [];
      return classes;
    },
    async addClass(payload){
      const r = await fetch('/api/classes', { method:'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('Save failed');
      const data = await r.json();
      classes.unshift(data.class);
      return data.class;
    },

    // Notification prefs round-trip (optional; server endpoints already exist)
    async getNotificationPrefs(){
      if (!token) return { enabled:notifEnabled, pausedUntil:notifPausedUntil };
      const r = await fetch('/api/notifications/prefs', { headers: authHeaders() });
      if (!r.ok) return { enabled:notifEnabled, pausedUntil:notifPausedUntil };
      const d = await r.json();
      notifEnabled = !!d.enabled;
      notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
      return { enabled:notifEnabled, pausedUntil:notifPausedUntil };
    },
    async setNotificationPrefs({enabled, pausedUntil}){
      const r = await fetch('/api/notifications/prefs', {
        method:'PUT', headers: authHeaders(), body: JSON.stringify({enabled, pausedUntil})
      });
      if (!r.ok) return { enabled:notifEnabled, pausedUntil:notifPausedUntil };
      const d = await r.json();
      notifEnabled = !!d.enabled;
      notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
      return { enabled:notifEnabled, pausedUntil:notifPausedUntil };
    },

    // expose
    _state(){ return { users, classes, notifEnabled, notifPausedUntil }; }
  };
})();
// test for push