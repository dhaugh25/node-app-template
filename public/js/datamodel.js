////////////////////////////////////////////////////////////////
//DATAMODEL.JS
//THIS IS YOUR "MODEL", IT INTERACTS WITH THE ROUTES ON YOUR
//SERVER TO FETCH AND SEND DATA.  IT DOES NOT INTERACT WITH
//THE VIEW (dashboard.html) OR THE CONTROLLER (dashboard.js)
//DIRECTLY.  IT IS A "MIDDLEMAN" BETWEEN THE SERVER AND THE
//CONTROLLER.  ALL IT DOES IS MANAGE DATA.
////////////////////////////////////////////////////////////////

const DataModel = (function () {
    let token = null;                // Holds the JWT token
    let users = [];                  // Cached list of user emails
    let classes = [];                // Cached classes

    // Notification prefs cache
    let notifEnabled = true;
    let notifPausedUntil = null;
    let notifServerTimeISO = null;

    // helper to attach Authorization header
    function authHeaders() {
    if (!token) return { 'Content-Type': 'application/json' };
    return {
        'Content-Type': 'application/json',
        // send raw token because your server expects the raw value in req.headers['authorization']
        'Authorization': token
    };
}

    // Public API
    return {
        // store the JWT token
        setToken: function (newToken) {
            token = newToken;
        },

        // ---------- Users ----------
        getUsers: async function () {
            if (!token) { console.error("Token is not set."); return []; }
            try {
                const res = await fetch('/api/users', { method: 'GET', headers: authHeaders() });
                if (!res.ok) {
                    console.error("Error fetching users:", await res.json().catch(()=>({})));
                    return [];
                }
                const data = await res.json();
                users = data.emails || [];
                return users;
            } catch (err) {
                console.error("getUsers error:", err);
                return [];
            }
        },

        // ---------- Classes ----------
        getClasses: async function () {
            if (!token) { console.error("Token is not set."); return []; }
            try {
                const res = await fetch('/api/classes', { method: 'GET', headers: authHeaders() });
                if (!res.ok) {
                    console.error("Error fetching classes:", await res.json().catch(()=>({})));
                    return [];
                }
                const data = await res.json();
                classes = data.classes || [];
                return classes;
            } catch (err) {
                console.error("getClasses error:", err);
                return [];
            }
        },

        createClass: async function (payload) {
            // payload: { course_name, subject, days, start_time, end_time }
            if (!token) throw new Error('Token not set');
            try {
                const res = await fetch('/api/classes', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) {
                    const msg = data && data.message ? data.message : 'Error creating class';
                    throw new Error(msg);
                }
                if (data.class) classes.unshift(data.class);
                return data.class;
            } catch (err) {
                console.error('createClass error:', err);
                throw err;
            }
        },

        // ---------- Notification prefs ----------
        getNotificationPrefs: async function () {
            if (!token) {
                console.error("Token is not set.");
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
            }
            try {
                const resp = await fetch('/api/notifications/prefs', {
                    method: 'GET',
                    headers: authHeaders()
                });
                if (!resp.ok) {
                    console.error("Error fetching notification prefs:", await resp.json().catch(() => ({})));
                    return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
                }
                const d = await resp.json();
                notifEnabled = !!d.enabled;
                notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
                notifServerTimeISO = d.serverTime || null;
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
            } catch (err) {
                console.error("getNotificationPrefs error:", err);
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
            }
        },

        setNotificationPrefs: async function ({ enabled, pausedUntil }) {
            if (!token) {
                console.error("Token is not set.");
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
            }
            try {
                const body = { enabled, pausedUntil };
                const resp = await fetch('/api/notifications/prefs', {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify(body)
                });
                if (!resp.ok) {
                    console.error("Error updating notification prefs:", await resp.json().catch(() => ({})));
                    return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
                }
                const d = await resp.json();
                notifEnabled = !!d.enabled;
                notifPausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
            } catch (err) {
                console.error("setNotificationPrefs error:", err);
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
            }
        },

        notificationsAllowedNow: function () {
            if (!notifEnabled) return false;
            if (!notifPausedUntil) return true;
            return new Date(notifPausedUntil) <= new Date();
        },

        _notificationState: function () {
            return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
        },

        // Read-only access to caches for controllers
        _getCachedUsers: function () { return users.slice(); },
        _getCachedClasses: function () { return classes.slice(); }
    };
})();