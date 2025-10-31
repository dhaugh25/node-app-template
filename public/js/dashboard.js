////////////////////////////////////////////////
// DASHBOARD.JS — Controller
////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {
  const logoutButton = document.getElementById('logoutButton');
  const refreshButton = document.getElementById('refreshButton');

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

  // Refresh list (and toast if allowed)
  refreshButton?.addEventListener('click', async () => {
    try {
      await renderUserList();
      if (window.isNotificationsEnabled && window.isNotificationsEnabled()) {
        window.notify?.({ title: 'Data refreshed', body: 'Members list updated.' });
      }
    } catch (err) {
      console.error('Failed to refresh users:', err);
    }
  });

  // Gate access
  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token) { window.location.href = '/'; return; }
  DataModel.setToken(token);

  // Initial paint
  renderUserList();
});

async function renderUserList() {
  const el = document.getElementById('userList');
  if (!el) return;
  el.innerHTML = '<div class="sub">Loading members…</div>';
  try {
    const users = await DataModel.getUsers();
    if (!users || !users.length) {
      el.innerHTML = '<div class="sub">No members yet.</div>';
      return;
    }
    el.innerHTML = '';
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'user-item';
      row.textContent = u;
      el.appendChild(row);
    });
  } catch (e) {
    console.error('Error loading users:', e);
    el.innerHTML = '<div class="sub">Failed to load users.</div>';
  }
}
