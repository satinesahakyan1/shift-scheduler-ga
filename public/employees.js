const availabilityContainer = document.getElementById('availabilityContainer');
const preferencesContainer = document.getElementById('preferencesContainer');
const employeeForm = document.getElementById('employeeForm');
const employeeStatus = document.getElementById('employeeStatus');
const employeeResult = document.getElementById('employeeResult');
const saveEmployeeBtn = document.getElementById('saveEmployeeBtn');
const myEmployeesList = document.getElementById('myEmployeesList');

const token = localStorage.getItem('scheduler_token');

if (!token) {
  window.location.href = '/login.html';
}

let shiftTypes = [];
let days = [];
let editingEmployeeId = null;

function setStatus(message, isError = false) {
  employeeStatus.textContent = message;
  employeeStatus.style.color = isError ? '#b91c1c' : '#111827';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function availabilityKey(dayId, shiftId) {
  return `${Number(dayId)}-${Number(shiftId)}`;
}

function preferenceKey(shiftId) {
  return String(Number(shiftId));
}

function renderAvailabilityMatrix(selectedAvailability = []) {
  const selectedMap = new Map(
    selectedAvailability.map((item) => [
      availabilityKey(item.day_of_week, item.shift_type_id),
      Boolean(item.is_available),
    ])
  );

  const thead = `
    <thead>
      <tr>
        <th>Օր / Հերթափոխ</th>
        ${shiftTypes.map((shift) => `<th>${escapeHtml(shift.name)}</th>`).join('')}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${days
        .map(
          (day) => `
            <tr>
              <td>${escapeHtml(day.name)}</td>
              ${shiftTypes
                .map((shift) => {
                  const key = availabilityKey(day.id, shift.id);
                  const isChecked = selectedMap.has(key) ? selectedMap.get(key) : true;

                  return `
                    <td>
                      <input
                        type="checkbox"
                        class="availability-checkbox"
                        data-day="${day.id}"
                        data-shift="${shift.id}"
                        ${isChecked ? 'checked' : ''}
                      />
                    </td>
                  `;
                })
                .join('')}
            </tr>
          `
        )
        .join('')}
    </tbody>
  `;

  availabilityContainer.innerHTML = `
    <table class="matrix-table">
      ${thead}
      ${tbody}
    </table>
  `;
}

function renderPreferences(selectedPreferences = []) {
  const selectedMap = new Map(
    selectedPreferences.map((item) => [
      preferenceKey(item.shift_type_id),
      Number(item.preference_level),
    ])
  );

  preferencesContainer.innerHTML = `
    <div class="form-grid">
      ${shiftTypes
        .map((shift) => {
          const selectedValue = selectedMap.has(preferenceKey(shift.id))
            ? selectedMap.get(preferenceKey(shift.id))
            : 0;

          return `
            <div class="field">
              <label for="pref-${shift.id}">${escapeHtml(shift.name)}</label>
              <select id="pref-${shift.id}" data-shift="${shift.id}" class="preference-select">
                <option value="-1" ${selectedValue === -1 ? 'selected' : ''}>Ոչ ցանկալի</option>
                <option value="0" ${selectedValue === 0 ? 'selected' : ''}>Չեզոք</option>
                <option value="1" ${selectedValue === 1 ? 'selected' : ''}>Նախընտրելի</option>
              </select>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function collectAvailability() {
  return [...document.querySelectorAll('.availability-checkbox')].map((checkbox) => ({
    day_of_week: Number(checkbox.dataset.day),
    shift_type_id: Number(checkbox.dataset.shift),
    is_available: checkbox.checked,
  }));
}

function collectPreferences() {
  return [...document.querySelectorAll('.preference-select')].map((select) => ({
    shift_type_id: Number(select.dataset.shift),
    preference_level: Number(select.value),
  }));
}

function resetEmployeeForm() {
  editingEmployeeId = null;
  employeeForm.reset();
  document.getElementById('maxShifts').value = 5;
  saveEmployeeBtn.textContent = 'Պահպանել աշխատակցին';
  renderAvailabilityMatrix();
  renderPreferences();
}

function renderMyEmployees(items) {
  if (!items || items.length === 0) {
    myEmployeesList.innerHTML = '<div class="employee-card">Դեռ աշխատակիցներ չկան</div>';
    return;
  }

  myEmployeesList.innerHTML = items
    .map(
      (employee) => `
        <div class="employee-card">
          <div class="employee-card-header">
            <div>
              <div class="employee-name">${escapeHtml(employee.full_name)}</div>
              <div class="employee-meta">
                Շաբաթական առավելագույն հերթափոխ՝ ${employee.max_shifts_per_week}
              </div>
            </div>
            <div class="employee-actions">
              <button type="button" class="secondary-link edit-employee-btn" data-id="${employee.id}">Խմբագրել</button>
              <button type="button" class="danger-button delete-employee-btn" data-id="${employee.id}" data-name="${escapeHtml(employee.full_name)}">Ջնջել</button>
            </div>
          </div>
        </div>
      `
    )
    .join('');
}

async function loadMeta() {
  const response = await fetch('/api/employee-management/meta', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց բեռնել ձևի տվյալները');
  }

  shiftTypes = data.shiftTypes;
  days = data.days;

  if (!shiftTypes || shiftTypes.length === 0) {
    availabilityContainer.innerHTML = `
      <div class="card">
        Նախ պետք է սահմանեք ձեր կազմակերպության հերթափոխերը։
        <div style="margin-top:12px;">
          <a href="/shift-setup.html"><button type="button">Սահմանել հերթափոխերը</button></a>
        </div>
      </div>
    `;
    preferencesContainer.innerHTML = '';
    saveEmployeeBtn.disabled = true;
    return;
  }

  saveEmployeeBtn.disabled = false;
  renderAvailabilityMatrix();
  renderPreferences();
}

async function loadMyEmployees() {
  const response = await fetch('/api/employee-management/my-employees', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց բեռնել ձեր աշխատակիցներին');
  }

  renderMyEmployees(data.data);
}

async function startEditEmployee(employeeId) {
  try {
    setStatus('Բեռնվում են աշխատակցի տվյալները...');

    const response = await fetch(`/api/employee-management/${employeeId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց բեռնել աշխատակցի տվյալները');
    }

    const { employee, availability, preferences } = data.data;

    editingEmployeeId = Number(employee.id);
    document.getElementById('fullName').value = employee.full_name;
    document.getElementById('maxShifts').value = employee.max_shifts_per_week;

    renderAvailabilityMatrix(availability);
    renderPreferences(preferences);

    saveEmployeeBtn.textContent = 'Թարմացնել աշխատակցին';
    setStatus('Կարող եք խմբագրել աշխատակցի տվյալները');
    employeeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  }
}

async function deleteEmployee(employeeId, employeeName) {
  const confirmed = confirm(`Ջնջե՞լ աշխատակցին՝ ${employeeName}`);

  if (!confirmed) {
    return;
  }

  try {
    setStatus('Ջնջվում է աշխատակիցը...');

    const response = await fetch(`/api/employee-management/${employeeId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց ջնջել աշխատակցին');
    }

    if (editingEmployeeId === Number(employeeId)) {
      resetEmployeeForm();
    }

    setStatus('Աշխատակիցը հաջողությամբ ջնջվեց');
    await loadMyEmployees();
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  }
}

employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  saveEmployeeBtn.disabled = true;
  employeeResult.classList.add('hidden');
  setStatus(editingEmployeeId ? 'Թարմացվում է աշխատակցի պրոֆիլը...' : 'Պահպանվում է աշխատակցի պրոֆիլը...');

  const payload = {
    full_name: document.getElementById('fullName').value.trim(),
    max_shifts_per_week: Number(document.getElementById('maxShifts').value),
    availability: collectAvailability(),
    preferences: collectPreferences(),
  };

  try {
    const url = editingEmployeeId
      ? `/api/employee-management/${editingEmployeeId}`
      : '/api/employee-management';

    const response = await fetch(url, {
      method: editingEmployeeId ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց պահպանել աշխատակցին');
    }

    setStatus(editingEmployeeId ? 'Աշխատակիցը հաջողությամբ թարմացվեց' : 'Աշխատակիցը հաջողությամբ ավելացվեց');
    employeeResult.textContent = '';
    employeeResult.classList.remove('hidden');

    resetEmployeeForm();
    await loadMyEmployees();
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    saveEmployeeBtn.disabled = false;
  }
});

myEmployeesList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('.edit-employee-btn');
  const deleteButton = event.target.closest('.delete-employee-btn');

  if (editButton) {
    await startEditEmployee(Number(editButton.dataset.id));
  }

  if (deleteButton) {
    await deleteEmployee(Number(deleteButton.dataset.id), deleteButton.dataset.name);
  }
});

Promise.all([loadMeta(), loadMyEmployees()]).catch((error) => {
  setStatus(`Սխալ՝ ${error.message}`, true);
});