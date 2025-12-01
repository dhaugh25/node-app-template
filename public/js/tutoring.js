// public/js/tutoring.js  — replace existing file with this
document.addEventListener('DOMContentLoaded', initTutoring);

async function initTutoring() {
  const tutorForm = document.getElementById('tutorForm');
  const tutorsList = document.getElementById('tutorsList');
  if (!tutorForm || !tutorsList) return;

  // Set DataModel token if available
  if (window.DataModel) {
    DataModel.setToken(localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken'));
  }

  function getAuthHeader() {
    const tok = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken') || '';
    return tok ? { 'Authorization': 'Bearer ' + tok } : {};
  }

  function getCurrentEmail() {
    const tok = (localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken') || '');
    try {
      const payload = JSON.parse(atob(tok.split('.')[1]));
      return payload.email;
    } catch (e) { return null; }
  }

  async function refreshTutors() {
  tutorsList.innerHTML = '<div class="sub">Loading tutoring slots…</div>';
  try {
    const resp = await fetch('/api/tutors', { headers: { 'Content-Type': 'application/json', ...(getAuthHeader()) }});
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'Failed to load tutors');

    const tutors = data.tutors || [];
    const onlyMine = !!data.onlyMine;

    // If there are no tutors to show, display an explanatory message
    if (tutors.length === 0) {
      tutorsList.innerHTML = ''; // clear loading text

      if (onlyMine) {
        // user has no classes and we only returned their own (none)
        const explain = document.createElement('div');
        explain.className = 'sub';
        explain.style.marginTop = '8px';
        explain.textContent = "You don't have any classes yet — add a class to see tutoring slots from other students.";
        tutorsList.appendChild(explain);
        return;
      } else {
        // user has classes but no matching slots found
        const explain = document.createElement('div');
        explain.className = 'sub';
        explain.style.marginTop = '8px';
        explain.textContent = "No tutoring slots match your classes yet. You can add a slot or check back later.";
        tutorsList.appendChild(explain);
        return;
      }
    }

    // otherwise render as normal
    renderTutors(tutors);
  } catch (err) {
    console.error(err);
    tutorsList.innerHTML = `<div class="sub">Failed to load tutors</div>`;
  }
}

  // RENDER
  async function renderTutors(tutors) {
    tutorsList.innerHTML = '';
    // load my classes once for conflict checks
    let myClasses = [];
    try { myClasses = await (DataModel ? DataModel.getClasses() : Promise.resolve([])); } catch (e) { myClasses = []; }

    if (!tutors.length) {
      tutorsList.innerHTML = '<div class="sub">No tutoring slots yet.</div>';
      return;
    }

    const myEmail = getCurrentEmail();

    tutors.forEach(slot => {
      const el = document.createElement('div');
      el.className = 'tutor-card';

      // conflict detection (first conflict)
      const conflict = findConflict(slot, myClasses);

      // We'll show title and meta on one line
      el.innerHTML = `
        <div class="tutor-row">
          <div class="tutor-info">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="min-width:0;">
                <span class="tutor-title">${escapeHtml(slot.course_name)} (${escapeHtml(slot.subject)})</span>
                <div class="tutor-meta">${escapeHtml(slot.days)} • ${time12(slot.start_time)}–${time12(slot.end_time)}</div>
                <div class="tutor-details" style="margin-top:6px; color:#94a3b8">${escapeHtml(slot.details || '')}</div>
                <div class="tutor-user" style="margin-top:6px; color:#64748b">Posted by: ${escapeHtml(slot.full_name || slot.user_email)}</div>
              </div>
            </div>
          </div>

          <div class="tutor-actions" style="display:flex; gap:8px; align-items:center;">
            ${slot.user_email === myEmail ? `<button class="btn warn small delete-slot" data-id="${slot.id}">Delete</button>` : ''}
            <button class="btn ghost small details-btn" data-id="${slot.id}">Details</button>
            <button class="btn ok small join-btn" data-id="${slot.id}">Join</button>
            <span class="join-count" data-id="${slot.id}" style="margin-left:6px; color:#cbd5e1"></span>
          </div>
        </div>
        ${conflict ? `<div class="tutor-conflict">Conflict with your class: ${escapeHtml(conflict.course_name)} (${escapeHtml(conflict.days)} ${time12(conflict.start_time)}–${time12(conflict.end_time)})</div>` : ''}
      `;

      // wire delete (owner)
      const delBtn = el.querySelector('.delete-slot');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!confirm('Remove this tutoring slot?')) return;
        try {
          const id = delBtn.getAttribute('data-id');
          const r = await fetch(`/api/tutors/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getAuthHeader() });
          if (!r.ok) throw new Error('Delete failed');
          await refreshTutors();
        } catch (e) {
          alert(e.message || 'Delete failed');
        }
      });

      // Details button: loads joiners and shows modal
      const detailsBtn = el.querySelector('.details-btn');
      if (detailsBtn) detailsBtn.addEventListener('click', async () => {
        const id = detailsBtn.getAttribute('data-id');
        try {
          const resp = await fetch(`/api/tutors/${encodeURIComponent(id)}/joins`, { headers: { 'Content-Type':'application/json', ...getAuthHeader() }});
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.message || 'Failed to load joiners');
          showJoinersModal(id, data.joins || []);
        } catch (e) {
          alert(e.message || 'Could not load details.');
          console.error(e);
        }
      });

      // Join/Leave button (state will be refreshed below)
      const joinBtn = el.querySelector('.join-btn');
      const joinCountSpan = el.querySelector('.join-count');

      async function refreshJoinState() {
        try {
          // fetch joiners quickly
          const resp = await fetch(`/api/tutors/${encodeURIComponent(slot.id)}/joins`, { headers: { 'Content-Type':'application/json', ...getAuthHeader() }});
          const data = await resp.json();
          const joins = data.joins || [];
          const joined = joins.some(j => j.user_email === myEmail);
          joinCountSpan.textContent = joins.length ? `${joins.length}` : '';
          if (joined) {
            joinBtn.textContent = 'Joined';
            joinBtn.classList.remove('ok'); joinBtn.classList.add('ghost');
          } else {
            joinBtn.textContent = 'Join';
            joinBtn.classList.remove('ghost'); joinBtn.classList.add('ok');
          }
        } catch (e) {
          // ignore
        }
      }

      if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
          const id = joinBtn.getAttribute('data-id');
          try {
            const currently = joinBtn.textContent.trim().toLowerCase();
            if (currently === 'join') {
              const r = await fetch(`/api/tutors/${encodeURIComponent(id)}/join`, { method: 'POST', headers: { 'Content-Type':'application/json', ...getAuthHeader() }});
              const d = await r.json();
              if (!r.ok) throw new Error(d.message || 'Join failed');
            } else {
              const r = await fetch(`/api/tutors/${encodeURIComponent(id)}/join`, { method: 'DELETE', headers: getAuthHeader() });
              const d = await r.json();
              if (!r.ok) throw new Error(d.message || 'Leave failed');
            }
            await refreshJoinState();
          } catch (e) {
            alert(e.message || 'Failed to update join state.');
            console.error(e);
          }
        });
      }

      // initial join state
      refreshJoinState();

      tutorsList.appendChild(el);
    });
  }

  // small modal to display joiners
  function showJoinersModal(slotId, joins) {
    // remove existing
    const existing = document.getElementById('joinersModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'joinersModal';
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '99999';
    modal.style.background = 'rgba(3,7,18,0.6)';

    const panel = document.createElement('div');
    panel.style.background = 'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02))';
    panel.style.border = '1px solid rgba(255,255,255,.08)';
    panel.style.padding = '18px';
    panel.style.borderRadius = '12px';
    panel.style.minWidth = '320px';
    panel.style.maxWidth = '600px';
    panel.style.maxHeight = '70vh';
    panel.style.overflow = 'auto';
    panel.innerHTML = `<h3 style="margin:0 0 8px 0">Joined (${joins.length})</h3>`;

    if (!joins.length) {
      const p = document.createElement('div');
      p.className = 'sub';
      p.textContent = 'No one has joined yet.';
      panel.appendChild(p);
    } else {
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '8px';
      joins.forEach(j => {
        const item = document.createElement('div');
        item.style.padding = '8px';
        item.style.borderRadius = '8px';
        item.style.background = 'rgba(255,255,255,0.02)';
        item.innerHTML = `<div style="font-weight:700">${escapeHtml(j.full_name || j.user_email)}</div>
                          <div style="color:#94a3b8; font-size:0.9rem">${escapeHtml(j.user_email)} • Joined ${new Date(j.joined_at).toLocaleString()}</div>`;
        list.appendChild(item);
      });
      panel.appendChild(list);
    }

    const close = document.createElement('button');
    close.textContent = 'Close';
    close.className = 'btn';
    close.style.marginTop = '12px';
    close.addEventListener('click', () => modal.remove());
    panel.appendChild(close);

    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  // Add slot handling (unchanged from previous)
  tutorForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const payload = {
      course_name: document.getElementById('tutorCourse').value.trim(),
      subject: document.getElementById('tutorSubject').value.trim(),
      days: document.getElementById('tutorDays').value.trim(),
      start_time: document.getElementById('tutorStart').value,
      end_time: document.getElementById('tutorEnd').value,
      details: document.getElementById('tutorDetails').value.trim()
    };
    if (!payload.course_name || !payload.subject || !payload.days || !payload.start_time || !payload.end_time) {
      alert('Please fill in all required fields.');
      return;
    }
    try {
      const resp = await fetch('/api/tutors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Failed to add slot');
      tutorForm.reset();
      await refreshTutors();
    } catch (err) {
      alert(err.message || 'Add failed');
      console.error(err);
    }
  });

  // Utilities

  function dayTokens(str) {
    if (!str) return [];
    return String(str).split(/[,\s\/]+/).map(s => s.trim()).filter(Boolean).map(s => s.toUpperCase());
  }
  function toMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    const h = parseInt(parts[0],10) || 0;
    const m = parseInt(parts[1],10) || 0;
    return h*60 + m;
  }
  function time12(t) {
    if (!t) return '';
    const parts = String(t).split(':'); let h = parseInt(parts[0],10); let m = parts[1] ? parts[1].padStart(2,'0') : '00';
    const ampm = h >= 12 ? 'PM' : 'AM'; let hour = h % 12 || 12;
    return `${hour}:${m} ${ampm}`;
  }
  function findConflict(slot, classes) {
    if (!classes || !classes.length) return null;
    const slotDays = dayTokens(slot.days);
    return classes.find(c => {
      const classDays = dayTokens(c.days);
      const share = slotDays.some(d => classDays.includes(d));
      if (!share) return false;
      const sStart = toMinutes(slot.start_time);
      const sEnd = toMinutes(slot.end_time);
      const cStart = toMinutes(c.start_time);
      const cEnd = toMinutes(c.end_time);
      return (cStart < sEnd && cEnd > sStart);
    }) || null;
  }

  function escapeHtml(s){ if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"'`=\/]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c])); }

  // initial load
  refreshTutors();
}