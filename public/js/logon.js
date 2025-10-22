// Tab switching
const loginTab = document.getElementById('login-tab');
const createAccountTab = document.getElementById('create-account-tab');
const logonForm = document.getElementById('logon-form');
const createAccountForm = document.getElementById('create-account-form');
const messageEl = document.getElementById('message');

// Show a logout message if one was set
const logoutMsg = localStorage.getItem('logoutMessage');
if (logoutMsg) {
    messageEl.textContent = logoutMsg;
    messageEl.classList.add('success', 'fade-message');

    // Automatically hide after 3 seconds
    setTimeout(() => {
        messageEl.classList.add('fade-out');
        setTimeout(() => {
            messageEl.textContent = '';
            messageEl.classList.remove('success', 'fade-message', 'fade-out');
        }, 500); // time for fade-out transition
    }, 3000);

    // Clear the flag so it only shows once
    localStorage.removeItem('logoutMessage');
}

loginTab.addEventListener('click', () => {
    logonForm.classList.add('active-form');
    createAccountForm.classList.remove('active-form');
    loginTab.classList.add('active');
    createAccountTab.classList.remove('active');
});

createAccountTab.addEventListener('click', () => {
    createAccountForm.classList.add('active-form');
    logonForm.classList.remove('active-form');
    createAccountTab.classList.add('active');
    loginTab.classList.remove('active');
});

// Logon form submission
logonForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    // FIX: correctly get the checkbox element
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok && result.token) {
            // Save token where dashboard expects it (localStorage)
            localStorage.setItem('jwtToken', result.token);

            // Also save to sessionStorage if the user DID NOT choose "remember me"
            // (this is optional, but ensures sessions behave as expected)
            if (!rememberMe) {
                sessionStorage.setItem('jwtToken', result.token);
            } else {
                // if rememberMe checked, ensure sessionStorage does not contain a stale token
                sessionStorage.removeItem('jwtToken');
            }

            window.location.href = '/dashboard';
        } else {
            messageEl.textContent = result.message || 'Login failed';
            messageEl.classList.add('error');
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.textContent = 'An error occurred. Please try again later.';
        messageEl.classList.add('error');
    }
});

// Create account form submission
createAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('create-email').value;
    const password = document.getElementById('create-password').value;

    try {
        const response = await fetch('/api/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            messageEl.textContent = 'Account created successfully! You can now log in.';
            messageEl.classList.add('success');
            document.getElementById('login-email').value = email;
            document.getElementById('login-password').value = password;
            logonForm.classList.add('active-form');
            createAccountForm.classList.remove('active-form');
            loginTab.classList.add('active');
            createAccountTab.classList.remove('active');
        } else {
            messageEl.textContent = result.message;
            messageEl.classList.add('error');
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.textContent = 'An error occurred. Please try again later.';
        messageEl.classList.add('error');
    }
});