////////////////////////////////////////////////
// DASHBOARD.JS — Controller
////////////////////////////////////////////////

// NOTE: notification helpers are provided as globals by dashboard.html:
// window.isNotificationsEnabled, window.enableNotifications, window.notify

document.addEventListener('DOMContentLoaded', () => {
  //////////////////////////////////////////
  // ELEMENTS
  //////////////////////////////////////////
  const logoutButton = document.getElementById('logoutButton');
  const refreshButton = document.getElementById('refreshButton');
  const notifyToggleBtn = document.getElementById('notifToggleBtn'); // toggle lives in HTML

  //////////////////////////////////////////
  // EVENT LISTENERS
  //////////////////////////////////////////
  // Log out and redirect to login - clear both storages
  logoutButton?.addEventListener('click', () => {
    try {
      localStorage.removeItem('jwtToken');
      sessionStorage.removeItem('jwtToken');
      localStorage.setItem('logoutMessage', 'You have been logged out successfully.');
    } finally {
      window.location.href = '/';
    }
  });

  // Refresh list when the button is clicked (with gated notifications)
  refreshButton?.addEventListener('click', async () => {
    try {
      await renderUserList();
      if (window.isNotificationsEnabled && window.isNotificationsEnabled()) {
        window.notify && window.notify({ title: 'Data refreshed', body: 'User list updated.' });
      }
    } catch (err) {
      console.error('Failed to refresh users:', err);
    }
  });

  // NOTE: Notification toggle is handled in dashboard.html; no handler here

  //////////////////////////////////////////////////////
  // CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
  //////////////////////////////////////////////////////
  // (dashboard.html also registers the SW; duplicate is harmless but we'll skip here)

  // Initial check for the token (either storage)
  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token) {
    window.location.href = '/';
    return;
  }

  DataModel.setToken(token);
  renderUserList();

  // Show welcome only if notifications truly enabled
  if (window.isNotificationsEnabled && window.isNotificationsEnabled()) {
    window.notify && window.notify({ title: 'Welcome back!', body: "You’re signed in." });
  }
});

//////////////////////////////////////////
// FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////
async function renderUserList() {
  const userListElement = document.getElementById('userList');
  if (!userListElement) return;
  userListElement.innerHTML = '<div class="loading-message">Loading user list...</div>';
  try {
    const users = await DataModel.getUsers();
    userListElement.innerHTML = '';
    (users || []).forEach(user => {
      const userItem = document.createElement('div');
      userItem.classList.add('user-item');
      userItem.textContent = user;
      userListElement.appendChild(userItem);
    });
  } catch (e) {
    console.error('Error loading users:', e);
    userListElement.innerHTML = '<div class="error-message">Failed to load users.</div>';
  }
}
