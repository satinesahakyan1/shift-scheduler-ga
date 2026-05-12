const token = localStorage.getItem('scheduler_token');

if (!token) {
  window.location.href = '/login.html';
}

const MAX_SHIFTS_PER_OFFICE = 5;

const shiftCountInput = document.getElementById('shiftCount');
const shiftFields = document.getElementById('shiftFields');
const shiftSetupForm = document.getElementById('shiftSetupForm');
const shiftStatus = document.getElementById('shiftStatus');
const saveShiftSetupBtn = document.getElementById('saveShiftSetupBtn');
const currentShiftsList = document.getElementById('currentShiftsList');

let currentShifts = [];

function setStatus(message, isError = false) {
  shiftStatus.textContent = message;
  shiftStatus.style.color = isError ? '#b91c1c' : '#111827';
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

function defaultShiftName(index, count) {
  if (count === 1) return 'Հիմնական հերթափոխ';

  if (count === 2) {
    return index === 1 ? '1-ին հերթափոխ' : '2-րդ հերթափոխ';
  }

  if (count === 3) {
    if (index === 1) return 'Առավոտյան հերթափոխ';
    if (index === 2) return 'Երեկոյան հերթափոխ';
    return 'Գիշերային հերթափոխ';
  }

  if (count === 4) {
    if (index === 1) return 'Առավոտյան հերթափոխ';
    if (index === 2) return 'Ցերեկային հերթափոխ';
    if (index === 3) return 'Երեկոյան հերթափոխ';
    return 'Գիշերային հերթափոխ';
  }

  return `${index}-րդ հերթափոխ`;
}

function renderShiftFields(count) {
  const safeCount = Math.max(1, Number(count) || 1);

  shiftFields.innerHTML = `
    <div class="form-grid">
      ${Array.from({ length: safeCount }, (_, i) => {
        const index = i + 1;
        const existingShift = currentShifts[i];

        return `
          <div class="field">
            <label for="shiftName-${index}">${index}-րդ հերթափոխի անվանումը</label>
            <input
              id="shiftName-${index}"
              type="text"
              value="${escapeHtml(existingShift?.name || defaultShiftName(index, safeCount))}"
              data-id="${existingShift?.id || ''}"
              required
            />
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderCurrentShifts(items) {
  if (!items || items.length === 0) {
    currentShiftsList.innerHTML = '<p>Դեռ հերթափոխեր սահմանված չեն</p>';
    return;
  }

  currentShiftsList.innerHTML = `
    <div style="display:grid; gap:12px;">
      ${items.map((item) => `
        <div class="card">
          <div class="card-title">Հերթափոխ ${item.sort_order}</div>
          <div class="card-value" style="font-size:20px;">${escapeHtml(item.name)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

async function loadCurrentShifts() {
  const response = await fetch('/api/shift-types/my-shifts', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց բեռնել հերթափոխերը');
  }

  currentShifts = data.data || [];
  renderCurrentShifts(currentShifts);

  if (currentShifts.length > 0) {
    shiftCountInput.value = currentShifts.length;
  }

  renderShiftFields(Number(shiftCountInput.value));
}

shiftCountInput.addEventListener('input', () => {
  const count = Math.max(1, Number(shiftCountInput.value) || 1);
  renderShiftFields(count);
});

shiftSetupForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  saveShiftSetupBtn.disabled = true;
  setStatus('Պահպանվում է հերթափոխերի կառուցվածքը...');

  try {
    const count = Math.max(1, Number(shiftCountInput.value) || 1);

    if (count > MAX_SHIFTS_PER_OFFICE) {
      alert(`Հնարավոր չէ սահմանել ավելի քան ${MAX_SHIFTS_PER_OFFICE} հերթափոխ`);

      setStatus(
        `Հնարավոր չէ սահմանել ավելի քան ${MAX_SHIFTS_PER_OFFICE} հերթափոխ`,
        true
      );

      return;
    }

    const shifts = Array.from({ length: count }, (_, i) => {
      const input = document.getElementById(`shiftName-${i + 1}`);

      return {
        id: input.dataset.id ? Number(input.dataset.id) : null,
        name: input.value.trim(),
        sort_order: i + 1,
      };
    });

    const hasEmptyShiftName = shifts.some((shift) => !shift.name);

    if (hasEmptyShiftName) {
      alert('Բոլոր հերթափոխերի անվանումները պարտադիր են');
      setStatus('Բոլոր հերթափոխերի անվանումները պարտադիր են', true);
      return;
    }

    const response = await fetch('/api/shift-types/setup', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ shifts }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց պահպանել հերթափոխերը');
    }

    setStatus('Հերթափոխերը հաջողությամբ պահպանվեցին');
    await loadCurrentShifts();
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    saveShiftSetupBtn.disabled = false;
  }
});

loadCurrentShifts().catch((error) => {
  setStatus(`Սխալ՝ ${error.message}`, true);
});