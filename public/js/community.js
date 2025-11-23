// COMMUNITY PAGE CONTROLLER
document.addEventListener('DOMContentLoaded', async () => {
  const friendsList = document.getElementById('friendsList');
  const incomingList = document.getElementById('incomingList');
  const communityList = document.getElementById('communityList');
  const friendsCount = document.getElementById('friendsCount');
  const communityCount = document.getElementById('communityCount');
  const toast = document.getElementById('toast');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  if (!token) {
    window.location.href = '/';
    return;
  }
  DataModel.setToken(token);

  async function loadCommunity() {
    try {
      const people = await DataModel.getCommunity();
      const friends = people.filter(p => p.relationship === 'friends');
      const incoming = people.filter(p => p.relationship === 'incoming');
      const outgoing = people.filter(p => p.relationship === 'outgoing');
      const others = people.filter(p => p.relationship === 'none' || p.relationship === 'declined');

      if (friendsCount) friendsCount.textContent = `${friends.length} friend${friends.length === 1 ? '' : 's'}`;
      if (communityCount) communityCount.textContent = `${people.length} students`;

      // Friends
      friendsList.innerHTML = friends.length
        ? ''
        : '<p class="sub">No friends yet. Add someone from the community list.</p>';
      friends.forEach(p => friendsList.appendChild(renderPerson(p, 'friends')));

      // Incoming requests
      incomingList.innerHTML = incoming.length
        ? ''
        : '<p class="sub">No pending requests right now.</p>';
      incoming.forEach(p => incomingList.appendChild(renderPerson(p, 'incoming')));

      // Community (others + outgoing)
      communityList.innerHTML = '';
      [...outgoing, ...others].forEach(p => communityList.appendChild(renderPerson(p, p.relationship)));
    } catch (e) {
      console.error('[community] load failed', e);
      communityList.innerHTML = '<p class="sub">Failed to load community.</p>';
    }
  }

  function renderPerson(p, kind) {
    const div = document.createElement('div');
    div.className = 'friend-card';

    const tag = document.createElement('span');
    tag.className = 'tag';
    if (kind === 'friends') {
      tag.classList.add('friends');
      tag.textContent = 'Friends';
    } else if (kind === 'incoming') {
      tag.classList.add('pending');
      tag.textContent = 'Incoming request';
    } else if (kind === 'outgoing') {
      tag.classList.add('pending');
      tag.textContent = 'Requested';
    } else {
      tag.textContent = 'Discover';
    }

    div.innerHTML = `
      <div class="top">
        <div>
          <h3>${escapeHtml(p.fullName || p.email)}</h3>
          <div class="meta">
            ${escapeHtml(p.major || 'Undeclared')}
            ${p.academicYear ? ' • ' + escapeHtml(p.academicYear) : ''}
            ${p.gpa != null ? ' • GPA ' + escapeHtml(p.gpa.toFixed ? p.gpa.toFixed(2) : String(p.gpa)) : ''}
          </div>
          <div class="meta">${escapeHtml(p.email)}</div>
        </div>
      </div>
      <div class="bio">${escapeHtml(p.bio || 'No bio yet.')}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(tag);
    div.appendChild(actions);

    if (kind === 'none' || kind === 'declined') {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Add Friend';
      btn.addEventListener('click', async () => {
        try {
          await DataModel.requestFriend(p.email);
          showToast('Friend request sent.');
          await loadCommunity();
        } catch (e) {
          console.error(e);
          showToast(e.message || 'Request failed.');
        }
      });
      actions.appendChild(btn);
    } else if (kind === 'incoming') {
      const accept = document.createElement('button');
      accept.className = 'btn ok';
      accept.textContent = 'Accept';
      accept.addEventListener('click', async () => {
        try {
          await DataModel.respondFriend(p.email, 'accept');
          showToast('Friend request accepted.');
          await loadCommunity();
        } catch (e) {
          console.error(e);
          showToast(e.message || 'Failed to accept.');
        }
      });

      const decline = document.createElement('button');
      decline.className = 'btn warn';
      decline.textContent = 'Decline';
      decline.addEventListener('click', async () => {
        try {
          await DataModel.respondFriend(p.email, 'decline');
          showToast('Request declined.');
          await loadCommunity();
        } catch (e) {
          console.error(e);
          showToast(e.message || 'Failed to decline.');
        }
      });

      actions.appendChild(accept);
      actions.appendChild(decline);
    } else if (kind === 'outgoing') {
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.textContent = 'Requested';
      btn.disabled = true;
      actions.appendChild(btn);
    } else if (kind === 'friends') {
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.textContent = 'Friends';
      btn.disabled = true;
      actions.appendChild(btn);
    }

    return div;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"'`=\/]/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
      "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    }[s]));
  }

  loadCommunity();
});
