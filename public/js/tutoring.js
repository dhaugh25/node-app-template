document.addEventListener('DOMContentLoaded', initTutoring);

async function initTutoring() {
  const tutorForm = document.getElementById('tutorForm');
  const tutorsList = document.getElementById('tutorsList');

  // require DataModel token be set by the dashboard controller
  if (!window.DataModel) return console.warn('DataModel required for tutoring.');
  DataModel.setToken(localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken'));

  // load both sets
  let myClasses = [];
  try { myClasses = await DataModel.getClasses(); } catch(e){ console.warn('Could not load classes', e); }

  async function refreshTutors() {
    tutorsList.innerHTML = '<div class="sub">Loading tutoring slots…</div>';
    try {
      const resp = await fetch('/api/tutors', { headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() } });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Failed to load tutors');
      renderTutors(data.tutors || []);
    } catch (err) {
      console.error(err);
      tutorsList.innerHTML = `<div class="sub">Failed to load tutors</div>`;
    }
  }

  function getAuthHeader() {
    const tok = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    return tok ? 'Bearer ' + tok : '';
  }

  function renderTutors(tutors) {
    tutorsList.innerHTML = '';
    if (!tutors.length) {
      tutorsList.innerHTML = '<div class="sub">No tutoring slots yet.</div>';
      return;
    }
    tutors.forEach(slot => {
      const el = document.createElement('div');
      el.className = 'tutor-card card-row';
      el.style.padding = '10px';
      // determine conflict with myClasses
      const conflict = findConflict(slot, myClasses);
      el.innerHTML = `
        <div class="class-left">
          <div style="font-weight:700">${escapeHtml(slot.course_name)} <span style="font-weight:600; color:#9ca3af">(${escapeHtml(slot.subject)})</span></div>
          <div class="class-meta">${escapeHtml(slot.days)} • ${time12(slot.start_time)}–${time12(slot.end_time)}</div>
          <div class="class-meta" style="margin-top:6px; color:#94a3b8">${escapeHtml(slot.details || '')} — by ${escapeHtml(slot.full_name || slot.user_email)}</div>
        </div>
        <div class="class-right">
          ${slot.user_email === (getCurrentEmail()) ? `<button class="btn warn small" data-id="${slot.id}">Delete</button>` : ''}
        </div>
        ${conflict ? `<div style="width:100%; margin-top:8px; color:#ff6b6b; font-weight:600">Conflict with your class: ${escapeHtml(conflict.course_name)} (${escapeHtml(conflict.days)} ${time12(conflict.start_time)}–${time12(conflict.end_time)})</div>` : ''}
      `;
      // wire delete
      const delBtn = el.querySelector('button[data-id]');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!confirm('Remove this tutoring slot?')) return;
        try {
          const id = delBtn.getAttribute('data-id');
          const resp = await fetch(`/api/tutors/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Authorization': getAuthHeader() }});
          if (!resp.ok) throw new Error('Delete failed');
          await refreshTutors();
        } catch (e) {
          alert(e.message || 'Delete failed');
          console.error(e);
        }
      });

      tutorsList.appendChild(el);
    });
  }

  function getCurrentEmail() {
    // DataModel doesn't expose email; decode token simply (lightweight)
    const tok = (localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken') || '');
    try {
      const payload = JSON.parse(atob(tok.split('.')[1]));
      return payload.email;
    } catch (e) { return null; }
  }

  // Add slot
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
        headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
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

  // Utility: find first class that conflicts with slot (by day string and time overlap)
  function findConflict(slot, classes) {
    if (!classes || !classes.length) return null;
    // Normalize: compare day tokens: if any day token in slot.days appears in class.days
    const slotDays = dayTokens(slot.days);
    return classes.find(c => {
      const classDays = dayTokens(c.days);
      const share = slotDays.some(d => classDays.includes(d));
      if (!share) return false;
      // time overlap: class.start_time < slot.end_time && class.end_time > slot.start_time
      const sStart = toMinutes(slot.start_time);
      const sEnd = toMinutes(slot.end_time);
      const cStart = toMinutes(c.start_time);
      const cEnd = toMinutes(c.end_time);
      return (cStart < sEnd && cEnd > sStart);
    }) || null;
  }

  function dayTokens(str) {
    if (!str) return [];
    return String(str).split(/[,\s\/]+/).map(s => s.trim()).filter(Boolean).map(s => s.toUpperCase());
    // e.g. "M/W/F" -> ["M","W","F"]
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
    // input may be "14:30:00" or "14:30"
    const parts = String(t).split(':'); let h = parseInt(parts[0],10); let m = parts[1] ? parts[1].padStart(2,'0') : '00';
    const ampm = h >= 12 ? 'PM' : 'AM'; let hour = h % 12 || 12;
    return `${hour}:${m} ${ampm}`;
  }
  function escapeHtml(s){ if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"'`=\/]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c])); }

  // initial load
  refreshTutors();
}