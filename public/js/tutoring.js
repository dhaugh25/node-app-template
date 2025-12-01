// public/js/tutoring.js
document.addEventListener('DOMContentLoaded', initTutoring);

async function initTutoring() {
  // DOM
  const tutorForm = document.getElementById('tutorForm');
  const tutorsList = document.getElementById('tutorsList');
  const courseSelect = document.getElementById('tutorCourse');
  const subjectSelect = document.getElementById('tutorSubject');
  const courseOther = document.getElementById('tutorCourseOther');
  const subjectOther = document.getElementById('tutorSubjectOther');
  const daysEl = document.getElementById('tutorDays');
  const startEl = document.getElementById('tutorStart');
  const endEl = document.getElementById('tutorEnd');
  const detailsEl = document.getElementById('tutorDetails');

  if (!tutorForm || !tutorsList || !courseSelect || !subjectSelect) {
    console.warn('tutoring.js: required DOM elements missing.');
    return;
  }

  // Auth / DataModel bootstrap
  function getStoredToken() { return localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken') || ''; }
  function getAuthHeader() { const t = getStoredToken(); return t ? { Authorization: 'Bearer ' + t } : {}; }
  if (window.DataModel && typeof DataModel.setToken === 'function') {
    const tok = getStoredToken();
    if (tok) {
      try { DataModel.setToken(tok); console.debug('tutoring.js: DataModel token set from storage'); } catch(e){console.warn(e);}
    }
  }

  // Fetch classes (DataModel preferred)
  async function fetchClasses() {
    try {
      if (window.DataModel && typeof DataModel.getClasses === 'function') {
        try {
          const dm = await DataModel.getClasses();
          if (Array.isArray(dm) && dm.length) { console.debug('tutoring.js: loaded classes from DataModel:', dm.length); return dm; }
        } catch(err){ console.debug('tutoring.js: DataModel.getClasses failed, falling back'); }
      }
      const r = await fetch('/api/classes', { headers: Object.assign({ Accept: 'application/json' }, getAuthHeader()) });
      if (!r.ok) { console.warn('tutoring.js: /api/classes status', r.status); return []; }
      const j = await r.json();
      const arr = j.classes || [];
      console.debug('tutoring.js: loaded classes from /api/classes:', arr.length);
      return arr;
    } catch (e) {
      console.error('tutoring.js: fetchClasses error', e);
      return [];
    }
  }

  // Helpers: accept multiple possible field names
  function getField(row, ...names) {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== null) return String(row[n]).trim();
    }
    return '';
  }

  // Heuristics
  function looksLikeCode(s) {
    if (!s) return false;
    const str = String(s).trim();
    if (/\d/.test(str) && str.length <= 15) return true;         // contains digits (likely code)
    if (/^[A-Za-z]{2,}\s*[\-._]?\s*\d{2,}/.test(str)) return true; // CIS 425, CIS-425, CIS425
    return false;
  }

  // Build mapping code->title and populate courseSelect defensively
  let codeToTitle = new Map();

  async function populateClassSelectors() {
    try {
      const classesArr = await fetchClasses();

      // temporary sets
      const detectedCodes = new Map();   // code -> first title found
      const fallbackCodes = new Map();   // fallback items if no detected codes
      const titles = new Map();

      const decisions = [];

      classesArr.forEach((r, idx) => {
        // be flexible about property names
        const rawCourseName = getField(r, 'course_name', 'courseName', 'title', 'name'); // maybe title
        const rawSubject    = getField(r, 'subject', 'course_code', 'code', 'courseCode'); // maybe code
        // prefer rawSubject as code if looks like code, otherwise prefer rawCourseName
        let code = '', title = '';

        const subjectVal = rawSubject;
        const courseVal = rawCourseName;

        // If either field is actually a JSON object or contains newlines, normalize
        const a = courseVal || '';
        const b = subjectVal || '';

        // Decide
        if (looksLikeCode(b) && !looksLikeCode(a)) { code = b; title = a; decisions.push({idx, chosen:'b->code', a, b}); }
        else if (looksLikeCode(a) && !looksLikeCode(b)) { code = a; title = b; decisions.push({idx, chosen:'a->code', a, b}); }
        else if (looksLikeCode(b) && looksLikeCode(a)) {
          // both look like codes — choose the shorter one as code
          code = (a.length <= b.length ? a : b); title = (a.length <= b.length ? b : a);
          decisions.push({idx, chosen:'both-codes-shorter-chosen', a, b});
        } else {
          // neither looks clearly like a code — fallback to conventional mapping: subject->code, course_name->title
          code = b || a;
          title = a || b;
          decisions.push({idx, chosen:'fallback-subject->code', a, b});
        }

        // collect
        if (code) {
          // prefer first seen title for a code
          if (!detectedCodes.has(code)) detectedCodes.set(code, title || '');
        } else if (b || a) {
          // fallback: add both to fallbackCodes so user can still pick something
          if (b && !fallbackCodes.has(b)) fallbackCodes.set(b, a || '');
          if (a && !fallbackCodes.has(a)) fallbackCodes.set(a, b || '');
        }

        if (title) titles.set(title, title);
      });

      console.debug('tutoring.js mapping decisions:', decisions);

      // If detectedCodes is empty, use fallbackCodes (guarantee dropdown not empty)
      if (detectedCodes.size === 0 && fallbackCodes.size > 0) {
        for (const [k,v] of fallbackCodes.entries()) detectedCodes.set(k, v);
        console.debug('tutoring.js: using fallback values for course codes');
      }

      // Always ensure we include distinct codes from either detectedCodes or fallback
      codeToTitle = new Map(detectedCodes); // copy

      // If STILL empty (rare), add any subject/course_name raw values
      if (codeToTitle.size === 0 && classesArr.length) {
        classesArr.forEach(r => {
          const rawSubject = getField(r, 'subject', 'course_code', 'code', 'courseCode');
          const rawCourseName = getField(r, 'course_name', 'courseName', 'title', 'name');
          if (rawSubject && !codeToTitle.has(rawSubject)) codeToTitle.set(rawSubject, rawCourseName || '');
          else if (rawCourseName && !codeToTitle.has(rawCourseName)) codeToTitle.set(rawCourseName, rawSubject || '');
        });
        console.debug('tutoring.js: fallback added raw values to course list');
      }

      // Build courseSelect
      courseSelect.innerHTML = '';
      const ph = document.createElement('option'); ph.value = ''; ph.textContent = '— choose a course code —'; courseSelect.appendChild(ph);

      for (const [code, title] of codeToTitle.entries()) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code;
        courseSelect.appendChild(opt);
      }

      // Add Other option
      const otherOpt = document.createElement('option');
      otherOpt.value = '__OTHER__';
      otherOpt.textContent = 'Other (type below)';
      courseSelect.appendChild(otherOpt);

      // Prepare subjectSelect (disabled until course chosen)
      subjectSelect.innerHTML = '';
      const sph = document.createElement('option'); sph.value = ''; sph.textContent = '— subject will auto-fill when you pick a course —'; subjectSelect.appendChild(sph);
      subjectSelect.disabled = true;

      console.debug('tutoring.js: populated courseSelect — codes:', codeToTitle.size);
    } catch (err) {
      console.error('tutoring.js: populateClassSelectors error', err);
    }
  }

  // Wire course change to auto-fill subject
  function wireCourseBehavior() {
    courseSelect.addEventListener('change', () => {
      const val = courseSelect.value;
      if (!val) {
        subjectSelect.disabled = true;
        subjectSelect.innerHTML = '';
        const ph = document.createElement('option'); ph.value=''; ph.textContent='— choose a subject title —'; subjectSelect.appendChild(ph);
        courseOther.style.display = 'none'; subjectOther.style.display = 'none';
        return;
      }
      if (val === '__OTHER__') {
        // show both other inputs for manual entry
        courseOther.style.display = '';
        subjectOther.style.display = '';
        subjectSelect.disabled = true;
        subjectSelect.innerHTML = '';
        const ph = document.createElement('option'); ph.value=''; ph.textContent='— other subject (type below) —'; subjectSelect.appendChild(ph);
        subjectOther.focus();
        return;
      }

      // selected real code: populate single subject option and disable control
      const mapped = codeToTitle.get(val) || '';
      subjectSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = mapped;
      opt.textContent = mapped || '(No title found)';
      subjectSelect.appendChild(opt);
      subjectSelect.disabled = true;
      courseOther.style.display = 'none';
      courseOther.value = '';
      subjectOther.style.display = 'none';
      subjectOther.value = '';
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function toMinutes(t) {
    if (!t) return null;
    const parts = String(t).split(':').map(x => parseInt(x, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0]*60 + parts[1];
  }
  function timesOverlap(s1,e1,s2,e2) {
    if (s1 === null || e1 === null || s2 === null || e2 === null) return false;
    return Math.max(s1,s2) < Math.min(e1,e2);
  }
  function parseDays(daysStr) {
    if (!daysStr) return new Set();
    const cleaned = String(daysStr).replace(/\s+/g,'');
    const parts = cleaned.split(/[,\/\-]+/);
    if (parts.length === 1 && parts[0].length > 1 && !parts[0].includes('/')) {
      return new Set(parts[0].split(''));
    }
    return new Set(parts.filter(Boolean));
  }
  function daysIntersect(a,b) { for (const x of a) if (b.has(x)) return true; return false; }

  function detectConflictForSlot(slot, classes) {
    const sDays = parseDays(slot.days);
    const sS = toMinutes(slot.start_time);
    const sE = toMinutes(slot.end_time);
    for (const c of (classes || [])) {
      const cDays = parseDays(c.days || c.days_string || c.days_str);
      const cS = toMinutes(c.start_time || c.start || c.s);
      const cE = toMinutes(c.end_time || c.end || c.e);
      if (!cDays.size || cS === null || cE === null) continue;
      if (!daysIntersect(sDays, cDays)) continue;
      if (timesOverlap(sS, sE, cS, cE)) return { conflict:true, classRow: c };
    }
    return { conflict:false, classRow:null };
  }

 function getCurrentUserEmailFromToken() {
  try {
    const tok = getStoredToken();
    if (!tok) return null;
    const payload = JSON.parse(atob(tok.split('.')[1]));
    return payload && payload.email ? payload.email.toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

// helper to render joiners list (array of objects or strings)
function renderJoinersList(joinersArr) {
  if (!Array.isArray(joinersArr) || joinersArr.length === 0) {
    return 'No one has joined yet.';
  }
  // Map each joiner to display name (full_name or name) or fallback to email
  const display = joinersArr.map(j => {
    if (!j) return '(unknown)';
    if (typeof j === 'string') return j; // email string
    // if object, prefer full_name, then name, then email
    if (j.full_name) return j.full_name;
    if (j.name) return j.name;
    if (j.email) return j.email;
    return '(unknown)';
  });
  return display.join('\n');
}

// Try to unjoin via DELETE; fall back to any known variations
async function tryUnjoin(slotId) {
  const attempts = [
    { method: 'DELETE', url: `/api/tutors/${slotId}/join` },
    { method: 'POST',   url: `/api/tutors/${slotId}/leave` },
    { method: 'POST',   url: `/api/tutors/${slotId}/unjoin` },
  ];
  for (const a of attempts) {
    try {
      const r = await fetch(a.url, { method: a.method, headers: getAuthHeader() });
      if (r.ok) return await r.json().catch(()=>({}));
      // if 404 or 405 try next
    } catch (e) {
      // network error — try next
    }
  }
  throw new Error('Failed to unjoin (no supported endpoint responded)');
}

// Try to join via POST /api/tutors/:id/join
async function tryJoin(slotId) {
  const r = await fetch(`/api/tutors/${slotId}/join`, { method: 'POST', headers: Object.assign({'Content-Type':'application/json'}, getAuthHeader()) });
  if (!r.ok) {
    const j = await r.json().catch(()=>({}));
    throw new Error(j.message || `Join failed (${r.status})`);
  }
  return await r.json().catch(()=>({}));
}

// createTutorCard now supports join/leave toggle and shows joined list in Details
function createTutorCard(slot, classes, currentUserEmail) {
  const card = document.createElement('div');
  card.className = 'tutor-card friend-card';

  // Top
  const top = document.createElement('div'); top.className = 'top';
  const title = document.createElement('div'); title.className = 'title';
  const subj = (slot.subject || '').trim();
  const code = (slot.course_name || '').trim();
  title.innerHTML = `${escapeHtml(subj || '(No title)')} <span style="opacity:.9; font-weight:600;">(${escapeHtml(code || '')})</span>`;
  const meta = document.createElement('div'); meta.className = 'meta';
  function fmt(t){ if(!t) return ''; const p=String(t).split(':').map(x=>parseInt(x,10)); if(isNaN(p[0])) return t; const hr=p[0], min=p[1]||0, am=hr>=12?'PM':'AM', h12=((hr+11)%12)+1; return `${h12}:${String(min).padStart(2,'0')} ${am}`; }
  meta.textContent = `${slot.days || ''} • ${fmt(slot.start_time)}–${fmt(slot.end_time)}`;

  top.appendChild(title); top.appendChild(meta); card.appendChild(top);

  // Details
  if (slot.details) {
    const d = document.createElement('div'); d.className = 'details'; d.textContent = slot.details; card.appendChild(d);
  }

  // Posted by
  const posted = document.createElement('div'); posted.className = 'posted'; posted.textContent = `Posted by: ${slot.user_email || 'unknown'}`; card.appendChild(posted);

  // Conflict detection (optional)
  if (typeof detectConflictForSlot === 'function') {
    const conflict = detectConflictForSlot(slot, classes || []);
    if (conflict && conflict.conflict) {
      const c = conflict.classRow || {};
      const cm = document.createElement('div'); cm.className = 'conflict';
      const classTitle = c.course_name || c.subject || 'your class';
      const cd = c.days || '';
      const ct = `${fmt(c.start_time)}–${fmt(c.end_time)}`;
      cm.textContent = `Conflict with your class: ${classTitle} (${cd} ${ct})`;
      card.appendChild(cm);
    }
  }

  // actions row + joiner count
  const actions = document.createElement('div'); actions.className = 'actions';
  const joinCountSpan = document.createElement('span');
  joinCountSpan.style.marginRight = '6px';
  joinCountSpan.style.fontWeight = '600';
  joinCountSpan.style.color = '#d1d5db';
  // compute initial joiners count from slot.joiners or slot.join_count or slot.joined
  let joiners = Array.isArray(slot.joiners) ? slot.joiners.slice() : (Array.isArray(slot.joined) ? slot.joined.slice() : []);
  // if server sent only count
  if (!joiners.length && typeof slot.join_count === 'number') {
    joinCountSpan.textContent = `${slot.join_count}`;
  } else {
    joinCountSpan.textContent = `${joiners.length || 0}`;
  }

  // Determine if current user is joined
  const currentEmail = (currentUserEmail || getCurrentUserEmailFromToken() || '').toLowerCase();
  function isUserJoined() {
    if (!joiners || !joiners.length) return false;
    // joiners may be strings or objects
    return joiners.some(j => {
      if (!j) return false;
      if (typeof j === 'string') return j.toLowerCase() === currentEmail;
      if (j.email) return j.email.toLowerCase() === currentEmail;
      // maybe stored as user id - can't compare -> return false
      return false;
    });
  }

  // Join button: toggles join/unjoin
  const joinBtn = document.createElement('button');
  joinBtn.className = 'btn join';

  function refreshJoinBtn() {
    if (isUserJoined()) {
      joinBtn.textContent = 'Joined ✓';
      joinBtn.disabled = false;
      joinBtn.style.opacity = '0.95';
    } else {
      joinBtn.textContent = 'Join';
      joinBtn.disabled = false;
      joinBtn.style.opacity = '1';
    }
    joinCountSpan.textContent = `${joiners.length || (typeof slot.join_count === 'number' ? slot.join_count : 0)}`;
  }
  refreshJoinBtn();

  joinBtn.addEventListener('click', async () => {
    joinBtn.disabled = true;
    try {
      if (!isUserJoined()) {
        // join
        const result = await tryJoin(slot.id);
        // try to update local joiners: if server returned list use it; else push current email
        if (result && Array.isArray(result.joiners)) {
          joiners = result.joiners.slice();
        } else {
          // append current email object if not already present
          if (currentEmail) {
            // push as email string (server will store full user data)
            joiners.push(currentEmail);
          }
        }
        refreshJoinBtn();
      } else {
        // unjoin
        await tryUnjoin(slot.id);
        // remove current user from joiners list
        joiners = joiners.filter(j => {
          if (!j) return false;
          if (typeof j === 'string') return j.toLowerCase() !== currentEmail;
          if (j.email) return j.email.toLowerCase() !== currentEmail;
          return true; // keep unknown entries
        });
        refreshJoinBtn();
      }
    } catch (err) {
      alert(err.message || 'Failed to update join status');
      console.error('join toggle error', err);
    } finally {
      // ensure button enabled so user can toggle again
      joinBtn.disabled = false;
    }
  });

  // Details button: show joiners list in modal/alert
  const detailsBtn = document.createElement('button'); detailsBtn.className = 'btn details'; detailsBtn.textContent = 'Details';
  detailsBtn.addEventListener('click', async () => {
    // If the latest joiners might be stale, try to fetch slot details from API
    try {
      const r = await fetch(`/api/tutors/${slot.id}`, { headers: getAuthHeader() });
      let fresh = null;
      if (r.ok) fresh = await r.json().catch(()=>null);
      const usedJoiners = fresh && fresh.joiners ? fresh.joiners : joiners;
      // Format: show names if available otherwise emails
      const lines = (Array.isArray(usedJoiners) && usedJoiners.length)
        ? usedJoiners.map(j => {
            if (!j) return '(unknown)';
            if (typeof j === 'string') return j;
            return j.full_name || j.name || j.email || '(unknown)';
          })
        : ['No one has joined yet.'];
      const text = `${subj} (${code})\n\n${slot.days} ${fmt(slot.start_time)}–${fmt(slot.end_time)}\n\nDetails:\n${slot.details || '(no details)'}\n\nJoined:\n${lines.join('\n')}`;
      // Use a simple alert for now; replace with modal if you prefer
      alert(text);
    } catch (e) {
      // fallback to local joiners
      const text = `${subj} (${code})\n\n${slot.days} ${fmt(slot.start_time)}–${fmt(slot.end_time)}\n\nDetails:\n${slot.details || '(no details)'}\n\nJoined:\n${renderJoinersList(joiners)}`;
      alert(text);
    }
  });

  // Actions layout: include join count and buttons
  const countContainer = document.createElement('div');
  countContainer.style.display = 'flex';
  countContainer.style.alignItems = 'center';
  const smallLabel = document.createElement('div');
  smallLabel.style.color = '#cbd5e1';
  smallLabel.style.marginRight = '8px';
  smallLabel.textContent = 'Joined:';
  countContainer.appendChild(smallLabel);
  countContainer.appendChild(joinCountSpan);

  const actionsRow = document.createElement('div'); actionsRow.className = 'actions';
  // Append delete if owner
  if (slot.user_email && currentUserEmail && slot.user_email.toLowerCase() === currentUserEmail.toLowerCase()) {
    const del = document.createElement('button'); del.className = 'btn delete'; del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this tutoring slot?')) return;
      try {
        const r = await fetch(`/api/tutors/${slot.id}`, { method: 'DELETE', headers: getAuthHeader() });
        if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error(j.message || `Delete failed (${r.status})`); }
        // refresh list after delete
        await refreshTutors();
      } catch (e) { alert(e.message || 'Delete failed'); }
    });
    actionsRow.appendChild(del);
  }

  actionsRow.appendChild(detailsBtn);
  actionsRow.appendChild(joinBtn);

  // Compose: put count on left and actions on right
  const bottomRow = document.createElement('div');
  bottomRow.style.display = 'flex';
  bottomRow.style.justifyContent = 'space-between';
  bottomRow.style.alignItems = 'center';
  bottomRow.style.marginTop = '8px';
  bottomRow.appendChild(countContainer);
  bottomRow.appendChild(actionsRow);

  card.appendChild(bottomRow);
  return card;
}

// refreshTutors: fetch classes + tutors, compute user email and render cards (uses createTutorCard)
async function refreshTutors() {
  tutorsList.innerHTML = '<div class="sub">Loading tutoring slots…</div>';
  try {
    const [classes, tutorsResp] = await Promise.all([
      fetchClasses(),
      (async () => {
        const resp = await fetch('/api/tutors', { headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()) });
        if (!resp.ok) return { tutors: [] };
        return resp.json();
      })()
    ]);

    const tutors = (tutorsResp && tutorsResp.tutors) ? tutorsResp.tutors : [];
    let currentUserEmail = getCurrentUserEmailFromToken();

    tutorsList.innerHTML = '';
    if (!tutors.length) {
      const m = document.createElement('div'); m.className = 'sub'; m.textContent = 'No tutoring slots found.'; tutorsList.appendChild(m); return;
    }

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gap = '12px';

    for (const t of tutors) {
      const card = createTutorCard(t, classes, currentUserEmail);
      wrap.appendChild(card);
    }
    tutorsList.appendChild(wrap);
  } catch (e) {
    console.error('tutoring.js: refreshTutors error', e);
    tutorsList.innerHTML = '<div class="sub">Error loading tutoring slots</div>';
  }
}

  // Submit form (course_name = code, subject = title)
  tutorForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    let chosenCourse, chosenSubject;
    if (courseSelect.value === '__OTHER__') {
      chosenCourse = (courseOther.value || '').trim();
      chosenSubject = (subjectOther.value || '').trim();
    } else {
      chosenCourse = (courseSelect.value || '').trim();
      chosenSubject = (codeToTitle.get(chosenCourse) || subjectSelect.value || '').trim();
    }
    const payload = {
      course_name: chosenCourse,
      subject: chosenSubject,
      days: (daysEl.value || '').trim(),
      start_time: startEl.value,
      end_time: endEl.value,
      details: (detailsEl.value || '').trim()
    };
    if (!payload.course_name || !payload.subject || !payload.days || !payload.start_time || !payload.end_time) {
      alert('Please fill all required fields.');
      return;
    }
    try {
      const r = await fetch('/api/tutors', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader()), body: JSON.stringify(payload) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j.message || `Add failed (${r.status})`);
      tutorForm.reset();
      await populateClassSelectors();
      await refreshTutors();
    } catch (err) {
      alert(err.message || 'Add failed');
      console.error('tutoring.js add error', err);
    }
  });

  // Init
  wireCourseBehavior();
  await populateClassSelectors();
  await refreshTutors();
}