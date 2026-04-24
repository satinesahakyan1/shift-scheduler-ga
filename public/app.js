
const form = document.getElementById('schedulerForm');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const saveScheduleBtn = document.getElementById('saveScheduleBtn');
const downloadScheduleBtn = document.getElementById('downloadScheduleBtn');
const resultActionsSection = document.getElementById('resultActionsSection');
const resultActionStatus = document.getElementById('resultActionStatus');

const summarySection = document.getElementById('summarySection');
const scheduleSection = document.getElementById('scheduleSection');
const violationsSection = document.getElementById('violationsSection');

const summaryCards = document.getElementById('summaryCards');
const scheduleTableBody = document.getElementById('scheduleTableBody');
const violationsOutput = document.getElementById('violationsOutput');

const token = localStorage.getItem('scheduler_token');

if (!token) {
  window.location.href = '/login.html';
}

let lastGeneratedData = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#111827';
}

function setActionStatus(message, isError = false) {
  resultActionStatus.textContent = message;
  resultActionStatus.style.color = isError ? '#b91c1c' : '#111827';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function buildLookupMap(items, keyField, valueField) {
  const map = new Map();

  for (const item of items || []) {
    map.set(Number(item[keyField]), item[valueField]);
  }

  return map;
}

function renderSummary(data) {
  const best = data.bestCandidate || {};
  const stats = best.stats || {};

  const cards = [
    { title: 'Լավագույն գնահատական', value: best.score ?? '-' },
    { title: 'Որ սերնդում է գտնվել', value: best.generation ?? '-' },
    { title: 'Ընդհանուր տուգանք', value: best.totalPenalty ?? '-' },
    { title: 'Ընդհանուր բոնուս', value: best.totalBonus ?? '-' },
    { title: 'Նշանակումների քանակ', value: stats.totalAssignedCount ?? '-' },
    { title: 'Միջին նշանակումներ', value: stats.averageAssignments ?? '-' },
    { title: 'Սկսելու ամսաթիվ', value: data.selectedRange?.startDate ?? '-' },
    { title: 'Ավարտի ամսաթիվ', value: data.selectedRange?.endDate ?? '-' },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <div class="card">
          <div class="card-title">${card.title}</div>
          <div class="card-value">${card.value}</div>
        </div>
      `
    )
    .join('');

  summarySection.classList.remove('hidden');
}

function renderSchedule(data) {
  const schedule = data.bestCandidate?.schedule || [];
  const employees = data.planningMeta?.employees || [];
  const shiftTypes = data.planningMeta?.shiftTypes || [];

  const employeeMap = buildLookupMap(employees, 'id', 'full_name');
  const shiftMap = buildLookupMap(shiftTypes, 'id', 'name');

  scheduleTableBody.innerHTML = schedule
    .map((entry) => {
      const employeeNames = (entry.employee_ids || [])
        .map((id) => employeeMap.get(Number(id)) || `Աշխատակից #${id}`)
        .join(', ') || '-';

      return `
        <tr>
          <td>${entry.work_date}</td>
          <td>${shiftMap.get(Number(entry.shift_type_id)) || entry.shift_type_id}</td>
          <td>${employeeNames}</td>
        </tr>
      `;
    })
    .join('');

  scheduleSection.classList.remove('hidden');
}

function getCoverageSummary(bestCandidate) {
  const violations = bestCandidate?.violations || {};
  const stats = bestCandidate?.stats || {};
  const uncovered = violations.uncoveredShifts || [];
  const totalRequirements = Number(stats.totalRequirements || 0);

  const problematicShiftCount = uncovered.length;
  const coveredShiftCount = Math.max(0, totalRequirements - problematicShiftCount);
  const totalMissingEmployees = uncovered.reduce(
    (sum, item) => sum + Number(item.missing || 0),
    0
  );

  let severityClass = 'severity-good';
  let severityText = 'Գրաֆիկը լավ է կազմվել։';

  if (problematicShiftCount > 0 && problematicShiftCount <= 3) {
    severityClass = 'severity-warn';
    severityText = 'Գրաֆիկը մասամբ է բավարարել պահանջարկը։';
  }

  if (problematicShiftCount > 3) {
    severityClass = 'severity-bad';
    severityText = 'Գրաֆիկը լիովին չի բավարարել պահանջարկը։';
  }

  return {
    problematicShiftCount,
    coveredShiftCount,
    totalMissingEmployees,
    severityClass,
    severityText,
  };
}

function buildIssueSummary(data) {
  const bestCandidate = data.bestCandidate || {};
  const violations = bestCandidate.violations || {};
  const shiftTypes = data.planningMeta?.shiftTypes || [];
  const shiftMap = buildLookupMap(shiftTypes, 'id', 'name');

  const uncovered = violations.uncoveredShifts || [];
  const unavailable = violations.unavailableAssignments || [];
  const maxShiftExceeded = violations.maxShiftExceeded || [];
  const multipleSameDay = violations.multipleShiftsSameDay || [];

  const topProblematic = [...uncovered]
    .sort((a, b) => Number(b.missing || 0) - Number(a.missing || 0))
    .slice(0, 5);

  const issueLines = [];

  if (uncovered.length === 0) {
    issueLines.push('Բոլոր հերթափոխերը հաջողությամբ փակվել են։');
  } else {
    issueLines.push(
      `Ընդհանուր առմամբ ամբողջությամբ կամ մասնակի չի փակվել ${uncovered.length} հերթափոխ։`
    );

    for (const item of topProblematic) {
      const shiftName = shiftMap.get(Number(item.shift_type_id)) || `Հերթափոխ #${item.shift_type_id}`;
      issueLines.push(
        `${item.work_date}-ին "${shiftName}" հերթափոխի համար պահանջվել է ${item.required} աշխատակից, նշանակվել է ${item.assigned}, պակասել է ${item.missing} աշխատակից։`
      );
    }
  }

  if (unavailable.length > 0) {
    issueLines.push(
      `Գտնվել են ${unavailable.length} նշանակումներ, որտեղ աշխատակիցը տվյալ հերթափոխին հասանելի չի եղել։`
    );
  }

  if (maxShiftExceeded.length > 0) {
    issueLines.push(
      `Գտնվել են ${maxShiftExceeded.length} դեպքեր, որտեղ աշխատակիցների շաբաթական թույլատրելի հերթափոխերի սահմանաչափը գերազանցվել է։`
    );
  }

  if (multipleSameDay.length > 0) {
    issueLines.push(
      `Գտնվել են ${multipleSameDay.length} դեպքեր, որտեղ նույն օրը աշխատակցին տրվել է մեկից ավելի հերթափոխ։`
    );
  }

  return issueLines;
}

function buildRecommendations(data) {
  const bestCandidate = data.bestCandidate || {};
  const violations = bestCandidate.violations || {};
  const shiftTypes = data.planningMeta?.shiftTypes || [];
  const shiftMap = buildLookupMap(shiftTypes, 'id', 'name');

  const uncovered = violations.uncoveredShifts || [];
  const unavailable = violations.unavailableAssignments || [];
  const maxShiftExceeded = violations.maxShiftExceeded || [];

  const recommendations = [];

  if (uncovered.length > 0) {
    const groupedByShift = new Map();

    for (const item of uncovered) {
      const shiftTypeId = Number(item.shift_type_id);
      groupedByShift.set(
        shiftTypeId,
        (groupedByShift.get(shiftTypeId) || 0) + Number(item.missing || 0)
      );
    }

    const topShortageShift = [...groupedByShift.entries()].sort((a, b) => b[1] - a[1])[0];

    if (topShortageShift) {
      const shiftName = shiftMap.get(topShortageShift[0]) || `Հերթափոխ #${topShortageShift[0]}`;
      recommendations.push(
        `Ամենամեծ պակասը գրանցվել է "${shiftName}" հերթափոխում։ Առաջարկվում է կամ ավելացնել այդ հերթափոխի հասանելի աշխատակիցների քանակը, կամ նվազեցնել դրա պահանջվող քանակը որոշ օրերին։`
      );
    }

    recommendations.push(
      'Եթե ամբողջ պահանջարկը փակել չի հաջողվում, ցանկալի է չթողնել լրիվ դատարկ օրեր, այլ պակասը բաշխել ավելի հավասար տարբեր օրերի միջև։'
    );
  }

  if (unavailable.length > 0) {
    recommendations.push(
      'Վերանայեք աշխատակիցների հասանելիության կարգավորումները, քանի որ համակարգը հայտնաբերել է անհասանելի հերթափոխերի նշանակումներ։'
    );
  }

  if (maxShiftExceeded.length > 0) {
    recommendations.push(
      'Վերանայեք աշխատակիցների շաբաթական առավելագույն հերթափոխերի սահմանաչափը կամ ավելացրեք նոր աշխատակիցներ, որպեսզի ծանրաբեռնվածությունը բաշխվի ավելի հավասար։'
    );
  }

  if (uncovered.length > 0) {
    recommendations.push(
      'Եթե որոշ հերթափոխերի համար հաճախ է պակաս առաջանում, կարելի է տվյալ հերթափոխի համար ավելացնել նոր աշխատակիցներ կամ փոխել գործող աշխատակիցների նախասիրություններն ու հասանելիությունը։'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Այս տարբերակը լուրջ խախտումներ չունի։ Կարելի է օգտագործել որպես վերջնական ժամանակացույց։'
    );
  }

  return recommendations;
}

function renderViolations(data) {
  const bestCandidate = data.bestCandidate || {};
  const coverage = getCoverageSummary(bestCandidate);
  const issueLines = buildIssueSummary(data);
  const recommendationLines = buildRecommendations(data);

  violationsOutput.innerHTML = `
    <div class="insight-box">
      <div class="insight-title">Ընդհանուր գնահատական</div>
      <p class="${coverage.severityClass}">
        ${coverage.severityText}
      </p>
      <ul class="insight-list">
        <li>Լիովին կամ մասնակի չփակված հերթափոխերի քանակը՝ ${coverage.problematicShiftCount}</li>
        <li>Փակված հերթափոխերի քանակը՝ ${coverage.coveredShiftCount}</li>
        <li>Ընդհանուր պակասած աշխատակիցների քանակը՝ ${coverage.totalMissingEmployees}</li>
      </ul>
    </div>

    <div class="insight-box">
      <div class="insight-title">Հիմնական դիտարկումներ</div>
      <ul class="insight-list">
        ${issueLines.map((line) => `<li>${line}</li>`).join('')}
      </ul>
    </div>

    <div class="insight-box">
      <div class="insight-title">Ինչպես կարելի է բարելավել արդյունքը</div>
      <ul class="insight-list">
        ${recommendationLines.map((line) => `<li>${line}</li>`).join('')}
      </ul>
    </div>
  `;

  violationsSection.classList.remove('hidden');
}

function buildCsvRows(data) {
  const schedule = data.bestCandidate?.schedule || [];
  const employees = data.planningMeta?.employees || [];
  const shiftTypes = data.planningMeta?.shiftTypes || [];
  const employeeMap = buildLookupMap(employees, 'id', 'full_name');
  const shiftMap = buildLookupMap(shiftTypes, 'id', 'name');

  const rows = [
    ['Անվանում', data.scheduleName || document.getElementById('scheduleName').value || 'Ժամանակացույց'],
    ['Սկսելու ամսաթիվ', data.selectedRange?.startDate || ''],
    ['Ավարտի ամսաթիվ', data.selectedRange?.endDate || ''],
    [],
    ['Ամսաթիվ', 'Հերթափոխ', 'Նշանակված աշխատակիցներ'],
  ];

  for (const entry of schedule) {
    const employeeNames = (entry.employee_ids || [])
      .map((id) => employeeMap.get(Number(id)) || `Աշխատակից #${id}`)
      .join(', ');

    rows.push([
      entry.work_date,
      shiftMap.get(Number(entry.shift_type_id)) || entry.shift_type_id,
      employeeNames || '-',
    ]);
  }

  return rows;
}

function rowsToCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
}

function downloadCsvFile(filename, csvContent) {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getCsvFilename() {
  const scheduleName =
    (lastGeneratedData?.scheduleName || document.getElementById('scheduleName').value || 'schedule')
      .trim()
      .replace(/\s+/g, '_');

  return `${scheduleName || 'schedule'}.csv`;
}

saveScheduleBtn.addEventListener('click', async () => {
  if (!lastGeneratedData) {
    setActionStatus('Նախ պետք է ժամանակացույց գեներացնել', true);
    return;
  }

  try {
    saveScheduleBtn.disabled = true;
    setActionStatus('Ժամանակացույցը պահպանվում է...');

    const response = await fetch('/api/schedules', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        scheduleName: lastGeneratedData.scheduleName || document.getElementById('scheduleName').value,
        bestCandidate: lastGeneratedData.bestCandidate,
        startDate: lastGeneratedData.selectedRange?.startDate,
        endDate: lastGeneratedData.selectedRange?.endDate,
      }),
    });

    const data = await response.json();

    if (response.status === 401) {
      localStorage.removeItem('scheduler_token');
      localStorage.removeItem('scheduler_user');
      window.location.href = '/login.html';
      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Չհաջողվեց պահպանել ժամանակացույցը');
    }

    setActionStatus('Պահպանվեց․ հիմա այն կտեսնեք «Իմ աղյուսակները» բաժնում');
  } catch (error) {
    setActionStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    saveScheduleBtn.disabled = false;
  }
});

downloadScheduleBtn.addEventListener('click', () => {
  if (!lastGeneratedData) {
    setActionStatus('Նախ պետք է ժամանակացույց գեներացնել', true);
    return;
  }

  const rows = buildCsvRows(lastGeneratedData);
  const csv = rowsToCsv(rows);
  downloadCsvFile(getCsvFilename(), csv);
  setActionStatus('Ներբեռնումը սկսվեց');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  generateBtn.disabled = true;
  saveScheduleBtn.disabled = true;
  downloadScheduleBtn.disabled = true;
  setStatus('Ժամանակացույցը գեներացվում է...');
  setActionStatus('');

  lastGeneratedData = null;

  summarySection.classList.add('hidden');
  scheduleSection.classList.add('hidden');
  violationsSection.classList.add('hidden');
  resultActionsSection.classList.add('hidden');

  try {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
      throw new Error('Ընտրեք սկսելու և ավարտի ամսաթիվը');
    }

    if (startDate > endDate) {
      throw new Error('Սկսելու ամսաթիվը չի կարող ուշ լինել ավարտի ամսաթվից');
    }

    const payload = {
      startDate,
      endDate,
      scheduleName: document.getElementById('scheduleName').value,
      populationSize: Number(document.getElementById('populationSize').value),
      generations: Number(document.getElementById('generations').value),
      mutationRate: Number(document.getElementById('mutationRate').value),
      crossoverRate: Number(document.getElementById('crossoverRate').value),
      elitismCount: Number(document.getElementById('elitismCount').value),
      tournamentSize: Number(document.getElementById('tournamentSize').value),
    };

    const response = await fetch('/api/runtime-scheduler/run', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.status === 401) {
      localStorage.removeItem('scheduler_token');
      localStorage.removeItem('scheduler_user');
      window.location.href = '/login.html';
      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Հարցումը չհաջողվեց');
    }

    lastGeneratedData = {
      ...data,
      scheduleName: payload.scheduleName,
    };

    renderSummary(lastGeneratedData);
    renderSchedule(lastGeneratedData);
    renderViolations(lastGeneratedData);

    resultActionsSection.classList.remove('hidden');
    saveScheduleBtn.disabled = false;
    downloadScheduleBtn.disabled = false;

    setStatus('Ժամանակացույցը հաջողությամբ կազմվեց');
  } catch (error) {
    setStatus(`Սխալ՝ ${error.message}`, true);
  } finally {
    generateBtn.disabled = false;
  }
});

