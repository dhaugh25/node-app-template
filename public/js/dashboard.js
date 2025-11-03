// CONTROLLER: wire events, call DataModel, update DOM.
document.addEventListener('DOMContentLoaded', main);

function main() {
  // DOM elements (match your dashboard.html IDs)
  const refreshButton = document.getElementById('refreshButton');
  const notifyToggleBtn = document.getElementById('notifToggleBtn');
  const logoutButton = document.getElementById('logoutButton');

  const classForm = document.getElementById('classForm');
  const courseInput = document.getElementById('course_name');
  const subjectInput = document.getElementById('subject');
  const daysSelect = document.getElementById('days');
  const startInput = document.getElementById('start_time');
  const endInput = document.getElementById('end_time');
  const classMsg = document.getElementById('classMsg');
  const classesBody = document.getElementById('classesBody');

  const submitBtn = classForm ? classForm.querySelector('button[type="submit"]') : null;

  // editing state
  let editingId = null;

  // Register SW if available (harmless)
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

  // Auth token (must exist)
  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token) {
    console.warn('No token found — redirecting to login.');
    return window.location.href = '/';
  }
  DataModel.setToken(token);

  // Wire header buttons
  refreshButton?.addEventListener('click', async (e) => { e.preventDefault(); await loadAndRenderClasses(); });
  logoutButton?.addEventListener('click', () => { localStorage.removeItem('jwtToken'); sessionStorage.removeItem('jwtToken'); window.location.href = '/'; });
  notifyToggleBtn?.addEventListener('click', async () => {
    if (typeof enableNotifications === 'function') {
      const ok = await enableNotifications();
      notifyToggleBtn.textContent = ok ? 'Disable Notifications' : 'Enable Notifications';
    } else {
      const cur = notifyToggleBtn.textContent || '';
      notifyToggleBtn.textContent = cur === 'Enable Notifications' ? 'Disable Notifications' : 'Enable Notifications';
    }
  });

  // Form submit: add or update
  classForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearMessage();

    const payload = {
      course_name: (courseInput?.value || '').trim(),
      subject: (subjectInput?.value || '').trim(),
      days: (daysSelect?.value || '').trim(),
      start_time: (startInput?.value || '').trim(),
      end_time: (endInput?.value || '').trim()
    };

    // Validation
    if (!payload.course_name || !payload.subject || !payload.days || !payload.start_time || !payload.end_time) {
      showMessage('Please fill in all required fields.', true);
      return;
    }
    if (payload.start_time >= payload.end_time) {
      showMessage('Start time must be before end time.', true);
      return;
    }

    try {
      if (editingId) {
        await DataModel.updateClass(editingId, payload);
        classForm.reset();
        editingId = null;
        if (submitBtn) submitBtn.textContent = 'Add Class';
        showMessage('Class updated successfully.', false);
      } else {
        await DataModel.addClass(payload);
        classForm.reset();
        if (submitBtn) submitBtn.textContent = 'Add Class';
        showMessage('Class added.', false);
      }
      // refresh to show server truth
      await loadAndRenderClasses();
    } catch (err) {
      console.error('Save error', err);
      showMessage(err.message || 'Save failed', true);
      // attempt a refresh anyway so UI matches DB
      try { await loadAndRenderClasses(); } catch(e){ console.error('refresh after save failed', e); }
    }
  });

  // Load initially
  loadAndRenderClasses();

  // ----------------- Functions -----------------

  async function loadAndRenderClasses() {
    if (!classesBody) return;
    classesBody.innerHTML = `<tr><td colspan="5" class="sub">Loading...</td></tr>`;
    try {
      const classesArray = await DataModel.getClasses();
      // defensive: ensure an array
      if (!Array.isArray(classesArray)) {
        console.warn('getClasses did not return an array, got:', classesArray);
        classesBody.innerHTML = `<tr><td colspan="5" class="sub">Unexpected server response — see console.</td></tr>`;
        return;
      }
      console.log('dashboard: loaded classes', classesArray.length);
      if (classesArray.length === 0) {
        classesBody.innerHTML = `<tr><td colspan="5" class="sub">No classes yet.</td></tr>`;
        return;
      }
      // render
      renderClassesTable(classesArray);
    } catch (err) {
      console.error('Failed to load classes', err);
      classesBody.innerHTML = `<tr><td colspan="5" class="sub">Failed loading classes — see console.</td></tr>`;
    }
  }

  // Renders table rows for classes (rebuilds tbody)
  function renderClassesTable(classesArray) {
    if (!classesBody) return;
    classesBody.innerHTML = ''; // clear

    classesArray.forEach(c => {
      const tr = document.createElement('tr');

      const start12 = to12Hour(c.start_time);
      const end12 = to12Hour(c.end_time);

      tr.innerHTML = `
        <td class="td-course">${escapeHtml(c.course_name)}</td>
        <td class="td-subject">${escapeHtml(c.subject)}</td>
        <td class="td-days">${escapeHtml(c.days)}</td>
        <td class="td-start">${escapeHtml(start12)}</td>
        <td class="td-end">
          <span class="end-time">${escapeHtml(end12)}</span>
          <span class="divider" aria-hidden="true"></span>
          <span class="row-menu">
            <button class="menu-btn" aria-haspopup="true">⋯</button>
            <div class="menu-dropdown" role="menu" aria-hidden="true">
              <button class="menu-edit">Edit</button>
              <button class="menu-delete">Remove</button>
            </div>
          </span>
        </td>
      `;

      // wire menu buttons
      const menuBtn = tr.querySelector('.menu-btn');
      const dropdown = tr.querySelector('.menu-dropdown');
      const editBtn = tr.querySelector('.menu-edit');
      const deleteBtn = tr.querySelector('.menu-delete');

      menuBtn?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const open = dropdown.getAttribute('aria-hidden') === 'false';
        closeAllDropdowns();
        if (!open) dropdown.setAttribute('aria-hidden', 'false');
      });

      // close menus on outside click
      document.addEventListener('click', closeAllDropdowns);

      editBtn?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeAllDropdowns();
        startEditing(c);
      });

      deleteBtn?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeAllDropdowns();
        if (!confirm(`Remove class "${c.subject}: ${c.course_name}"?`)) return;
        try {
          await DataModel.deleteClass(c.id);
          // remove row from DOM (optimistic)
          tr.remove();
        } catch (err) {
          console.error('Delete failed', err);
          alert('Failed to delete class.');
        }
      });

      classesBody.appendChild(tr);
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.menu-dropdown').forEach(d => d.setAttribute('aria-hidden', 'true'));
  }

  function startEditing(classObj) {
    editingId = classObj.id;
    courseInput.value = classObj.course_name || '';
    subjectInput.value = classObj.subject || '';
    daysSelect.value = classObj.days || '';
    startInput.value = normalizeTimeForInput(classObj.start_time || '');
    endInput.value = normalizeTimeForInput(classObj.end_time || '');
    if (submitBtn) submitBtn.textContent = 'Update Class';
    clearMessage();
    courseInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Helpers
  function showMessage(msg, isError = false) {
    if (!classMsg) return;
    classMsg.textContent = msg;
    classMsg.style.color = isError ? 'var(--err, #f44336)' : '#cbd5e1';
  }
  function clearMessage() { if (classMsg) classMsg.textContent = ''; }

  function normalizeTimeForInput(t) {
    if (!t) return '';
    const parts = String(t).split(':');
    if (parts.length >= 2) return `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}`;
    return t;
  }

  function to12Hour(timeStr) {
    if (!timeStr) return '';
    const s = String(timeStr).trim();
    if (/[ap]m$/i.test(s)) return s.toUpperCase();
    const parts = s.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parts[1].padStart(2,'0') : '00';
    if (Number.isNaN(h)) return s;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m} ${ampm}`;
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>"'`=\/]/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
      "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    }[s]));
  }
} // end main
