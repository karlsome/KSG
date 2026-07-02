'use strict';

window.addEventListener('languageChanged', () => {
  const root = document.getElementById('analyticsRoot');
  if (!root) return;
  if (typeof applyTranslations === 'function') applyTranslations(root);
  analyticsSyncShiftControls();
  if (analyticsData) renderAnalytics(analyticsData);
  analyticsUpdateFilterOptionLabels();
});

let analyticsRequestId = 0;
let analyticsCharts = {};
let analyticsActiveTab = 'overview';
let analyticsData = null;
const ANALYTICS_SHIFT_STORAGE_KEY = 'analyticsWorkerShiftProfile';
const ANALYTICS_DEFAULT_SHIFT_LABEL = '__analytics_default_shift__';
const analyticsDefaultShiftProfile = Object.freeze({
  label: ANALYTICS_DEFAULT_SHIFT_LABEL,
  start: '08:30',
  end: '17:00',
  hours: 8.5
});

function analyticsGetAuthHeaders() {
  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const token = localStorage.getItem('ksgToken') || '';
  const headers = {};

  if (currentUser.username) headers['x-session-user'] = currentUser.username;
  if (currentUser.role) headers['x-session-role'] = currentUser.role;
  if (currentUser.dbName) headers['x-session-db-name'] = currentUser.dbName;
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

function analyticsGetTokyoDateInputValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function analyticsEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function analyticsFormatNumber(value, digits = 0) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '0';

  return number.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function analyticsFormatPercent(value) {
  return `${analyticsFormatNumber(value, 1)}%`;
}

function analyticsFormatHours(value) {
  return `${analyticsFormatNumber(value, 2)} ${t('analytics.common.hoursUnit')}`;
}

function analyticsFormatCount(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '0';
  return analyticsFormatNumber(number, Number.isInteger(number) ? 0 : 1);
}

function analyticsFormatPiecesPerHour(value) {
  return `${analyticsFormatNumber(value, 2)} ${t('analytics.common.piecesPerHourUnit')}`;
}

function analyticsGetShiftLabel(label) {
  const normalized = String(label ?? '').trim();
  if (!normalized || normalized === ANALYTICS_DEFAULT_SHIFT_LABEL || normalized.toLowerCase() === 'morning shift') {
    return t('analytics.shift.defaultLabel');
  }

  return normalized;
}

function analyticsFormatSignedPercent(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '0.0%';
  const sign = number > 0 ? '+' : '';
  return `${sign}${analyticsFormatNumber(number, 1)}%`;
}

function analyticsShortenLabel(value, maxLength = 40) {
  const text = String(value ?? '').trim();
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function analyticsNormalizeShiftTime(value, fallback) {
  const normalized = String(value ?? '').trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized) ? normalized : fallback;
}

function analyticsCalculateShiftHours(startTime, endTime) {
  const [startHour, startMinute] = String(startTime).split(':').map(Number);
  const [endHour, endMinute] = String(endTime).split(':').map(Number);

  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) {
    return analyticsDefaultShiftProfile.hours;
  }

  const startTotalMinutes = (startHour * 60) + startMinute;
  const endTotalMinutes = (endHour * 60) + endMinute;
  let durationMinutes = endTotalMinutes - startTotalMinutes;

  if (durationMinutes <= 0) {
    durationMinutes += 24 * 60;
  }

  return durationMinutes / 60;
}

function analyticsBuildShiftProfile(source = {}) {
  const start = analyticsNormalizeShiftTime(source.start, analyticsDefaultShiftProfile.start);
  const end = analyticsNormalizeShiftTime(source.end, analyticsDefaultShiftProfile.end);
  return {
    label: analyticsGetShiftLabel(source.label || analyticsDefaultShiftProfile.label),
    start,
    end,
    hours: analyticsCalculateShiftHours(start, end)
  };
}

function analyticsReadStoredShiftProfile() {
  try {
    const storedValue = localStorage.getItem(ANALYTICS_SHIFT_STORAGE_KEY);
    if (!storedValue) return null;
    return JSON.parse(storedValue);
  } catch (error) {
    console.warn('analytics shift profile storage read error:', error);
    return null;
  }
}

function analyticsSaveShiftProfile(shiftProfile) {
  try {
    localStorage.setItem(ANALYTICS_SHIFT_STORAGE_KEY, JSON.stringify({
      start: shiftProfile.start,
      end: shiftProfile.end
    }));
  } catch (error) {
    console.warn('analytics shift profile storage write error:', error);
  }
}

function analyticsClearShiftProfile() {
  try {
    localStorage.removeItem(ANALYTICS_SHIFT_STORAGE_KEY);
  } catch (error) {
    console.warn('analytics shift profile storage clear error:', error);
  }
}

function analyticsGetShiftProfile(source = null) {
  if (source && typeof source === 'object') {
    return analyticsBuildShiftProfile(source);
  }

  return analyticsBuildShiftProfile(analyticsReadStoredShiftProfile() || analyticsDefaultShiftProfile);
}

function analyticsSyncShiftControls(shiftProfileInput = null) {
  const shiftProfile = analyticsGetShiftProfile(shiftProfileInput);
  const shiftStartEl = document.getElementById('analyticsShiftStart');
  const shiftEndEl = document.getElementById('analyticsShiftEnd');
  const shiftSummaryEl = document.getElementById('analyticsShiftSummary');

  if (shiftStartEl) shiftStartEl.value = shiftProfile.start;
  if (shiftEndEl) shiftEndEl.value = shiftProfile.end;
  if (shiftSummaryEl) {
    shiftSummaryEl.textContent = t('analytics.shift.shiftPattern')
      .replace('{start}', shiftProfile.start)
      .replace('{end}', shiftProfile.end)
      .replace('{hours}', analyticsFormatHours(shiftProfile.hours));
  }

  return shiftProfile;
}

function analyticsGetWorkerAverageShiftOutput(worker, shiftProfile) {
  const activeDays = Number(worker?.activeDays || 0);
  if (activeDays <= 0) return 0;
  return Number(worker?.totalGoodCount || 0) / activeDays;
}

function analyticsGetWorkerShiftUtilization(worker, shiftProfile) {
  const shiftHours = Number(shiftProfile?.hours || 0);
  const activeDays = Number(worker?.activeDays || 0);
  if (shiftHours <= 0 || activeDays <= 0) return 0;
  return (Number(worker?.totalManHours || 0) / (activeDays * shiftHours)) * 100;
}

function analyticsGetFocusShiftUtilization(point, shiftProfile) {
  const shiftHours = Number(shiftProfile?.hours || 0);
  if (shiftHours <= 0) return 0;
  return (Number(point?.manHours || 0) / shiftHours) * 100;
}

function analyticsFormatTooltipMetric(seriesName, value) {
  const number = Number(Array.isArray(value) ? value[value.length - 1] : value);
  if (!Number.isFinite(number)) return '-';

  if (/(pieces\/h|output\/hour|per hour|\/h)/i.test(seriesName)) {
    return analyticsFormatPiecesPerHour(number);
  }

  if (/delta/i.test(seriesName)) {
    return analyticsFormatSignedPercent(number);
  }

  if (/(hour|time)/i.test(seriesName)) {
    return analyticsFormatHours(number);
  }

  if (/(rate|%|utilization)/i.test(seriesName)) {
    return `${analyticsFormatNumber(number, 2)}%`;
  }

  return analyticsFormatNumber(number, Number.isInteger(number) ? 0 : 2);
}

function analyticsAxisTooltipFormatter(params) {
  const items = Array.isArray(params) ? params : [params];
  if (!items.length) return '';

  const axisLabel = analyticsEscapeHtml(items[0].axisValueLabel || items[0].name || '');
  const rows = items.map(item => {
    const marker = item.marker || '';
    const seriesName = analyticsEscapeHtml(item.seriesName || t('analytics.common.value'));
    const formattedValue = analyticsFormatTooltipMetric(item.seriesName || '', item.value);
    return `${marker}${seriesName}<span style="float:right;margin-left:24px;font-weight:600;color:#111827;">${formattedValue}</span>`;
  }).join('<br>');

  return `${axisLabel}<br/>${rows}`;
}

function analyticsFormatDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('ja-JP');
}

function analyticsGetProductLabel(item = {}) {
  const bits = [item.productName || item.product_name || item.hinban || t('analytics.common.unknown')];
  if (item.hinban && item.productName && item.hinban !== item.productName) bits.push(item.hinban);
  if (item.lhRh || item.lh_rh) bits.push(item.lhRh || item.lh_rh);
  return bits.filter(Boolean).join(' / ');
}

function analyticsGetCardValueClass(card = {}) {
  if (card.valueClass) return card.valueClass;

  const tone = card.tone || '';
  if (tone.includes('emerald')) return 'text-emerald-600';
  if (tone.includes('rose')) return 'text-rose-600';
  if (tone.includes('amber')) return 'text-amber-600';
  if (tone.includes('sky')) return 'text-sky-600';
  if (tone.includes('violet')) return 'text-violet-600';
  if (tone.includes('cyan')) return 'text-cyan-600';
  return 'text-gray-900';
}

function analyticsGetCardValueText(card = {}) {
  return String(card.value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyticsGetCardValueSizeClass(card = {}) {
  const valueText = analyticsGetCardValueText(card);

  if (valueText.length > 44) return 'text-base';
  if (valueText.length > 28) return 'text-lg';
  if (valueText.length > 18) return 'text-xl';
  return 'text-2xl';
}

function analyticsShouldWrapCardValue(card = {}) {
  return analyticsGetCardValueText(card).length > 24;
}

function analyticsGetCardValueLayoutClass(card = {}) {
  if (analyticsShouldWrapCardValue(card)) {
    return 'whitespace-normal break-words';
  }

  return 'overflow-hidden text-ellipsis whitespace-nowrap';
}

function analyticsGetSummaryCardsMarkup(cards = []) {
  return cards.map(card => `
    <article class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-500">${card.title || card.eyebrow || ''}${card.info ? ` <i class="ri-information-line align-middle text-gray-300" title="${analyticsEscapeHtml(card.info)}"></i>` : ''}</p>
          <p class="mt-4 max-w-full font-semibold leading-tight ${analyticsGetCardValueLayoutClass(card)} ${analyticsGetCardValueSizeClass(card)} ${analyticsGetCardValueClass(card)}" title="${analyticsEscapeHtml(analyticsGetCardValueText(card))}">${card.value}${card.delta || ''}</p>
          <p class="mt-2 text-xs uppercase tracking-wide text-gray-400">${card.detail || card.subtext || ''}</p>
        </div>
        ${card.icon ? `<div class="shrink-0 rounded-2xl px-3 py-2 ${card.tone || 'bg-gray-100 text-gray-700'}"><i class="${card.icon} text-xl"></i></div>` : ''}
      </div>
    </article>`).join('');
}

function analyticsRenderCardGrid(containerId, cards = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = cards.length
    ? analyticsGetSummaryCardsMarkup(cards)
    : `<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.empty.noData'))}</div>`;
}

function analyticsRenderTableState(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="px-6 py-10 text-sm text-gray-400">${analyticsEscapeHtml(message)}</div>`;
}

function analyticsShowChartEmpty(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (analyticsCharts[containerId]) {
    analyticsCharts[containerId].dispose();
    delete analyticsCharts[containerId];
  }

  container.innerHTML = `<div class="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">${analyticsEscapeHtml(message)}</div>`;
}

function analyticsRenderChart(containerId, option) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (typeof echarts === 'undefined') {
    analyticsShowChartEmpty(containerId, t('analytics.empty.chartNotAvailable'));
    return;
  }

  let chart = analyticsCharts[containerId];

  if (chart && container.childElementCount === 0) {
    chart.dispose();
    delete analyticsCharts[containerId];
    chart = null;
  }

  if (!chart) {
    container.innerHTML = '';
    chart = echarts.init(container);
    analyticsCharts[containerId] = chart;
  }

  chart.setOption(option, true);
  requestAnimationFrame(() => chart.resize());
}

function analyticsSetDefaultFilters(force = false) {
  const startDateEl = document.getElementById('analyticsStartDate');
  const endDateEl = document.getElementById('analyticsEndDate');
  if (!startDateEl || !endDateEl) return;

  if (force || !startDateEl.value) startDateEl.value = analyticsGetTokyoDateInputValue(-29);
  if (force || !endDateEl.value) endDateEl.value = analyticsGetTokyoDateInputValue(0);
}

function analyticsBuildParams() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('analyticsStartDate')?.value || '';
  const endDate = document.getElementById('analyticsEndDate')?.value || '';
  const hinban = document.getElementById('analyticsHinban')?.value.trim() || '';
  const productName = document.getElementById('analyticsProductName')?.value.trim() || '';
  const operator = document.getElementById('analyticsOperator')?.value.trim() || '';
  const source = document.getElementById('analyticsSource')?.value || 'all';
  const lhRh = document.getElementById('analyticsLhRh')?.value || 'all';
  const focusOperator = document.getElementById('analyticsFocusOperator')?.value || '';

  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (hinban) params.set('hinban', hinban);
  if (productName) params.set('productName', productName);
  if (operator) params.set('operator', operator);
  if (source && source !== 'all') params.set('source', source);
  if (lhRh && lhRh !== 'all') params.set('lhRh', lhRh);
  if (focusOperator) params.set('focusOperator', focusOperator);

  return params;
}

function analyticsSetError(message = '') {
  const errorEl = document.getElementById('analyticsError');
  if (!errorEl) return;

  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
}

function analyticsPopulateDatalist(id, values) {
  const datalist = document.getElementById(id);
  if (!datalist) return;
  datalist.innerHTML = values.map(value => `<option value="${analyticsEscapeHtml(value)}"></option>`).join('');
}

function analyticsPopulateSelect(id, values, defaultLabel, allowBlank = false) {
  const select = document.getElementById(id);
  if (!select) return;

  const currentValue = select.value;
  const uniqueValues = [...new Set(values.filter(Boolean))];
  const options = [];

  if (allowBlank) {
    options.push(`<option value="">${analyticsEscapeHtml(defaultLabel)}</option>`);
  } else {
    options.push(`<option value="all">${analyticsEscapeHtml(defaultLabel)}</option>`);
  }

  uniqueValues.forEach(value => {
    options.push(`<option value="${analyticsEscapeHtml(value)}">${analyticsEscapeHtml(value)}</option>`);
  });

  select.innerHTML = options.join('');
  if (uniqueValues.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = allowBlank ? '' : 'all';
  }
}

function analyticsUpdateTabState() {
  document.querySelectorAll('[data-analytics-tab]').forEach(button => {
    const isActive = button.getAttribute('data-analytics-tab') === analyticsActiveTab;
    button.classList.toggle('bg-gray-100', isActive);
    button.classList.toggle('text-gray-900', isActive);
    button.classList.toggle('shadow-sm', isActive);
    button.classList.toggle('text-gray-500', !isActive);
    button.classList.toggle('hover:bg-gray-50', !isActive);
  });

  document.querySelectorAll('[data-analytics-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.getAttribute('data-analytics-panel') !== analyticsActiveTab);
  });
}

function setAnalyticsTab(tabName) {
  analyticsActiveTab = tabName || 'overview';
  analyticsUpdateTabState();
  renderAnalyticsActiveTab();
  if (typeof analyticsSaveViewState === 'function') analyticsSaveViewState();
}

function analyticsGetHighestBy(items = [], valueSelector, filterSelector = null) {
  const filtered = filterSelector ? items.filter(filterSelector) : items.slice();
  return filtered.slice().sort((a, b) => valueSelector(b) - valueSelector(a))[0] || null;
}

function renderAnalyticsMeta(filters, summary, generatedAt, shiftProfileInput) {
  const metaEl = document.getElementById('analyticsMetaChips');
  const updatedEl = document.getElementById('analyticsLastUpdated');
  const focusMetaEl = document.getElementById('analyticsOperatorFocusMeta');
  const skillMetaEl = document.getElementById('analyticsOperatorSkillMeta');
  if (!metaEl || !updatedEl) return;
  const shiftProfile = analyticsSyncShiftControls(shiftProfileInput);

  updatedEl.textContent = analyticsFormatDateTime(generatedAt);

  const chips = [
    {
      label: t('analytics.meta.range'),
      value: t('analytics.meta.rangeValuePattern')
        .replace('{start}', analyticsEscapeHtml(filters.startDate || t('analytics.meta.all')))
        .replace('{end}', analyticsEscapeHtml(filters.endDate || t('analytics.meta.all'))),
      tone: 'border-slate-100 bg-slate-50'
    },
    {
      label: t('analytics.meta.records'),
      value: analyticsFormatNumber(summary.submissions),
      tone: 'border-emerald-100 bg-emerald-50'
    },
    {
      label: t('analytics.meta.workers'),
      value: analyticsFormatNumber(summary.uniqueOperators),
      tone: 'border-sky-100 bg-sky-50'
    },
    {
      label: t('analytics.meta.machines'),
      value: analyticsFormatNumber(summary.uniqueSources),
      tone: 'border-violet-100 bg-violet-50'
    }
  ];

  if (filters.source) chips.push({ label: t('analytics.meta.machine'), value: analyticsEscapeHtml(filters.source), tone: 'border-gray-200 bg-white' });
  if (filters.lhRh) chips.push({ label: t('analytics.meta.direction'), value: analyticsEscapeHtml(filters.lhRh), tone: 'border-gray-200 bg-white' });
  if (filters.hinban) chips.push({ label: t('analytics.meta.hinban'), value: analyticsEscapeHtml(filters.hinban), tone: 'border-gray-200 bg-white' });
  if (filters.productName) chips.push({ label: t('analytics.meta.product'), value: analyticsEscapeHtml(filters.productName), tone: 'border-gray-200 bg-white' });
  if (filters.operator) chips.push({ label: t('analytics.meta.worker'), value: analyticsEscapeHtml(filters.operator), tone: 'border-gray-200 bg-white' });
  chips.push({
    label: t('analytics.meta.shift'),
    value: t('analytics.meta.shiftValuePattern')
      .replace('{start}', analyticsEscapeHtml(shiftProfile.start))
      .replace('{end}', analyticsEscapeHtml(shiftProfile.end))
      .replace('{hours}', analyticsFormatHours(shiftProfile.hours)),
    tone: 'border-gray-200 bg-white'
  });

  metaEl.innerHTML = chips.map(chip => `
    <div class="rounded-xl border px-3 py-2 text-sm ${chip.tone}">
      <span class="text-gray-600">${chip.label}:</span>
      <strong class="ml-2 font-semibold text-gray-900">${chip.value}</strong>
    </div>`).join('');

  if (focusMetaEl) {
    focusMetaEl.textContent = filters.focusOperator
      ? t('analytics.shift.focusedOnText')
          .replace('{name}', filters.focusOperator)
          .replace('{start}', shiftProfile.start)
          .replace('{end}', shiftProfile.end)
          .replace('{label}', shiftProfile.label)
      : t('analytics.shift.autoSelectText');
  }

  if (skillMetaEl) {
    skillMetaEl.textContent = filters.focusOperator
      ? t('analytics.shift.focusedSkillText').replace('{name}', filters.focusOperator)
      : t('analytics.shift.autoSkillText');
  }
}

function renderAnalyticsKpis(summary, previousSummary = null) {
  const cards = [
    {
      eyebrow: t('analytics.kpi.goodPieces'),
      value: analyticsFormatNumber(summary.totalGoodCount),
      delta: previousSummary ? analyticsBuildDeltaChip(summary.totalGoodCount, previousSummary.totalGoodCount, { higherIsBetter: true }) : '',
      info: t('analytics.kpi.infoGoodPieces'),
      detail: t('analytics.kpi.recordsInScope').replace('{n}', analyticsFormatNumber(summary.submissions)),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-checkbox-circle-line'
    },
    {
      eyebrow: t('analytics.kpi.defectRate'),
      value: analyticsFormatPercent(summary.defectRate),
      delta: previousSummary ? analyticsBuildDeltaChip(summary.defectRate, previousSummary.defectRate, { higherIsBetter: false, isRate: true }) : '',
      info: t('analytics.kpi.infoDefectRate'),
      detail: t('analytics.kpi.totalDefects').replace('{n}', analyticsFormatNumber(summary.totalDefectCount)),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.kpi.issueRecords'),
      value: analyticsFormatNumber(summary.totalIssueRecords),
      delta: previousSummary ? analyticsBuildDeltaChip(summary.totalIssueRecords, previousSummary.totalIssueRecords, { higherIsBetter: false }) : '',
      info: t('analytics.kpi.infoIssueRecords'),
      detail: t('analytics.kpi.recordsWithIssues'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: t('analytics.kpi.manHours'),
      value: analyticsFormatHours(summary.totalManHours),
      delta: previousSummary ? analyticsBuildDeltaChip(summary.totalManHours, previousSummary.totalManHours, { higherIsBetter: true }) : '',
      info: t('analytics.kpi.infoManHours'),
      detail: t('analytics.kpi.troubleTime').replace('{n}', analyticsFormatHours(summary.totalTroubleTime)),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-time-line'
    },
    {
      eyebrow: t('analytics.kpi.activeWorkers'),
      value: analyticsFormatNumber(summary.uniqueOperators),
      info: t('analytics.kpi.infoActiveWorkers'),
      detail: t('analytics.kpi.kanbans').replace('{n}', analyticsFormatNumber(summary.uniqueKanbans)),
      tone: 'bg-violet-50 text-violet-700',
      icon: 'ri-team-line'
    },
    {
      eyebrow: t('analytics.kpi.activeMachines'),
      value: analyticsFormatNumber(summary.uniqueSources),
      info: t('analytics.kpi.infoActiveMachines'),
      detail: t('analytics.kpi.products').replace('{n}', analyticsFormatNumber(summary.uniqueProducts)),
      tone: 'bg-cyan-50 text-cyan-700',
      icon: 'ri-cpu-line'
    }
  ];

  analyticsRenderCardGrid('analyticsKpiGrid', cards);
}

function renderAnalyticsOverviewTrendChart(dailyTrend) {
  if (!Array.isArray(dailyTrend) || dailyTrend.length === 0) {
    analyticsShowChartEmpty('analyticsTrendChart', t('analytics.overview.noTrendData'));
    return;
  }

  const lgGoodPieces = t('analytics.kpi.goodPieces');
  const lgManHours = t('analytics.kpi.manHours');
  const lgIssueRecords = t('analytics.kpi.issueRecords');
  const lgDefectRate = t('analytics.kpi.defectRate');

  analyticsRenderChart('analyticsTrendChart', {
    color: ['#0f172a', '#14b8a6', '#f59e0b', '#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgGoodPieces, lgManHours, lgIssueRecords, lgDefectRate] },
    grid: { left: 32, right: 32, top: 56, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: dailyTrend.map(item => item.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.machine.yAxisPiecesHours'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: '% / Issues',
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgGoodPieces,
        type: 'bar',
        barMaxWidth: 24,
        data: dailyTrend.map(item => Number(item.goodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] },
        yAxisIndex: 0
      },
      {
        name: lgManHours,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: dailyTrend.map(item => Number(item.manHours || 0)),
        yAxisIndex: 0
      },
      {
        name: lgIssueRecords,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: dailyTrend.map(item => Number(item.issueCount || 0)),
        yAxisIndex: 1
      },
      {
        name: lgDefectRate,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: dailyTrend.map(item => Number(item.defectRate || 0)),
        yAxisIndex: 1
      }
    ]
  });
}

function renderAnalyticsOverview(data) {
  const dailyTrend = data.dailyTrend || [];
  const topDefect = (data.topDefects || [])[0];
  const busiestWorker = analyticsGetHighestBy(data.operatorComparison || [], item => Number(item.totalManHours || 0));
  const unstableMachine = analyticsGetHighestBy(data.sourceBreakdown || [], item => Number(item.totalTroubleTime || 0));
  const leadProduct = analyticsGetHighestBy(data.topProducts || [], item => Number(item.totalGoodCount || 0));
  const worstDay = analyticsGetHighestBy(dailyTrend, item => Number(item.issueCount || 0));

  const overviewCards = [
    {
      eyebrow: t('analytics.overview.mainDefectDriver'),
      value: topDefect ? analyticsEscapeHtml(topDefect.name) : t('analytics.overview.noDefects'),
      detail: topDefect
        ? t('analytics.overview.defectHits').replace('{n}', analyticsFormatNumber(topDefect.count))
        : t('analytics.overview.noQualityLoss'),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.overview.mostLoadedWorker'),
      value: busiestWorker ? analyticsEscapeHtml(busiestWorker.name) : t('analytics.overview.noWorkerData'),
      detail: busiestWorker
        ? t('analytics.overview.workerHoursRecords')
            .replace('{hours}', analyticsFormatHours(busiestWorker.totalManHours))
            .replace('{records}', analyticsFormatNumber(busiestWorker.submissions))
        : t('analytics.overview.noWorkerActivity'),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-user-star-line'
    },
    {
      eyebrow: t('analytics.overview.mostUnstableMachine'),
      value: unstableMachine ? analyticsEscapeHtml(unstableMachine.source) : t('analytics.overview.noMachineData'),
      detail: unstableMachine
        ? t('analytics.overview.machineTroubleRate')
            .replace('{hours}', analyticsFormatHours(unstableMachine.totalTroubleTime))
            .replace('{rate}', analyticsFormatPercent(unstableMachine.defectRate))
        : t('analytics.overview.noMachineActivity'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-cpu-line'
    },
    {
      eyebrow: t('analytics.overview.leadProduct'),
      value: leadProduct ? analyticsEscapeHtml(analyticsGetProductLabel(leadProduct)) : t('analytics.overview.noProductData'),
      detail: leadProduct
        ? t('analytics.overview.productGoodDefect')
            .replace('{good}', analyticsFormatNumber(leadProduct.totalGoodCount))
            .replace('{rate}', analyticsFormatPercent(leadProduct.defectRate))
        : t('analytics.overview.noProductActivity'),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-box-3-line'
    }
  ];

  const worstBottleneck = (data.machineTimeLoss || [])[0];
  if (worstBottleneck && Number(worstBottleneck.lostHoursPerDay || 0) >= 0.25) {
    overviewCards.push({
      eyebrow: t('analytics.overview.biggestBottleneck'),
      value: analyticsEscapeHtml(worstBottleneck.source),
      detail: t('analytics.overview.bottleneckDetail').replace('{hours}', analyticsFormatHours(worstBottleneck.lostHoursPerDay)),
      tone: 'bg-violet-50 text-violet-700',
      icon: 'ri-hourglass-line'
    });
  }

  if (data.finance) {
    const monthEntry = (data.finance.monthly || []).find(entry => entry.month === data.finance.monthKey);
    overviewCards.push({
      eyebrow: t('analytics.overview.profitThisMonth'),
      value: analyticsFormatCurrency(monthEntry?.earned || 0),
      detail: t('analytics.overview.profitLostDetail').replace('{n}', analyticsFormatCurrency(monthEntry?.lost || 0)),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-money-cny-circle-line'
    });
  }

  analyticsRenderCardGrid('analyticsOverviewHighlights', overviewCards);

  renderAnalyticsWeeklyDigest(data);
  renderAnalyticsOverviewTrendChart(dailyTrend);

  const overviewDrivers = document.getElementById('analyticsOverviewDrivers');
  if (overviewDrivers) {
    const machineAlert = unstableMachine
      ? t('analytics.overview.machineAlertText')
          .replace('{source}', analyticsEscapeHtml(unstableMachine.source))
          .replace('{hours}', analyticsFormatHours(unstableMachine.totalTroubleTime))
          .replace('{rate}', analyticsFormatPercent(unstableMachine.defectRate))
      : t('analytics.overview.noMachineAlert');
    const workerAlert = busiestWorker
      ? t('analytics.overview.workerAlertText')
          .replace('{name}', analyticsEscapeHtml(busiestWorker.name))
          .replace('{hours}', analyticsFormatHours(busiestWorker.totalManHours))
          .replace('{issues}', analyticsFormatNumber(busiestWorker.issueCount))
      : t('analytics.overview.noWorkerAlert');
    const dayAlert = worstDay
      ? t('analytics.overview.dayAlertText')
          .replace('{day}', analyticsEscapeHtml(worstDay.label))
          .replace('{issues}', analyticsFormatNumber(worstDay.issueCount))
          .replace('{rate}', analyticsFormatPercent(worstDay.defectRate))
      : t('analytics.overview.noDayPattern');

    const qualitySignalText = topDefect
      ? t('analytics.overview.qualitySignalText')
          .replace('{name}', analyticsEscapeHtml(topDefect.name))
          .replace('{count}', analyticsFormatNumber(topDefect.count))
      : t('analytics.overview.noDefectSignal');

    overviewDrivers.innerHTML = `
      <div class="space-y-4">
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.overview.qualitySignal'))}</p>
          <p class="mt-2 text-sm text-slate-700">${qualitySignalText}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.overview.machineSignal'))}</p>
          <p class="mt-2 text-sm text-slate-700">${machineAlert}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.overview.laborSignal'))}</p>
          <p class="mt-2 text-sm text-slate-700">${workerAlert}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.overview.dailyPattern'))}</p>
          <p class="mt-2 text-sm text-slate-700">${dayAlert}</p>
        </div>
      </div>`;
  }
}

function renderAnalyticsWorkerProductivityChart(operatorComparison, shiftProfile) {
  const rankedWorkers = (operatorComparison || [])
    .slice()
    .sort((a, b) => analyticsGetWorkerAverageShiftOutput(b, shiftProfile) - analyticsGetWorkerAverageShiftOutput(a, shiftProfile) || Number(b.outputPerHour || 0) - Number(a.outputPerHour || 0))
    .slice(0, 12);

  if (rankedWorkers.length === 0) {
    analyticsShowChartEmpty('analyticsWorkerProductivityChart', t('analytics.worker.noProductivityData'));
    return;
  }

  const lgAvgOutput = t('analytics.worker.chartAvgOutputShift');
  const lgOutputHour = t('analytics.worker.chartOutputHour');

  analyticsRenderChart('analyticsWorkerProductivityChart', {
    color: ['#0f766e', '#0284c7'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgAvgOutput, lgOutputHour] },
    grid: { left: 48, right: 52, top: 56, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankedWorkers.map(item => item.name),
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        rotate: 18,
        formatter: value => analyticsShortenLabel(value, 14)
      }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.worker.yAxisPiecesShift'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: t('analytics.worker.yAxisPcsH'),
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgAvgOutput,
        type: 'bar',
        barMaxWidth: 30,
        data: rankedWorkers.map(item => analyticsGetWorkerAverageShiftOutput(item, shiftProfile)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgOutputHour,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rankedWorkers.map(item => Number(item.outputPerHour || 0))
      }
    ]
  });
}

function renderAnalyticsWorkerQualityChart(operatorComparison) {
  const rankedWorkers = (operatorComparison || [])
    .slice()
    .sort((a, b) => Number(b.totalDefectCount || 0) - Number(a.totalDefectCount || 0) || Number(b.defectRate || 0) - Number(a.defectRate || 0))
    .slice(0, 12);

  if (rankedWorkers.length === 0) {
    analyticsShowChartEmpty('analyticsWorkerQualityChart', t('analytics.worker.noQualityData'));
    return;
  }

  const lgAttributedDefects = t('analytics.worker.chartAttributedDefects');
  const lgDefectRate = t('analytics.worker.chartDefectRate');

  analyticsRenderChart('analyticsWorkerQualityChart', {
    color: ['#dc2626', '#f59e0b'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgAttributedDefects, lgDefectRate] },
    grid: { left: 48, right: 52, top: 56, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankedWorkers.map(item => item.name),
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        rotate: 18,
        formatter: value => analyticsShortenLabel(value, 14)
      }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.worker.yAxisDefects'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: t('analytics.worker.yAxisPercent'),
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgAttributedDefects,
        type: 'bar',
        barMaxWidth: 30,
        data: rankedWorkers.map(item => Number(item.totalDefectCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgDefectRate,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rankedWorkers.map(item => Number(item.defectRate || 0))
      }
    ]
  });
}

function renderAnalyticsWorkerEfficiencyChart(operatorComparison, shiftProfile) {
  const rankedWorkers = (operatorComparison || [])
    .slice()
    .sort((a, b) => analyticsGetWorkerShiftUtilization(a, shiftProfile) - analyticsGetWorkerShiftUtilization(b, shiftProfile) || Number((b.totalBreakTime || 0) + (b.totalTroubleTime || 0)) - Number((a.totalBreakTime || 0) + (a.totalTroubleTime || 0)))
    .slice(0, 12);

  if (rankedWorkers.length === 0) {
    analyticsShowChartEmpty('analyticsWorkerEfficiencyChart', t('analytics.worker.noEfficiencyData'));
    return;
  }

  const lgBreakTime = t('analytics.worker.chartBreakTime');
  const lgTroubleTime = t('analytics.worker.chartTroubleTime');
  const lgShiftUtil = t('analytics.worker.chartShiftUtil');

  analyticsRenderChart('analyticsWorkerEfficiencyChart', {
    color: ['#fbbf24', '#ef4444', '#1d4ed8'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgBreakTime, lgTroubleTime, lgShiftUtil] },
    grid: { left: 48, right: 52, top: 56, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankedWorkers.map(item => item.name),
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        rotate: 18,
        formatter: value => analyticsShortenLabel(value, 14)
      }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.worker.yAxisHours'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: t('analytics.worker.yAxisPercentShift'),
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgBreakTime,
        type: 'bar',
        stack: 'downtime',
        barMaxWidth: 28,
        data: rankedWorkers.map(item => Number(item.totalBreakTime || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgTroubleTime,
        type: 'bar',
        stack: 'downtime',
        barMaxWidth: 28,
        data: rankedWorkers.map(item => Number(item.totalTroubleTime || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgShiftUtil,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rankedWorkers.map(item => analyticsGetWorkerShiftUtilization(item, shiftProfile))
      }
    ]
  });
}

function renderAnalyticsWorkerConsistencyChart(operatorFocus, shiftProfile) {
  if (!operatorFocus || !Array.isArray(operatorFocus.points) || operatorFocus.points.length === 0) {
    analyticsShowChartEmpty('analyticsWorkerConsistencyChart', t('analytics.worker.noConsistencyData'));
    return;
  }

  const lgShiftOutput = t('analytics.worker.chartShiftOutput');
  const lgOutputHour2 = t('analytics.worker.chartOutputHour');
  const lgShiftUtil2 = t('analytics.worker.chartShiftUtil');

  analyticsRenderChart('analyticsWorkerConsistencyChart', {
    color: ['#0f766e', '#1d4ed8', '#dc2626'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgShiftOutput, lgOutputHour2, lgShiftUtil2] },
    grid: { left: 48, right: 84, top: 56, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: operatorFocus.points.map(item => item.label),
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.worker.yAxisPiecesShift'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: t('analytics.worker.yAxisPcsH'),
        position: 'right',
        splitLine: { show: false }
      },
      {
        type: 'value',
        name: t('analytics.worker.yAxisPercentShift'),
        position: 'right',
        offset: 56,
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgShiftOutput,
        type: 'bar',
        barMaxWidth: 24,
        data: operatorFocus.points.map(item => Number(item.goodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgOutputHour2,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: operatorFocus.points.map(item => Number(item.outputPerHour || 0))
      },
      {
        name: lgShiftUtil2,
        type: 'line',
        yAxisIndex: 2,
        smooth: true,
        symbolSize: 8,
        data: operatorFocus.points.map(item => analyticsGetFocusShiftUtilization(item, shiftProfile))
      }
    ]
  });
}

function analyticsWorkerSkillTooltipFormatter(params) {
  const item = Array.isArray(params) ? params[0] : params;
  const context = item?.data?.context;
  if (!context) return '';

  const scopeLabel = context.scope === 'source' ? t('analytics.worker.scopeMachine') : t('analytics.worker.scopeProduct');
  return [
    `<strong>${analyticsEscapeHtml(scopeLabel)}</strong>`,
    analyticsEscapeHtml(context.label || t('analytics.common.unknown')),
    `${analyticsEscapeHtml(t('analytics.worker.tooltipOutputHour'))}<span style="float:right;margin-left:24px;font-weight:600;color:#111827;">${analyticsFormatPiecesPerHour(context.outputPerHour)}</span>`,
    `${analyticsEscapeHtml(t('analytics.worker.tooltipBaselineHour'))}<span style="float:right;margin-left:24px;font-weight:600;color:#111827;">${analyticsFormatPiecesPerHour(context.benchmarkOutputPerHour)}</span>`,
    `${analyticsEscapeHtml(t('analytics.worker.tooltipDelta'))}<span style="float:right;margin-left:24px;font-weight:600;color:#111827;">${analyticsFormatSignedPercent(context.deltaPercent)}</span>`,
    `${analyticsEscapeHtml(t('analytics.worker.tooltipDefectRate'))}<span style="float:right;margin-left:24px;font-weight:600;color:#111827;">${analyticsFormatPercent(context.defectRate)}</span>`,
    `${analyticsEscapeHtml(t('analytics.worker.tooltipBaselineDefect'))}<span style="float:right;margin-left:24px;font-weight:600;color:#111827;">${analyticsFormatPercent(context.benchmarkDefectRate)}</span>`
  ].join('<br>');
}

function renderAnalyticsWorkerSkillChart(operatorSkillProfile) {
  const contexts = (operatorSkillProfile?.contexts || [])
    .slice()
    .sort((a, b) => Number(b.deltaPercent || 0) - Number(a.deltaPercent || 0));

  if (contexts.length === 0) {
    analyticsShowChartEmpty('analyticsWorkerSkillChart', t('analytics.worker.noSkillData'));
    return;
  }

  analyticsRenderChart('analyticsWorkerSkillChart', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: analyticsWorkerSkillTooltipFormatter },
    grid: { left: 220, right: 32, top: 24, bottom: 32, containLabel: false },
    xAxis: {
      type: 'value',
      name: t('analytics.worker.yAxisVsBaseline'),
      splitLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'category',
      data: contexts.map(item => analyticsShortenLabel(`${item.scope === 'source' ? t('analytics.worker.scopeMachine') : t('analytics.worker.scopeProduct')} · ${item.label}`, 34)),
      axisTick: { show: false },
      axisLine: { show: false }
    },
    series: [
      {
        name: t('analytics.worker.chartSkillDelta'),
        type: 'bar',
        barMaxWidth: 28,
        data: contexts.map(item => ({
          value: Number(item.deltaPercent || 0),
          context: item,
          itemStyle: {
            color: Number(item.deltaPercent || 0) >= 0 ? '#0f766e' : '#dc2626',
            borderRadius: 8
          }
        })),
        label: {
          show: true,
          position: 'right',
          formatter: params => analyticsFormatSignedPercent(params.value)
        },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#94a3b8', type: 'dashed' },
          data: [{ xAxis: 0 }]
        }
      }
    ]
  });
}

function renderAnalyticsWorkerTable(operatorComparison, shiftProfile) {
  const container = document.getElementById('analyticsWorkerTable');
  if (!container) return;

  const rankedWorkers = (operatorComparison || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0));

  if (rankedWorkers.length === 0) {
    analyticsRenderTableState('analyticsWorkerTable', t('analytics.worker.noWorkerTableData'));
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableWorker'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableRecords'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableShared'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableDays'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableAvgShift'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableOutputHour'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableShiftUtil'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableHours'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableIssues'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableDowntime'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableDefectRate'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.worker.tableAvgCT'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${rankedWorkers.map(worker => `
          <tr>
            <td class="px-6 py-4 font-medium text-slate-900">${analyticsEscapeHtml(worker.name)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.submissions)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.sharedSubmissions)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.activeDays)}</td>
            <td class="px-6 py-4">${analyticsFormatCount(analyticsGetWorkerAverageShiftOutput(worker, shiftProfile))}</td>
            <td class="px-6 py-4">${analyticsFormatPiecesPerHour(worker.outputPerHour)}</td>
            <td class="px-6 py-4">${analyticsFormatPercent(analyticsGetWorkerShiftUtilization(worker, shiftProfile))}</td>
            <td class="px-6 py-4">${analyticsFormatHours(worker.totalManHours)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.issueCount)}</td>
            <td class="px-6 py-4">${analyticsFormatPercent(worker.downtimeRate)}</td>
            <td class="px-6 py-4">${analyticsFormatPercent(worker.defectRate)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.averageCycleTime, 2)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsWorkerTab(data) {
  renderAnalyticsWorkerFocus(data);

  const workers = data.operatorComparison || [];
  const shiftProfile = analyticsGetShiftProfile();
  const topOutputWorker = analyticsGetHighestBy(workers, item => analyticsGetWorkerAverageShiftOutput(item, shiftProfile));
  const bestThroughputWorker = analyticsGetHighestBy(
    workers,
    item => Number(item.outputPerHour || 0),
    item => Number(item.totalManHours || 0) >= 1 && Number(item.submissions || 0) >= 2
  );
  const topDefectWorker = analyticsGetHighestBy(workers, item => Number(item.totalDefectCount || 0));
  const mostConsistentWorker = analyticsGetHighestBy(
    workers,
    item => Number(item.consistencyScore || 0),
    item => Number(item.activeDays || 0) >= 3 && Number(item.totalManHours || 0) >= 1
  );

  analyticsRenderCardGrid('analyticsWorkerSummary', [
    {
      eyebrow: t('analytics.worker.highestAvgOutput'),
      value: topOutputWorker ? analyticsEscapeHtml(topOutputWorker.name) : t('analytics.worker.noData'),
      detail: topOutputWorker
        ? t('analytics.worker.detailHighestOutput')
            .replace('{count}', analyticsFormatCount(analyticsGetWorkerAverageShiftOutput(topOutputWorker, shiftProfile)))
            .replace('{start}', shiftProfile.start)
            .replace('{end}', shiftProfile.end)
        : t('analytics.worker.detailNoOutput'),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-medal-line'
    },
    {
      eyebrow: t('analytics.worker.bestOutputHour'),
      value: bestThroughputWorker ? analyticsEscapeHtml(bestThroughputWorker.name) : t('analytics.worker.noCandidate'),
      detail: bestThroughputWorker
        ? t('analytics.worker.detailBestThroughput')
            .replace('{pph}', analyticsFormatPiecesPerHour(bestThroughputWorker.outputPerHour))
            .replace('{pieces}', analyticsFormatCount(bestThroughputWorker.outputPerHour * shiftProfile.hours))
        : t('analytics.worker.detailNeedMoreRecords'),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-speed-up-line'
    },
    {
      eyebrow: t('analytics.worker.highestDefectLoad'),
      value: topDefectWorker ? analyticsEscapeHtml(topDefectWorker.name) : t('analytics.worker.noData'),
      detail: topDefectWorker
        ? t('analytics.worker.detailHighestDefect')
            .replace('{count}', analyticsFormatCount(topDefectWorker.totalDefectCount))
            .replace('{rate}', analyticsFormatPercent(topDefectWorker.defectRate))
        : t('analytics.worker.detailNoQualityLoss'),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.worker.mostConsistent'),
      value: mostConsistentWorker ? analyticsEscapeHtml(mostConsistentWorker.name) : t('analytics.worker.noCandidate'),
      detail: mostConsistentWorker
        ? t('analytics.worker.detailConsistency')
            .replace('{score}', analyticsFormatPercent(mostConsistentWorker.consistencyScore))
            .replace('{days}', analyticsFormatNumber(mostConsistentWorker.activeDays))
        : t('analytics.worker.detailNeedMoreShifts'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-line-chart-line'
    }
  ]);

  renderAnalyticsWorkerProductivityChart(workers, shiftProfile);
  renderAnalyticsWorkerQualityChart(workers);
  renderAnalyticsWorkerEfficiencyChart(workers, shiftProfile);
  renderAnalyticsWorkerConsistencyChart(data.operatorFocus || null, shiftProfile);
  renderAnalyticsWorkerSkillChart(data.operatorSkillProfile || null);
  renderAnalyticsWorkerTable(workers, shiftProfile);
}

function renderAnalyticsMachineChart(sourceBreakdown) {
  const rankedSources = (sourceBreakdown || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0))
    .slice(0, 10);

  if (rankedSources.length === 0) {
    analyticsShowChartEmpty('analyticsSourceChart', t('analytics.machine.noMachineData'));
    return;
  }

  const lgGoodPieces = t('analytics.machine.chartGoodPieces');
  const lgTroubleTime = t('analytics.machine.chartTroubleTime');
  const lgDefectRate = t('analytics.machine.chartDefectRate');

  analyticsRenderChart('analyticsSourceChart', {
    color: ['#06b6d4', '#f59e0b', '#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgGoodPieces, lgTroubleTime, lgDefectRate] },
    grid: { left: 40, right: 40, top: 48, bottom: 48, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankedSources.map(item => item.source),
      axisTick: { show: false },
      axisLabel: { interval: 0, rotate: 18 }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.machine.yAxisPiecesHours'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: t('analytics.machine.yAxisPercent'),
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgGoodPieces,
        type: 'bar',
        barMaxWidth: 26,
        data: rankedSources.map(item => Number(item.totalGoodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgTroubleTime,
        type: 'line',
        smooth: true,
        symbolSize: 8,
        data: rankedSources.map(item => Number(item.totalTroubleTime || 0)),
        yAxisIndex: 0
      },
      {
        name: lgDefectRate,
        type: 'line',
        smooth: true,
        symbolSize: 8,
        data: rankedSources.map(item => Number(item.defectRate || 0)),
        yAxisIndex: 1
      }
    ]
  });
}

function renderAnalyticsMachineCards(sourceBreakdown) {
  const container = document.getElementById('analyticsMachineCards');
  if (!container) return;

  const topSources = (sourceBreakdown || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0))
    .slice(0, 4);

  if (topSources.length === 0) {
    container.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-400">${analyticsEscapeHtml(t('analytics.machine.noMachineCards'))}</div>`;
    return;
  }

  container.innerHTML = `<div class="space-y-4">${topSources.map(source => `
    <article class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-slate-900">${analyticsEscapeHtml(source.source)}</p>
          <p class="mt-1 text-xs text-slate-500">${analyticsEscapeHtml(t('analytics.machine.cardSubtext').replace('{records}', analyticsFormatNumber(source.submissions)).replace('{issues}', analyticsFormatNumber(source.issueCount)))}</p>
        </div>
        <span class="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">${analyticsFormatPercent(source.defectRate)}</span>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div class="rounded-xl bg-white px-3 py-2"><span class="block text-slate-400">${analyticsEscapeHtml(t('analytics.machine.cardGood'))}</span><span class="mt-1 block text-sm font-semibold text-slate-900">${analyticsFormatNumber(source.totalGoodCount)}</span></div>
        <div class="rounded-xl bg-white px-3 py-2"><span class="block text-slate-400">${analyticsEscapeHtml(t('analytics.machine.cardTrouble'))}</span><span class="mt-1 block text-sm font-semibold text-slate-900">${analyticsFormatHours(source.totalTroubleTime)}</span></div>
      </div>
    </article>`).join('')}</div>`;
}

function renderAnalyticsMachineTable(sourceBreakdown) {
  const container = document.getElementById('analyticsMachineTable');
  if (!container) return;

  const rankedSources = (sourceBreakdown || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0));

  if (rankedSources.length === 0) {
    analyticsRenderTableState('analyticsMachineTable', t('analytics.machine.noMachineData'));
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableSource'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableRecords'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableGood'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableHours'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableTrouble'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableIssues'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.machine.tableDefectRate'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${rankedSources.map(source => `
          <tr>
            <td class="px-6 py-4 font-medium text-slate-900">${analyticsEscapeHtml(source.source)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(source.submissions)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(source.totalGoodCount)}</td>
            <td class="px-6 py-4">${analyticsFormatHours(source.totalManHours)}</td>
            <td class="px-6 py-4">${analyticsFormatHours(source.totalTroubleTime)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(source.issueCount)}</td>
            <td class="px-6 py-4">${analyticsFormatPercent(source.defectRate)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsMachineTab(data) {
  renderAnalyticsMachineTimeLoss(data.machineTimeLoss || []);
  renderAnalyticsChangeoverTrend(data.changeoverTrend || null);
  renderAnalyticsOpcEvents(data.opcEvents || null);

  const sources = data.sourceBreakdown || [];
  const topOutputSource = analyticsGetHighestBy(sources, item => Number(item.totalGoodCount || 0));
  const topTroubleSource = analyticsGetHighestBy(sources, item => Number(item.totalTroubleTime || 0));
  const topIssueSource = analyticsGetHighestBy(sources, item => Number(item.issueCount || 0));
  const worstQualitySource = analyticsGetHighestBy(sources, item => Number(item.defectRate || 0));

  analyticsRenderCardGrid('analyticsMachineSummary', [
    {
      eyebrow: t('analytics.machine.highestOutput'),
      value: topOutputSource ? analyticsEscapeHtml(topOutputSource.source) : t('analytics.machine.noData'),
      detail: topOutputSource
        ? t('analytics.machine.detailGoodPieces').replace('{n}', analyticsFormatNumber(topOutputSource.totalGoodCount))
        : t('analytics.machine.noOutputData'),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-cpu-line'
    },
    {
      eyebrow: t('analytics.machine.mostTrouble'),
      value: topTroubleSource ? analyticsEscapeHtml(topTroubleSource.source) : t('analytics.machine.noData'),
      detail: topTroubleSource
        ? t('analytics.machine.detailTroubleTime').replace('{n}', analyticsFormatHours(topTroubleSource.totalTroubleTime))
        : t('analytics.machine.noTroubleSignal'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: t('analytics.machine.mostIssues'),
      value: topIssueSource ? analyticsEscapeHtml(topIssueSource.source) : t('analytics.machine.noData'),
      detail: topIssueSource
        ? t('analytics.machine.detailIssueRecords').replace('{n}', analyticsFormatNumber(topIssueSource.issueCount))
        : t('analytics.machine.noIssueSignal'),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.machine.highestDefect'),
      value: worstQualitySource ? analyticsEscapeHtml(worstQualitySource.source) : t('analytics.machine.noData'),
      detail: worstQualitySource
        ? t('analytics.machine.detailDefectRate').replace('{n}', analyticsFormatPercent(worstQualitySource.defectRate))
        : t('analytics.machine.noQualitySignal'),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-focus-3-line'
    }
  ]);

  renderAnalyticsMachineChart(sources);
  renderAnalyticsMachineCards(sources);
  renderAnalyticsMachineTable(sources);
}

function renderAnalyticsDefectsChart(topDefects) {
  const rankedDefects = (topDefects || []).slice(0, 10);
  if (rankedDefects.length === 0) {
    analyticsShowChartEmpty('analyticsDefectsChart', t('analytics.quality.noDefectRecords'));
    return;
  }

  const reversed = rankedDefects.slice().reverse();
  analyticsRenderChart('analyticsDefectsChart', {
    color: ['#dc2626'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: analyticsAxisTooltipFormatter },
    grid: { left: 140, right: 28, top: 20, bottom: 24 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'category',
      data: reversed.map(item => item.name),
      axisTick: { show: false }
    },
    series: [
      {
        name: 'Count',
        type: 'bar',
        data: reversed.map(item => Number(item.count || 0)),
        barMaxWidth: 22,
        itemStyle: { borderRadius: [0, 8, 8, 0] },
        label: { show: true, position: 'right', color: '#7f1d1d' }
      }
    ]
  });
}

function renderAnalyticsQualityAlerts(data) {
  const container = document.getElementById('analyticsQualityAlerts');
  if (!container) return;

  const topDefect = (data.topDefects || [])[0];
  const worstDay = analyticsGetHighestBy(data.dailyTrend || [], item => Number(item.defectRate || 0));
  const riskiestMachine = analyticsGetHighestBy(data.sourceBreakdown || [], item => Number(item.defectRate || 0));
  const riskiestProduct = analyticsGetHighestBy(data.topProducts || [], item => Number(item.defectRate || 0));

  const topDefectText = topDefect
    ? t('analytics.quality.alertTopDefectText')
        .replace('{name}', analyticsEscapeHtml(topDefect.name))
        .replace('{n}', analyticsFormatNumber(topDefect.count))
    : t('analytics.quality.alertNoDefectSignal');
  const worstDayText = worstDay
    ? t('analytics.quality.alertWorstDayText')
        .replace('{day}', analyticsEscapeHtml(worstDay.label))
        .replace('{rate}', analyticsFormatPercent(worstDay.defectRate))
        .replace('{n}', analyticsFormatNumber(worstDay.issueCount))
    : t('analytics.quality.alertNoWorstDay');
  const machineInspectText = riskiestMachine
    ? t('analytics.quality.alertMachineText')
        .replace('{machine}', analyticsEscapeHtml(riskiestMachine.source))
        .replace('{rate}', analyticsFormatPercent(riskiestMachine.defectRate))
    : t('analytics.quality.alertNoMachineSignal');
  const productInspectText = riskiestProduct
    ? t('analytics.quality.alertProductText')
        .replace('{product}', analyticsEscapeHtml(analyticsGetProductLabel(riskiestProduct)))
        .replace('{rate}', analyticsFormatPercent(riskiestProduct.defectRate))
    : t('analytics.quality.alertNoProductSignal');

  container.innerHTML = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.quality.alertTopDefect'))}</p>
        <p class="mt-2 text-sm text-slate-700">${topDefectText}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.quality.alertWorstDay'))}</p>
        <p class="mt-2 text-sm text-slate-700">${worstDayText}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.quality.alertMachineInspect'))}</p>
        <p class="mt-2 text-sm text-slate-700">${machineInspectText}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.quality.alertProductInspect'))}</p>
        <p class="mt-2 text-sm text-slate-700">${productInspectText}</p>
      </div>
    </div>`;
}

function renderAnalyticsHotspots(qualityHotspots) {
  const container = document.getElementById('analyticsHotspotsList');
  if (!container) return;

  if (!Array.isArray(qualityHotspots) || qualityHotspots.length === 0) {
    container.innerHTML = `<div class="px-6 py-10 text-sm text-slate-400">${analyticsEscapeHtml(t('analytics.quality.noHotspots'))}</div>`;
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.quality.tableTimestamp'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.quality.tableProduct'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.quality.tableWorker'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.quality.tableDefectFocus'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.quality.tableTrouble'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.quality.tableRemarks'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${qualityHotspots.map(item => {
          const issueSummary = item.topDefects && item.topDefects.length
            ? item.topDefects.map(defect => `${analyticsEscapeHtml(defect.name)} (${analyticsFormatNumber(defect.count)})`).join(', ')
            : analyticsEscapeHtml(t('analytics.quality.tableNoDefectDetail'));
          const productBits = [item.productName, item.hinban, item.kanbanId].filter(Boolean).map(analyticsEscapeHtml);
          const productMarkup = productBits.length
            ? productBits.map((bit, index) => `<div class="${index === 0 ? '' : 'mt-1 text-xs text-slate-500'}">${bit}</div>`).join('')
            : '-';
          return `
            <tr>
              <td class="px-6 py-4 align-top text-slate-500">${analyticsEscapeHtml(analyticsFormatDateTime(item.timestamp))}<div class="mt-1 text-xs text-slate-400">${analyticsEscapeHtml(item.source || t('analytics.common.unknown'))}</div></td>
              <td class="px-6 py-4 align-top font-medium text-slate-900">${productMarkup}</td>
              <td class="px-6 py-4 align-top">${(item.operators || []).map(analyticsEscapeHtml).join('<br>') || '-'}</td>
              <td class="px-6 py-4 align-top"><div class="font-medium text-rose-700">${analyticsEscapeHtml(t('analytics.quality.tableDefectsCount').replace('{n}', analyticsFormatNumber(item.totalDefects)))}</div><div class="mt-1 text-xs text-slate-500">${issueSummary}</div></td>
              <td class="px-6 py-4 align-top">${analyticsFormatHours(item.troubleTime)}</td>
              <td class="px-6 py-4 align-top text-slate-500">${analyticsEscapeHtml(item.remarks || '-')}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsQualityTab(data) {
  renderAnalyticsDefectHeatmap(data.defectMatrix || null);
  renderAnalyticsDefectControlChart(data.dailyTrend || []);

  const topDefect = (data.topDefects || [])[0];
  const worstDay = analyticsGetHighestBy(data.dailyTrend || [], item => Number(item.defectRate || 0));
  const worstMachine = analyticsGetHighestBy(data.sourceBreakdown || [], item => Number(item.defectRate || 0));
  const worstProduct = analyticsGetHighestBy(data.topProducts || [], item => Number(item.defectRate || 0));

  analyticsRenderCardGrid('analyticsQualitySummary', [
    {
      eyebrow: t('analytics.quality.kpiDefectRate'),
      value: analyticsFormatPercent(data.summary?.defectRate || 0),
      detail: t('analytics.quality.detailTotalDefects').replace('{n}', analyticsFormatNumber(data.summary?.totalDefectCount || 0)),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.quality.kpiIssueRecords'),
      value: analyticsFormatNumber(data.summary?.totalIssueRecords || 0),
      detail: t('analytics.quality.kpiRecordsReview'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: t('analytics.quality.kpiTopDefect'),
      value: topDefect ? analyticsEscapeHtml(topDefect.name) : t('analytics.quality.kpiNoDefects'),
      detail: topDefect
        ? t('analytics.quality.detailCountedEvents').replace('{n}', analyticsFormatNumber(topDefect.count))
        : t('analytics.quality.kpiNoDefectActivity'),
      tone: 'bg-slate-100 text-slate-700',
      icon: 'ri-bug-line'
    },
    {
      eyebrow: t('analytics.quality.kpiHighestRisk'),
      value: worstProduct ? analyticsEscapeHtml(analyticsGetProductLabel(worstProduct)) : t('analytics.quality.kpiNoProductData'),
      detail: worstProduct
        ? t('analytics.quality.detailDefectRate').replace('{n}', analyticsFormatPercent(worstProduct.defectRate))
        : t('analytics.quality.kpiNoProductSignal'),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-box-3-line'
    }
  ]);

  renderAnalyticsDefectsChart(data.topDefects || []);
  renderAnalyticsQualityAlerts({
    topDefects: data.topDefects || [],
    dailyTrend: data.dailyTrend || [],
    sourceBreakdown: data.sourceBreakdown || [],
    topProducts: data.topProducts || [],
    worstDay,
    worstMachine
  });
  renderAnalyticsHotspots(data.qualityHotspots || []);
}

function renderAnalyticsProductsChart(topProducts) {
  const rankedProducts = (topProducts || []).slice(0, 10);
  if (rankedProducts.length === 0) {
    analyticsShowChartEmpty('analyticsProductsChart', t('analytics.product.noProductData'));
    return;
  }

  const lgGoodPiecesP = t('analytics.product.chartGoodPieces');
  const lgDefectRateP = t('analytics.product.chartDefectRate');

  analyticsRenderChart('analyticsProductsChart', {
    color: ['#0ea5e9', '#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgGoodPiecesP, lgDefectRateP] },
    grid: { left: 40, right: 40, top: 48, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankedProducts.map(item => analyticsGetProductLabel(item)),
      axisTick: { show: false },
      axisLabel: { interval: 0, rotate: 18 }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.product.yAxisPieces'),
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: t('analytics.product.yAxisPercent'),
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: lgGoodPiecesP,
        type: 'bar',
        barMaxWidth: 26,
        data: rankedProducts.map(item => Number(item.totalGoodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: lgDefectRateP,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rankedProducts.map(item => Number(item.defectRate || 0))
      }
    ]
  });
}

function renderAnalyticsProductHighlights(topProducts) {
  const container = document.getElementById('analyticsProductHighlights');
  if (!container) return;

  const leadProduct = analyticsGetHighestBy(topProducts || [], item => Number(item.totalGoodCount || 0));
  const riskiestProduct = analyticsGetHighestBy(topProducts || [], item => Number(item.defectRate || 0));
  const slowestProduct = analyticsGetHighestBy(topProducts || [], item => Number(item.averageCycleTime || 0));

  const leadText = leadProduct
    ? t('analytics.product.highlightLeadText')
        .replace('{name}', analyticsEscapeHtml(analyticsGetProductLabel(leadProduct)))
        .replace('{n}', analyticsFormatNumber(leadProduct.totalGoodCount))
    : t('analytics.product.highlightNoLead');
  const riskText = riskiestProduct
    ? t('analytics.product.highlightRiskiestText')
        .replace('{name}', analyticsEscapeHtml(analyticsGetProductLabel(riskiestProduct)))
        .replace('{rate}', analyticsFormatPercent(riskiestProduct.defectRate))
    : t('analytics.product.highlightNoRiskiest');
  const slowText = slowestProduct
    ? t('analytics.product.highlightSlowestText')
        .replace('{name}', analyticsEscapeHtml(analyticsGetProductLabel(slowestProduct)))
        .replace('{ct}', analyticsFormatNumber(slowestProduct.averageCycleTime, 2))
    : t('analytics.product.highlightNoSlowest');

  container.innerHTML = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.product.noteLead'))}</p>
        <p class="mt-2 text-sm text-slate-700">${leadText}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.product.noteRiskiest'))}</p>
        <p class="mt-2 text-sm text-slate-700">${riskText}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${analyticsEscapeHtml(t('analytics.product.noteSlowest'))}</p>
        <p class="mt-2 text-sm text-slate-700">${slowText}</p>
      </div>
    </div>`;
}

function renderAnalyticsProductTable(topProducts) {
  const container = document.getElementById('analyticsProductTable');
  if (!container) return;

  const rankedProducts = (topProducts || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0));

  if (rankedProducts.length === 0) {
    analyticsRenderTableState('analyticsProductTable', t('analytics.product.noProductData'));
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableProduct'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableRecords'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableGood'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableHours'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableIssues'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableDefectRate'))}</th>
          <th class="px-6 py-3 font-medium">${analyticsEscapeHtml(t('analytics.product.tableAvgCT'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${rankedProducts.map(product => `
          <tr>
            <td class="px-6 py-4 font-medium text-slate-900">${analyticsEscapeHtml(analyticsGetProductLabel(product))}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(product.submissions)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(product.totalGoodCount)}</td>
            <td class="px-6 py-4">${analyticsFormatHours(product.totalManHours)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(product.issueCount)}</td>
            <td class="px-6 py-4">${analyticsFormatPercent(product.defectRate)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(product.averageCycleTime, 2)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsProductTab(data) {
  const products = data.topProducts || [];
  const leadProduct = analyticsGetHighestBy(products, item => Number(item.totalGoodCount || 0));
  const riskiestProduct = analyticsGetHighestBy(products, item => Number(item.defectRate || 0));
  const slowestProduct = analyticsGetHighestBy(products, item => Number(item.averageCycleTime || 0));
  const issueHeavyProduct = analyticsGetHighestBy(products, item => Number(item.issueCount || 0));

  analyticsRenderCardGrid('analyticsProductSummary', [
    {
      eyebrow: t('analytics.product.leadProduct'),
      value: leadProduct ? analyticsEscapeHtml(analyticsGetProductLabel(leadProduct)) : t('analytics.product.noData'),
      detail: leadProduct
        ? t('analytics.product.detailGoodPieces').replace('{n}', analyticsFormatNumber(leadProduct.totalGoodCount))
        : t('analytics.product.noOutputData'),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-box-3-line'
    },
    {
      eyebrow: t('analytics.product.highestDefect'),
      value: riskiestProduct ? analyticsEscapeHtml(analyticsGetProductLabel(riskiestProduct)) : t('analytics.product.noData'),
      detail: riskiestProduct
        ? t('analytics.product.detailDefectRate').replace('{n}', analyticsFormatPercent(riskiestProduct.defectRate))
        : t('analytics.product.noQualitySignal'),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.product.slowestCycle'),
      value: slowestProduct ? analyticsEscapeHtml(analyticsGetProductLabel(slowestProduct)) : t('analytics.product.noData'),
      detail: slowestProduct
        ? t('analytics.product.detailAvgCycleTime').replace('{n}', analyticsFormatNumber(slowestProduct.averageCycleTime, 2))
        : t('analytics.product.noCycleSignal'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-timer-2-line'
    },
    {
      eyebrow: t('analytics.product.mostIssues'),
      value: issueHeavyProduct ? analyticsEscapeHtml(analyticsGetProductLabel(issueHeavyProduct)) : t('analytics.product.noData'),
      detail: issueHeavyProduct
        ? t('analytics.product.detailIssueRecords').replace('{n}', analyticsFormatNumber(issueHeavyProduct.issueCount))
        : t('analytics.product.noIssueSignal'),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-alarm-warning-line'
    }
  ]);

  renderAnalyticsProductDetail(data);
  renderAnalyticsProductsChart(products);
  renderAnalyticsProductHighlights(products);
  renderAnalyticsProductWorkerComparison(data.productWorkerComparison || []);
  renderAnalyticsProductTable(products);
}

// ============================================================
// Worker focus (daily / monthly report), bottleneck, product
// comparison, and finance views
// ============================================================

let analyticsWorkerView = 'daily';
let analyticsWorkerFocusName = '';
let analyticsWorkerFocusDate = '';
let analyticsWorkerFocusMonth = '';
let analyticsFinanceScope = 'month';
let analyticsProductCompareKey = '';

function analyticsFormatCurrency(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '¥0';
  return `¥${Math.round(number).toLocaleString('ja-JP')}`;
}

function analyticsResizeChartsSoon() {
  requestAnimationFrame(() => {
    Object.values(analyticsCharts).forEach(chart => {
      if (chart) chart.resize();
    });
  });
}

function analyticsParseClockMinutes(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

// Traffic-light helpers: color always means judgment (green good, amber watch, red problem)
function analyticsTrafficDot(tone) {
  const color = tone === 'good' ? 'bg-emerald-500' : tone === 'watch' ? 'bg-amber-500' : tone === 'bad' ? 'bg-rose-500' : 'bg-gray-300';
  return `<span class="inline-block h-2.5 w-2.5 rounded-full ${color}"></span>`;
}

function analyticsScoreTile(tile) {
  const valueClass = tile.tone === 'good' ? 'text-emerald-600' : tile.tone === 'watch' ? 'text-amber-600' : tile.tone === 'bad' ? 'text-rose-600' : 'text-gray-900';
  return `
    <article class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(tile.title)}${tile.info ? ` <i class="ri-information-line align-middle text-gray-300" title="${analyticsEscapeHtml(tile.info)}"></i>` : ''}</p>
        ${analyticsTrafficDot(tile.tone)}
      </div>
      <p class="mt-2 text-2xl font-semibold leading-tight ${valueClass}">${tile.value}</p>
      <p class="mt-1 text-xs text-gray-400">${tile.detail || ''}</p>
    </article>`;
}

function analyticsGetOperatorDailyEntry(name) {
  return (analyticsData?.operatorDaily || []).find(entry => entry.name === name) || null;
}

function analyticsGetWorkerLatestDate(operatorEntry) {
  const days = operatorEntry?.days || [];
  return days.length > 0 ? days[days.length - 1].date : '';
}

function analyticsGetTeamDayAverages(date) {
  const entries = (analyticsData?.operatorDaily || [])
    .map(operatorEntry => (operatorEntry.days || []).find(day => day.date === date))
    .filter(Boolean);
  if (entries.length === 0) return null;

  const sum = entries.reduce((acc, day) => {
    acc.goodCount += Number(day.goodCount || 0);
    acc.defectCount += Number(day.defectCount || 0);
    acc.breakTime += Number(day.breakTime || 0);
    acc.troubleTime += Number(day.troubleTime || 0);
    return acc;
  }, { goodCount: 0, defectCount: 0, breakTime: 0, troubleTime: 0 });

  return {
    workers: entries.length,
    goodCount: sum.goodCount / entries.length,
    defectCount: sum.defectCount / entries.length,
    breakTime: sum.breakTime / entries.length,
    troubleTime: sum.troubleTime / entries.length
  };
}

function analyticsCompareTone(value, benchmark, { higherIsBetter = true, watchRatio = 0.85 } = {}) {
  if (!Number.isFinite(benchmark) || benchmark <= 0) return 'neutral';
  const ratio = value / benchmark;
  if (higherIsBetter) {
    if (ratio >= 1) return 'good';
    if (ratio >= watchRatio) return 'watch';
    return 'bad';
  }
  if (ratio <= 1) return 'good';
  if (ratio <= 1 / watchRatio) return 'watch';
  return 'bad';
}

function analyticsSyncWorkerFocusControls() {
  const select = document.getElementById('analyticsWorkerFocusSelect');
  const dateInput = document.getElementById('analyticsWorkerFocusDate');
  const monthInput = document.getElementById('analyticsWorkerFocusMonth');
  const viewButtons = document.querySelectorAll('#analyticsWorkerViewButtons [data-worker-view]');
  const dailySection = document.getElementById('analyticsWorkerDailySection');
  const monthlySection = document.getElementById('analyticsWorkerMonthlySection');
  if (!select) return;

  const operatorDaily = analyticsData?.operatorDaily || [];
  const names = operatorDaily.map(entry => entry.name);
  if (!names.includes(analyticsWorkerFocusName)) {
    const busiest = (analyticsData?.operatorComparison || [])[0]?.name;
    analyticsWorkerFocusName = names.includes(busiest) ? busiest : (names[0] || '');
  }

  select.innerHTML = names
    .map(name => `<option value="${analyticsEscapeHtml(name)}" ${name === analyticsWorkerFocusName ? 'selected' : ''}>${analyticsEscapeHtml(name)}</option>`)
    .join('');

  const operatorEntry = analyticsGetOperatorDailyEntry(analyticsWorkerFocusName);
  // Only auto-pick when nothing is selected (e.g. first load or worker switch);
  // a user-picked day with no records should show the "no data" message instead
  // of silently jumping to another date.
  if (!analyticsWorkerFocusDate) {
    analyticsWorkerFocusDate = analyticsGetWorkerLatestDate(operatorEntry);
  }
  if (!analyticsWorkerFocusMonth) {
    analyticsWorkerFocusMonth = analyticsWorkerFocusDate ? analyticsWorkerFocusDate.slice(0, 7) : '';
  }

  if (dateInput) dateInput.value = analyticsWorkerFocusDate;
  if (monthInput) monthInput.value = analyticsWorkerFocusMonth;

  viewButtons.forEach(button => {
    const isActive = button.getAttribute('data-worker-view') === analyticsWorkerView;
    button.classList.toggle('bg-white', isActive);
    button.classList.toggle('text-gray-900', isActive);
    button.classList.toggle('shadow-sm', isActive);
    button.classList.toggle('text-gray-500', !isActive);
  });

  if (dateInput) dateInput.classList.toggle('hidden', analyticsWorkerView !== 'daily');
  if (monthInput) monthInput.classList.toggle('hidden', analyticsWorkerView !== 'monthly');
  if (dailySection) dailySection.classList.toggle('hidden', analyticsWorkerView !== 'daily');
  if (monthlySection) monthlySection.classList.toggle('hidden', analyticsWorkerView !== 'monthly');
}

function renderAnalyticsWorkerScoreboardDaily(dayEntry) {
  const container = document.getElementById('analyticsWorkerScoreboard');
  const insight = document.getElementById('analyticsWorkerInsight');
  if (!container) return;

  if (!dayEntry) {
    container.innerHTML = `<div class="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.workerFocus.noDayData'))}</div>`;
    if (insight) insight.textContent = t('analytics.workerFocus.noDayData');
    return;
  }

  const team = analyticsGetTeamDayAverages(dayEntry.date);
  const defectRate = Number(dayEntry.defectRate || 0);
  const outputTone = team ? analyticsCompareTone(dayEntry.goodCount, team.goodCount) : 'neutral';
  const defectTone = dayEntry.defectCount <= 0 ? 'good' : (team && team.defectCount > 0 ? analyticsCompareTone(dayEntry.defectCount, team.defectCount, { higherIsBetter: false }) : 'watch');
  const breakTone = team ? analyticsCompareTone(dayEntry.breakTime, Math.max(team.breakTime, 0.01), { higherIsBetter: false }) : 'neutral';
  const troubleTone = dayEntry.troubleTime <= 0 ? 'good' : dayEntry.troubleTime <= 0.5 ? 'watch' : 'bad';
  const focusWorker = (analyticsData?.operatorComparison || []).find(worker => worker.name === analyticsWorkerFocusName);

  container.innerHTML = [
    analyticsWorkerScoreTile(focusWorker),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileOutput'),
      value: analyticsFormatCount(dayEntry.goodCount),
      detail: team ? t('analytics.workerFocus.teamAvg').replace('{n}', analyticsFormatCount(team.goodCount)) : '',
      tone: outputTone
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileDefects'),
      value: analyticsFormatCount(dayEntry.defectCount),
      detail: t('analytics.workerFocus.defectRateDetail').replace('{rate}', analyticsFormatPercent(defectRate)),
      tone: defectTone
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileBreak'),
      value: analyticsFormatHours(dayEntry.breakTime),
      detail: team ? t('analytics.workerFocus.teamAvg').replace('{n}', analyticsFormatHours(team.breakTime)) : '',
      tone: breakTone
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileTrouble'),
      value: analyticsFormatHours(dayEntry.troubleTime),
      detail: t('analytics.workerFocus.workedHours').replace('{n}', analyticsFormatHours(dayEntry.manHours)),
      tone: troubleTone
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileMachines'),
      value: (dayEntry.sources || []).map(source => `<span class="mr-1 inline-block rounded-lg bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-700">${analyticsEscapeHtml(source)}</span>`).join('') || '-',
      detail: t('analytics.workerFocus.productsDetail').replace('{n}', analyticsFormatNumber((dayEntry.products || []).length)),
      tone: 'neutral'
    })
  ].join('');

  if (insight) {
    const teamPart = team
      ? t('analytics.workerFocus.insightDailyTeam')
          .replace('{team}', analyticsFormatCount(team.goodCount))
      : '';
    insight.textContent = t('analytics.workerFocus.insightDaily')
      .replace('{name}', analyticsWorkerFocusName)
      .replace('{date}', dayEntry.date)
      .replace('{output}', analyticsFormatCount(dayEntry.goodCount))
      .replace('{defects}', analyticsFormatCount(dayEntry.defectCount))
      .replace('{break}', analyticsFormatHours(dayEntry.breakTime))
      .replace('{trouble}', analyticsFormatHours(dayEntry.troubleTime))
      .replace('{machines}', (dayEntry.sources || []).join(', ') || '-')
      + teamPart;
  }
}

function renderAnalyticsWorkerScoreboardMonthly(monthDays) {
  const container = document.getElementById('analyticsWorkerScoreboard');
  const insight = document.getElementById('analyticsWorkerInsight');
  if (!container) return;

  if (!monthDays || monthDays.length === 0) {
    container.innerHTML = `<div class="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.workerFocus.noMonthData'))}</div>`;
    if (insight) insight.textContent = t('analytics.workerFocus.noMonthData');
    return;
  }

  const totals = monthDays.reduce((acc, day) => {
    acc.goodCount += Number(day.goodCount || 0);
    acc.defectCount += Number(day.defectCount || 0);
    acc.breakTime += Number(day.breakTime || 0);
    acc.troubleTime += Number(day.troubleTime || 0);
    acc.manHours += Number(day.manHours || 0);
    (day.sources || []).forEach(source => acc.sources.add(source));
    return acc;
  }, { goodCount: 0, defectCount: 0, breakTime: 0, troubleTime: 0, manHours: 0, sources: new Set() });

  const days = monthDays.length;
  const defectRate = (totals.goodCount + totals.defectCount) > 0 ? (totals.defectCount / (totals.goodCount + totals.defectCount)) * 100 : 0;
  const defectTone = totals.defectCount <= 0 ? 'good' : defectRate < 2 ? 'watch' : 'bad';
  const troublePerDay = totals.troubleTime / days;
  const focusWorker = (analyticsData?.operatorComparison || []).find(worker => worker.name === analyticsWorkerFocusName);

  container.innerHTML = [
    analyticsWorkerScoreTile(focusWorker),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileDaysWorked'),
      value: analyticsFormatNumber(days),
      detail: t('analytics.workerFocus.workedHours').replace('{n}', analyticsFormatHours(totals.manHours)),
      tone: 'neutral'
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileOutputMonth'),
      value: analyticsFormatCount(totals.goodCount),
      detail: t('analytics.workerFocus.perDayDetail').replace('{n}', analyticsFormatCount(totals.goodCount / days)),
      tone: 'neutral'
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileDefects'),
      value: analyticsFormatCount(totals.defectCount),
      detail: t('analytics.workerFocus.defectRateDetail').replace('{rate}', analyticsFormatPercent(defectRate)),
      tone: defectTone
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileBreak'),
      value: analyticsFormatHours(totals.breakTime / days),
      detail: t('analytics.workerFocus.perDaySuffix'),
      tone: 'neutral'
    }),
    analyticsScoreTile({
      title: t('analytics.workerFocus.tileTrouble'),
      value: analyticsFormatHours(troublePerDay),
      detail: t('analytics.workerFocus.machinesUsedDetail').replace('{n}', analyticsFormatNumber(totals.sources.size)),
      tone: troublePerDay <= 0.05 ? 'good' : troublePerDay <= 0.5 ? 'watch' : 'bad'
    })
  ].join('');

  if (insight) {
    insight.textContent = t('analytics.workerFocus.insightMonthly')
      .replace('{name}', analyticsWorkerFocusName)
      .replace('{month}', analyticsWorkerFocusMonth)
      .replace('{days}', analyticsFormatNumber(days))
      .replace('{output}', analyticsFormatCount(totals.goodCount))
      .replace('{avg}', analyticsFormatCount(totals.goodCount / days))
      .replace('{defects}', analyticsFormatCount(totals.defectCount))
      .replace('{rate}', analyticsFormatPercent(defectRate));
  }
}

function renderAnalyticsWorkerDayTimeline(dayEntry, shiftProfile) {
  const container = document.getElementById('analyticsWorkerDayTimeline');
  if (!container) return;

  const records = (dayEntry?.records || []).filter(record => analyticsParseClockMinutes(record.startTime) !== null && analyticsParseClockMinutes(record.endTime) !== null);
  if (records.length === 0) {
    container.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.workerFocus.noTimelineData'))}</div>`;
    return;
  }

  const segments = records.map(record => {
    const start = analyticsParseClockMinutes(record.startTime);
    let end = analyticsParseClockMinutes(record.endTime);
    if (end < start) end += 24 * 60;
    return { ...record, start, end };
  }).sort((a, b) => a.start - b.start);

  const shiftStart = analyticsParseClockMinutes(shiftProfile.start) ?? 8 * 60 + 30;
  let shiftEnd = analyticsParseClockMinutes(shiftProfile.end) ?? 17 * 60;
  if (shiftEnd < shiftStart) shiftEnd += 24 * 60;

  const boundStart = Math.min(shiftStart, segments[0].start);
  const boundEnd = Math.max(shiftEnd, segments[segments.length - 1].end);
  const span = Math.max(boundEnd - boundStart, 60);
  const toPercent = minutes => ((minutes - boundStart) / span) * 100;
  const minutesToLabel = minutes => `${String(Math.floor((minutes / 60) % 24)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const bars = segments.map(segment => {
    const left = toPercent(segment.start);
    const width = Math.max(toPercent(segment.end) - left, 0.7);
    const hasTrouble = Number(segment.troubleTime || 0) > 0;
    const hasDefects = Number(segment.defectCount || 0) > 0;
    const color = hasTrouble ? 'bg-rose-400' : hasDefects ? 'bg-amber-400' : 'bg-emerald-400';
    const tooltip = `${segment.startTime}-${segment.endTime} · ${segment.source} · ${analyticsGetProductLabel(segment)} · ${analyticsFormatCount(segment.goodCount)}`;
    return `<div class="absolute top-1 bottom-1 rounded-md ${color}" style="left:${left}%;width:${width}%" title="${analyticsEscapeHtml(tooltip)}"></div>`;
  }).join('');

  const rows = segments.map(segment => `
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <span class="font-medium text-gray-900">${analyticsEscapeHtml(segment.startTime)} - ${analyticsEscapeHtml(segment.endTime)}</span>
      <span class="rounded-lg bg-white px-2 py-0.5 text-xs font-medium text-gray-600">${analyticsEscapeHtml(segment.source)}</span>
      <span class="text-gray-500">${analyticsEscapeHtml(analyticsGetProductLabel(segment))}</span>
      <span class="ml-auto flex items-center gap-3 text-xs">
        <span class="font-semibold text-emerald-600">${analyticsFormatCount(segment.goodCount)} ${analyticsEscapeHtml(t('analytics.workerFocus.piecesSuffix'))}</span>
        ${Number(segment.defectCount || 0) > 0 ? `<span class="font-semibold text-rose-600">NG ${analyticsFormatCount(segment.defectCount)}</span>` : ''}
        ${Number(segment.breakTime || 0) > 0 ? `<span class="text-gray-500">${analyticsEscapeHtml(t('analytics.workerFocus.breakShort'))} ${analyticsFormatHours(segment.breakTime)}</span>` : ''}
        ${Number(segment.troubleTime || 0) > 0 ? `<span class="text-rose-500">${analyticsEscapeHtml(t('analytics.workerFocus.troubleShort'))} ${analyticsFormatHours(segment.troubleTime)}</span>` : ''}
      </span>
    </div>`).join('');

  // Time ticks under the strip at every segment boundary so admins can read
  // exact start/end times. Deduplicate ticks that would overlap visually
  // (e.g. one record ending 13:00 and the next starting 13:00).
  const tickMinutes = [boundStart, boundEnd];
  segments.forEach(segment => {
    tickMinutes.push(segment.start, segment.end);
  });
  const MIN_TICK_GAP_PERCENT = 3.5;
  const ticks = [];
  [...new Set(tickMinutes)].sort((a, b) => a - b).forEach(minutes => {
    const position = toPercent(minutes);
    if (ticks.length === 0 || position - ticks[ticks.length - 1].position >= MIN_TICK_GAP_PERCENT) {
      ticks.push({ minutes, position });
    }
  });

  const tickMarkup = ticks.map(tick => {
    // Keep edge labels inside the container instead of centering past it
    const translate = tick.position < 2 ? '0' : tick.position > 98 ? '-100%' : '-50%';
    return `<span class="absolute top-0 whitespace-nowrap text-[10px] text-gray-500" style="left:${tick.position}%;transform:translateX(${translate})">${minutesToLabel(tick.minutes)}</span>`;
  }).join('');

  container.innerHTML = `
    <div class="relative h-12 rounded-xl bg-gray-100">${bars}</div>
    <div class="relative mt-1 h-4">${tickMarkup}</div>
    <div class="mt-3 space-y-2">${rows}</div>`;
}

function renderAnalyticsWorkerCalendar(monthDays) {
  const container = document.getElementById('analyticsWorkerCalendar');
  if (!container) return;

  const monthKey = analyticsWorkerFocusMonth;
  if (!monthKey) {
    container.innerHTML = '';
    return;
  }

  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday-first
  const dayMap = new Map((monthDays || []).map(day => [day.date, day]));
  const maxOutput = Math.max(1, ...((monthDays || []).map(day => Number(day.goodCount || 0))));

  const weekdayLabels = t('analytics.workerFocus.weekdays').split(',');
  const headers = weekdayLabels.map(label => `<div class="py-1 text-center text-xs font-medium text-gray-400">${analyticsEscapeHtml(label)}</div>`).join('');

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<div></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = dayMap.get(dateKey);
    if (!entry) {
      cells.push(`<div class="flex h-16 flex-col items-center justify-center rounded-xl bg-gray-50 text-xs text-gray-300">${day}</div>`);
      continue;
    }

    const intensity = Number(entry.goodCount || 0) / maxOutput;
    const bgClass = intensity > 0.75 ? 'bg-emerald-500 text-white' : intensity > 0.5 ? 'bg-emerald-400 text-white' : intensity > 0.25 ? 'bg-emerald-200 text-emerald-900' : 'bg-emerald-100 text-emerald-900';
    const dots = [
      Number(entry.defectCount || 0) > 0 ? '<span class="inline-block h-1.5 w-1.5 rounded-full bg-rose-500"></span>' : '',
      Number(entry.troubleTime || 0) > 0 ? '<span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>' : ''
    ].join('');
    const tooltip = `${dateKey}: ${analyticsFormatCount(entry.goodCount)} / NG ${analyticsFormatCount(entry.defectCount)}`;

    cells.push(`
      <button type="button" onclick="analyticsOpenWorkerDay('${dateKey}')" title="${analyticsEscapeHtml(tooltip)}"
        class="flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl ${bgClass} transition hover:ring-2 hover:ring-emerald-300">
        <span class="text-xs font-medium opacity-80">${day}</span>
        <span class="text-sm font-semibold">${analyticsFormatCount(entry.goodCount)}</span>
        <span class="flex gap-0.5">${dots}</span>
      </button>`);
  }

  container.innerHTML = `
    <div class="grid grid-cols-7 gap-1">${headers}${cells.join('')}</div>
    <div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
      <span class="flex items-center gap-1"><span class="inline-block h-3 w-3 rounded bg-emerald-400"></span>${analyticsEscapeHtml(t('analytics.workerFocus.legendOutput'))}</span>
      <span class="flex items-center gap-1"><span class="inline-block h-1.5 w-1.5 rounded-full bg-rose-500"></span>${analyticsEscapeHtml(t('analytics.workerFocus.legendDefects'))}</span>
      <span class="flex items-center gap-1"><span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>${analyticsEscapeHtml(t('analytics.workerFocus.legendTrouble'))}</span>
    </div>`;
}

function renderAnalyticsWorkerMonthChart(monthDays) {
  if (!monthDays || monthDays.length === 0) {
    analyticsShowChartEmpty('analyticsWorkerMonthChart', t('analytics.workerFocus.noMonthData'));
    return;
  }

  const average = monthDays.reduce((sum, day) => sum + Number(day.goodCount || 0), 0) / monthDays.length;
  const lgOutput = t('analytics.workerFocus.chartOutput');
  const lgDefects = t('analytics.workerFocus.chartDefects');

  analyticsRenderChart('analyticsWorkerMonthChart', {
    color: ['#10b981', '#f43f5e'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgOutput, lgDefects] },
    grid: { left: 32, right: 32, top: 40, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthDays.map(day => day.label),
      axisTick: { show: false }
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e2e8f0' } } },
    series: [
      {
        name: lgOutput,
        type: 'bar',
        barMaxWidth: 22,
        data: monthDays.map(day => Math.round(Number(day.goodCount || 0) * 10) / 10),
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#64748b', type: 'dashed' },
          label: { formatter: t('analytics.workerFocus.avgLineLabel').replace('{n}', analyticsFormatCount(average)) },
          data: [{ yAxis: Math.round(average * 10) / 10 }]
        }
      },
      {
        name: lgDefects,
        type: 'bar',
        barMaxWidth: 22,
        data: monthDays.map(day => Math.round(Number(day.defectCount || 0) * 10) / 10),
        itemStyle: { borderRadius: [6, 6, 0, 0] }
      }
    ]
  });
}

function renderAnalyticsWorkerFocusTable(daysToShow) {
  const container = document.getElementById('analyticsWorkerFocusTable');
  if (!container) return;

  const rows = (daysToShow || []).flatMap(day => (day.records || []).map(record => ({ ...record, date: day.date })));
  if (rows.length === 0) {
    analyticsRenderTableState('analyticsWorkerFocusTable', t('analytics.workerFocus.noRecords'));
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colDate'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colTime'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colMachine'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colProduct'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colOutput'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colDefects'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colBreak'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colTrouble'))}</th>
          <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.workerFocus.colShared'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${rows.map(record => `
          <tr>
            <td class="px-4 py-3">${analyticsEscapeHtml(record.date)}</td>
            <td class="px-4 py-3">${analyticsEscapeHtml(record.startTime)} - ${analyticsEscapeHtml(record.endTime)}</td>
            <td class="px-4 py-3">${analyticsEscapeHtml(record.source)}</td>
            <td class="px-4 py-3">${analyticsEscapeHtml(analyticsGetProductLabel(record))}</td>
            <td class="px-4 py-3 font-medium text-slate-900">${analyticsFormatNumber(record.goodCount)}</td>
            <td class="px-4 py-3 ${Number(record.defectCount || 0) > 0 ? 'font-medium text-rose-600' : ''}">${analyticsFormatNumber(record.defectCount)}</td>
            <td class="px-4 py-3">${analyticsFormatHours(record.breakTime)}</td>
            <td class="px-4 py-3">${analyticsFormatHours(record.troubleTime)}</td>
            <td class="px-4 py-3">${(record.operators || []).length > 1 ? analyticsEscapeHtml((record.operators || []).join(', ')) : '-'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsWorkerAttention(operatorComparison) {
  const container = document.getElementById('analyticsWorkerAttention');
  if (!container) return;

  const workers = (operatorComparison || []).filter(worker => Number(worker.totalManHours || 0) >= 2);
  if (workers.length < 2) {
    container.innerHTML = `<p class="text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.workerFocus.attentionNotEnough'))}</p>`;
    return;
  }

  const teamDefectRate = workers.reduce((sum, worker) => sum + Number(worker.defectRate || 0), 0) / workers.length;
  const teamOutputPerHour = workers.reduce((sum, worker) => sum + Number(worker.outputPerHour || 0), 0) / workers.length;
  const signals = [];

  const worstDefect = analyticsGetHighestBy(workers, worker => Number(worker.defectRate || 0), worker => Number(worker.totalDefectCount || 0) > 0);
  if (worstDefect && Number(worstDefect.defectRate || 0) > Math.max(teamDefectRate * 1.5, 1)) {
    signals.push({
      tone: 'bad',
      icon: 'ri-error-warning-line',
      name: worstDefect.name,
      text: t('analytics.workerFocus.signalDefects')
        .replace('{name}', worstDefect.name)
        .replace('{rate}', analyticsFormatPercent(worstDefect.defectRate))
        .replace('{avg}', analyticsFormatPercent(teamDefectRate))
    });
  }

  const worstDowntime = analyticsGetHighestBy(workers, worker => (Number(worker.totalBreakTime || 0) + Number(worker.totalTroubleTime || 0)) / Math.max(Number(worker.activeDays || 1), 1));
  if (worstDowntime) {
    const downtimePerDay = (Number(worstDowntime.totalBreakTime || 0) + Number(worstDowntime.totalTroubleTime || 0)) / Math.max(Number(worstDowntime.activeDays || 1), 1);
    if (downtimePerDay > 1) {
      signals.push({
        tone: 'watch',
        icon: 'ri-time-line',
        name: worstDowntime.name,
        text: t('analytics.workerFocus.signalDowntime')
          .replace('{name}', worstDowntime.name)
          .replace('{hours}', analyticsFormatHours(downtimePerDay))
      });
    }
  }

  const slowest = workers
    .filter(worker => Number(worker.outputPerHour || 0) > 0)
    .sort((a, b) => Number(a.outputPerHour || 0) - Number(b.outputPerHour || 0))[0];
  if (slowest && Number(slowest.outputPerHour || 0) < teamOutputPerHour * 0.7) {
    signals.push({
      tone: 'watch',
      icon: 'ri-speed-line',
      name: slowest.name,
      text: t('analytics.workerFocus.signalSlow')
        .replace('{name}', slowest.name)
        .replace('{pph}', analyticsFormatPiecesPerHour(slowest.outputPerHour))
        .replace('{avg}', analyticsFormatPiecesPerHour(teamOutputPerHour))
    });
  }

  if (signals.length === 0) {
    container.innerHTML = `
      <div class="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <i class="ri-checkbox-circle-line text-lg"></i>
        <span>${analyticsEscapeHtml(t('analytics.workerFocus.attentionAllGood'))}</span>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="space-y-3">${signals.map(signal => `
    <div class="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${signal.tone === 'bad' ? 'border-rose-100 bg-rose-50 text-rose-800' : 'border-amber-100 bg-amber-50 text-amber-800'}">
      <i class="${signal.icon} mt-0.5 text-lg"></i>
      <button type="button" class="text-left hover:underline" data-name="${analyticsEscapeHtml(signal.name)}" onclick="analyticsOpenWorkerReport(this.dataset.name)">${analyticsEscapeHtml(signal.text)}</button>
    </div>`).join('')}</div>`;
}

function renderAnalyticsWorkerFocus(data) {
  analyticsSyncWorkerFocusControls();

  const shiftProfile = analyticsGetShiftProfile();
  const operatorEntry = analyticsGetOperatorDailyEntry(analyticsWorkerFocusName);

  if (analyticsWorkerView === 'daily') {
    const dayEntry = (operatorEntry?.days || []).find(day => day.date === analyticsWorkerFocusDate) || null;
    renderAnalyticsWorkerScoreboardDaily(dayEntry);
    renderAnalyticsWorkerDayTimeline(dayEntry, shiftProfile);
    renderAnalyticsWorkerFocusTable(dayEntry ? [dayEntry] : []);
  } else {
    const monthDays = (operatorEntry?.days || []).filter(day => day.date.startsWith(analyticsWorkerFocusMonth));
    renderAnalyticsWorkerScoreboardMonthly(monthDays);
    renderAnalyticsWorkerCalendar(monthDays);
    renderAnalyticsWorkerMonthChart(monthDays);
    renderAnalyticsWorkerFocusTable(monthDays);
  }

  renderAnalyticsWorkerAttention(data.operatorComparison || []);
}

function setAnalyticsWorkerView(view) {
  analyticsWorkerView = view === 'monthly' ? 'monthly' : 'daily';
  if (analyticsData) renderAnalyticsWorkerFocus(analyticsData);
}

function handleAnalyticsWorkerFocusChange() {
  const select = document.getElementById('analyticsWorkerFocusSelect');
  const dateInput = document.getElementById('analyticsWorkerFocusDate');
  const monthInput = document.getElementById('analyticsWorkerFocusMonth');

  const previousWorker = analyticsWorkerFocusName;
  if (select && select.value) analyticsWorkerFocusName = select.value;
  if (previousWorker !== analyticsWorkerFocusName) {
    // New worker: jump to their latest data instead of keeping a stale date
    analyticsWorkerFocusDate = '';
    analyticsWorkerFocusMonth = '';
  } else {
    if (dateInput && dateInput.value) {
      analyticsWorkerFocusDate = dateInput.value;
      analyticsWorkerFocusMonth = dateInput.value.slice(0, 7);
    }
    if (monthInput && monthInput.value && analyticsWorkerView === 'monthly') analyticsWorkerFocusMonth = monthInput.value;
  }

  if (analyticsData) renderAnalyticsWorkerFocus(analyticsData);
}

function analyticsOpenWorkerDay(dateKey) {
  analyticsWorkerFocusDate = dateKey;
  analyticsWorkerView = 'daily';
  if (analyticsData) renderAnalyticsWorkerFocus(analyticsData);
}

function analyticsOpenWorkerReport(name) {
  const cleanName = String(name || '').trim();
  if ((analyticsData?.operatorDaily || []).some(entry => entry.name === cleanName)) {
    analyticsWorkerFocusName = cleanName;
    analyticsWorkerFocusDate = '';
    analyticsWorkerFocusMonth = '';
    renderAnalyticsWorkerFocus(analyticsData);
  }
}

// ------------------------------------------------------------
// Machine bottleneck ("time thief")
// ------------------------------------------------------------

function renderAnalyticsMachineTimeLoss(machineTimeLoss) {
  const verdictEl = document.getElementById('analyticsMachineBottleneckVerdict');
  const machines = (machineTimeLoss || []).filter(machine => Number(machine.trackedHours || 0) > 0).slice(0, 10);

  if (machines.length === 0) {
    if (verdictEl) verdictEl.innerHTML = '';
    analyticsShowChartEmpty('analyticsMachineTimeLossChart', t('analytics.bottleneck.noData'));
    return;
  }

  if (verdictEl) {
    const worst = machines[0];
    if (Number(worst.lostHoursPerDay || 0) >= 0.25) {
      verdictEl.innerHTML = `
        <div class="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <i class="ri-alarm-warning-line mt-0.5 text-lg"></i>
          <span>${analyticsEscapeHtml(t('analytics.bottleneck.verdict')
            .replace('{source}', worst.source)
            .replace('{hours}', analyticsFormatHours(worst.lostHoursPerDay))
            .replace('{changeover}', analyticsFormatHours(worst.changeoverHours / Math.max(worst.days, 1)))
            .replace('{trouble}', analyticsFormatHours(worst.troubleHours / Math.max(worst.days, 1)))
            .replace('{idle}', analyticsFormatHours(worst.idleGapHours / Math.max(worst.days, 1))))}</span>
        </div>`;
    } else {
      verdictEl.innerHTML = `
        <div class="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <i class="ri-checkbox-circle-line mt-0.5 text-lg"></i>
          <span>${analyticsEscapeHtml(t('analytics.bottleneck.verdictGood'))}</span>
        </div>`;
    }
  }

  const perDay = (machine, value) => Math.round((value / Math.max(machine.days, 1)) * 100) / 100;
  const ordered = machines.slice().reverse(); // Horizontal bars: worst on top
  const lgProducing = t('analytics.bottleneck.legendProducing');
  const lgBreak = t('analytics.bottleneck.legendBreak');
  const lgTrouble = t('analytics.bottleneck.legendTrouble');
  const lgChangeover = t('analytics.bottleneck.legendChangeover');
  const lgIdle = t('analytics.bottleneck.legendIdle');

  analyticsRenderChart('analyticsMachineTimeLossChart', {
    color: ['#10b981', '#94a3b8', '#ef4444', '#f59e0b', '#8b5cf6'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: [lgProducing, lgBreak, lgTrouble, lgChangeover, lgIdle] },
    grid: { left: 40, right: 40, top: 40, bottom: 24, containLabel: true },
    xAxis: { type: 'value', name: t('analytics.bottleneck.xAxisHoursPerDay'), splitLine: { lineStyle: { color: '#e2e8f0' } } },
    yAxis: { type: 'category', data: ordered.map(machine => machine.source), axisTick: { show: false } },
    series: [
      { name: lgProducing, type: 'bar', stack: 'time', barMaxWidth: 26, data: ordered.map(machine => perDay(machine, machine.producingHours)) },
      { name: lgBreak, type: 'bar', stack: 'time', data: ordered.map(machine => perDay(machine, machine.breakHours)) },
      { name: lgTrouble, type: 'bar', stack: 'time', data: ordered.map(machine => perDay(machine, machine.troubleHours)) },
      { name: lgChangeover, type: 'bar', stack: 'time', data: ordered.map(machine => perDay(machine, machine.changeoverHours)) },
      { name: lgIdle, type: 'bar', stack: 'time', itemStyle: { borderRadius: [0, 8, 8, 0] }, data: ordered.map(machine => perDay(machine, machine.idleGapHours)) }
    ]
  });
}

// ------------------------------------------------------------
// Product tab: worker-vs-worker comparison on the same product
// ------------------------------------------------------------

function renderAnalyticsProductWorkerComparison(productWorkerComparison) {
  const select = document.getElementById('analyticsProductCompareSelect');
  const entries = productWorkerComparison || [];

  if (!select) return;

  if (entries.length === 0) {
    select.innerHTML = '';
    analyticsShowChartEmpty('analyticsProductWorkerChart', t('analytics.productCompare.noData'));
    return;
  }

  if (!entries.some(entry => entry.key === analyticsProductCompareKey)) {
    analyticsProductCompareKey = entries[0].key;
  }

  select.innerHTML = entries
    .map(entry => `<option value="${analyticsEscapeHtml(entry.key)}" ${entry.key === analyticsProductCompareKey ? 'selected' : ''}>${analyticsEscapeHtml(analyticsShortenLabel(analyticsGetProductLabel(entry), 44))}</option>`)
    .join('');

  const entry = entries.find(item => item.key === analyticsProductCompareKey);
  const workers = (entry?.workers || []).filter(worker => Number(worker.manHours || 0) > 0);

  if (!entry || workers.length === 0) {
    analyticsShowChartEmpty('analyticsProductWorkerChart', t('analytics.productCompare.noData'));
    return;
  }

  const ordered = workers.slice().reverse(); // Horizontal bars: fastest on top
  const defectColor = rate => rate < 2 ? '#10b981' : rate < 5 ? '#f59e0b' : '#ef4444';

  analyticsRenderChart('analyticsProductWorkerChart', {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const item = Array.isArray(params) ? params[0] : params;
        const worker = ordered[item.dataIndex];
        if (!worker) return '';
        return [
          `<strong>${analyticsEscapeHtml(worker.name)}</strong>`,
          `${analyticsEscapeHtml(t('analytics.productCompare.tooltipPace'))}: <strong>${analyticsFormatPiecesPerHour(worker.outputPerHour)}</strong>`,
          `${analyticsEscapeHtml(t('analytics.productCompare.tooltipPieces'))}: ${analyticsFormatCount(worker.goodCount)} (${analyticsFormatHours(worker.manHours)})`,
          `${analyticsEscapeHtml(t('analytics.productCompare.tooltipDefectRate'))}: ${analyticsFormatPercent(worker.defectRate)}`
        ].join('<br>');
      }
    },
    grid: { left: 40, right: 60, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value', name: t('analytics.common.piecesPerHourUnit'), splitLine: { lineStyle: { color: '#e2e8f0' } } },
    yAxis: { type: 'category', data: ordered.map(worker => worker.name), axisTick: { show: false } },
    series: [{
      type: 'bar',
      barMaxWidth: 26,
      data: ordered.map(worker => ({
        value: Math.round(Number(worker.outputPerHour || 0) * 100) / 100,
        itemStyle: { color: defectColor(Number(worker.defectRate || 0)), borderRadius: [0, 8, 8, 0] }
      })),
      label: {
        show: true,
        position: 'right',
        formatter: params => analyticsFormatPercent(ordered[params.dataIndex]?.defectRate ?? 0)
      },
      markLine: {
        symbol: 'none',
        lineStyle: { color: '#64748b', type: 'dashed' },
        label: { formatter: t('analytics.productCompare.benchmarkLabel').replace('{n}', analyticsFormatNumber(entry.benchmarkOutputPerHour, 2)) },
        data: [{ xAxis: Math.round(Number(entry.benchmarkOutputPerHour || 0) * 100) / 100 }]
      }
    }]
  });
}

function handleAnalyticsProductCompareChange() {
  const select = document.getElementById('analyticsProductCompareSelect');
  if (select) analyticsProductCompareKey = select.value;
  if (analyticsData) renderAnalyticsProductWorkerComparison(analyticsData.productWorkerComparison || []);
}

// ------------------------------------------------------------
// Finance tab (admin only — data present only when server allows)
// ------------------------------------------------------------

function analyticsGetFinanceScopeData(finance) {
  const monthKey = finance.monthKey;
  const todayKey = finance.todayKey;

  if (analyticsFinanceScope === 'today') {
    const day = (finance.daily || []).find(entry => entry.date === todayKey);
    return {
      earned: Number(day?.earned || 0),
      lost: Number(day?.lost || 0),
      goodCount: Number(day?.goodCount || 0),
      defectCount: Number(day?.defectCount || 0),
      products: (finance.products || []).map(product => ({
        ...product,
        scopeEarned: Number(product.earnedToday || 0),
        scopeLost: Number(product.lostToday || 0),
        scopeGoodCount: Number(product.goodCountToday || 0)
      }))
    };
  }

  if (analyticsFinanceScope === 'month') {
    const days = (finance.daily || []).filter(entry => entry.date.startsWith(monthKey));
    return {
      earned: days.reduce((sum, entry) => sum + Number(entry.earned || 0), 0),
      lost: days.reduce((sum, entry) => sum + Number(entry.lost || 0), 0),
      goodCount: days.reduce((sum, entry) => sum + Number(entry.goodCount || 0), 0),
      defectCount: days.reduce((sum, entry) => sum + Number(entry.defectCount || 0), 0),
      products: (finance.products || []).map(product => ({
        ...product,
        scopeEarned: Number(product.earnedThisMonth || 0),
        scopeLost: Number(product.lostThisMonth || 0),
        scopeGoodCount: Number(product.goodCountThisMonth || 0)
      }))
    };
  }

  return {
    earned: Number(finance.summary?.totalEarned || 0),
    lost: Number(finance.summary?.totalLost || 0),
    goodCount: Number(finance.summary?.pricedGoodCount || 0) + Number(finance.summary?.unpricedGoodCount || 0),
    defectCount: Number(finance.summary?.pricedDefectCount || 0) + Number(finance.summary?.unpricedDefectCount || 0),
    products: (finance.products || []).map(product => ({
      ...product,
      scopeEarned: Number(product.earned || 0),
      scopeLost: Number(product.lost || 0),
      scopeGoodCount: Number(product.goodCount || 0)
    }))
  };
}

function renderAnalyticsFinanceTab(data) {
  const finance = data.finance;
  if (!finance) return;

  document.querySelectorAll('#analyticsFinanceScopeButtons [data-finance-scope]').forEach(button => {
    const isActive = button.getAttribute('data-finance-scope') === analyticsFinanceScope;
    button.classList.toggle('bg-gray-100', isActive);
    button.classList.toggle('text-gray-900', isActive);
    button.classList.toggle('text-gray-500', !isActive);
  });

  const coverageEl = document.getElementById('analyticsFinanceCoverage');
  if (coverageEl) {
    const totalProducts = Number(finance.summary?.pricedProducts || 0) + Number(finance.summary?.unpricedProducts || 0);
    coverageEl.innerHTML = t('analytics.finance.coverage')
      .replace('{priced}', analyticsFormatNumber(finance.summary?.pricedProducts || 0))
      .replace('{total}', analyticsFormatNumber(totalProducts))
      .replace('{coverage}', analyticsFormatPercent(finance.summary?.outputCoverage || 0));
  }

  const scope = analyticsGetFinanceScopeData(finance);
  const lossRate = (scope.earned + scope.lost) > 0 ? (scope.lost / (scope.earned + scope.lost)) * 100 : 0;
  const bestProduct = scope.products.slice().sort((a, b) => b.scopeEarned - a.scopeEarned)[0];

  analyticsRenderCardGrid('analyticsFinanceSummary', [
    {
      eyebrow: t('analytics.finance.tileEarned'),
      value: analyticsFormatCurrency(scope.earned),
      info: t('analytics.finance.infoEarned'),
      detail: t('analytics.finance.tileEarnedDetail').replace('{n}', analyticsFormatNumber(scope.goodCount)),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-money-cny-circle-line'
    },
    {
      eyebrow: t('analytics.finance.tileLost'),
      value: analyticsFormatCurrency(scope.lost),
      info: t('analytics.finance.infoLost'),
      detail: t('analytics.finance.tileLostDetail').replace('{n}', analyticsFormatNumber(scope.defectCount)),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-delete-bin-line'
    },
    {
      eyebrow: t('analytics.finance.tileLossRate'),
      value: analyticsFormatPercent(lossRate),
      info: t('analytics.finance.infoLossRate'),
      detail: t('analytics.finance.tileLossRateDetail'),
      valueClass: lossRate < 1 ? 'text-emerald-600' : lossRate < 3 ? 'text-amber-600' : 'text-rose-600',
      tone: lossRate < 1 ? 'bg-emerald-50 text-emerald-700' : lossRate < 3 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700',
      icon: 'ri-percent-line'
    },
    {
      eyebrow: t('analytics.finance.tileBestProduct'),
      value: bestProduct && bestProduct.scopeEarned > 0 ? analyticsEscapeHtml(analyticsGetProductLabel(bestProduct)) : t('analytics.finance.noData'),
      detail: bestProduct && bestProduct.scopeEarned > 0
        ? t('analytics.finance.tileBestProductDetail').replace('{n}', analyticsFormatCurrency(bestProduct.scopeEarned))
        : '',
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-trophy-line'
    }
  ]);

  // Trend chart: monthly bars for the year scope, daily bars of the current month otherwise
  const lgEarned = t('analytics.finance.legendEarned');
  const lgLost = t('analytics.finance.legendLost');
  const trendData = analyticsFinanceScope === 'year'
    ? (finance.monthly || [])
    : (finance.daily || []).filter(entry => entry.date.startsWith(finance.monthKey));

  if (trendData.length === 0) {
    analyticsShowChartEmpty('analyticsFinanceTrendChart', t('analytics.finance.noData'));
  } else {
    analyticsRenderChart('analyticsFinanceTrendChart', {
      color: ['#10b981', '#ef4444'],
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const items = Array.isArray(params) ? params : [params];
          const rows = items.map(item => `${item.marker}${analyticsEscapeHtml(item.seriesName)}<span style="float:right;margin-left:24px;font-weight:600;">${analyticsFormatCurrency(item.value)}</span>`).join('<br>');
          return `${analyticsEscapeHtml(items[0]?.axisValueLabel || '')}<br>${rows}`;
        }
      },
      legend: { top: 0, data: [lgEarned, lgLost] },
      grid: { left: 48, right: 32, top: 40, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: trendData.map(entry => entry.label), axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { formatter: value => `¥${Number(value).toLocaleString('ja-JP')}` }, splitLine: { lineStyle: { color: '#e2e8f0' } } },
      series: [
        { name: lgEarned, type: 'bar', stack: 'money', barMaxWidth: 26, data: trendData.map(entry => Math.round(Number(entry.earned || 0))) },
        { name: lgLost, type: 'bar', stack: 'money', itemStyle: { borderRadius: [6, 6, 0, 0] }, data: trendData.map(entry => Math.round(Number(entry.lost || 0))) }
      ]
    });
  }

  // Product money ranking (top 12 by scope earnings)
  const rankedProducts = scope.products
    .filter(product => product.priced && (product.scopeEarned > 0 || product.scopeLost > 0))
    .sort((a, b) => b.scopeEarned - a.scopeEarned)
    .slice(0, 12)
    .reverse();

  if (rankedProducts.length === 0) {
    analyticsShowChartEmpty('analyticsFinanceProductChart', t('analytics.finance.noScopeData'));
  } else {
    analyticsRenderChart('analyticsFinanceProductChart', {
      color: ['#10b981', '#ef4444'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const items = Array.isArray(params) ? params : [params];
          const rows = items.map(item => `${item.marker}${analyticsEscapeHtml(item.seriesName)}<span style="float:right;margin-left:24px;font-weight:600;">${analyticsFormatCurrency(item.value)}</span>`).join('<br>');
          return `${analyticsEscapeHtml(items[0]?.axisValueLabel || '')}<br>${rows}`;
        }
      },
      legend: { top: 0, data: [lgEarned, lgLost] },
      grid: { left: 40, right: 48, top: 40, bottom: 24, containLabel: true },
      xAxis: { type: 'value', axisLabel: { formatter: value => `¥${Number(value).toLocaleString('ja-JP')}` }, splitLine: { lineStyle: { color: '#e2e8f0' } } },
      yAxis: { type: 'category', data: rankedProducts.map(product => analyticsShortenLabel(analyticsGetProductLabel(product), 26)), axisTick: { show: false } },
      series: [
        { name: lgEarned, type: 'bar', stack: 'money', barMaxWidth: 22, data: rankedProducts.map(product => Math.round(product.scopeEarned)) },
        { name: lgLost, type: 'bar', stack: 'money', itemStyle: { borderRadius: [0, 8, 8, 0] }, data: rankedProducts.map(product => Math.round(product.scopeLost)) }
      ]
    });
  }

  renderAnalyticsFinanceQuadrant(finance);

  // Unpriced products
  const unpricedEl = document.getElementById('analyticsFinanceUnpriced');
  if (unpricedEl) {
    const unpriced = finance.unpricedProductList || [];
    unpricedEl.innerHTML = unpriced.length === 0
      ? `<div class="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><i class="ri-checkbox-circle-line text-lg"></i><span>${analyticsEscapeHtml(t('analytics.finance.allPriced'))}</span></div>`
      : `<div class="flex flex-wrap gap-2">${unpriced.map(product => `
          <span class="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
            <i class="ri-price-tag-3-line"></i>
            ${analyticsEscapeHtml(analyticsGetProductLabel(product))}
            <span class="text-xs text-amber-600">${analyticsFormatNumber(product.goodCount)} ${analyticsEscapeHtml(t('analytics.workerFocus.piecesSuffix'))}</span>
          </span>`).join('')}</div>`;
  }

  // Detail table
  const tableEl = document.getElementById('analyticsFinanceTable');
  if (tableEl) {
    const rows = scope.products
      .slice()
      .sort((a, b) => b.scopeEarned - a.scopeEarned || b.scopeGoodCount - a.scopeGoodCount)
      .filter(product => product.goodCount > 0 || product.defectCount > 0);

    tableEl.innerHTML = `
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.finance.colProduct'))}</th>
            <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.finance.colPrice'))}</th>
            <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.finance.colPieces'))}</th>
            <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.finance.colDefects'))}</th>
            <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.finance.colEarned'))}</th>
            <th class="px-4 py-3 font-medium">${analyticsEscapeHtml(t('analytics.finance.colLost'))}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
          ${rows.map(product => `
            <tr>
              <td class="px-4 py-3 font-medium text-slate-900">
                ${analyticsEscapeHtml(analyticsGetProductLabel(product))}
                ${product.priced ? '' : `<span class="ml-2 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">${analyticsEscapeHtml(t('analytics.finance.unpricedBadge'))}</span>`}
              </td>
              <td class="px-4 py-3">${product.priced ? analyticsFormatCurrency(product.price) : '-'}</td>
              <td class="px-4 py-3">${analyticsFormatNumber(product.scopeGoodCount)}</td>
              <td class="px-4 py-3">${analyticsFormatNumber(product.defectCount)}</td>
              <td class="px-4 py-3 font-medium text-emerald-700">${product.priced ? analyticsFormatCurrency(product.scopeEarned) : '-'}</td>
              <td class="px-4 py-3 ${product.scopeLost > 0 ? 'font-medium text-rose-600' : ''}">${product.priced ? analyticsFormatCurrency(product.scopeLost) : '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
}

function setAnalyticsFinanceScope(scope) {
  analyticsFinanceScope = ['today', 'month', 'year'].includes(scope) ? scope : 'month';
  if (analyticsData) renderAnalyticsFinanceTab(analyticsData);
}

function analyticsUpdateFinanceTabVisibility(data) {
  const button = document.getElementById('analyticsFinanceTabButton');
  if (!button) return;

  const hasFinance = Boolean(data?.finance);
  button.classList.toggle('hidden', !hasFinance);
  button.classList.toggle('inline-flex', hasFinance);

  if (!hasFinance && analyticsActiveTab === 'finance') {
    analyticsActiveTab = 'overview';
    analyticsUpdateTabState();
  }
}

// ------------------------------------------------------------
// Worker efficiency score (0-100)
// ------------------------------------------------------------

// Pace is benchmark-normalized (vs team pace on the same products), so workers
// on slow products are not unfairly penalized.
function analyticsComputeWorkerScore(worker) {
  if (!worker) return null;
  const paceIndex = worker.paceIndex;
  const paceComponent = (paceIndex === null || paceIndex === undefined)
    ? 0.5
    : Math.min(Math.max(Number(paceIndex), 0), 1.2) / 1.2;
  const qualityComponent = Math.max(0, 1 - Number(worker.defectRate || 0) / 10);
  const downtimeComponent = Math.max(0, 1 - Number(worker.downtimeRate || 0) / 30);
  return Math.round((paceComponent * 50) + (qualityComponent * 30) + (downtimeComponent * 20));
}

function analyticsWorkerScoreTile(worker) {
  const score = analyticsComputeWorkerScore(worker);
  if (score === null) return '';

  const color = score >= 75 ? '#10b981' : score >= 55 ? '#f59e0b' : '#f43f5e';
  const circumference = 2 * Math.PI * 26;
  const dash = (score / 100) * circumference;

  return `
    <article class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" title="${analyticsEscapeHtml(t('analytics.workerFocus.scoreInfo'))}">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.workerFocus.tileScore'))}</p>
        <i class="ri-information-line text-gray-300"></i>
      </div>
      <div class="mt-1 flex items-center gap-3">
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#e5e7eb" stroke-width="7"></circle>
          <circle cx="32" cy="32" r="26" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 32 32)"></circle>
          <text x="32" y="37" text-anchor="middle" font-size="17" font-weight="700" fill="#111827">${score}</text>
        </svg>
        <p class="text-xs text-gray-400">${analyticsEscapeHtml(t('analytics.workerFocus.scorePeriodNote'))}</p>
      </div>
    </article>`;
}

function analyticsPrintWorkerReport() {
  document.body.classList.add('analytics-printing-worker');
  const cleanup = () => document.body.classList.remove('analytics-printing-worker');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  // Fallback for browsers that don't fire afterprint reliably
  setTimeout(cleanup, 2000);
}

// ------------------------------------------------------------
// Overview: previous-period deltas + weekly digest
// ------------------------------------------------------------

function analyticsBuildDeltaChip(current, previous, { higherIsBetter = true, isRate = false } = {}) {
  const currentNumber = Number(current ?? 0);
  const previousNumber = Number(previous ?? 0);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) return '';
  if (previousNumber === 0 && currentNumber === 0) return '';

  let text;
  let improved;
  if (isRate) {
    const diff = currentNumber - previousNumber;
    if (Math.abs(diff) < 0.05) return '';
    text = `${diff > 0 ? '▲' : '▼'} ${analyticsFormatNumber(Math.abs(diff), 1)}pt`;
    improved = higherIsBetter ? diff > 0 : diff < 0;
  } else {
    if (previousNumber === 0) return '';
    const percent = ((currentNumber - previousNumber) / previousNumber) * 100;
    if (Math.abs(percent) < 0.5) return '';
    text = `${percent > 0 ? '▲' : '▼'} ${analyticsFormatNumber(Math.abs(percent), 0)}%`;
    improved = higherIsBetter ? percent > 0 : percent < 0;
  }

  const toneClass = improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600';
  return `<span class="ml-2 inline-block rounded-lg px-1.5 py-0.5 align-middle text-xs font-semibold ${toneClass}" title="${analyticsEscapeHtml(t('analytics.kpi.deltaTooltip'))}">${text}</span>`;
}

function renderAnalyticsWeeklyDigest(data) {
  const digestEl = document.getElementById('analyticsWeeklyDigest');
  if (!digestEl) return;

  const summary = data.summary || {};
  const previous = data.previousSummary;
  const worstBottleneck = (data.machineTimeLoss || [])[0];
  const topDefect = (data.topDefects || [])[0];

  if (!previous || Number(previous.submissions || 0) === 0 || Number(summary.submissions || 0) === 0) {
    digestEl.classList.add('hidden');
    return;
  }

  const outputChange = Number(previous.totalGoodCount || 0) > 0
    ? ((Number(summary.totalGoodCount || 0) / Number(previous.totalGoodCount || 1)) - 1) * 100
    : 0;
  const sentences = [];

  sentences.push(t('analytics.digest.output')
    .replace('{direction}', outputChange >= 0 ? t('analytics.digest.up') : t('analytics.digest.down'))
    .replace('{percent}', analyticsFormatNumber(Math.abs(outputChange), 0))
    .replace('{pieces}', analyticsFormatNumber(summary.totalGoodCount)));

  sentences.push(t('analytics.digest.defects')
    .replace('{prev}', analyticsFormatPercent(previous.defectRate))
    .replace('{now}', analyticsFormatPercent(summary.defectRate))
    .replace('{verdict}', Number(summary.defectRate || 0) <= Number(previous.defectRate || 0) ? t('analytics.digest.improved') : t('analytics.digest.worsened')));

  if (worstBottleneck && Number(worstBottleneck.lostHoursPerDay || 0) >= 0.25) {
    sentences.push(t('analytics.digest.bottleneck')
      .replace('{source}', worstBottleneck.source)
      .replace('{hours}', analyticsFormatHours(worstBottleneck.lostHoursPerDay)));
  } else if (topDefect) {
    sentences.push(t('analytics.digest.topDefect')
      .replace('{name}', topDefect.name)
      .replace('{count}', analyticsFormatNumber(topDefect.count)));
  }

  digestEl.classList.remove('hidden');
  digestEl.innerHTML = `<i class="ri-chat-smile-2-line mr-2 text-base text-slate-400"></i>${analyticsEscapeHtml(sentences.join(' '))}`;
}

// ------------------------------------------------------------
// Product detail view
// ------------------------------------------------------------

let analyticsProductDetailKey = '';

function analyticsGetProductProfile(key) {
  return (analyticsData?.productProfiles || []).find(profile => profile.key === key) || null;
}

function renderAnalyticsProductDetail(data) {
  const select = document.getElementById('analyticsProductDetailSelect');
  const headerEl = document.getElementById('analyticsProductDetailHeader');
  const scoreboardEl = document.getElementById('analyticsProductDetailScoreboard');
  const defectsEl = document.getElementById('analyticsProductDefectBars');
  const peopleEl = document.getElementById('analyticsProductPeople');
  if (!select || !headerEl || !scoreboardEl) return;

  const profiles = data.productProfiles || [];
  if (profiles.length === 0) {
    select.innerHTML = '';
    headerEl.innerHTML = `<p class="text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.productDetail.noData'))}</p>`;
    scoreboardEl.innerHTML = '';
    if (defectsEl) defectsEl.innerHTML = '';
    if (peopleEl) peopleEl.innerHTML = '';
    analyticsShowChartEmpty('analyticsProductPaceChart', t('analytics.productDetail.noData'));
    return;
  }

  if (!profiles.some(profile => profile.key === analyticsProductDetailKey)) {
    analyticsProductDetailKey = profiles[0].key;
  }

  select.innerHTML = profiles
    .map(profile => `<option value="${analyticsEscapeHtml(profile.key)}" ${profile.key === analyticsProductDetailKey ? 'selected' : ''}>${analyticsEscapeHtml(analyticsShortenLabel(analyticsGetProductLabel(profile), 44))}</option>`)
    .join('');

  const profile = analyticsGetProductProfile(analyticsProductDetailKey);
  if (!profile) return;

  // Header: photo + identity + cycle-time nudge
  const financeProduct = data.finance
    ? (data.finance.products || []).find(product => product.hinban === profile.hinban && product.lhRh === profile.lhRh)
    : null;

  const nudgeMarkup = (() => {
    if (!profile.masterRecordId || profile.bestCycleTime <= 0) return '';
    if (profile.standardCycleTime > 0) {
      return `<span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600"><i class="ri-timer-line"></i>${analyticsEscapeHtml(t('analytics.productDetail.standardSet').replace('{n}', analyticsFormatNumber(profile.standardCycleTime, 2)))}</span>`;
    }
    return `
      <button type="button" id="analyticsCycleTimeNudgeBtn" data-master-id="${analyticsEscapeHtml(profile.masterRecordId)}" data-cycle-time="${profile.bestCycleTime}"
        onclick="analyticsSaveStandardCycleTime(this)"
        class="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100">
        <i class="ri-timer-flash-line"></i>
        ${analyticsEscapeHtml(t('analytics.productDetail.nudgeButton').replace('{n}', analyticsFormatNumber(profile.bestCycleTime, 2)))}
      </button>`;
  })();

  headerEl.innerHTML = `
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
      ${profile.imageURL
        ? `<img src="${analyticsEscapeHtml(profile.imageURL)}" alt="" class="h-28 w-36 rounded-xl border border-gray-100 object-cover" onerror="this.style.display='none'">`
        : `<div class="flex h-28 w-36 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-gray-300"><i class="ri-image-line text-3xl"></i></div>`}
      <div class="min-w-0 flex-1">
        <p class="text-xl font-semibold text-gray-900">${analyticsEscapeHtml(profile.productName || profile.hinban)}</p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          ${profile.hinban ? `<span class="rounded-lg bg-gray-100 px-2 py-1 font-medium text-gray-600">${analyticsEscapeHtml(profile.hinban)}</span>` : ''}
          ${profile.lhRh ? `<span class="rounded-lg bg-gray-100 px-2 py-1 font-medium text-gray-600">${analyticsEscapeHtml(profile.lhRh)}</span>` : ''}
          ${profile.hakoIresu > 0 ? `<span class="rounded-lg bg-gray-100 px-2 py-1 text-gray-600">${analyticsEscapeHtml(t('analytics.productDetail.boxSize').replace('{n}', analyticsFormatNumber(profile.hakoIresu)))}</span>` : ''}
          ${nudgeMarkup}
        </div>
      </div>
    </div>`;

  // Scoreboard tiles
  const paceRatio = profile.bestCycleTime > 0 && profile.averageCycleTime > 0
    ? profile.averageCycleTime / profile.bestCycleTime
    : 0;
  const tiles = [
    analyticsScoreTile({
      title: t('analytics.productDetail.tilePieces'),
      value: analyticsFormatNumber(profile.goodCount),
      detail: t('analytics.productDetail.tilePiecesDetail').replace('{n}', analyticsFormatNumber(profile.submissions)),
      tone: 'neutral'
    }),
    analyticsScoreTile({
      title: t('analytics.productDetail.tileDefectRate'),
      value: analyticsFormatPercent(profile.defectRate),
      detail: t('analytics.productDetail.tileDefectDetail').replace('{n}', analyticsFormatNumber(profile.defectCount)),
      tone: profile.defectCount === 0 ? 'good' : profile.defectRate < 2 ? 'watch' : 'bad'
    }),
    analyticsScoreTile({
      title: t('analytics.productDetail.tileBestPace'),
      value: `${analyticsFormatNumber(profile.bestCycleTime, 2)}`,
      info: t('analytics.productDetail.infoBestPace'),
      detail: t('analytics.productDetail.tileAvgPaceDetail').replace('{n}', analyticsFormatNumber(profile.averageCycleTime, 2)),
      tone: paceRatio === 0 ? 'neutral' : paceRatio <= 1.15 ? 'good' : paceRatio <= 1.35 ? 'watch' : 'bad'
    }),
    analyticsScoreTile({
      title: t('analytics.productDetail.tileTrouble'),
      value: analyticsFormatHours(profile.troubleTime),
      detail: t('analytics.workerFocus.workedHours').replace('{n}', analyticsFormatHours(profile.manHours)),
      tone: profile.troubleTime <= 0 ? 'good' : profile.troubleTime <= 1 ? 'watch' : 'bad'
    }),
    analyticsScoreTile({
      title: t('analytics.productDetail.tileIncompleteBoxes'),
      value: analyticsFormatNumber(profile.incompleteBoxRecords),
      detail: t('analytics.productDetail.tileIncompleteDetail'),
      tone: profile.incompleteBoxRecords === 0 ? 'good' : 'watch'
    })
  ];
  if (financeProduct && financeProduct.priced) {
    tiles.push(analyticsScoreTile({
      title: t('analytics.productDetail.tileProfit'),
      value: analyticsFormatCurrency(financeProduct.earnedThisMonth),
      detail: t('analytics.productDetail.tileProfitDetail').replace('{n}', analyticsFormatCurrency(financeProduct.lostThisMonth)),
      tone: 'neutral'
    }));
  }
  scoreboardEl.innerHTML = tiles.join('');
  scoreboardEl.className = `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-${Math.min(tiles.length, 6)}`;

  // Pace history chart (lower = faster)
  const paceHistory = profile.paceHistory || [];
  if (paceHistory.length === 0) {
    analyticsShowChartEmpty('analyticsProductPaceChart', t('analytics.productDetail.noPaceData'));
  } else {
    const markLines = [{
      yAxis: Math.round(profile.bestCycleTime * 100) / 100,
      lineStyle: { color: '#10b981', type: 'dashed' },
      label: { formatter: t('analytics.productDetail.bestPaceLine').replace('{n}', analyticsFormatNumber(profile.bestCycleTime, 2)), color: '#059669' }
    }];
    if (profile.standardCycleTime > 0) {
      markLines.push({
        yAxis: profile.standardCycleTime,
        lineStyle: { color: '#64748b', type: 'dotted' },
        label: { formatter: t('analytics.productDetail.standardLine').replace('{n}', analyticsFormatNumber(profile.standardCycleTime, 2)), color: '#475569' }
      });
    }

    analyticsRenderChart('analyticsProductPaceChart', {
      color: ['#0ea5e9'],
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const item = Array.isArray(params) ? params[0] : params;
          const point = paceHistory[item.dataIndex];
          if (!point) return '';
          return [
            `<strong>${analyticsEscapeHtml(point.date)}</strong>`,
            `${analyticsEscapeHtml(t('analytics.productDetail.tooltipPace'))}: <strong>${analyticsFormatNumber(point.cycleTime, 2)} ${analyticsEscapeHtml(t('analytics.productDetail.minPerPiece'))}</strong>`,
            `${analyticsEscapeHtml(t('analytics.productCompare.tooltipPieces'))}: ${analyticsFormatNumber(point.goodCount)}`,
            `${analyticsEscapeHtml(t('analytics.workerFocus.colMachine'))}: ${analyticsEscapeHtml(point.source)}`,
            `${analyticsEscapeHtml(t('analytics.workerFocus.colShared'))}: ${analyticsEscapeHtml((point.operators || []).join(', '))}`
          ].join('<br>');
        }
      },
      grid: { left: 40, right: 48, top: 32, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: paceHistory.map(point => point.label), axisTick: { show: false } },
      yAxis: { type: 'value', name: t('analytics.productDetail.minPerPiece'), splitLine: { lineStyle: { color: '#e2e8f0' } } },
      series: [{
        type: 'line',
        symbolSize: 7,
        smooth: true,
        data: paceHistory.map(point => Math.round(point.cycleTime * 100) / 100),
        markLine: { symbol: 'none', data: markLines }
      }]
    });
  }

  // Defect breakdown as simple horizontal bars
  if (defectsEl) {
    const defectTypes = (profile.defectsByType || []).slice(0, 8);
    if (defectTypes.length === 0) {
      defectsEl.innerHTML = `<div class="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><i class="ri-checkbox-circle-line"></i>${analyticsEscapeHtml(t('analytics.productDetail.noDefects'))}</div>`;
    } else {
      const maxCount = Math.max(...defectTypes.map(defect => defect.count));
      defectsEl.innerHTML = defectTypes.map(defect => `
        <div class="mb-2 flex items-center gap-2 text-sm">
          <span class="w-36 shrink-0 truncate text-gray-600" title="${analyticsEscapeHtml(defect.name)}">${analyticsEscapeHtml(defect.name)}</span>
          <div class="h-4 flex-1 rounded bg-gray-100">
            <div class="h-4 rounded bg-rose-400" style="width:${Math.max((defect.count / maxCount) * 100, 3)}%"></div>
          </div>
          <span class="w-10 text-right font-semibold text-gray-800">${analyticsFormatNumber(defect.count)}</span>
        </div>`).join('');
    }
  }

  // Machines & workers who make it
  if (peopleEl) {
    const machineChips = (profile.machines || []).map(machine =>
      `<span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-sm text-gray-700"><i class="ri-cpu-line text-gray-400"></i>${analyticsEscapeHtml(machine.name)} <span class="text-xs text-gray-400">${analyticsFormatNumber(machine.pieces)}</span></span>`).join(' ');
    const workerChips = (profile.workers || []).map(worker =>
      `<span class="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-sm text-sky-800"><i class="ri-user-line text-sky-400"></i>${analyticsEscapeHtml(worker.name)} <span class="text-xs text-sky-500">${analyticsFormatCount(worker.pieces)}</span></span>`).join(' ');
    peopleEl.innerHTML = `<div class="flex flex-wrap gap-2">${machineChips}</div><div class="mt-3 flex flex-wrap gap-2">${workerChips}</div>`;
  }
}

function handleAnalyticsProductDetailChange() {
  const select = document.getElementById('analyticsProductDetailSelect');
  if (select) analyticsProductDetailKey = select.value;
  if (!analyticsData) return;
  renderAnalyticsProductDetail(analyticsData);

  // Keep the worker-comparison chart on the same product (keys share the
  // same hinban||productName||lhRh format)
  const comparisons = analyticsData.productWorkerComparison || [];
  if (comparisons.some(entry => entry.key === analyticsProductDetailKey)) {
    analyticsProductCompareKey = analyticsProductDetailKey;
    renderAnalyticsProductWorkerComparison(comparisons);
  }
}

async function analyticsSaveStandardCycleTime(button) {
  const masterRecordId = button?.dataset?.masterId;
  const cycleTime = Number(button?.dataset?.cycleTime);
  if (!masterRecordId || !Number.isFinite(cycleTime) || cycleTime <= 0) return;

  button.disabled = true;
  try {
    const response = await fetch(`${API_URL}/api/admin/analytics/product-cycle-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...analyticsGetAuthHeaders() },
      body: JSON.stringify({ masterRecordId, cycleTime })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Failed');

    // Reflect the save locally without a full reload
    const profile = analyticsGetProductProfile(analyticsProductDetailKey);
    if (profile) profile.standardCycleTime = Number(result.cycleTime) || cycleTime;
    renderAnalyticsProductDetail(analyticsData);
  } catch (error) {
    console.error('cycle time save error:', error);
    button.disabled = false;
    alert(t('analytics.productDetail.nudgeError'));
  }
}

// ------------------------------------------------------------
// Quality tab: defect heatmap + control band
// ------------------------------------------------------------

function renderAnalyticsDefectHeatmap(defectMatrix) {
  const products = defectMatrix?.products || [];
  const defectTypes = defectMatrix?.defectTypes || [];

  if (products.length === 0 || defectTypes.length === 0) {
    analyticsShowChartEmpty('analyticsDefectHeatmap', t('analytics.quality.noHeatmapData'));
    return;
  }

  const rows = products.slice().reverse(); // Worst product on top
  const cells = [];
  let maxCount = 1;
  rows.forEach((product, rowIndex) => {
    product.counts.forEach((count, colIndex) => {
      if (count > 0) cells.push([colIndex, rowIndex, count]);
      if (count > maxCount) maxCount = count;
    });
  });

  analyticsRenderChart('analyticsDefectHeatmap', {
    tooltip: {
      position: 'top',
      formatter: params => {
        const product = rows[params.value[1]];
        return `${analyticsEscapeHtml(analyticsGetProductLabel(product))}<br>${analyticsEscapeHtml(defectTypes[params.value[0]])}: <strong>${analyticsFormatNumber(params.value[2])}</strong>`;
      }
    },
    grid: { left: 8, right: 24, top: 8, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: defectTypes.map(type => analyticsShortenLabel(type, 12)),
      axisLabel: { interval: 0, rotate: 28 },
      splitArea: { show: true }
    },
    yAxis: {
      type: 'category',
      data: rows.map(product => analyticsShortenLabel(analyticsGetProductLabel(product), 24)),
      splitArea: { show: true }
    },
    visualMap: {
      min: 0,
      max: maxCount,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      inRange: { color: ['#fef2f2', '#fca5a5', '#dc2626'] }
    },
    series: [{
      type: 'heatmap',
      data: cells,
      label: { show: true, formatter: params => params.value[2] },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' } }
    }]
  });
}

function renderAnalyticsDefectControlChart(dailyTrend) {
  const days = (dailyTrend || []).filter(day => Number(day.goodCount || 0) + Number(day.defectCount || 0) > 0);
  if (days.length < 3) {
    analyticsShowChartEmpty('analyticsDefectControlChart', t('analytics.quality.noControlData'));
    return;
  }

  const rates = days.map(day => Number(day.defectRate || 0));
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const sigma = Math.sqrt(rates.reduce((sum, rate) => sum + ((rate - mean) ** 2), 0) / rates.length);
  const upper = mean + 2 * sigma;
  const lower = Math.max(0, mean - 2 * sigma);

  analyticsRenderChart('analyticsDefectControlChart', {
    color: ['#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    grid: { left: 40, right: 32, top: 32, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: days.map(day => day.label), axisTick: { show: false } },
    yAxis: { type: 'value', name: '%', splitLine: { lineStyle: { color: '#e2e8f0' } } },
    series: [{
      name: t('analytics.kpi.defectRate'),
      type: 'line',
      symbolSize: 7,
      data: rates.map(rate => Math.round(rate * 100) / 100),
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(148, 163, 184, 0.15)' },
        data: [[{ yAxis: Math.round(lower * 100) / 100 }, { yAxis: Math.round(upper * 100) / 100 }]]
      },
      markLine: {
        symbol: 'none',
        lineStyle: { color: '#64748b', type: 'dashed' },
        label: { formatter: t('analytics.quality.controlMeanLabel').replace('{n}', analyticsFormatNumber(mean, 1)) },
        data: [{ yAxis: Math.round(mean * 100) / 100 }]
      }
    }]
  });
}

// ------------------------------------------------------------
// Machine tab: changeover trend + OPC outages
// ------------------------------------------------------------

function renderAnalyticsChangeoverTrend(changeoverTrend) {
  const weeks = changeoverTrend?.weeks || [];
  const series = changeoverTrend?.series || [];

  if (weeks.length === 0 || series.length === 0) {
    analyticsShowChartEmpty('analyticsChangeoverTrendChart', t('analytics.changeover.noData'));
    return;
  }

  analyticsRenderChart('analyticsChangeoverTrendChart', {
    color: ['#0ea5e9', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444'],
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 40, right: 32, top: 40, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: weeks.map(week => week.label), axisTick: { show: false } },
    yAxis: { type: 'value', name: t('analytics.changeover.yAxisMinutes'), splitLine: { lineStyle: { color: '#e2e8f0' } } },
    series: series.map(machine => ({
      name: machine.source,
      type: 'line',
      connectNulls: true,
      symbolSize: 7,
      data: machine.averageMinutes
    }))
  });
}

function renderAnalyticsOpcEvents(opcEvents) {
  const container = document.getElementById('analyticsOpcEventsCard');
  if (!container) return;

  const daily = opcEvents?.daily || [];
  if (daily.length === 0) {
    container.innerHTML = `
      <div class="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <i class="ri-wifi-line text-lg"></i>
        <span>${analyticsEscapeHtml(t('analytics.opcEvents.noOutages'))}</span>
      </div>`;
    return;
  }

  container.innerHTML = `
    <p class="mb-3 text-sm text-gray-600">${analyticsEscapeHtml(t('analytics.opcEvents.total').replace('{n}', analyticsFormatNumber(opcEvents.totalConnectionLost)))}</p>
    <div class="flex flex-wrap gap-2">
      ${daily.map(day => `
        <span class="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-900" title="${analyticsEscapeHtml((day.devices || []).join(', '))}">
          <i class="ri-wifi-off-line"></i>${analyticsEscapeHtml(day.label)}
          <span class="text-xs font-semibold">×${analyticsFormatNumber(day.count)}</span>
        </span>`).join('')}
    </div>`;
}

// ------------------------------------------------------------
// Finance quadrant scatter
// ------------------------------------------------------------

function renderAnalyticsFinanceQuadrant(finance) {
  const products = (finance?.products || []).filter(product => product.priced && Number(product.goodCount || 0) > 0);
  if (products.length === 0) {
    analyticsShowChartEmpty('analyticsFinanceQuadrantChart', t('analytics.finance.noData'));
    return;
  }

  const maxDefectCount = Math.max(1, ...products.map(product => Number(product.defectCount || 0)));
  const defectColor = rate => rate < 2 ? '#10b981' : rate < 5 ? '#f59e0b' : '#ef4444';

  analyticsRenderChart('analyticsFinanceQuadrantChart', {
    tooltip: {
      formatter: params => {
        const product = products[params.dataIndex];
        const defectRate = (Number(product.goodCount) + Number(product.defectCount)) > 0
          ? (Number(product.defectCount) / (Number(product.goodCount) + Number(product.defectCount))) * 100 : 0;
        return [
          `<strong>${analyticsEscapeHtml(analyticsGetProductLabel(product))}</strong>`,
          `${analyticsEscapeHtml(t('analytics.finance.colPieces'))}: ${analyticsFormatNumber(product.goodCount)}`,
          `${analyticsEscapeHtml(t('analytics.finance.colPrice'))}: ${analyticsFormatCurrency(product.price)}`,
          `${analyticsEscapeHtml(t('analytics.productCompare.tooltipDefectRate'))}: ${analyticsFormatNumber(defectRate, 1)}%`,
          `${analyticsEscapeHtml(t('analytics.finance.colLost'))}: ${analyticsFormatCurrency(product.lost)}`
        ].join('<br>');
      }
    },
    grid: { left: 56, right: 32, top: 32, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: t('analytics.finance.quadrantXAxis'), splitLine: { lineStyle: { color: '#e2e8f0' } } },
    yAxis: { type: 'value', name: t('analytics.finance.quadrantYAxis'), axisLabel: { formatter: value => `¥${Number(value).toLocaleString('ja-JP')}` }, splitLine: { lineStyle: { color: '#e2e8f0' } } },
    series: [{
      type: 'scatter',
      data: products.map(product => {
        const defectRate = (Number(product.goodCount) + Number(product.defectCount)) > 0
          ? (Number(product.defectCount) / (Number(product.goodCount) + Number(product.defectCount))) * 100 : 0;
        return {
          value: [Number(product.goodCount), Number(product.price)],
          symbolSize: 12 + (Number(product.defectCount || 0) / maxDefectCount) * 28,
          itemStyle: { color: defectColor(defectRate), opacity: 0.75 }
        };
      })
    }]
  });
}

// ------------------------------------------------------------
// Saved view state (tab + filters persist across visits)
// ------------------------------------------------------------

const ANALYTICS_VIEW_STORAGE_KEY = 'analyticsViewState';

function analyticsSaveViewState() {
  try {
    localStorage.setItem(ANALYTICS_VIEW_STORAGE_KEY, JSON.stringify({
      tab: analyticsActiveTab,
      startDate: document.getElementById('analyticsStartDate')?.value || '',
      endDate: document.getElementById('analyticsEndDate')?.value || '',
      source: document.getElementById('analyticsSource')?.value || 'all',
      lhRh: document.getElementById('analyticsLhRh')?.value || 'all',
      hinban: document.getElementById('analyticsHinban')?.value || '',
      productName: document.getElementById('analyticsProductName')?.value || '',
      operator: document.getElementById('analyticsOperator')?.value || ''
    }));
  } catch (error) {
    console.warn('analytics view state save error:', error);
  }
}

function analyticsRestoreViewState() {
  try {
    const stored = JSON.parse(localStorage.getItem(ANALYTICS_VIEW_STORAGE_KEY) || 'null');
    if (!stored) return;

    if (stored.tab) analyticsActiveTab = stored.tab;
    const assign = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.value = value;
    };
    assign('analyticsStartDate', stored.startDate);
    assign('analyticsEndDate', stored.endDate);
    assign('analyticsHinban', stored.hinban);
    assign('analyticsProductName', stored.productName);
    assign('analyticsOperator', stored.operator);
    // Select values restored after options load; stash for later
    window.__analyticsPendingSelects = { source: stored.source, lhRh: stored.lhRh };
  } catch (error) {
    console.warn('analytics view state restore error:', error);
  }
}

function renderAnalyticsActiveTab() {
  if (!analyticsData) return;

  switch (analyticsActiveTab) {
    case 'worker':
      renderAnalyticsWorkerTab(analyticsData);
      break;
    case 'machine':
      renderAnalyticsMachineTab(analyticsData);
      break;
    case 'quality':
      renderAnalyticsQualityTab(analyticsData);
      break;
    case 'product':
      renderAnalyticsProductTab(analyticsData);
      break;
    case 'finance':
      renderAnalyticsFinanceTab(analyticsData);
      break;
    case 'overview':
    default:
      renderAnalyticsOverview(analyticsData);
      break;
  }
}

function renderAnalytics(data) {
  analyticsData = data;
  renderAnalyticsMeta(data.filters || {}, data.summary || {}, data.generatedAt || '');
  renderAnalyticsKpis(data.summary || {}, data.previousSummary || null);
  analyticsUpdateFinanceTabVisibility(data);
  renderAnalyticsActiveTab();
}

async function loadAnalyticsFilterOptions() {
  try {
    const response = await fetch(`${API_URL}/api/admin/analytics/filter-options`, {
      headers: analyticsGetAuthHeaders()
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to load analytics filter options');
    }

    const options = result.options || {};
    analyticsPopulateSelect('analyticsSource', options.sources || [], t('analytics.filters.allSources'));
    analyticsPopulateSelect('analyticsFocusOperator', options.operators || [], t('analytics.filters.autoTopWorker'), true);
    analyticsPopulateDatalist('analyticsHinbanList', options.hinban || []);
    analyticsPopulateDatalist('analyticsProductList', options.productNames || []);
    analyticsPopulateDatalist('analyticsOperatorList', options.operators || []);

    const lhRhSelect = document.getElementById('analyticsLhRh');
    if (lhRhSelect && Array.isArray(options.lhRh) && options.lhRh.length > 0) {
      const currentValue = lhRhSelect.value;
      const values = [...new Set(options.lhRh.filter(Boolean))];
      lhRhSelect.innerHTML = [`<option value="all">${analyticsEscapeHtml(t('analytics.filters.allDirections'))}</option>`]
        .concat(values.map(value => `<option value="${analyticsEscapeHtml(value)}">${analyticsEscapeHtml(value)}</option>`))
        .join('');
      lhRhSelect.value = values.includes(currentValue) ? currentValue : 'all';
    }

    // Apply saved select values now that the options exist, then refresh once
    const pending = window.__analyticsPendingSelects;
    if (pending) {
      window.__analyticsPendingSelects = null;
      let changed = false;
      const applySaved = (id, value) => {
        const select = document.getElementById(id);
        if (!select || !value || value === 'all') return;
        if ([...select.options].some(option => option.value === value) && select.value !== value) {
          select.value = value;
          changed = true;
        }
      };
      applySaved('analyticsSource', pending.source);
      applySaved('analyticsLhRh', pending.lhRh);
      if (changed) loadAnalytics();
    }
  } catch (error) {
    console.error('analytics filter options error:', error);
  }
}

async function loadAnalytics() {
  const root = document.getElementById('analyticsRoot');
  if (!root) return;

  const requestId = ++analyticsRequestId;
  const refreshBtn = document.getElementById('analyticsRefreshBtn');
  const refreshLabel = document.getElementById('analyticsRefreshLabel');
  const previousLabel = t('analytics.refresh');
  analyticsSetError('');

  if (refreshBtn) refreshBtn.disabled = true;
  if (refreshLabel) refreshLabel.textContent = t('analytics.refreshing');

  try {
    const response = await fetch(`${API_URL}/api/admin/analytics?${analyticsBuildParams().toString()}`, {
      headers: analyticsGetAuthHeaders()
    });
    const result = await response.json();

    if (requestId !== analyticsRequestId || !document.getElementById('analyticsRoot')) {
      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || t('analytics.errors.loadFailed'));
    }

    renderAnalytics(result);
    analyticsSaveViewState();
  } catch (error) {
    console.error('analytics load error:', error);
    analyticsSetError(error.message || t('analytics.errors.loadFailed'));
  } finally {
    if (requestId === analyticsRequestId && document.getElementById('analyticsRoot')) {
      if (refreshBtn) refreshBtn.disabled = false;
      if (refreshLabel) refreshLabel.textContent = previousLabel;
    }
  }
}

function resetAnalyticsFilters() {
  analyticsSetDefaultFilters(true);

  ['analyticsHinban', 'analyticsProductName', 'analyticsOperator'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const sourceEl = document.getElementById('analyticsSource');
  const lhRhEl = document.getElementById('analyticsLhRh');
  const focusOperatorEl = document.getElementById('analyticsFocusOperator');
  if (sourceEl) sourceEl.value = 'all';
  if (lhRhEl) lhRhEl.value = 'all';
  if (focusOperatorEl) focusOperatorEl.value = '';

  loadAnalytics();
}

function handleAnalyticsShiftChange() {
  const shiftStartEl = document.getElementById('analyticsShiftStart');
  const shiftEndEl = document.getElementById('analyticsShiftEnd');
  const shiftProfile = analyticsGetShiftProfile({
    start: shiftStartEl?.value,
    end: shiftEndEl?.value
  });

  analyticsSaveShiftProfile(shiftProfile);
  analyticsSyncShiftControls(shiftProfile);

  if (analyticsData) {
    renderAnalytics(analyticsData);
  }
}

function resetAnalyticsShift() {
  analyticsClearShiftProfile();
  const shiftProfile = analyticsGetShiftProfile(analyticsDefaultShiftProfile);
  analyticsSyncShiftControls(shiftProfile);

  if (analyticsData) {
    renderAnalytics(analyticsData);
  }
}

function handleAnalyticsFilterKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadAnalytics();
  }
}

function disposeAnalyticsCharts() {
  Object.values(analyticsCharts).forEach(chart => {
    if (chart) chart.dispose();
  });
  analyticsCharts = {};
  analyticsData = null;
}

function analyticsUpdateFilterOptionLabels() {
  const sourceSelect = document.getElementById('analyticsSource');
  if (sourceSelect) {
    const allOpt = sourceSelect.querySelector('option[value="all"]');
    if (allOpt) allOpt.textContent = t('analytics.filters.allSources');
  }

  const lhRhSelect = document.getElementById('analyticsLhRh');
  if (lhRhSelect) {
    const allOpt = lhRhSelect.querySelector('option[value="all"]');
    if (allOpt) allOpt.textContent = t('analytics.filters.allDirections');
  }

  const focusSelect = document.getElementById('analyticsFocusOperator');
  if (focusSelect) {
    const blankOpt = focusSelect.querySelector('option[value=""]');
    if (blankOpt) blankOpt.textContent = t('analytics.filters.autoTopWorker');
  }
}

function initializeAnalytics() {
  const root = document.getElementById('analyticsRoot');
  if (!root) return;
  if (typeof applyTranslations === 'function') applyTranslations(root);
  analyticsRestoreViewState();
  analyticsSetDefaultFilters();
  analyticsSyncShiftControls();
  analyticsUpdateTabState();
  loadAnalyticsFilterOptions();
  loadAnalytics();
}

window.addEventListener('resize', () => {
  Object.values(analyticsCharts).forEach(chart => {
    if (chart) chart.resize();
  });
});

window.initializeAnalytics = initializeAnalytics;
window.loadAnalytics = loadAnalytics;
window.resetAnalyticsFilters = resetAnalyticsFilters;
window.handleAnalyticsShiftChange = handleAnalyticsShiftChange;
window.resetAnalyticsShift = resetAnalyticsShift;
window.handleAnalyticsFilterKeydown = handleAnalyticsFilterKeydown;
window.disposeAnalyticsCharts = disposeAnalyticsCharts;
window.setAnalyticsTab = setAnalyticsTab;
window.setAnalyticsWorkerView = setAnalyticsWorkerView;
window.handleAnalyticsWorkerFocusChange = handleAnalyticsWorkerFocusChange;
window.analyticsOpenWorkerDay = analyticsOpenWorkerDay;
window.analyticsOpenWorkerReport = analyticsOpenWorkerReport;
window.handleAnalyticsProductCompareChange = handleAnalyticsProductCompareChange;
window.setAnalyticsFinanceScope = setAnalyticsFinanceScope;
window.analyticsResizeChartsSoon = analyticsResizeChartsSoon;
window.handleAnalyticsProductDetailChange = handleAnalyticsProductDetailChange;
window.analyticsSaveStandardCycleTime = analyticsSaveStandardCycleTime;
window.analyticsPrintWorkerReport = analyticsPrintWorkerReport;
window.analyticsUpdateFilterOptionLabels = analyticsUpdateFilterOptionLabels;