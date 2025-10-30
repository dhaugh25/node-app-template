////////////////////////////////////////////////
// DASHBOARD.JS
// CONTROLLER: connects model (datamodel.js) and view (dashboard.html)
////////////////////////////////////////////////

// NOTE: notification helpers are provided as globals by dashboard.html:
// window.isNotificationsEnabled, window.enableNotifications, window.notify

import { enableNotifications, notify } from "/js/notifications.js";

document.addEventListener('DOMContentLoaded', () => {
    // Core UI elements
    const logoutButton = document.getElementById('logoutButton');
    const refreshButton = document.getElementById('refreshButton');
    const notifyBtn = document.getElementById('notifToggleBtn');
    const openAddClassBtn = document.getElementById('openAddClassBtn');

    // Modal elements (from new dashboard.html)
    const addClassModal = document.getElementById('addClassModal');      // whole modal
    const addModalBackdrop = document.getElementById('addModalBackdrop'); // backdrop element
    const modalCloseBtn = document.getElementById('modalCloseBtn');      // × close button

    // Form inside modal
    const addClassForm = document.getElementById('addClassForm');
    const cancelAddClassBtn = document.getElementById('cancelAddClassBtn');
    const classFormMessage = document.getElementById('classFormMessage');

    // Class list container
    const classListElement = document.getElementById('classList');

    // Register service worker (harmless duplicate if already registered)
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    // Logout: clear tokens and redirect
    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        sessionStorage.removeItem('jwtToken');
        localStorage.setItem('logoutMessage', 'You have been logged out successfully.');
        window.location.href = '/';
    });

    // Refresh classes
    refreshButton?.addEventListener('click', async () => {
        await renderClassList();
        if (typeof notify === 'function') notify({ title: "Data refreshed", body: "Class list updated." });
    });

    // Notifications toggle (uses global enableNotifications/notify or imported helpers)
    if (notifyBtn) {
        notifyBtn.addEventListener('click', async () => {
            const ok = await enableNotifications();
            if (ok) {
                notify({ title: "Notifications enabled", body: "You’ll get alerts from the app.", tag: "welcome" });
                notifyBtn.textContent = "Disable Notifications";
            } else {
                notifyBtn.textContent = "Enable Notifications";
            }
        });
    }

    // Token check and set DataModel
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    if (!token) return window.location.href = '/';
    DataModel.setToken(token);

    // Initial load of classes
    renderClassList();

    // ---------------- Modal open / close helpers ----------------
    function openAddModal() {
        if (!addClassModal) return;
        addClassModal.classList.add('open');
        addClassModal.setAttribute('aria-hidden', 'false');
        // focus first input for accessibility
        const first = addClassForm?.querySelector('input, select, textarea');
        if (first) first.focus();
        // add keydown listener for Esc
        document.addEventListener('keydown', escHandler);
    }

    function closeAddModal() {
        if (!addClassModal) return;
        addClassModal.classList.remove('open');
        addClassModal.setAttribute('aria-hidden', 'true');
        if (addClassForm) addClassForm.reset();
        if (classFormMessage) {
            classFormMessage.textContent = '';
            classFormMessage.classList.remove('error', 'success');
        }
        document.removeEventListener('keydown', escHandler);
    }

    function escHandler(e) {
        if (e.key === 'Escape') closeAddModal();
    }

    // Open modal on button click
    openAddClassBtn?.addEventListener('click', () => {
        openAddModal();
    });

    // Close modal on backdrop click or close button
    addModalBackdrop?.addEventListener('click', () => closeAddModal());
    modalCloseBtn?.addEventListener('click', () => closeAddModal());
    cancelAddClassBtn?.addEventListener('click', () => closeAddModal());

    // ---------------- Form submit handling (create class) ----------------
    if (addClassForm) {
        addClassForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const course_name = document.getElementById('courseName').value.trim();
            const subject = document.getElementById('subject').value.trim();
            const days = document.getElementById('days').value.trim();
            const start_time = document.getElementById('startTime').value;
            const end_time = document.getElementById('endTime').value;

            // Client validation
            if (!course_name || !subject || !days || !start_time || !end_time) {
                classFormMessage.textContent = 'Please fill in all required fields.';
                classFormMessage.classList.add('error');
                return;
            }
            if (start_time >= end_time) {
                classFormMessage.textContent = 'Start time must be before end time.';
                classFormMessage.classList.add('error');
                return;
            }

            try {
                classFormMessage.textContent = 'Saving...';
                classFormMessage.classList.remove('error');

                const newClass = await DataModel.createClass({
                    course_name, subject, days, start_time, end_time
                });

                // On success: close modal and refresh list from DB
                closeAddModal();
                await renderClassList();

                // Optional success notification
                if (typeof notify === 'function') notify({ title: "Class added", body: `${subject}: ${course_name}` });

            } catch (err) {
                console.error('Error creating class:', err);
                classFormMessage.textContent = err.message || 'Error saving class';
                classFormMessage.classList.add('error');
            }
        });
    }

    // ---------------- Render classes ----------------
    async function renderClassList() {
        if (!classListElement) return;
        classListElement.innerHTML = '<div class="loading-message">Loading classes...</div>';

        const classes = await DataModel.getClasses();
        classListElement.innerHTML = '';

        if (!classes || classes.length === 0) {
            classListElement.innerHTML = '<div class="empty-message">No classes yet.</div>';
            return;
        }

        classes.forEach(c => {
            const item = document.createElement('div');
            item.className = 'class-item';

            // Convert "HH:MM" 24h to "h:MM AM/PM"
            const format12 = (timeStr) => {
                if (!timeStr) return '';
                const [h, m] = timeStr.split(':').map(Number);
                const ampm = h >= 12 ? 'PM' : 'AM';
                const hour = h % 12 || 12;
                return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
            };

            const start12 = format12(c.start_time);
            const end12 = format12(c.end_time);

            item.innerHTML = `
              <div class="class-title"><strong>${escapeHtml(c.subject)}: ${escapeHtml(c.course_name)}</strong></div>
              <div class="class-meta">${escapeHtml(c.days)} | ${start12} – ${end12}</div>
            `;
            classListElement.appendChild(item);
        });
    }

    // ---------------- Helpers ----------------
    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str).replace(/[&<>"'`=\/]/g, s => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        }[s]));
    }
});
// end DOMContentLoaded