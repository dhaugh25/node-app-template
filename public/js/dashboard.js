// CONTROLLER: wire events, call DataModel, update DOM.
document.addEventListener('DOMContentLoaded', main);

function main() {
  // ----------------- Shared / Auth -----------------
  const logoutButton = document.getElementById('logoutButton');

  // Classes DOM
  const classForm = document.getElementById('classForm');
  const courseInput = document.getElementById('course_name');
  const subjectInput = document.getElementById('subject');
  const daysSelect = document.getElementById('days');
  const startInput = document.getElementById('start_time');
  const endInput = document.getElementById('end_time');
  const classMsg = document.getElementById('classMsg');
  const classesBody = document.getElementById('classesBody');
  const submitBtn = classForm ? classForm.querySelector('button[type="submit"]') : null;

  // Assignments / calendar DOM
  const assignmentForm = document.getElementById('assignment-form');
  const assignmentList = document.getElementById('assignment-list');
  const calMonthYear = document.getElementById('cal-month-year');
  const calBody = document.getElementById('calendar-body');
  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');

  // Study groups DOM
  const autoGroupBtn = document.getElementById('auto-group-btn');
  const studyGroupList = document.getElementById('study-group-list');

  // editing state (classes)
  let editingId = null;

  // Calendar state
  let currentMonth = new Date().getMonth(); // 0-11
  let currentYear = new Date().getFullYear();

  // Auth token (must exist)
  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token) {
    console.warn('No token found — redirecting to login.');
    return window.location.href = '/';
  }
  if (typeof DataModel !== 'undefined' && DataModel.setToken) {
    DataModel.setToken(token);
  }

  // Logout
  logoutButton?.addEventListener('click', () => {
    localStorage.removeItem('jwtToken');
    sessionStorage.removeItem('jwtToken');
    window.location.href = '/';
  });

  // ----------------- CLASSES: form submit -----------------
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
      await loadAndRenderClasses();
    } catch (err) {
      console.error('Save error', err);
      showMessage(err.message || 'Save failed', true);
      try { await loadAndRenderClasses(); } catch(e){ console.error('refresh after save failed', e); }
    }
  });

  // ----------------- CLASSES: load + render -----------------
  async function loadAndRenderClasses() {
    if (!classesBody || !DataModel || !DataModel.getClasses) return;
    classesBody.innerHTML = `<tr><td colspan="5" class="sub">Loading...</td></tr>`;
    try {
      const classesArray = await DataModel.getClasses();
      if (!Array.isArray(classesArray)) {
        console.warn('getClasses did not return an array, got:', classesArray);
        classesBody.innerHTML = `<tr><td colspan="5" class="sub">Unexpected server response — see console.</td></tr>`;
        return;
      }
      if (classesArray.length === 0) {
        classesBody.innerHTML = `<tr><td colspan="5" class="sub">No classes yet.</td></tr>`;
        return;
      }
      renderClassesTable(classesArray);
    } catch (err) {
      console.error('Failed to load classes', err);
      classesBody.innerHTML = `<tr><td colspan="5" class="sub">Failed loading classes — see console.</td></tr>`;
    }
  }

  function renderClassesTable(classesArray) {
    if (!classesBody) return;
    classesBody.innerHTML = '';

    function closeFloatingMenu() {
      const existing = document.querySelector('.floating-dropdown');
      if (existing) {
        existing.classList.add('hidden');
        setTimeout(() => existing.remove(), 120);
      }
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('resize', closeFloatingMenu);
      window.removeEventListener('scroll', closeFloatingMenu, true);
      document.removeEventListener('keydown', onKeyDown);
    }
    function onDocClick(e) {
      const fd = document.querySelector('.floating-dropdown');
      if (!fd) return;
      if (!fd.contains(e.target)) closeFloatingMenu();
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') closeFloatingMenu();
    }

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
          <span class="row-menu">
            <button class="menu-btn" aria-haspopup="true">⋯</button>
          </span>
        </td>
      `;

      const menuBtn = tr.querySelector('.menu-btn');
      if (menuBtn) {
        menuBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeFloatingMenu();

          const fd = document.createElement('div');
          fd.className = 'floating-dropdown hidden';

          const editBtnF = document.createElement('button');
          editBtnF.type = 'button';
          editBtnF.className = 'menu-edit';
          editBtnF.textContent = 'Edit';
          fd.appendChild(editBtnF);

          const delBtnF = document.createElement('button');
          delBtnF.type = 'button';
          delBtnF.className = 'menu-delete';
          delBtnF.textContent = 'Remove';
          fd.appendChild(delBtnF);

          document.body.appendChild(fd);

          const btnRect = menuBtn.getBoundingClientRect();
          fd.style.opacity = '0';
          fd.style.pointerEvents = 'none';

          requestAnimationFrame(() => {
            const fdRect = fd.getBoundingClientRect();
            let top = btnRect.bottom + 6;
            let left = btnRect.right - fdRect.width;

            const overflowRight = left + fdRect.width - window.innerWidth;
            if (overflowRight > 8) left = Math.max(8, left - overflowRight - 8);

            if (top + fdRect.height > window.innerHeight - 8) {
              top = btnRect.top - fdRect.height - 6;
              if (top < 8) top = 8;
            }

            fd.style.left = `${Math.round(left)}px`;
            fd.style.top = `${Math.round(top)}px`;

            fd.classList.remove('hidden');
            fd.style.opacity = '';
            fd.style.pointerEvents = '';

            document.addEventListener('click', onDocClick);
            window.addEventListener('resize', closeFloatingMenu);
            window.addEventListener('scroll', closeFloatingMenu, true);
            document.addEventListener('keydown', onKeyDown);
          });

          editBtnF.addEventListener('click', (e) => {
            e.stopPropagation();
            closeFloatingMenu();
            startEditing(c);
          });

          delBtnF.addEventListener('click', async (e) => {
            e.stopPropagation();
            closeFloatingMenu();
            if (!confirm(`Remove class "${c.subject}: ${c.course_name}"?`)) return;
            try {
              await DataModel.deleteClass(c.id);
              tr.remove();
            } catch (err) {
              console.error('Delete failed', err);
              alert('Failed to delete class.');
            }
          });
        });
      }

      classesBody.appendChild(tr);
    });
  }

  // ----------------- CLASSES helpers -----------------
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

  // ----------------- ASSIGNMENTS (agenda) -----------------
  async function loadAssignments() {
    if (!assignmentList) return;

    const res = await fetch('/api/assignments', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      assignmentList.innerHTML = '<li>Error loading assignments.</li>';
      return;
    }

    const assignments = await res.json();
    assignmentList.innerHTML = '';

    if (assignments.length === 0) {
      assignmentList.innerHTML = '<li>No assignments yet. Add one above.</li>';
    } else {
      assignments.forEach(a => {
        const li = document.createElement('li');
        li.dataset.id = a.id;
        li.dataset.dueDate = a.due_date;

        const top = document.createElement('div');
        top.style.display = 'flex';
        top.style.justifyContent = 'space-between';
        top.style.alignItems = 'center';

        const main = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = a.title;
        main.appendChild(title);

        const meta = document.createElement('div');
        meta.style.fontSize = '0.8rem';
        meta.textContent = `${a.course_code || 'No course'} • Due ${new Date(a.due_date).toLocaleDateString()}`;
        main.appendChild(document.createElement('br'));
        main.appendChild(meta);

        top.appendChild(main);

        const actions = document.createElement('div');

        const doneCheckbox = document.createElement('input');
        doneCheckbox.type = 'checkbox';
        doneCheckbox.checked = a.status === 'done';
        doneCheckbox.title = 'Mark complete';
        doneCheckbox.addEventListener('change', () => {
          updateAssignmentStatus(a.id, doneCheckbox.checked ? 'done' : 'pending');
        });
        actions.appendChild(doneCheckbox);

        const delBtn = document.createElement('button');
        delBtn.textContent = 'X';
        delBtn.style.marginLeft = '6px';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', () => deleteAssignment(a.id));

        actions.appendChild(delBtn);

        top.appendChild(actions);
        li.appendChild(top);

        if (a.notes) {
          const notes = document.createElement('div');
          notes.style.fontSize = '0.8rem';
          notes.style.marginTop = '0.25rem';
          notes.textContent = a.notes;
          li.appendChild(notes);
        }

        assignmentList.appendChild(li);
      });
    }

    buildCalendar();
  }

  async function addAssignment(e) {
    e.preventDefault();
    const titleEl = document.getElementById('assignment-title');
    const courseEl = document.getElementById('assignment-course');
    const dateEl = document.getElementById('assignment-date');
    const notesEl = document.getElementById('assignment-notes');
    if (!titleEl || !dateEl) return;

    const title = titleEl.value.trim();
    const course_code = (courseEl?.value || '').trim();
    const due_date = dateEl.value;
    const notes = (notesEl?.value || '').trim();

    if (!title || !due_date) return;

    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ title, course_code, due_date, notes })
    });

    if (!res.ok) {
      alert('Error adding assignment');
      return;
    }

    if (assignmentForm) assignmentForm.reset();
    loadAssignments();
  }

  async function updateAssignmentStatus(id, status) {
    const res = await fetch('/api/assignments/' + id, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      alert('Error updating assignment');
      loadAssignments();
    } else {
      buildCalendar();
    }
  }

  async function deleteAssignment(id) {
    if (!confirm('Delete this assignment?')) return;

    const res = await fetch('/api/assignments/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      alert('Error deleting assignment');
    }
    loadAssignments();
  }

  assignmentForm?.addEventListener('submit', addAssignment);

  // ----------------- CALENDAR -----------------
  function getAssignmentsByDay(year, month) {
    if (!assignmentList) return {};
    const items = [...assignmentList.querySelectorAll('li[data-due-date]')];
    const map = {};
    items.forEach(li => {
      const due = new Date(li.dataset.dueDate);
      if (due.getFullYear() === year && due.getMonth() === month) {
        const day = due.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(li.dataset.id);
      }
    });
    return map;
  }

  function buildCalendar() {
    if (!calBody || !calMonthYear) return;

    calBody.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const monthNames = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];

    calMonthYear.textContent = `${monthNames[currentMonth]} ${currentYear}`;

    const today = new Date();
    const isThisMonth =
      today.getFullYear() === currentYear &&
      today.getMonth() === currentMonth;

    const assignmentsByDay = getAssignmentsByDay(currentYear, currentMonth);

    let date = 1;
    for (let i = 0; i < 6; i++) {
      const row = document.createElement('tr');

      for (let j = 0; j < 7; j++) {
        const cell = document.createElement('td');

        if (i === 0 && j < firstDay) {
          cell.textContent = '';
        } else if (date > daysInMonth) {
          cell.textContent = '';
        } else {
          cell.textContent = String(date);

          if (isThisMonth && date === today.getDate()) {
            cell.style.border = '2px solid #000';
            cell.style.borderRadius = '4px';
          }

          if (assignmentsByDay[date]) {
            cell.style.backgroundColor = '#ffe5b4';
            cell.style.cursor = 'pointer';
            cell.title = `${assignmentsByDay[date].length} assignment(s) due`;

            cell.addEventListener('click', () => {
              const firstId = assignmentsByDay[date][0];
              const target = assignmentList?.querySelector(`li[data-id="${firstId}"]`);
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.style.outline = '2px solid orange';
                setTimeout(() => (target.style.outline = 'none'), 1500);
              }
            });
          }

          date++;
        }

        row.appendChild(cell);
      }

      calBody.appendChild(row);
      if (date > daysInMonth) break;
    }
  }

  calPrev?.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    buildCalendar();
  });

  calNext?.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    buildCalendar();
  });

  // ----------------- STUDY GROUPS (similar courses) -----------------
  async function loadStudyGroups() {
    if (!studyGroupList) return;

    const res = await fetch('/api/study-groups', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      studyGroupList.innerHTML = '<li>Error loading study groups.</li>';
      return;
    }

    const groups = await res.json();
    studyGroupList.innerHTML = '';

    if (groups.length === 0) {
      studyGroupList.innerHTML = '<li>No groups yet. Click the button to find or create groups based on your courses.</li>';
      return;
    }

    groups.forEach(g => {
      const li = document.createElement('li');
      const label = g.course_code
        ? `${g.name} (${g.course_code})`
        : g.name;
      li.textContent = label;
      studyGroupList.appendChild(li);
    });
  }

  async function autoJoinGroups() {
    if (!autoGroupBtn) return;
    autoGroupBtn.disabled = true;
    autoGroupBtn.textContent = 'Working...';

    const res = await fetch('/api/study-groups/auto-join', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    autoGroupBtn.disabled = false;
    autoGroupBtn.textContent = 'Find / Create Groups from My Courses';

    if (!res.ok) {
      alert('Error creating/joining groups');
      return;
    }

    const data = await res.json();
    if (!data.groups || data.groups.length === 0) {
      alert('No courses found on your profile. Add courses first on the Profile page.');
    } else {
      alert('Study groups updated based on your courses!');
    }

    loadStudyGroups();
  }

  autoGroupBtn?.addEventListener('click', autoJoinGroups);

  // ----------------- INITIAL LOAD -----------------
  loadAndRenderClasses();
  loadAssignments();
  loadStudyGroups();
  buildCalendar();
}
