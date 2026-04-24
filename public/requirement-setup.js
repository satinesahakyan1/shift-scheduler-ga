const token = localStorage.getItem('scheduler_token');

if (!token) {
  window.location.href = '/login.html';
}

const requirementMatrixContainer = document.getElementById('requirementMatrixContainer');
const requirementStatus = document.getElementById('requirementStatus');
const saveRequirementsBtn = document.getElementById('saveRequirementsBtn');

let shiftTypes = [];
let days = [];
let templates = [];

function setStatus(message, isError = false) {
  requirementStatus.textContent = message;
  requirementStatus.style.color = isError ? '#b91c1c' : '#111827';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function getTemplateValue(dayId, shiftId) {
  const found = templates.find(
    (item) => Number(item.day_of_week) === Number(dayId) && Number(item.shift_type_id) === Number(shiftId)
  );

  return found ? Number(found.required_employees) : 1;
}

function renderMatrix() {
  if (!shiftTypes.length) {
    requirementMatrixContainer.innerHTML = `
      <div class="card">
        Նախ պետք է սահմանեք կազմակերպության հերթափոխերը։
        <div style="margin-top:12px;">
          <a href="/shift-setup.html"><button type="button">Սահմանել հերթափոխերը</button></a>
        </div>
      </div>
    `;
    saveRequirementsBtn.disabled = true;
    return;
  }

  saveRequirementsBtn.disabled = false;

  const thead = `
    <thead>
      <tr>
        <th>Օր / Հերթափոխ</th>
        ${shiftTypes.map((shift) => `<th>${shift.name}</th>`).join('')}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${days
        .map(
          (day) => `
            <tr>
              <td>${day.name}</td>
              ${shiftTypes
                .map(
                  (shift) => `
                    <td>
                      <input
                        type="number"
                        min="0"
                        class="requirement-input"
                        data-day="${day.id}"
                        data-shift="${shift.id}"
                        value="${getTemplateValue(day.id, shift.id)}"
                      />
                    </td>
                  `
                )
                .join('')}
            </tr>
          `
        )
        .join('')}
    </tbody>
  `;

  requirementMatrixContainer.innerHTML = `
    <table class="matrix-table">
      ${thead}
      ${tbody}
    </table>
  `;
}

async function loadTemplates() {
  const response = await fetch('/api/requirements/templates', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց բեռնել պահանջարկի տվյալները');
  }

  shiftTypes = data.shiftTypes || [];
  days = data.days || [];
  templates = data.templates || [];

  renderMatrix();
}

function collectItems() {
  return [...document.querySelectorAll('.requirement-input')].map((input) => ({
    day_of_week: Number(input.dataset.day),
    shift_type_id: Number(input.dataset.shift),
    required_employees: Number(input.value),
  }));
}

saveRequirementsBtn.addEventListener('click', async () => {
  try {
    saveRequirementsBtn.disabled = true;
    setStatus('Պահպանվում է պահանջարկի տվյալները...');

    const items = collectItems();

    const response = await fetch('/api/requirements/templates', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ items }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց պահպանել պահանջարկի տվյալները');
    }

    setStatus('Պահանջարկի ձևանմուշները հաջողությամբ պահպանվեցին');
    await loadTemplates();
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    saveRequirementsBtn.disabled = false;
  }
});

loadTemplates().catch((error) => {
  setStatus(`Սխալ՝ ${error.message}`, true);
});