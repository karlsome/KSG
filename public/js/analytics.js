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
          <p class="text-sm font-medium text-gray-500">${card.title || card.eyebrow || ''}</p>
          <p class="mt-4 max-w-full font-semibold leading-tight ${analyticsGetCardValueLayoutClass(card)} ${analyticsGetCardValueSizeClass(card)} ${analyticsGetCardValueClass(card)}" title="${analyticsEscapeHtml(analyticsGetCardValueText(card))}">${card.value}</p>
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

function renderAnalyticsKpis(summary) {
  const cards = [
    {
      eyebrow: t('analytics.kpi.goodPieces'),
      value: analyticsFormatNumber(summary.totalGoodCount),
      detail: t('analytics.kpi.recordsInScope').replace('{n}', analyticsFormatNumber(summary.submissions)),
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-checkbox-circle-line'
    },
    {
      eyebrow: t('analytics.kpi.defectRate'),
      value: analyticsFormatPercent(summary.defectRate),
      detail: t('analytics.kpi.totalDefects').replace('{n}', analyticsFormatNumber(summary.totalDefectCount)),
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: t('analytics.kpi.issueRecords'),
      value: analyticsFormatNumber(summary.totalIssueRecords),
      detail: t('analytics.kpi.recordsWithIssues'),
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: t('analytics.kpi.manHours'),
      value: analyticsFormatHours(summary.totalManHours),
      detail: t('analytics.kpi.troubleTime').replace('{n}', analyticsFormatHours(summary.totalTroubleTime)),
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-time-line'
    },
    {
      eyebrow: t('analytics.kpi.activeWorkers'),
      value: analyticsFormatNumber(summary.uniqueOperators),
      detail: t('analytics.kpi.kanbans').replace('{n}', analyticsFormatNumber(summary.uniqueKanbans)),
      tone: 'bg-violet-50 text-violet-700',
      icon: 'ri-team-line'
    },
    {
      eyebrow: t('analytics.kpi.activeMachines'),
      value: analyticsFormatNumber(summary.uniqueSources),
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

  analyticsRenderCardGrid('analyticsOverviewHighlights', [
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
  ]);

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

  renderAnalyticsProductsChart(products);
  renderAnalyticsProductHighlights(products);
  renderAnalyticsProductTable(products);
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
    case 'overview':
    default:
      renderAnalyticsOverview(analyticsData);
      break;
  }
}

function renderAnalytics(data) {
  analyticsData = data;
  renderAnalyticsMeta(data.filters || {}, data.summary || {}, data.generatedAt || '');
  renderAnalyticsKpis(data.summary || {});
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
window.analyticsUpdateFilterOptionLabels = analyticsUpdateFilterOptionLabels;