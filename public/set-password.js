const setPasswordForm = document.getElementById('setPasswordForm');
const setPasswordBtn = document.getElementById('setPasswordBtn');
const statusEl = document.getElementById('status');

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');

const togglePasswordBtn = document.getElementById('togglePassword');
const toggleConfirmPasswordBtn = document.getElementById('toggleConfirmPassword');

const params = new URLSearchParams(window.location.search);
const email = params.get('email') || '';
const token = params.get('token') || '';

emailInput.value = email;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#111827';
}

function togglePassword(input, button) {
  const isPasswordHidden = input.type === 'password';
  input.type = isPasswordHidden ? 'text' : 'password';
  button.textContent = isPasswordHidden ? '🙈' : '👁️';
}

togglePasswordBtn.addEventListener('click', () => {
  togglePassword(passwordInput, togglePasswordBtn);
});

toggleConfirmPasswordBtn.addEventListener('click', () => {
  togglePassword(confirmPasswordInput, toggleConfirmPasswordBtn);
});

setPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  setPasswordBtn.disabled = true;
  setStatus('Գաղտնաբառը պահպանվում է...');

  try {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!email || !token) {
      throw new Error('Հղումը անվավեր է կամ թերի');
    }

    if (!password || !confirmPassword) {
      throw new Error('Լրացրեք բոլոր դաշտերը');
    }

    if (password !== confirmPassword) {
      throw new Error('Գաղտնաբառերը չեն համընկնում');
    }

    const response = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        token,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց սահմանել գաղտնաբառը');
    }

    localStorage.setItem('scheduler_token', data.token);
    localStorage.setItem('scheduler_user', JSON.stringify(data.user));

    setStatus('Գաղտնաբառը հաջողությամբ սահմանվեց');
    window.location.href = '/dashboard.html';
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    setPasswordBtn.disabled = false;
  }
});