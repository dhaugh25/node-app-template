////////////////////////////////////////////////////////////////
//DATAMODEL.JS
//THIS IS YOUR "MODEL", IT INTERACTS WITH THE ROUTES ON YOUR
//SERVER TO FETCH AND SEND DATA.  IT DOES NOT INTERACT WITH
//THE VIEW (dashboard.html) OR THE CONTROLLER (dashboard.js)
//DIRECTLY.  IT IS A "MIDDLEMAN" BETWEEN THE SERVER AND THE
//CONTROLLER.  ALL IT DOES IS MANAGE DATA.
////////////////////////////////////////////////////////////////

const DataModel = (function () {
    //WE CAN STORE DATA HERE SO THAT WE DON'T HAVE TO FETCH IT
    //EVERY TIME WE NEED IT.  THIS IS CALLED "CACHING".
    //WE CAN ALSO STORE THINGS HERE TO MANAGE STATE, LIKE
    //WHEN THE USER SELECTS SOMETHING IN THE VIEW AND WE
    //NEED TO KEEP TRACK OF IT SO WE CAN USE THAT INFOMRATION
    //LATER.  RIGHT NOW, WE'RE JUST STORING THE JWT TOKEN
    //AND THE LIST OF USERS.
    let token = null;  // Holds the JWT token
    let users = [];    // Holds the list of user emails

    //WE CAN CREATE FUNCTIONS HERE TO FETCH DATA FROM THE SERVER
    //AND RETURN IT TO THE CONTROLLER.  THE CONTROLLER CAN THEN
    //USE THAT DATA TO UPDATE THE VIEW.  THE CONTROLLER CAN ALSO
    //SEND DATA TO THE SERVER TO BE STORED IN THE DATABASE BY
    //CALLING FUNCTIONS THAT WE DEFINE HERE.

    // ---------------- NOTIFICATION PREFS (local cache) ----------------
    let notifEnabled = true;          // current preference: enabled/disabled
    let notifPausedUntil = null;      // Date or null (when pause lifts)
    let notifServerTimeISO = null;    // last server time (ISO string)

    function authHeaders() {
        // NOTE: Your server expects the raw token in Authorization (not "Bearer ...")
        return {
            'Authorization': token,
            'Content-Type': 'application/json',
        };
    }

    return {
        //utility function to store the token so that we
        //can use it later to make authenticated requests
        setToken: function (newToken) {
            token = newToken;
        },

        //function to fetch the list of users from the server
        getUsers: async function () {
            // Check if the token is set
            if (!token) {
                console.error("Token is not set.");
                return [];
            }

            try {
                // send the token with Bearer prefix
                const response = await fetch('/api/users', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    console.error("Error fetching users:", await response.json());
                    return [];
                }

                const data = await response.json();
                //store the emails in the users variable so we can
                //use them again later without having to fetch them
                users = data.emails;
                //return the emails to the controller
                //so that it can update the view
                return users;
            } catch (error) {
                console.error("Error in API call:", error);
                return [];
            }
        },

        // ---------------- NOTIFICATION PREFS API ----------------
        // Load preferences from server and cache locally
        getNotificationPrefs: async function () {
            if (!token) {
                console.error("Token is not set.");
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
            }
            try {
                const resp = await fetch('/api/notifications/prefs', {
                    method: 'GET',
                    headers: { 'Authorization': token }
                });
                if (!resp.ok) {
                    console.error("Error fetching notification prefs:", await resp.json().catch(() => ({})));
                    return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
                }
                const data = await resp.json();
                notifEnabled = !!data.enabled;
                notifPausedUntil = data.pausedUntil ? new Date(data.pausedUntil) : null;
                notifServerTimeISO = data.serverTime || null;
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
            } catch (err) {
                console.error("Error in notification prefs GET:", err);
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil, serverTime: notifServerTimeISO };
            }
        },

        // Update preferences on server and update local cache
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
                const data = await resp.json();
                notifEnabled = !!data.enabled;
                notifPausedUntil = data.pausedUntil ? new Date(data.pausedUntil) : null;
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
            } catch (err) {
                console.error("Error in notification prefs PUT:", err);
                return { enabled: notifEnabled, pausedUntil: notifPausedUntil };
            }
        },

        // Convenience helper for client-side gating of toasts, etc.
        notificationsAllowedNow: function () {
            if (!notifEnabled) return false;
            if (!notifPausedUntil) return true;
            return new Date(notifPausedUntil) <= new Date();
        },

        // You can expose raw state if needed by controllers
        _notificationState: function () {
            return {
                enabled: notifEnabled,
                pausedUntil: notifPausedUntil,
                serverTime: notifServerTimeISO
            };
        },

        //ADD MORE FUNCTIONS HERE TO FETCH DATA FROM THE SERVER
        //AND SEND DATA TO THE SERVER AS NEEDED
    };
})();
