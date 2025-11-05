// CONTROLLER: wire events, call DataModel, update DOM.
document.addEventListener('DOMContentLoaded', init);

async function init(){
  // Elements
  const logoutButton = $('#logoutButton');
  const refreshButton = $('#refreshButton');
  const askPermBtn   = $('#askBrowserPermBtn');
  const testNotifBtn = $('#testNotifBtn');
  const notifToggleBtn = $('#notifToggleBtn');
  const notifSwitch  = $('#notifSwitch');
  const notifState   = $('#notifState');
  const classForm    = $('#classForm');
  const classesBody  = $('#classesBody');

  // Auth check
  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token){ location.href = '/'; return; }
  DataModel.setToken(token);

  // Initial data
  renderUsers(await DataModel.getUsers());
  renderClasses(await DataModel.getClasses());

  // Notifications UI
  const enabledNow = window.isNotificationsEnabled && window.isNotificationsEnabled();
  updateNotifUI(enabledNow);

  // EVENTS
  logoutButton?.addEventListener('click', onLogout);
  refreshButton?.addEventListener('click', async ()=>{
    await Promise.all([refreshUsers(), refreshClasses()]);
    toast('Refreshed');
    if (window.isNotificationsEnabled?.()) window.notify?.({title:'Data refreshed', body:'Lists updated.'});
  });

  askPermBtn?.addEventListener('click', async ()=>{
    const ok = await window.enableNotifications?.();
    updateNotifUI(ok && !isDisabled());
    toast(ok ? 'Browser permission granted' : 'Permission not granted');
  });

  testNotifBtn?.addEventListener('click', ()=>{
    window.notify?.({ title:'CourseConnect', body:'This is a test notification.' });
  });

  notifToggleBtn?.addEventListener('click', ()=>{
    const disabled = isDisabled();
    localStorage.setItem('notifDisabled', disabled ? 'false' : 'true');
    updateNotifUI(!disabled && window.isNotificationsEnabled?.());
    toast(disabled ? 'Notifications enabled' : 'Notifications disabled');
  });

  // switch (visual)
  notifSwitch?.addEventListener('click', ()=>{
    const on = notifSwitch.dataset.on === 'true';
    localStorage.setItem('notifDisabled', on ? 'true' : 'false');
    updateNotifUI(!on && window.isNotificationsEnabled?.());
  });
  notifSwitch?.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); notifSwitch.click(); }
  });

  classForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const payload = {
      course_name: v('#course_name'),
      subject: v('#subject'),
      days: v('#days'),
      start_time: v('#start_time'),
      end_time: v('#end_time'),
    };
    try{
      const row = await DataModel.addClass(payload);
      prependClassRow(row);
      classForm.reset();
      toast('Class added');
      if (window.isNotificationsEnabled?.() && notifSwitch?.dataset.on === 'true'){
        window.notify?.({ title:'Class added', body:`${row.course_name} • ${row.days} ${row.start_time}-${row.end_time}` });
      }
    }catch(err){
      console.error(err); toast('Could not save', true);
    }
  });

  // helpers
  function updateNotifUI(enabled){
    const disabled = isDisabled();
    notifToggleBtn.textContent = (!disabled && enabled) ? 'Disable Notifications' : 'Enable Notifications';
    notifSwitch.dataset.on = (!disabled && enabled) ? 'true' : 'false';
    notifState.textContent = (!disabled && enabled) ? 'Notifications are ON.' : 'Notifications are OFF.';
  }
}

function isDisabled(){ return localStorage.getItem('notifDisabled') === 'true'; }

async function refreshUsers(){ renderUsers(await DataModel.getUsers()); }
async function refreshClasses(){ renderClasses(await DataModel.getClasses()); }

// ----- Renderers -----
function renderUsers(list){
  const el = $('#userList'); if (!el) return;
  el.innerHTML = '';
  (list || []).forEach(email=>{
    const d = document.createElement('div');
    d.className = 'user-item';
    d.textContent = email;
    el.appendChild(d);
  });
  if (!list?.length){ el.innerHTML = '<div class="sub">No users found.</div>'; }
}

function renderClasses(rows){
  const body = $('#classesBody'); if (!body) return;
  body.innerHTML = '';
  (rows || []).forEach(prependClassRow);
  if (!rows?.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 5; td.className='sub'; td.textContent='No classes yet.';
    tr.appendChild(td); body.appendChild(tr);
  }
}
function prependClassRow(row){
  const body = $('#classesBody');
  const tr = document.createElement('tr');
  const start12 = format12h(row.start_time);
  const end12 = format12h(row.end_time);

  tr.innerHTML = `
    <td>${esc(row.course_name)}</td>
    <td>${esc(row.subject)}</td>
    <td>${esc(row.days)}</td>
    <td>${esc(start12)}</td>
    <td>${esc(end12)}</td>`;
  body?.prepend(tr);
}


// ----- Utility -----
function $(sel){ return document.querySelector(sel); }
function v(sel){ return (document.querySelector(sel)?.value || '').trim(); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

//fix: from 24hr to 12hr frame
function format12h(timeStr){
  if (!timeStr) return '';
  const [hour, minute] = timeStr.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}


// in-app toast
let toastTimer = null;
function toast(msg, isError=false){
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  t.style.borderColor = isError ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.1)';
  clearTimeout(toastTimer); toastTimer = setTimeout(()=> t.classList.remove('show'), 1800);
}

function onLogout(){
  try{
    localStorage.removeItem('jwtToken');
    sessionStorage.removeItem('jwtToken');
    localStorage.setItem('logoutMessage','You have been logged out successfully.');
  } finally { location.href = '/'; }
}
