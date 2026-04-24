
const token = localStorage.getItem('scheduler_token');

if (!token) {
  window.location.href = '/login.html';
}

const savedSchedulesStatus = document.getElementById('savedSchedulesStatus');
const savedSchedulesList = document.getElementById('savedSchedulesList');
const scheduleDetailsSection = document.getElementById('scheduleDetailsSection');
const scheduleDetailsMeta = document.getElementById('scheduleDetailsMeta');
const savedScheduleTableBody = document.getElementById('savedScheduleTableBody');
const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

let selectedScheduleId = null;

function setStatus(message, isError = false) {
  savedSchedulesStatus.textContent = message;
  savedSchedulesStatus.style.color = isError ? '#b91c1c' : '#111827';
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function renderSchedulesList(items) {
  if (!items || items.length === 0) {
    savedSchedulesList.innerHTML = `
      <div class="empty-state">
        <p>Դեռ պահպանված ժամանակացույց չունեք։</p>
        <a href="/index.html" class="link-button">Գեներացնել նոր աղյուսակ</a>
      </div>
    `;
    scheduleDetailsSection.classList.add('hidden');
    return;
  }

  savedSchedulesList.innerHTML = `
    <div class="saved-grid">
      ${items
        .map(
          (item) => `
            <div class="card saved-card ${Number(item.id) === Number(selectedScheduleId) ? 'selected-card' : ''}">
              <div class="saved-card-head">
                <div>
                  <div class="card-title">${item.schedule_name}</div>
                  <div class="muted-line">${formatDate(item.start_date)} → ${formatDate(item.end_date)}</div>
                </div>
                <div class="card-badge">#${item.id}</div>
              </div>

              <div class="saved-card-stats">
                <div><strong>Score:</strong> ${item.fitness_score ?? '-'}</div>
                <div><strong>Խախտումներ:</strong> ${item.violation_count ?? 0}</div>
                <div><strong>Նշանակումներ:</strong> ${item.assignment_count ?? 0}</div>
              </div>

              <div class="saved-card-actions">
                <button type="button" data-action="view" data-id="${item.id}">Բացել</button>
                <button type="button" data-action="download" data-id="${item.id}">Ներբեռնել</button>
                <button type="button" data-action="delete" data-id="${item.id}" class="danger-button">Ջնջել</button>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderScheduleDetails(data) {
  const meta = data.meta || {};
  const schedule = data.schedule || [];

  scheduleDetailsMeta.innerHTML = [
    { title: 'Անվանում', value: meta.schedule_name || '-' },
    { title: 'Սկսելու ամսաթիվ', value: formatDate(meta.start_date) },
    { title: 'Ավարտի ամսաթիվ', value: formatDate(meta.end_date) },
    { title: 'Fitness score', value: meta.fitness_score ?? '-' },
    { title: 'Խախտումների քանակ', value: meta.violation_count ?? 0 },
    { title: 'Նշանակումների քանակ', value: meta.assignment_count ?? 0 },
  ]
    .map(
      (item) => `
        <div class="card">
          <div class="card-title">${item.title}</div>
          <div class="card-value">${item.value}</div>
        </div>
      `
    )
    .join('');

  savedScheduleTableBody.innerHTML = schedule
    .map(
      (item) => `
        <tr>
          <td>${item.work_date}</td>
          <td>${item.shift_name || item.shift_type_id}</td>
          <td>${(item.employee_names || []).join(', ') || '-'}</td>
        </tr>
      `
    )
    .join('');

  scheduleDetailsSection.classList.remove('hidden');
}

async function loadSchedules(selectedId = null) {
  const response = await fetch('/api/schedules', {
    headers: authHeaders(),
  });

  const data = await response.json();

  if (response.status === 401) {
    localStorage.removeItem('scheduler_token');
    localStorage.removeItem('scheduler_user');
    window.location.href = '/login.html';
    return;
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց բեռնել աղյուսակները');
  }

  if (selectedId) {
    selectedScheduleId = Number(selectedId);
  }

  renderSchedulesList(data.data || []);

  if (!data.data || data.data.length === 0) {
    return;
  }

  const targetId = selectedScheduleId || Number(data.data[0].id);
  await openSchedule(targetId, false);
}

async function openSchedule(scheduleId, rerenderList = true) {
  const response = await fetch(`/api/schedules/${scheduleId}`, {
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց բացել աղյուսակը');
  }

  selectedScheduleId = Number(scheduleId);
  renderScheduleDetails(data.data);

  if (rerenderList) {
    await loadSchedules(selectedScheduleId);
  }
}

function downloadSchedule(scheduleId) {
  const url = `/api/schedules/${scheduleId}/download`;
  fetch(url, { headers: authHeaders() })
    .then(async (response) => {
      if (!response.ok) {
        let errorMessage = 'Չհաջողվեց ներբեռնել աղյուսակը';
        try {
          const data = await response.json();
          errorMessage = data.message || errorMessage;
        } catch (error) {
          // ignore json parse error for file responses
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `schedule-${scheduleId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      setStatus('Ներբեռնումը սկսվեց');
    })
    .catch((error) => {
      setStatus(`Սխալ՝ ${error.message}`, true);
    });
}

async function deleteSchedule(scheduleId) {
  const confirmed = window.confirm('Վստա՞հ եք, որ ցանկանում եք ջնջել այս աղյուսակը։');

  if (!confirmed) {
    return;
  }

  const response = await fetch(`/api/schedules/${scheduleId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Չհաջողվեց ջնջել աղյուսակը');
  }

  if (Number(selectedScheduleId) === Number(scheduleId)) {
    selectedScheduleId = null;
  }

  scheduleDetailsSection.classList.add('hidden');
  setStatus('Ժամանակացույցը ջնջվեց');
  await loadSchedules();
}

savedSchedulesList.addEventListener('click', async (event) => {
  const action = event.target.dataset.action;
  const scheduleId = Number(event.target.dataset.id);

  if (!action || !scheduleId) {
    return;
  }

  try {
    if (action === 'view') {
      setStatus('Բացվում է աղյուսակը...');
      await openSchedule(scheduleId);
      setStatus('Աղյուսակը բացվեց');
      return;
    }

    if (action === 'download') {
      downloadSchedule(scheduleId);
      return;
    }

    if (action === 'delete') {
      setStatus('');
      await deleteSchedule(scheduleId);
    }
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  }
});

downloadSelectedBtn.addEventListener('click', () => {
  if (!selectedScheduleId) {
    setStatus('Նախ ընտրեք աղյուսակը', true);
    return;
  }

  downloadSchedule(selectedScheduleId);
});

deleteSelectedBtn.addEventListener('click', async () => {
  if (!selectedScheduleId) {
    setStatus('Նախ ընտրեք աղյուսակը', true);
    return;
  }

  try {
    await deleteSchedule(selectedScheduleId);
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  }
});

loadSchedules()
  .then(() => {
    if (!savedSchedulesStatus.textContent) {
      setStatus('Պահպանված աղյուսակները բեռնվեցին');
    }
  })
  .catch((error) => {
    setStatus(`Սխալ՝ ${error.message}`, true);
  });

