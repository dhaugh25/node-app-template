// CONTROLLER: wire events, call DataModel, update DOM.
document.addEventListener('DOMContentLoaded', main);

function main() {
  // Elements (match your dashboard.html)
  const refreshButton = document.getElementById('refreshButton');
  const notifyToggleBtn = document.getElementById('notifToggleBtn');
  const logoutButton = document.getElementById('logoutButton');

  const classForm = document.getElementById('classForm');      // form id in HTML
  const courseInput = document.getElementById('course_name'); // note underscore names in HTML
  const subjectInput = document.getElementById('subject');
  const daysSelect = document.getElementById('days');
  const startInput = document.getElementById('start_time');
  const endInput = document.getElementById('end_time');
  const classMsg = document.getElementById('classMsg');

  const classesBody = document.getElementById('classesBody'); // tbody where rows are rendered

  // submit button inside the form (used to change label)
  const submitBtn = classForm ? classForm.querySelector('button[type="submit"]') : null;

  // track edit mode: null = adding, id = editing existing
  let editingId = null;

  // service worker safe registration (harmless if already registered)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // check token & set DataModel
  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token) {
    return window.location.href = '/';
  }
  DataModel.setToken(token);

  // Wire header buttons
  refreshButton?.addEventListener('click', async (e) => {
    e.preventDefault();
    await loadAndRenderClasses();
  });

  notifyToggleBtn?.addEventListener('click', async () => {
    if (typeof enableNotifications === 'function') {
      const ok = await enableNotifications();
      notifyToggleBtn.textContent = ok ? 'Disable Notifications' : 'Enable Notifications';
    } else {
      const cur = notifyToggleBtn.textContent || '';
      notifyToggleBtn.textContent = cur === 'Enable Notifications' ? 'Disable Notifications' : 'Enable Notifications';
    }
  });

  logoutButton?.addEventListener('click', () => {
    localStorage.removeItem('jwtToken');
    sessionStorage.removeItem('jwtToken');
    window.location.href = '/';
  });

  // Form submit: add or update depending on editingId
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

    // client validation
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
        // update existing
        await DataModel.updateClass(editingId, payload);
        // clear the form & switch back to Add mode
        classForm.reset();
        editingId = null;
        if (submitBtn) submitBtn.textContent = 'Add Class';
        showMessage('Class updated successfully.', false);
        await loadAndRenderClasses();
      } else {
        // create new
        await DataModel.addClass(payload);
        // clear the form after add
        classForm.reset();
        if (submitBtn) submitBtn.textContent = 'Add Class';
        showMessage('Class added.', false);
        await loadAndRenderClasses();
      }
    } catch (err) {
      console.error('Save error', err);
      showMessage((err && err.message) ? err.message : 'Save failed', true);
      // attempt refresh anyway so UI matches DB
      try { await loadAndRenderClasses(); } catch (e) { console.error('refresh failed', e); }
    }
  });

  // Load + render on start
  loadAndRenderClasses();

  // ---------- Functions ----------

  async function loadAndRenderClasses() {
    if (!classesBody) return;
    classesBody.innerHTML = `<tr><td colspan="5" class="sub">Loading...</td></tr>`;
    try {
      const classes = await DataModel.getClasses();
      console.log('dashboard.loadAndRenderClasses: got classes array length =', (classes || []).length, classes);
      // If classes is empty array, show a helpful message (not just "No classes yet")
      if (!classes || classes.length === 0) {
        classesBody.innerHTML = `<tr><td colspan="5" class="sub">No classes returned from server. (Check console/Network tab for /api/classes.)</td></tr>`;
        return;
      }
      renderClassesTable(classes);
    } catch (err) {
      console.error('Failed to load classes', err);
      classesBody.innerHTML = `<tr><td colspan="5" class="sub">Failed loading classes — see console for details.</td></tr>`;
    }
  }

    classes.forEach(c => {
      const tr = document.createElement('tr');

      // Display times in 12-hour format for readability
      const start12 = to12Hour(c.start_time);
      const end12 = to12Hour(c.end_time);

      tr.innerHTML = `
        <td class="td-course">${escapeHtml(c.course_name)}</td>
        <td class="td-subject">${escapeHtml(c.subject)}</td>
        <td class="td-days">${escapeHtml(c.days)}</td>
        <td class="td-start">${escapeHtml(start12)}</td>
        <td class="td-end">${escapeHtml(end12)}
          <span style="float:right; margin-left:8px;">
            <div class="row-menu" style="display:inline-block; position:relative;">
              <button class="menu-btn" aria-haspopup="true">⋯</button>
              <div class="menu-dropdown" role="menu" aria-hidden="true">
                <button class="menu-edit">Edit</button>
                <button class="menu-delete">Remove</button>
              </div>
            </div>
          </span>
        </td>
      `;

      // attach handlers for the menu (Edit/Delete)
      const menuBtn = tr.querySelector('.menu-btn');
      const dropdown = tr.querySelector('.menu-dropdown');
      const editBtn = tr.querySelector('.menu-edit');
      const deleteBtn = tr.querySelector('.menu-delete');

      // toggle dropdown
      menuBtn?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const open = dropdown.getAttribute('aria-hidden') === 'false';
        closeAllDropdowns();
        if (!open) {
          dropdown.setAttribute('aria-hidden', 'false');
        }
      });

      // close dropdown when clicking outside
      document.addEventListener('click', closeAllDropdowns);

      // Edit action
      editBtn?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeAllDropdowns();
        startEditing(c);
      });

      // Delete action
      deleteBtn?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeAllDropdowns();
        if (!confirm(`Remove class "${c.subject}: ${c.course_name}"?`)) return;
        try {
          await DataModel.deleteClass(c.id);
          // immediate UI removal
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
    // Put form into edit mode and prefill values
    editingId = classObj.id;
    courseInput.value = classObj.course_name || '';
    subjectInput.value = classObj.subject || '';
    daysSelect.value = classObj.days || '';
    startInput.value = normalizeTimeForInput(classObj.start_time || '');
    endInput.value = normalizeTimeForInput(classObj.end_time || '');
    // Switch button text to Update Class
    if (submitBtn) submitBtn.textContent = 'Update Class';
    // clear any previous message (we won't show an "editing" helper)
    clearMessage();
    // scroll to top of form for convenience
    courseInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Utilities
  function showMessage(msg, isError = false) {
    if (!classMsg) return;
    classMsg.textContent = msg;
    classMsg.style.color = isError ? 'var(--err, #f44336)' : '#cbd5e1';
  }
  function clearMessage() { if (classMsg) { classMsg.textContent = ''; } }

  function normalizeTimeForInput(t) {
    if (!t) return '';
    const parts = String(t).split(':');
    if (parts.length >= 2) return `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}`;
    return t;
  }

  function to12Hour(timeStr) {
    if (!timeStr) return '';
    const s = String(timeStr).trim();
    if (/[ap]m$/i.test(s)) {
      return s.toUpperCase();
    }
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
}