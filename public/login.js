const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const statusEl = document.getElementById('status');
const loginPasswordInput = document.getElementById('password');
const toggleLoginPasswordBtn = document.getElementById('toggleLoginPassword');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#111827';
}

toggleLoginPasswordBtn.addEventListener('click', () => {
  const isPasswordHidden = loginPasswordInput.type === 'password';

  loginPasswordInput.type = isPasswordHidden ? 'text' : 'password';
  toggleLoginPasswordBtn.textContent = isPasswordHidden ? '🙈' : '👁️';
  toggleLoginPasswordBtn.setAttribute(
    'aria-label',
    isPasswordHidden ? 'Թաքցնել գաղտնաբառը' : 'Ցույց տալ գաղտնաբառը'
  );
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  loginBtn.disabled = true;
  setStatus('Մուտքը ստուգվում է...');

  try {
    const payload = {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Մուտքը չհաջողվեց');
    }

    localStorage.setItem('scheduler_token', data.token);
    localStorage.setItem('scheduler_user', JSON.stringify(data.user));

    setStatus('Մուտքը հաջողությամբ կատարվեց');
    window.location.href = '/dashboard.html';
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    loginBtn.disabled = false;
  }
});