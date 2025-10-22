////////////////////////////////////////////////////////////////
//DASHBOARD.JS
//THIS IS YOUR "CONTROLLER", IT ACTS AS THE MIDDLEMAN
// BETWEEN THE MODEL (datamodel.js) AND THE VIEW (dashboard.html)
////////////////////////////////////////////////////////////////

// Import the notification helpers
import { enableNotifications, notify } from "/js/notifications.js";

//ADD ALL EVENT LISTENERS INSIDE DOMCONTENTLOADED
document.addEventListener('DOMContentLoaded', () => {
    //////////////////////////////////////////
    //ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////
    const logoutButton = document.getElementById('logoutButton');
    const refreshButton = document.getElementById('refreshButton');
    // fix: this id in your HTML is notifToggleBtn (not notifyBtn)
    const notifyBtn = document.getElementById('notifToggleBtn');
    //////////////////////////////////////////
    //END ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////

    //////////////////////////////////////////
    //EVENT LISTENERS
    //////////////////////////////////////////
    // Log out and redirect to login - clear both storages
    logoutButton.addEventListener('click', () => {
        // Remove the stored JWT token from both storages
        localStorage.removeItem('jwtToken');
        sessionStorage.removeItem('jwtToken');

        // Set a short-lived flag in localStorage to show a logout message on the login page
        localStorage.setItem('logoutMessage', 'You have been logged out successfully.');

        // Redirect to the login page
        window.location.href = '/';
    });

    // Refresh list when the button is clicked
    refreshButton.addEventListener('click', async () => {
        renderUserList();
        // Optional notification on refresh
        notify({ title: "Data refreshed", body: "User list updated." });
    });

    // Notifications button click listener (uses notifyBtn which matches dashboard.html)
    if (notifyBtn) {
        notifyBtn.addEventListener('click', async () => {
            const ok = await enableNotifications();
            if (ok) {
                notify({
                    title: "Notifications enabled",
                    body: "You’ll get alerts from the app.",
                    tag: "welcome"
                });
            }
        });
    }
    //////////////////////////////////////////
    //END EVENT LISTENERS
    //////////////////////////////////////////

    //////////////////////////////////////////////////////
    //CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
    //////////////////////////////////////////////////////
    // Register the Service Worker for notifications (dashboard.html also registers it; duplicate registration is harmless)
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    // Initial check for the token (either storage)
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
    } else {
        DataModel.setToken(token);
        renderUserList();

        // Optional: show welcome message if notifications are already granted
        if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
            notify({ title: "Welcome back!", body: "You’re signed in." });
        }
    }
    //////////////////////////////////////////
    //END CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
    //////////////////////////////////////////
});
//END OF DOMCONTENTLOADED

//////////////////////////////////////////
//FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////
async function renderUserList() {
    const userListElement = document.getElementById('userList');
    userListElement.innerHTML = '<div class="loading-message">Loading user list...</div>';
    const users = await DataModel.getUsers(); 
    userListElement.innerHTML = ''; // clear loader
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.classList.add('user-item');
        userItem.textContent = user;
        userListElement.appendChild(userItem);
    });
}
//////////////////////////////////////////
//END FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////
