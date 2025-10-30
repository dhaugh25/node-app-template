////////////////////////////////////////////////
// DASHBOARD.JS
// CONTROLLER: connects model (datamodel.js) and view (dashboard.html)
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


// references to the new form elements
const openAddClassBtn = document.getElementById('openAddClassBtn');
const addClassFormContainer = document.getElementById('addClassFormContainer');
const addClassForm = document.getElementById('addClassForm');
const cancelAddClassBtn = document.getElementById('cancelAddClassBtn');
const classFormMessage = document.getElementById('classFormMessage');

// Show/hide form
if (openAddClassBtn && addClassFormContainer) {
  openAddClassBtn.addEventListener('click', () => {
    addClassFormContainer.style.display = 'block';
    classFormMessage.textContent = '';
  });
}
if (cancelAddClassBtn && addClassFormContainer) {
  cancelAddClassBtn.addEventListener('click', () => {
    addClassForm.reset();
    addClassFormContainer.style.display = 'none';
  });
}

// On submit: validate, call API, update UI immediately
if (addClassForm) {
  addClassForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // collect values
    const course_name = document.getElementById('courseName').value.trim();
    const subject = document.getElementById('subject').value.trim();
    const days = document.getElementById('days').value.trim();
    const start_time = document.getElementById('startTime').value;
    const end_time = document.getElementById('endTime').value;

    // client-side validation (acceptance criteria: show error if missing)
    if (!course_name || !subject || !days || !start_time || !end_time) {
      classFormMessage.textContent = 'Please fill in all required fields.';
      classFormMessage.classList.add('error');
      return;
    }

    // Optional: check start < end
    if (start_time >= end_time) {
      classFormMessage.textContent = 'Start time must be before end time.';
      classFormMessage.classList.add('error');
      return;
    }

    try {
      classFormMessage.textContent = 'Saving...';
      const newClass = await DataModel.createClass({ course_name, subject, days, start_time, end_time });

      // hide form & reset
      addClassForm.reset();
      addClassFormContainer.style.display = 'none';
      classFormMessage.textContent = '';

      // Immediately add to class list UI (prepend)
      const userListElement = document.getElementById('userList'); // reuse your class list container or create a new one
      const item = document.createElement('div');
      item.className = 'user-item';
      item.innerHTML = `<strong>${newClass.course_name}</strong> — ${newClass.subject}<br>
                        ${newClass.days} ${newClass.start_time}–${newClass.end_time}`;
      // insert at the top
      userListElement.insertBefore(item, userListElement.firstChild);

    } catch (err) {
      classFormMessage.textContent = err.message || 'Error saving class';
      classFormMessage.classList.add('error');
    }
  });
}