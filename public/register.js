const registerForm = document.getElementById('registerForm');
const registerBtn = document.getElementById('registerBtn');
const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#111827';
}

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  registerBtn.disabled = true;
  setStatus('Հղումը ուղարկվում է...');

  try {
    const payload = {
      full_name: document.getElementById('fullName').value.trim(),
      organization_name: document.getElementById('organizationName').value.trim(),
      email: document.getElementById('email').value.trim(),
    };

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց ուղարկել նամակը');
    }

    setStatus('Հղումը ուղարկվեց ձեր մեյլին։ Բացեք նամակը և սահմանեք գաղտնաբառը։');
    registerForm.reset();
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    registerBtn.disabled = false;
  }
});