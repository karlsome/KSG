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
let analyticsActiveTab = 'productivity';
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
    <article class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-gray-200">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium text-gray-500">${card.title || card.eyebrow || ''}${card.info ? ` <i class="ri-information-line align-middle text-gray-300" title="${analyticsEscapeHtml(card.info)}"></i>` : ''}</p>
          <p class="mt-3 max-w-full font-semibold leading-tight tracking-tight tabular-nums ${analyticsGetCardValueLayoutClass(card)} ${analyticsGetCardValueSizeClass(card)} ${analyticsGetCardValueClass(card)}" title="${analyticsEscapeHtml(analyticsGetCardValueText(card))}">${card.value}${card.delta || ''}</p>
          <p class="mt-1 text-xs text-gray-400 font-medium tabular-nums truncate" title="${analyticsEscapeHtml(card.detail || card.subtext || '')}">${card.detail || card.subtext || ''}</p>
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
  
  let hinban = document.getElementById('analyticsHinban')?.value.trim() || '';
  let productName = document.getElementById('analyticsProductName')?.value.trim() || '';
  const combined = document.getElementById('analyticsProductCombined')?.value;
  if (combined) {
      try {
          const parsed = JSON.parse(combined);
          hinban = parsed.hinban || '';
          productName = parsed.productName || '';
      } catch (e) {
          productName = combined;
      }
  }

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

  // Toggle global filters and scope summary when on MoM or Productivity tab
  const isMoM = analyticsActiveTab === 'mom';
  const isProductivity = analyticsActiveTab === 'productivity' || analyticsActiveTab === 'overview';
  const hideGlobalFilters = isMoM || isProductivity;
  const globalFilterCard = document.getElementById('analyticsGlobalFilterCard');
  if (globalFilterCard) globalFilterCard.classList.toggle('hidden', hideGlobalFilters);
  const scopeSummary = document.getElementById('analyticsScopeSummarySection');
  if (scopeSummary) scopeSummary.classList.toggle('hidden', hideGlobalFilters);

  // Handle filter visibility dynamically
  const cSource = document.getElementById('filter-container-source');
  const cLhrh = document.getElementById('filter-container-lhrh');
  const cProduct = document.getElementById('filter-container-product');
  const cOperator = document.getElementById('filter-container-operator');
  
  if (cSource) cSource.classList.toggle('hidden', !['machine'].includes(analyticsActiveTab));
  if (cLhrh) cLhrh.classList.toggle('hidden', !['product'].includes(analyticsActiveTab));
  if (cProduct) cProduct.classList.toggle('hidden', !['quality', 'product', 'finance'].includes(analyticsActiveTab));
  if (cOperator) cOperator.classList.toggle('hidden', !['worker'].includes(analyticsActiveTab));
}

function setAnalyticsTab(tabName) {
  analyticsActiveTab = tabName || 'productivity';
  analyticsUpdateTabState();
  if (analyticsActiveTab === 'productivity' || analyticsActiveTab === 'overview') {
    initAnalyticsProductivity();
    loadAnalyticsProductivity();
  } else if (analyticsActiveTab === 'mom') {
    initAnalyticsMoM(analyticsData);
    loadAnalyticsMoM();
  } else {
    renderAnalyticsActiveTab();
  }
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
      tone: 'border-gray-100 bg-gray-50'
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

// ==========================================================================
// Productivity (生産性) Tab Implementation
// Replicates physical factory whiteboard (220/1人h活動)
// ==========================================================================
let analyticsProductivityData = null;
let analyticsProductivityCharts = new Map();

function initAnalyticsProductivity() {
  const monthInput = document.getElementById('analyticsProductivityMonth');
  if (monthInput && !monthInput.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${y}-${m}`;
  }
  handleAnalyticsProductivityTargetChange(false);
}

function handleAnalyticsProductivityTargetChange(shouldReload = true) {
  const targetInput = document.getElementById('analyticsProductivityTarget');
  const targetDisplay = document.getElementById('analyticsProductivityTargetDisplay');
  if (targetInput && targetDisplay) {
    targetDisplay.textContent = targetInput.value || '220';
  }
  if (shouldReload) {
    loadAnalyticsProductivity();
  }
}

async function loadAnalyticsProductivity() {
  const container = document.getElementById('analyticsProductivityContainer');
  if (!container) return;

  const monthInput = document.getElementById('analyticsProductivityMonth');
  const sourceSelect = document.getElementById('analyticsProductivitySource');
  const operatorSelect = document.getElementById('analyticsProductivityOperator');
  const targetInput = document.getElementById('analyticsProductivityTarget');
  const warningInput = document.getElementById('analyticsProductivityWarning');
  const month = monthInput?.value || '';
  const source = sourceSelect?.value || 'all';
  const operator = operatorSelect?.value || 'all';
  const target = targetInput && Number(targetInput.value) > 0 ? Number(targetInput.value) : null;
  const warning = warningInput && Number(warningInput.value) > 0 ? Number(warningInput.value) : null;

  // Show loading state
  container.innerHTML = `
    <div class="flex items-center justify-center py-16 text-gray-400">
      <div class="flex flex-col items-center gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
        <p class="text-sm font-medium text-gray-500">生産性データを集計中...</p>
      </div>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (source && source !== 'all') params.set('source', source);
    if (operator && operator !== 'all') params.set('operator', operator);
    if (target != null) params.set('target', target);
    if (warning != null) params.set('warning', warning);

    const response = await fetch(`${API_URL}/api/admin/analytics/productivity?${params.toString()}`, {
      headers: analyticsGetAuthHeaders()
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to load productivity data');
    }

    analyticsProductivityData = result;

    // Update filter dropdown options dynamically while preserving selection
    if (sourceSelect && result.filterOptions) {
      const currentVal = sourceSelect.value || 'all';
      const sourceOptions = (result.filterOptions.availableSources || []);
      const optsHtml = [`<option value="all">${t('analytics.productivity.allEquipments') || '全ての設備'}</option>`];
      sourceOptions.forEach(s => {
        optsHtml.push(`<option value="${analyticsEscapeHtml(s)}">${analyticsEscapeHtml(s)}</option>`);
      });
      sourceSelect.innerHTML = optsHtml.join('');
      if (sourceOptions.includes(currentVal) || currentVal === 'all') {
        sourceSelect.value = currentVal;
      }
    }

    if (operatorSelect && result.filterOptions) {
      const currentOp = operatorSelect.value || 'all';
      const opOptions = (result.filterOptions.availableOperators || []);
      const opHtml = [`<option value="all">${t('analytics.productivity.allWorkers') || '全ての作業者'}</option>`];
      opOptions.forEach(op => {
        opHtml.push(`<option value="${analyticsEscapeHtml(op)}">${analyticsEscapeHtml(op)}</option>`);
      });
      operatorSelect.innerHTML = opHtml.join('');
      if (opOptions.includes(currentOp) || currentOp === 'all') {
        operatorSelect.value = currentOp;
      }
    }

    // Render KPIs
    const kpiPieces = document.getElementById('analyticsProductivityKpiPieces');
    const kpiHours = document.getElementById('analyticsProductivityKpiHours');
    const kpiAvg = document.getElementById('analyticsProductivityKpiAvg1hPc');
    const kpiAchieve = document.getElementById('analyticsProductivityKpiAchieve');

    if (kpiPieces) kpiPieces.textContent = analyticsFormatNumber(result.summary?.totalPieces || 0);
    if (kpiHours) kpiHours.textContent = analyticsFormatHours(result.summary?.totalHours || 0);
    if (kpiAvg) {
      kpiAvg.textContent = result.summary?.overall1hPc
        ? `${result.summary.overall1hPc.toFixed(1)} ヶ/1人h`
        : '-';
    }
    if (kpiAchieve) {
      const achieved = result.summary?.achievedCount || 0;
      const totalOps = result.summary?.totalOperators || 0;
      const rate = result.summary?.achievementRate || 0;
      kpiAchieve.textContent = `${achieved} / ${totalOps} (${rate}%)`;
    }

    renderAnalyticsProductivityTab(result);
  } catch (error) {
    console.error('loadAnalyticsProductivity error:', error);
    container.innerHTML = `
      <div class="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center text-rose-700">
        <p class="font-bold">データの取得に失敗しました</p>
        <p class="mt-1 text-xs text-rose-600">${analyticsEscapeHtml(error.message)}</p>
        <button type="button" onclick="loadAnalyticsProductivity()" class="mt-3 inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">
          再試行
        </button>
      </div>
    `;
  }
}

function disposeAnalyticsProductivityCharts() {
  analyticsProductivityCharts.forEach((chart, id) => {
    try {
      if (chart && typeof chart.dispose === 'function') {
        chart.dispose();
      }
    } catch (e) {
      console.warn('Error disposing chart:', id, e);
    }
  });
  analyticsProductivityCharts.clear();
}

function renderAnalyticsProductivityTab(data) {
  const container = document.getElementById('analyticsProductivityContainer');
  if (!container) return;

  disposeAnalyticsProductivityCharts();

  if (!data || !data.machines || data.machines.length === 0) {
    container.innerHTML = `
      <div class="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
          <i class="ri-bar-chart-2-line text-2xl"></i>
        </div>
        <h3 class="mt-4 text-base font-semibold text-gray-900">${t('analytics.productivity.noDataForMonth') || '対象月の生産性データがありません。'}</h3>
        <p class="mt-1 text-xs text-gray-500">上部の対象月または設備・作業者のフィルターを変更してください。</p>
      </div>
    `;
    return;
  }

  const daysInMonth = data.daysInMonth || 30;
  const target = data.target || 220;
  const warning = data.warning || 210;
  const monthNumber = data.monthNumber || '';

  window._analyticsProdClickMap = new Map();
  let html = '';
  let chartCounter = 0;
  const pendingCharts = [];

  data.machines.forEach(machine => {
    const machineName = machine.machineName || '未指定';
    const machineAvgStr = machine.monthlyAvg1hPc != null ? `${machine.monthlyAvg1hPc.toFixed(1)} ヶ/1人h` : '-';
    const operators = machine.operators || [];

    html += `
      <section class="space-y-4">
        <!-- 設備 Whiteboard Header Banner (styled consistently with MoM Tab) -->
        <div class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shadow-2xs">
                <i class="ri-cpu-line text-lg"></i>
              </div>
              <h3 class="text-base font-semibold text-gray-900">${analyticsEscapeHtml(machineName)}</h3>
              <span class="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                第3目標: ${target}/1h
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-500">
              <div>作業者: <span class="text-sm font-semibold text-gray-900 tabular-nums">${machine.operatorCount}</span> 名</div>
              <div class="hidden sm:block text-gray-200">|</div>
              <div>月間良品数: <span class="text-sm font-semibold text-gray-900 tabular-nums">${analyticsFormatNumber(machine.monthlyPieces)}</span> 個</div>
              <div class="hidden sm:block text-gray-200">|</div>
              <div>月間工数: <span class="text-sm font-semibold text-gray-900 tabular-nums">${analyticsFormatHours(machine.monthlyHours)}</span> h</div>
              <div class="hidden sm:block text-gray-200">|</div>
              <div>設備平均: <span class="text-sm font-semibold text-indigo-600 tabular-nums">${machineAvgStr}</span></div>
            </div>
          </div>
        </div>

        <!-- Full-Width Stacked Cards (Graph + Table sequence per worker, all month with no horizontal scrolling) -->
        <div class="space-y-8">
    `;

    operators.forEach(op => {
      chartCounter++;
      const chartDomId = `prodWorkerChart_${chartCounter}`;
      const opTarget = (op.target != null && op.target > 0) ? op.target : target;
      const opWarning = (op.warning != null && op.warning > 0) ? op.warning : warning;
      const isAchieved = op.monthlyAvg1hPc && op.monthlyAvg1hPc >= opTarget;
      const isBelowWarning = op.monthlyAvg1hPc && op.monthlyAvg1hPc < opWarning;

      let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (isBelowWarning) {
        badgeBg = 'bg-rose-50 text-rose-700 border-rose-200';
      } else if (!isAchieved) {
        badgeBg = 'bg-amber-50 text-amber-700 border-amber-200';
      }

      const opAvgStr = op.monthlyAvg1hPc != null ? op.monthlyAvg1hPc.toFixed(1) : '-';

      // Build 5-Row Data Table (日付, ライン, 良品数, 時間, 出来高/1人h, 理由)
      const dailyDataMap = new Map();
      (op.dailyData || []).forEach(d => dailyDataMap.set(d.day, d));

      const activeDays = (op.dailyData || []).map(d => d.day);

      let tableHtml = '';
      if (activeDays.length === 0) {
        tableHtml = `<div class="p-4 text-center text-xs text-gray-400 font-medium">実績データなし</div>`;
      } else {
        const rowDates = [];
        const rowLines = [];
        const rowPieces = [];
        const rowHours = [];
        const rowRate = [];
        const rowRemarks = [];
        let hasAnyRemark = false;

        activeDays.forEach(day => {
          const item = dailyDataMap.get(day);
          const dateStr = item ? item.dateLabel : `${monthNumber}/${day}`;
          const kanban = item?.kanban || '-';
          const pieces = item ? analyticsFormatNumber(item.pieces) : '-';
          const hours = item ? item.hours.toFixed(2) : '-';
          const rateVal = item?.oneHrPc;
          let rateCellClass = 'text-gray-700';
          let rateBgClass = '';

          if (rateVal != null) {
            if (rateVal >= opTarget) {
              rateCellClass = 'text-emerald-700 font-semibold';
              rateBgClass = 'bg-emerald-50/70';
            } else if (rateVal >= opWarning) {
              rateCellClass = 'text-amber-700 font-semibold';
              rateBgClass = 'bg-amber-50/70';
            } else {
              rateCellClass = 'text-rose-700 font-semibold';
              rateBgClass = 'bg-rose-50/70';
            }
          }

          const rateStr = rateVal != null ? Math.round(rateVal) : '-';
          const remark = item?.remarks || '';
          if (remark) hasAnyRemark = true;

          const clickKey = `prod_${chartCounter}_${day}`;
          window._analyticsProdClickMap.set(clickKey, {
            item,
            context: {
              operatorName: op.operatorName,
              machineName,
              productName: op.productName,
              target: opTarget,
              warning: opWarning
            }
          });

          const cellTitle = analyticsEscapeHtml(typeof t === 'function' ? t('analytics.productivity.clickToViewSubmitted') : 'クリックして実績詳細(submittedDB)を表示');
          const cellCommonClass = 'cursor-pointer transition-colors hover:bg-indigo-100/75 hover:text-indigo-950 active:bg-indigo-200/80';

          rowDates.push(`<th class="px-2.5 py-1.5 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 whitespace-nowrap ${cellCommonClass} group" onclick="handleProductivityCellClick('${clickKey}')" title="${cellTitle}"><div class="inline-flex items-center gap-1"><span>${dateStr}</span><i class="ri-external-link-line text-3xs text-gray-400 group-hover:text-indigo-600 transition-colors"></i></div></th>`);
          rowLines.push(`<td class="px-2.5 py-1 text-center text-xs font-medium text-gray-600 border-r border-gray-100 whitespace-nowrap ${cellCommonClass}" onclick="handleProductivityCellClick('${clickKey}')" title="${cellTitle}">${analyticsEscapeHtml(kanban)}</td>`);
          rowPieces.push(`<td class="px-2.5 py-1 text-center text-xs tabular-nums font-medium text-gray-900 border-r border-gray-100 whitespace-nowrap ${cellCommonClass}" onclick="handleProductivityCellClick('${clickKey}')" title="${cellTitle}">${pieces}</td>`);
          rowHours.push(`<td class="px-2.5 py-1 text-center text-xs tabular-nums font-medium text-gray-500 border-r border-gray-100 whitespace-nowrap ${cellCommonClass}" onclick="handleProductivityCellClick('${clickKey}')" title="${cellTitle}">${hours}</td>`);
          rowRate.push(`<td class="px-2.5 py-1 text-center text-xs tabular-nums font-semibold ${rateCellClass} ${rateBgClass} border-r border-gray-100 whitespace-nowrap cursor-pointer transition-colors hover:brightness-95 active:brightness-90" onclick="handleProductivityCellClick('${clickKey}')" title="${cellTitle}">${rateStr}</td>`);
          if (remark) {
            rowRemarks.push(`<td class="px-2.5 py-1 text-center text-xs font-medium text-rose-600 border-r border-gray-100 max-w-[140px] truncate cursor-pointer transition-colors hover:bg-rose-100/80" onclick="handleProductivityCellClick('${clickKey}')" title="${analyticsEscapeHtml(remark)} · ${cellTitle}">${analyticsEscapeHtml(remark)}</td>`);
          } else {
            rowRemarks.push(`<td class="px-2.5 py-1 text-center text-xs text-gray-300 border-r border-gray-100 ${cellCommonClass}" onclick="handleProductivityCellClick('${clickKey}')" title="${cellTitle}">-</td>`);
          }
        });

        tableHtml = `
          <div class="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-2xs">
            <table class="w-full text-xs text-left border-collapse">
              <tbody>
                <tr class="bg-gray-50 border-b border-gray-100">
                  <th class="px-3 py-1.5 text-left font-semibold text-gray-700 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] z-10 w-28">日付</th>
                  ${rowDates.join('')}
                </tr>
                <tr class="border-b border-gray-100 hover:bg-gray-50/50">
                  <th class="px-3 py-1 text-left font-semibold text-gray-500 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-white shadow-[1px_0_0_0_#f3f4f6] z-10">ライン</th>
                  ${rowLines.join('')}
                </tr>
                <tr class="border-b border-gray-100 hover:bg-gray-50/50">
                  <th class="px-3 py-1 text-left font-semibold text-gray-500 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-white shadow-[1px_0_0_0_#f3f4f6] z-10">良品数</th>
                  ${rowPieces.join('')}
                </tr>
                <tr class="border-b border-gray-100 hover:bg-gray-50/50">
                  <th class="px-3 py-1 text-left font-semibold text-gray-500 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-white shadow-[1px_0_0_0_#f3f4f6] z-10">時間</th>
                  ${rowHours.join('')}
                </tr>
                <tr class="border-b border-gray-100 bg-indigo-50/30">
                  <th class="px-3 py-1.5 text-left font-semibold text-indigo-700 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-indigo-50/50 shadow-[1px_0_0_0_#f3f4f6] z-10">出来高/1人h</th>
                  ${rowRate.join('')}
                </tr>
                ${hasAnyRemark ? `
                <tr class="bg-rose-50/30">
                  <th class="px-3 py-1 text-left text-xs font-semibold text-rose-600 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-rose-50 shadow-[1px_0_0_0_#f3f4f6] z-10">理由</th>
                  ${rowRemarks.join('')}
                </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        `;
      }

      const displayProduct = (op.productName && op.productName !== machineName && !machineName.includes(op.productName))
        ? `${machineName} (${op.productName})`
        : machineName;

      html += `
        <div class="productivity-worker-card w-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col space-y-4">
          <div>
            <!-- Sheet Card Header: Large Prominent Worker Name - Product Name -->
            <div class="border-b border-gray-100 pb-3.5 space-y-3">
              <!-- Top Row: Large Eye-Catching Title & Achievement Badge -->
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h3 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  <span class="text-gray-900">${analyticsEscapeHtml(op.operatorName)}</span>
                  <span class="text-gray-300 font-normal mx-2">-</span>
                  <span class="text-indigo-700">${analyticsEscapeHtml(displayProduct)}</span>
                </h3>

                <span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-2xs ${badgeBg}">
                  ${op.achievementRate}% 達成
                </span>
              </div>

              <!-- Sub Row: Monthly Average & Target / Warning References -->
              <div class="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                <div class="flex flex-wrap items-center gap-3">
                  <div class="text-sm font-semibold text-gray-700">
                    出来高（生産性） 当月平均: <span class="text-base tabular-nums font-bold ${isAchieved ? 'text-emerald-600' : (isBelowWarning ? 'text-rose-600' : 'text-amber-600')}">${opAvgStr} ヶ/1人h</span>
                  </div>
                  <div class="hidden sm:block text-gray-200">|</div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      目標: <strong class="ml-1 font-semibold text-gray-900 tabular-nums">${opTarget}</strong> ヶ/1人h
                    </span>
                    <span class="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      警戒ライン: <strong class="ml-1 font-semibold text-amber-900 tabular-nums">${opWarning}</strong> ヶ/1人h
                    </span>
                  </div>
                </div>
                <div class="text-xs font-medium text-rose-500">
                  ※ ${opWarning}/1人h以下の場合は理由を確認
                </div>
              </div>
            </div>

            <!-- ECharts Line Graph Container (Full Width, Spacious) -->
            <div id="${chartDomId}" class="h-80 w-full my-3"></div>
          </div>

          <!-- 5-Row Data Table Container (All Month, Zero Scroll on desktop) -->
          <div class="w-full mt-2">
            ${tableHtml}
          </div>
        </div>
      `;

      pendingCharts.push({
        domId: chartDomId,
        operator: op,
        machine,
        daysInMonth,
        target: opTarget,
        warning: opWarning
      });
    });

    html += `
        </div>
      </section>
    `;
  });

  container.innerHTML = html;

  // Initialize ECharts for each worker card
  pendingCharts.forEach(item => {
    initWorkerProductivityChart(item);
  });
}

function initWorkerProductivityChart({ domId, operator, machine, daysInMonth, target, warning }) {
  const chartDom = document.getElementById(domId);
  if (!chartDom || typeof echarts === 'undefined') return;

  const chart = echarts.init(chartDom);
  analyticsProductivityCharts.set(domId, chart);

  const dailyDataMap = new Map();
  (operator.dailyData || []).forEach(d => dailyDataMap.set(d.day, d));

  const xCategories = [];
  const seriesData = [];

  for (let day = 1; day <= daysInMonth; day++) {
    xCategories.push(String(day));
    const d = dailyDataMap.get(day);
    if (d && d.oneHrPc != null) {
      seriesData.push({
        value: d.oneHrPc,
        dateLabel: d.dateLabel,
        kanban: d.kanban,
        pieces: d.pieces,
        hours: d.hours,
        remarks: d.remarks,
        recordIds: d.recordIds || [],
        dayData: d,
        context: {
          operatorName: operator.operatorName,
          machineName: machine ? (machine.machineName || operator.productName) : operator.productName,
          productName: operator.productName,
          target,
          warning
        }
      });
    } else {
      seriesData.push(null);
    }
  }

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter: function(params) {
        if (!params || params.data == null) return '';
        const d = params.data;
        const val = typeof d === 'object' ? d.value : d;
        const pieces = d.pieces != null ? analyticsFormatNumber(d.pieces) : '-';
        const hours = d.hours != null ? d.hours.toFixed(2) : '-';
        const kanban = d.kanban || '-';
        const remarks = d.remarks || '';

        return `
          <div class="font-sans text-xs">
            <div class="font-semibold text-gray-900 border-b border-gray-100 pb-1 mb-1">
              ${d.dateLabel || ('Day ' + params.name)} (${operator.operatorName})
            </div>
            <div class="flex justify-between gap-4 text-xs py-0.5">
              <span class="text-gray-500">出来高/1人h:</span>
              <span class="font-semibold tabular-nums ${val >= target ? 'text-emerald-600' : (val < warning ? 'text-rose-600' : 'text-amber-600')}">${val} ヶ/1人h</span>
            </div>
            <div class="flex justify-between gap-4 text-xs py-0.5">
              <span class="text-gray-500">良品数:</span>
              <span class="font-medium text-gray-900 tabular-nums">${pieces} 個</span>
            </div>
            <div class="flex justify-between gap-4 text-xs py-0.5">
              <span class="text-gray-500">実工数:</span>
              <span class="font-medium text-gray-600 tabular-nums">${hours} h</span>
            </div>
            <div class="flex justify-between gap-4 text-xs py-0.5">
              <span class="text-gray-500">ライン/看板:</span>
              <span class="font-medium text-indigo-700">${analyticsEscapeHtml(kanban)}</span>
            </div>
            ${remarks ? `
              <div class="mt-1 pt-1 border-t border-rose-100 text-xs text-rose-600">
                <span class="font-semibold">理由:</span> ${analyticsEscapeHtml(remarks)}
              </div>
            ` : ''}
            <div class="mt-1.5 pt-1 border-t border-indigo-100 text-2xs text-indigo-600 font-semibold flex items-center gap-1">
              <i class="ri-cursor-line"></i> ${typeof t === 'function' ? t('analytics.productivity.clickToViewSubmitted') : 'クリックして実績詳細を表示'}
            </div>
          </div>
        `;
      }
    },
    grid: {
      top: 35,
      left: 45,
      right: 60,
      bottom: 25,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xCategories,
      axisLabel: {
        fontSize: 10,
        color: '#6b7280',
        interval: 0
      },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: 'value',
      name: 'ヶ/1人h',
      nameTextStyle: { color: '#6b7280', fontSize: 10, align: 'right' },
      min: function(val) {
        const floorTarget = warning - 30;
        const currentMin = val.min || target;
        return Math.max(0, Math.floor(Math.min(currentMin, floorTarget) / 10) * 10);
      },
      max: function(val) {
        const ceilTarget = target + 40;
        const currentMax = val.max || target;
        return Math.ceil(Math.max(currentMax, ceilTarget) / 10) * 10;
      },
      splitLine: {
        lineStyle: { color: '#f1f5f9' }
      },
      axisLabel: {
        fontSize: 10,
        color: '#6b7280'
      }
    },
    series: [
      {
        name: '出来高/1人h',
        type: 'line',
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 8,
        cursor: 'pointer',
        lineStyle: {
          width: 2.5,
          color: '#4f46e5'
        },
        itemStyle: {
          color: function(params) {
            if (!params || params.data == null) return '#4f46e5';
            const val = typeof params.data === 'object' ? params.data.value : params.data;
            if (val >= target) return '#10b981'; // Green
            if (val >= warning) return '#f59e0b'; // Amber
            return '#ef4444'; // Red
          }
        },
        data: seriesData,
        markLine: {
          symbol: ['none', 'none'],
          silent: false,
          data: [
            {
              yAxis: target,
              name: '目標',
              lineStyle: {
                color: '#dc2626',
                width: 1.8,
                type: 'solid'
              },
              label: {
                show: true,
                position: 'end',
                formatter: `目標 ${target}`,
                color: '#dc2626',
                fontSize: 10,
                fontWeight: '500'
              }
            },
            {
              yAxis: warning,
              name: '警戒',
              lineStyle: {
                color: '#f97316',
                width: 1.2,
                type: 'dashed'
              },
              label: {
                show: true,
                position: 'end',
                formatter: `警戒 ${warning}`,
                color: '#ea580c',
                fontSize: 9,
                fontWeight: '500'
              }
            }
          ]
        }
      }
    ]
  };

  chart.setOption(option);

  chart.on('click', function(params) {
    if (params && params.data && params.data.dayData) {
      openProductivitySubmittedDetail(params.data.dayData, params.data.context);
    }
  });
}

function printAnalyticsProductivityWhiteboard() {
  const originalTitle = document.title;
  const monthInput = document.getElementById('analyticsProductivityMonth');
  let monthNumber = '';
  if (monthInput && monthInput.value) {
    const parts = monthInput.value.split(/[-/]/);
    if (parts.length === 2 && Number(parts[1])) {
      monthNumber = parseInt(parts[1], 10);
    }
  }
  if (!monthNumber) {
    monthNumber = new Date().getMonth() + 1;
  }

  document.title = `生産性 グラフ - ${monthNumber}月分`;
  document.body.classList.add('analytics-printing-productivity');

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.title = originalTitle;
    document.body.classList.remove('analytics-printing-productivity');
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 2000);
}

// ============================================================================
// Productivity submittedDB Detail Modal Controller
// ============================================================================

let _currentProdDetailRecords = [];
let _currentProdDetailActiveIndex = 0;
let _currentProdDetailContext = null;
let _currentProdDetailDayData = null;

function handleProductivityCellClick(clickKey) {
  if (!window._analyticsProdClickMap) return;
  const entry = window._analyticsProdClickMap.get(clickKey);
  if (!entry) return;
  openProductivitySubmittedDetail(entry.item, entry.context);
}

async function openProductivitySubmittedDetail(dayData, context) {
  const modal = document.getElementById('analyticsProductivityRecordModal');
  if (!modal) return;

  _currentProdDetailContext = context || {};
  _currentProdDetailDayData = dayData || {};
  _currentProdDetailRecords = [];
  _currentProdDetailActiveIndex = 0;

  const dateEl = document.getElementById('analyticsProdModalDate');
  const titleEl = document.getElementById('analyticsProdModalTitle');
  const subEl = document.getElementById('analyticsProdModalSub');
  const loadingEl = document.getElementById('analyticsProdModalLoading');
  const contentEl = document.getElementById('analyticsProdModalContent');
  const tabsContainer = document.getElementById('analyticsProdModalRecordTabsContainer');
  const tabsEl = document.getElementById('analyticsProdModalRecordTabs');

  if (dateEl) {
    dateEl.textContent = dayData?.dateLabel ? `${dayData.dateLabel} (Day ${dayData.day})` : '';
  }
  if (titleEl) {
    titleEl.textContent = context?.productName || context?.machineName || '生産実績詳細';
  }
  if (subEl) {
    const parts = [context?.operatorName, dayData?.kanban].filter(Boolean);
    subEl.textContent = parts.join('  /  ');
  }

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (contentEl) contentEl.classList.add('hidden');
  if (tabsContainer) tabsContainer.classList.add('hidden');
  if (tabsEl) tabsEl.innerHTML = '';

  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Fetch records by IDs
  let records = [];
  const recordIds = Array.isArray(dayData?.recordIds) ? dayData.recordIds.filter(Boolean) : [];

  if (recordIds.length > 0) {
    try {
      const promises = recordIds.map(async id => {
        try {
          const res = await fetch(`/api/admin/submitted-db/${encodeURIComponent(id)}`, {
            headers: analyticsGetAuthHeaders()
          });
          if (!res.ok) return null;
          const json = await res.json();
          return json.success ? json.data : null;
        } catch (e) {
          console.warn('[Analytics] Failed to fetch record by ID:', id, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      records = results.filter(Boolean);
    } catch (err) {
      console.warn('[Analytics] Error resolving record IDs:', err);
    }
  }

  // Fallback if no records returned via IDs
  if (records.length === 0 && dayData?.day) {
    try {
      const monthInput = document.getElementById('analyticsProductivityMonth');
      let targetYear = new Date().getFullYear();
      let targetMonth = new Date().getMonth() + 1;
      if (monthInput && monthInput.value) {
        const p = monthInput.value.split(/[-/]/);
        if (p.length === 2) {
          targetYear = parseInt(p[0], 10);
          targetMonth = parseInt(p[1], 10);
        }
      }
      const q = new URLSearchParams();
      if (context?.operatorName) q.set('operator', context.operatorName);
      q.set('year', String(targetYear));
      q.set('month', String(targetMonth));
      q.set('day', String(dayData.day));
      q.set('limit', '50');

      const fbRes = await fetch(`/api/admin/submitted-db?${q.toString()}`, {
        headers: analyticsGetAuthHeaders()
      });
      if (fbRes.ok) {
        const fbJson = await fbRes.json();
        const rawList = Array.isArray(fbJson.data) ? fbJson.data : (Array.isArray(fbJson.records) ? fbJson.records : []);
        records = rawList.filter(r => {
          const matchDay = Number(r.date_day) === Number(dayData.day);
          const op1Match = r.operator1 && r.operator1 === context.operatorName;
          const op2Match = r.operator2 && r.operator2 === context.operatorName;
          return matchDay && (op1Match || op2Match);
        });
      }
    } catch (fallbackErr) {
      console.warn('[Analytics] Fallback query failed:', fallbackErr);
    }
  }

  // If still no records from submittedDB, create synthetic summary from dayData
  if (records.length === 0) {
    records = [{
      _synthetic: true,
      product_name: context?.machineName || context?.productName || '—',
      hinban: '—',
      kanban_id: dayData?.kanban || '—',
      '工場': '—',
      lh_rh: '—',
      hako_iresu: null,
      operator1: context?.operatorName || '—',
      operator2: '',
      good_count: dayData?.pieces ?? 0,
      man_hours: dayData?.hours ?? 0,
      cycle_time: null,
      start_time: '',
      end_time: '',
      break_time: 0,
      trouble_time: 0,
      remarks: dayData?.remarks || '',
      other_description: '',
      timestamp: null,
      submitted_from: '集計サマリー'
    }];
  }

  _currentProdDetailRecords = records;
  _currentProdDetailActiveIndex = 0;

  // Update Tabs if multiple records
  if (records.length > 1) {
    if (tabsContainer && tabsEl) {
      tabsContainer.classList.remove('hidden');
      tabsEl.innerHTML = records.map((rec, idx) => {
        const timeSpan = [rec.start_time, rec.end_time].filter(Boolean).join('~') || `実績 #${idx + 1}`;
        const pcs = rec.good_count != null ? `${analyticsFormatNumber(rec.good_count)}個` : '';
        const label = [timeSpan, pcs].filter(Boolean).join(' · ');
        const isActive = idx === 0;
        return `
          <button type="button" onclick="switchProductivityDetailTab(${idx})" class="prod-detail-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition shadow-2xs ${isActive ? 'bg-slate-700 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}">
            ${analyticsEscapeHtml(label)}
          </button>
        `;
      }).join('');
    }
  } else {
    if (tabsContainer) tabsContainer.classList.add('hidden');
  }

  // Render first record
  renderProductivityRecordInModal(0);
}

function switchProductivityDetailTab(index) {
  if (index < 0 || index >= _currentProdDetailRecords.length) return;
  _currentProdDetailActiveIndex = index;

  const tabBtns = document.querySelectorAll('.prod-detail-tab-btn');
  tabBtns.forEach((btn, idx) => {
    if (idx === index) {
      btn.className = 'prod-detail-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition shadow-2xs bg-slate-700 text-white';
    } else {
      btn.className = 'prod-detail-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition shadow-2xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-100';
    }
  });

  renderProductivityRecordInModal(index);
}

function renderProductivityRecordInModal(index) {
  const loadingEl = document.getElementById('analyticsProdModalLoading');
  const contentEl = document.getElementById('analyticsProdModalContent');
  if (loadingEl) loadingEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');

  const record = _currentProdDetailRecords[index];
  if (!record) return;

  const context = _currentProdDetailContext || {};
  const dayData = _currentProdDetailDayData || {};

  // Header: Date, Title, Subtitle
  const dateEl = document.getElementById('analyticsProdModalDate');
  const titleEl = document.getElementById('analyticsProdModalTitle');
  const subEl = document.getElementById('analyticsProdModalSub');

  if (dateEl) {
    if (record.timestamp) {
      dateEl.textContent = new Date(record.timestamp).toLocaleString('ja-JP');
    } else if (dayData?.dateLabel) {
      dateEl.textContent = `${dayData.dateLabel} (Day ${dayData.day})`;
    } else {
      dateEl.textContent = '';
    }
  }

  if (titleEl) {
    titleEl.textContent = record.product_name || context.productName || context.machineName || '—';
  }

  if (subEl) {
    const subParts = [record.hinban, record.kanban_id || dayData.kanban].filter(Boolean);
    subEl.textContent = subParts.length > 0 ? subParts.join('  /  ') : '—';
  }

  // 5 KPI Cards: 良品数, 工数, CT, 1時間/pc, LH/RH
  const goodEl = document.getElementById('analyticsProdModalGood');
  if (goodEl) {
    goodEl.textContent = String(record.good_count ?? dayData.pieces ?? '—');
  }

  const manHoursEl = document.getElementById('analyticsProdModalManHours');
  if (manHoursEl) {
    manHoursEl.textContent = record.man_hours != null ? Number(record.man_hours).toFixed(2) : (dayData.hours != null ? Number(dayData.hours).toFixed(2) : '—');
  }

  const ctEl = document.getElementById('analyticsProdModalCT');
  if (ctEl) {
    ctEl.textContent = record.cycle_time != null ? Number(record.cycle_time).toFixed(2) : '—';
  }

  // 1時間 / pc calculation matching submittedDB
  const pphLabelEl = document.getElementById('analyticsProdModalPiecesPerHourLabel');
  if (pphLabelEl && typeof t === 'function') {
    const label = t('dashboard.piecesPerHourShort');
    if (label && label !== 'dashboard.piecesPerHourShort') {
      pphLabelEl.textContent = label;
    }
  }

  const pphEl = document.getElementById('analyticsProdModalPiecesPerHour');
  const SDB_FIXED_KEYS = new Set([
    '_id', 'timestamp', 'date_year', 'date_month', 'date_day',
    '工場', 'hinban', 'product_name', 'kanban_id', 'hako_iresu', 'lh_rh',
    'operator1', 'operator2', 'good_count', 'man_hours', 'cycle_time',
    'other_description', 'start_time', 'end_time', 'break_time',
    'trouble_time', 'remarks', 'excluded_man_hours', 'submitted_from',
    'master_record_id', 'ng_group_id', 'non_countup_defect_keys',
    'is_deleted', 'deleted_at', 'deleted_by', 'deleted_by_role', 'trash_expires_at',
    '_synthetic'
  ]);

  if (pphEl) {
    const goodCount = Math.max(0, Number(record.good_count ?? dayData.pieces ?? 0) || 0);
    const defectTotal = Object.entries(record)
      .filter(([k]) => !SDB_FIXED_KEYS.has(k))
      .reduce((sum, [, v]) => sum + (Math.max(0, Number(v ?? 0) || 0)), 0);
    const totalCount = goodCount + defectTotal;
    const hours = Math.max(0, Number(record.man_hours ?? dayData.hours ?? 0) || 0);
    const ct = Math.max(0, Number(record.cycle_time ?? 0) || 0);

    let pphVal = null;
    if (hours > 0 && totalCount > 0) {
      pphVal = (totalCount / hours).toFixed(2);
    } else if (ct > 0) {
      pphVal = (60 / ct).toFixed(2);
    } else if (dayData.oneHrPc != null) {
      pphVal = Number(dayData.oneHrPc).toFixed(2);
    }

    pphEl.textContent = pphVal != null ? pphVal : '—';
  }

  const lhRhEl = document.getElementById('analyticsProdModalLhRh');
  if (lhRhEl) {
    lhRhEl.textContent = record.lh_rh || '—';
  }

  // Operators + Time
  const op1El = document.getElementById('analyticsProdModalOp1');
  if (op1El) {
    op1El.textContent = record.operator1 || context.operatorName || '—';
  }
  const op2El = document.getElementById('analyticsProdModalOp2');
  if (op2El) {
    op2El.textContent = record.operator2 || '';
  }

  const startEl = document.getElementById('analyticsProdModalStart');
  if (startEl) startEl.textContent = record.start_time || '—';

  const endEl = document.getElementById('analyticsProdModalEnd');
  if (endEl) endEl.textContent = record.end_time || '—';

  const breakEl = document.getElementById('analyticsProdModalBreak');
  if (breakEl) {
    breakEl.textContent = record.break_time != null ? `${record.break_time} h` : '—';
  }

  const troubleEl = document.getElementById('analyticsProdModalTrouble');
  if (troubleEl) {
    troubleEl.textContent = record.trouble_time != null ? `${record.trouble_time} h` : '—';
  }

  // Defects Section
  const defectEntries = Object.entries(record)
    .filter(([key]) => !SDB_FIXED_KEYS.has(key))
    .sort((a, b) => a[0].localeCompare(b[0]));

  const defectSection = document.getElementById('analyticsProdModalDefectsSection');
  const defectsEl = document.getElementById('analyticsProdModalDefects');
  if (defectSection && defectsEl) {
    if (defectEntries.length === 0) {
      defectSection.classList.add('hidden');
      defectsEl.innerHTML = '';
    } else {
      defectSection.classList.remove('hidden');
      defectsEl.innerHTML = defectEntries.map(([key, value]) => {
        const defectCount = Number(value ?? 0);
        const hasDefect = defectCount > 0;
        return `<div class="rounded-xl border p-3 text-center ${hasDefect ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}">
          <p class="text-xs font-medium ${hasDefect ? 'text-red-700' : 'text-gray-400'} mb-1 truncate" title="${analyticsEscapeHtml(key)}">${analyticsEscapeHtml(key)}</p>
          <p class="text-2xl font-bold ${hasDefect ? 'text-red-600' : 'text-gray-300'}">${defectCount}</p>
        </div>`;
      }).join('');
    }
  }

  // Remarks Section
  const remarksSection = document.getElementById('analyticsProdModalRemarksSection');
  const remarksEl = document.getElementById('analyticsProdModalRemarks');
  if (remarksSection && remarksEl) {
    if (record.remarks) {
      remarksSection.classList.remove('hidden');
      remarksEl.textContent = record.remarks;
    } else {
      remarksSection.classList.add('hidden');
    }
  }

  // Other Details Section
  const otherSection = document.getElementById('analyticsProdModalOtherSection');
  const otherEl = document.getElementById('analyticsProdModalOther');
  if (otherSection && otherEl) {
    if (record.other_description) {
      otherSection.classList.remove('hidden');
      otherEl.textContent = record.other_description;
    } else {
      otherSection.classList.add('hidden');
    }
  }

  // Footer: 工場 & 送信元
  const fromEl = document.getElementById('analyticsProdModalFrom');
  if (fromEl) {
    const footerBits = [];
    if (record.工場) footerBits.push(`工場: ${record.工場}`);
    if (record.submitted_from) footerBits.push(`送信元: ${record.submitted_from}`);
    fromEl.textContent = footerBits.join('  |  ');
  }
}

function handleAnalyticsProdModalEdit() {
  const record = _currentProdDetailRecords?.[_currentProdDetailActiveIndex];
  closeAnalyticsProductivityRecordModal();

  const searchParams = new URLSearchParams();
  if (record?.hinban) searchParams.set('hinban', record.hinban);
  if (record?.kanban_id) searchParams.set('kanbanId', record.kanban_id);
  if (record?.product_name) searchParams.set('productName', record.product_name);
  if (record?.operator1) searchParams.set('operator', record.operator1);

  if (typeof loadPage === 'function') {
    loadPage('submitted-db');
    setTimeout(() => {
      if (record?.hinban) {
        const el = document.getElementById('sdbFilterHinban');
        if (el) el.value = record.hinban;
      }
      if (record?.kanban_id) {
        const el = document.getElementById('sdbFilterKanbanId');
        if (el) el.value = record.kanban_id;
      }
      if (record?.product_name) {
        const el = document.getElementById('sdbFilterProductName');
        if (el) el.value = record.product_name;
      }
      if (record?.operator1) {
        const el = document.getElementById('sdbFilterOperator');
        if (el) el.value = record.operator1;
      }
      if (typeof loadSubmittedDB === 'function') {
        loadSubmittedDB();
      }
    }, 300);
  } else {
    window.location.href = `/submittedDB.html?${searchParams.toString()}`;
  }
}

function closeAnalyticsProductivityRecordModal(e) {
  if (e && e.target && e.target !== e.currentTarget) return;
  const modal = document.getElementById('analyticsProductivityRecordModal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// Global escape key listener
if (!window._analyticsProdModalKeyBound) {
  window._analyticsProdModalKeyBound = true;
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('analyticsProductivityRecordModal');
      if (modal && !modal.classList.contains('hidden')) {
        closeAnalyticsProductivityRecordModal();
      }
    }
  });
}

function renderAnalyticsOverview(data) {
  initAnalyticsProductivity();
  loadAnalyticsProductivity();
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
    <table class="min-w-full divide-y divide-gray-100 text-sm">
      <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-700">
        <tr>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableWorker'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableRecords'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableShared'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableDays'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableAvgShift'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableOutputHour'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableShiftUtil'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableHours'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableIssues'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableDowntime'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableDefectRate'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.worker.tableAvgCT'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
        ${rankedWorkers.map(worker => `
          <tr class="hover:bg-gray-50/70 transition">
            <td class="px-6 py-4 font-semibold text-gray-900">${analyticsEscapeHtml(worker.name)}</td>
            <td class="px-6 py-4 tabular-nums font-medium text-gray-900">${analyticsFormatNumber(worker.submissions)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(worker.sharedSubmissions)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(worker.activeDays)}</td>
            <td class="px-6 py-4 tabular-nums font-medium text-gray-900">${analyticsFormatCount(analyticsGetWorkerAverageShiftOutput(worker, shiftProfile))}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatPiecesPerHour(worker.outputPerHour)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatPercent(analyticsGetWorkerShiftUtilization(worker, shiftProfile))}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatHours(worker.totalManHours)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(worker.issueCount)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatPercent(worker.downtimeRate)}</td>
            <td class="px-6 py-4 tabular-nums ${Number(worker.defectRate || 0) > 2 ? 'font-semibold text-rose-600' : 'text-gray-600'}">${analyticsFormatPercent(worker.defectRate)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(worker.averageCycleTime, 2)}</td>
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
    container.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.machine.noMachineCards'))}</div>`;
    return;
  }

  container.innerHTML = `<div class="space-y-4">${topSources.map(source => `
    <article class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-gray-900">${analyticsEscapeHtml(source.source)}</p>
          <p class="mt-1 text-xs text-gray-500">${analyticsEscapeHtml(t('analytics.machine.cardSubtext').replace('{records}', analyticsFormatNumber(source.submissions)).replace('{issues}', analyticsFormatNumber(source.issueCount)))}</p>
        </div>
        <span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-700 shadow-2xs">${analyticsFormatPercent(source.defectRate)}</span>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div class="rounded-xl bg-white p-3 shadow-2xs"><span class="block text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.machine.cardGood'))}</span><span class="mt-1 block text-sm font-semibold tracking-tight tabular-nums text-gray-900">${analyticsFormatNumber(source.totalGoodCount)}</span></div>
        <div class="rounded-xl bg-white p-3 shadow-2xs"><span class="block text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.machine.cardTrouble'))}</span><span class="mt-1 block text-sm font-semibold tracking-tight tabular-nums text-gray-900">${analyticsFormatHours(source.totalTroubleTime)}</span></div>
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
    <table class="min-w-full divide-y divide-gray-100 text-sm">
      <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-700">
        <tr>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableSource'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableRecords'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableGood'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableHours'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableTrouble'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableIssues'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.machine.tableDefectRate'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
        ${rankedSources.map(source => `
          <tr class="hover:bg-gray-50/70 transition">
            <td class="px-6 py-4 font-semibold text-gray-900">${analyticsEscapeHtml(source.source)}</td>
            <td class="px-6 py-4 tabular-nums font-medium text-gray-900">${analyticsFormatNumber(source.submissions)}</td>
            <td class="px-6 py-4 tabular-nums font-medium text-gray-900">${analyticsFormatNumber(source.totalGoodCount)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatHours(source.totalManHours)}</td>
            <td class="px-6 py-4 tabular-nums ${Number(source.totalTroubleTime || 0) > 0 ? 'text-amber-600 font-medium' : 'text-gray-600'}">${analyticsFormatHours(source.totalTroubleTime)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(source.issueCount)}</td>
            <td class="px-6 py-4 tabular-nums ${Number(source.defectRate || 0) > 2 ? 'font-semibold text-rose-600' : 'text-gray-600'}">${analyticsFormatPercent(source.defectRate)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsMachineTab(data) {
  renderAnalyticsMachineTimeLoss(data.machineTimeLoss || []);
  renderAnalyticsMachineTimeline(data.machineDaily || []);
  renderAnalyticsMachineTrend(data.machineDaily || []);
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

// ------------------------------------------------------------
// Dedicated Month-over-Month (MoM) Analytics (Machines, Products, Workers)
// ------------------------------------------------------------

let analyticsMoMSubTab = 'machines'; // 'machines' | 'products' | 'workers'
let analyticsMoMMonthA = '';
let analyticsMoMMonthB = '';
let analyticsMoMMachine = 'all';
let analyticsMoMProduct = '';
let analyticsMoMProductLhRh = 'all';
let analyticsMoMWorker = '';
let analyticsMoMChartMode = 'cumulative'; // 'cumulative' | 'daily' | 'rate'
let analyticsMoMData = null;
let analyticsMoMLoading = false;

function analyticsGetRecentMonths(count = 18) {
  const result = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${yyyy}-${mm}`);
  }
  return result;
}

function analyticsFormatMonthOptionLabel(ym, isCurrent, isPrev) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const isJa = (typeof currentLanguage !== 'undefined' && currentLanguage === 'ja') || localStorage.getItem('appLanguage') === 'ja';
  const tag = isCurrent ? (isJa ? ' (当月)' : ' (Current)') : (isPrev ? (isJa ? ' (前月)' : ' (Prev)') : '');
  return isJa ? `${y}年${Number(m)}月${tag}` : `${new Date(Number(y), Number(m) - 1).toLocaleString('en-US', { month: 'short' })} ${y}${tag}`;
}

function initAnalyticsMoM(data) {
  const selectA = document.getElementById('analyticsMoMMonthA');
  const selectB = document.getElementById('analyticsMoMMonthB');
  const selectMachine = document.getElementById('analyticsMoMMachineSelect');
  const selectProduct = document.getElementById('analyticsMoMProductSelect');
  const selectWorker = document.getElementById('analyticsMoMWorkerSelect');

  const months = analyticsGetRecentMonths(18);
  if (!analyticsMoMMonthA) analyticsMoMMonthA = months[0] || '2026-09';
  if (!analyticsMoMMonthB) analyticsMoMMonthB = months[1] || '2026-08';

  if (selectA && selectA.options.length === 0) {
    selectA.innerHTML = months.map((ym, idx) => `
      <option value="${ym}" ${ym === analyticsMoMMonthA ? 'selected' : ''}>
        ${analyticsFormatMonthOptionLabel(ym, idx === 0, idx === 1)}
      </option>
    `).join('');
  }

  if (selectB && selectB.options.length === 0) {
    selectB.innerHTML = months.map((ym, idx) => `
      <option value="${ym}" ${ym === analyticsMoMMonthB ? 'selected' : ''}>
        ${analyticsFormatMonthOptionLabel(ym, idx === 0, idx === 1)}
      </option>
    `).join('');
  }

  if (selectMachine && selectMachine.options.length <= 1) {
    const sources = (data?.sourceBreakdown || []).map(s => s.source).filter(Boolean);
    const existing = new Set(sources);
    if (Array.isArray(analyticsMoMData?.availableOptions?.machines)) {
      analyticsMoMData.availableOptions.machines.forEach(m => existing.add(m));
    }
    const machineList = [...existing].sort((a, b) => a.localeCompare(b));
    selectMachine.innerHTML = [
      `<option value="all" ${analyticsMoMMachine === 'all' ? 'selected' : ''}>${t('analytics.machineMoM.allFleet') || 'All Machines (Fleet Average)'}</option>`
    ].concat(machineList.map(m => `
      <option value="${analyticsEscapeHtml(m)}" ${m === analyticsMoMMachine ? 'selected' : ''}>${analyticsEscapeHtml(m)}</option>
    `)).join('');
  }

  if (selectProduct && selectProduct.options.length <= 1) {
    const products = Array.isArray(analyticsMoMData?.availableOptions?.products)
      ? analyticsMoMData.availableOptions.products
      : (data?.productBreakdown || []).map(p => ({ hinban: p.hinban, productName: p.productName }));
    const opts = [`<option value="" ${!analyticsMoMProduct ? 'selected' : ''}>All Products</option>`];
    products.forEach(p => {
      if (!p.hinban) return;
      const label = p.productName ? `${p.hinban} - ${p.productName}` : p.hinban;
      opts.push(`<option value="${analyticsEscapeHtml(p.hinban)}" ${p.hinban === analyticsMoMProduct ? 'selected' : ''}>${analyticsEscapeHtml(label)}</option>`);
    });
    selectProduct.innerHTML = opts.join('');
  }

  if (selectWorker && selectWorker.options.length <= 1) {
    const operators = Array.isArray(analyticsMoMData?.availableOptions?.operators)
      ? analyticsMoMData.availableOptions.operators
      : (data?.operatorBreakdown || []).map(o => o.name).filter(Boolean);
    const opts = [`<option value="" ${!analyticsMoMWorker ? 'selected' : ''}>All Workers (Team Average)</option>`];
    operators.forEach(op => {
      opts.push(`<option value="${analyticsEscapeHtml(op)}" ${op === analyticsMoMWorker ? 'selected' : ''}>${analyticsEscapeHtml(op)}</option>`);
    });
    selectWorker.innerHTML = opts.join('');
  }
}

function setAnalyticsMoMSubTab(subTab) {
  analyticsMoMSubTab = subTab || 'machines';

  // Toggle pill buttons
  ['machines', 'products', 'workers'].forEach(tab => {
    const btn = document.getElementById(`analyticsMoMSubTabBtn-${tab}`);
    const isAct = tab === analyticsMoMSubTab;
    if (btn) {
      btn.className = isAct
        ? 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition cursor-pointer bg-white text-indigo-600 shadow-xs'
        : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition cursor-pointer';
    }
  });

  // Toggle filter containers
  const cMachines = document.getElementById('analyticsMoMFilterContainerMachines');
  const cProducts = document.getElementById('analyticsMoMFilterContainerProducts');
  const cWorkers = document.getElementById('analyticsMoMFilterContainerWorkers');
  if (cMachines) cMachines.classList.toggle('hidden', analyticsMoMSubTab !== 'machines');
  if (cProducts) cProducts.classList.toggle('hidden', analyticsMoMSubTab !== 'products');
  if (cWorkers) cWorkers.classList.toggle('hidden', analyticsMoMSubTab !== 'workers');

  // Update Rate / Metric Mode Button text
  const rateBtn = document.getElementById('analyticsMoMModeRate');
  if (rateBtn) {
    if (analyticsMoMSubTab === 'machines') rateBtn.textContent = 'Efficiency %';
    else if (analyticsMoMSubTab === 'products') rateBtn.textContent = 'Defect Rate %';
    else rateBtn.textContent = 'Pace (Shots/h)';
  }

  loadAnalyticsMoM();
}

function handleAnalyticsMoMFilterChange() {
  const selectA = document.getElementById('analyticsMoMMonthA');
  const selectB = document.getElementById('analyticsMoMMonthB');
  const selectMachine = document.getElementById('analyticsMoMMachineSelect');
  const selectProduct = document.getElementById('analyticsMoMProductSelect');
  const selectLhRh = document.getElementById('analyticsMoMProductLhRh');
  const selectWorker = document.getElementById('analyticsMoMWorkerSelect');

  if (selectA) analyticsMoMMonthA = selectA.value;
  if (selectB) analyticsMoMMonthB = selectB.value;
  if (selectMachine) analyticsMoMMachine = selectMachine.value || 'all';
  if (selectProduct) analyticsMoMProduct = selectProduct.value || '';
  if (selectLhRh) analyticsMoMProductLhRh = selectLhRh.value || 'all';
  if (selectWorker) analyticsMoMWorker = selectWorker.value || '';

  loadAnalyticsMoM();
}

function handleAnalyticsMoMSwapMonths() {
  const selectA = document.getElementById('analyticsMoMMonthA');
  const selectB = document.getElementById('analyticsMoMMonthB');
  const temp = analyticsMoMMonthA;
  analyticsMoMMonthA = analyticsMoMMonthB;
  analyticsMoMMonthB = temp;
  if (selectA) selectA.value = analyticsMoMMonthA;
  if (selectB) selectB.value = analyticsMoMMonthB;
  loadAnalyticsMoM();
}

function setAnalyticsMoMChartMode(mode) {
  analyticsMoMChartMode = mode || 'cumulative';
  const modes = ['cumulative', 'daily', 'rate'];
  modes.forEach(m => {
    const btn = document.getElementById(`analyticsMoMMode${m.charAt(0).toUpperCase() + m.slice(1)}`);
    if (btn) {
      if (m === analyticsMoMChartMode) {
        btn.className = 'rounded-lg px-3 py-1 text-xs font-semibold bg-indigo-50 text-indigo-600 transition cursor-pointer shadow-2xs';
      } else {
        btn.className = 'rounded-lg px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition cursor-pointer';
      }
    }
  });

  if (analyticsMoMData) {
    renderAnalyticsMoMTrajectoryChart(analyticsMoMData);
  }
}

async function loadAnalyticsMoM() {
  const refreshIcon = document.getElementById('analyticsMoMRefreshIcon');
  if (refreshIcon) refreshIcon.classList.add('animate-spin');
  analyticsMoMLoading = true;

  try {
    let typeParam = 'machine';
    if (analyticsMoMSubTab === 'products') typeParam = 'product';
    if (analyticsMoMSubTab === 'workers') typeParam = 'worker';

    let url = `${API_URL}/api/admin/analytics/mom?type=${typeParam}&monthA=${encodeURIComponent(analyticsMoMMonthA || '')}&monthB=${encodeURIComponent(analyticsMoMMonthB || '')}`;

    if (analyticsMoMSubTab === 'machines') {
      url += `&machine=${encodeURIComponent(analyticsMoMMachine || 'all')}`;
    } else if (analyticsMoMSubTab === 'products') {
      url += `&hinban=${encodeURIComponent(analyticsMoMProduct || '')}&lhRh=${encodeURIComponent(analyticsMoMProductLhRh || 'all')}`;
    } else if (analyticsMoMSubTab === 'workers') {
      url += `&operator=${encodeURIComponent(analyticsMoMWorker || '')}`;
    }

    const res = await fetch(url, { headers: analyticsGetAuthHeaders() });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to fetch MoM data');
    }

    analyticsMoMData = result;

    // Populate dropdown options from availableOptions if provided
    if (result.availableOptions) {
      const { machines = [], products = [], operators = [] } = result.availableOptions;
      const selectMachine = document.getElementById('analyticsMoMMachineSelect');
      if (selectMachine && machines.length > 0 && selectMachine.options.length <= 2) {
        const cur = selectMachine.value;
        selectMachine.innerHTML = [`<option value="all">${t('analytics.machineMoM.allFleet') || 'All Machines (Fleet Average)'}</option>`]
          .concat(machines.map(m => `<option value="${analyticsEscapeHtml(m)}">${analyticsEscapeHtml(m)}</option>`)).join('');
        selectMachine.value = cur || 'all';
      }

      const selectProduct = document.getElementById('analyticsMoMProductSelect');
      if (selectProduct && products.length > 0 && selectProduct.options.length <= 2) {
        const cur = selectProduct.value;
        const opts = [`<option value="">All Products</option>`];
        products.forEach(p => {
          const label = p.productName ? `${p.hinban} - ${p.productName}` : p.hinban;
          opts.push(`<option value="${analyticsEscapeHtml(p.hinban)}">${analyticsEscapeHtml(label)}</option>`);
        });
        selectProduct.innerHTML = opts.join('');
        selectProduct.value = cur || '';
      }

      const selectWorker = document.getElementById('analyticsMoMWorkerSelect');
      if (selectWorker && operators.length > 0 && selectWorker.options.length <= 2) {
        const cur = selectWorker.value;
        const opts = [`<option value="">All Workers (Team Average)</option>`]
          .concat(operators.map(op => `<option value="${analyticsEscapeHtml(op)}">${analyticsEscapeHtml(op)}</option>`));
        selectWorker.innerHTML = opts.join('');
        selectWorker.value = cur || '';
      }
    }

    renderAnalyticsMoM(result);
  } catch (err) {
    console.error('❌ Failed to load MoM analytics:', err);
    renderAnalyticsMoMError(err.message);
  } finally {
    analyticsMoMLoading = false;
    if (refreshIcon) refreshIcon.classList.remove('animate-spin');
  }
}

function renderAnalyticsMoMError(message) {
  const kpiGrid = document.getElementById('analyticsMoMKpiGrid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="col-span-1 sm:col-span-2 xl:col-span-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-8 text-center text-sm text-gray-500">
        <i class="ri-information-line text-2xl text-indigo-500 mb-2 block"></i>
        <p class="font-medium text-gray-700 mb-1">MoM Analytics Initialization</p>
        <p class="text-xs text-gray-400 max-w-md mx-auto">${analyticsEscapeHtml(message || 'Please ensure the server has finished restarting with the new MoM endpoint.')}</p>
        <button onclick="loadAnalyticsMoM()" class="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50">
          <i class="ri-refresh-line"></i> Retry
        </button>
      </div>`;
  }
}

function renderAnalyticsMoM(result) {
  renderAnalyticsMoMKpis(result);
  renderAnalyticsMoMTrajectoryChart(result);
  renderAnalyticsMoMBreakdowns(result);
}

function renderAnalyticsMoMKpis(result) {
  const container = document.getElementById('analyticsMoMKpiGrid');
  if (!container) return;

  const { deltas, analyticsA, analyticsB, type } = result;

  let cards = [];

  if (type === 'product' || type === 'products') {
    cards = [
      {
        title: 'Total Production Output',
        valA: `${analyticsA.totalGood.toLocaleString()}`,
        valB: `${analyticsB.totalGood.toLocaleString()}`,
        diffText: `${deltas.diffShots >= 0 ? '+' : ''}${deltas.pctShots}% (${deltas.diffShots >= 0 ? '+' : ''}${deltas.diffShots.toLocaleString()})`,
        isPositive: deltas.diffShots >= 0,
        subtext: `Avg ${analyticsA.avgShotsPerDay} units/day vs ${analyticsB.avgShotsPerDay} units/day`,
        icon: 'ri-box-3-line',
        tone: 'bg-indigo-50 text-indigo-600'
      },
      {
        title: 'Defect Rate (MoM)',
        valA: `${analyticsA.defectRate}%`,
        valB: `${analyticsB.defectRate}%`,
        diffText: `${deltas.diffDefectRate <= 0 ? '' : '+'}${deltas.diffDefectRate}%`,
        isPositive: deltas.diffDefectRate <= 0,
        subtext: `Total defects: ${analyticsA.totalDefects.toLocaleString()} vs ${analyticsB.totalDefects.toLocaleString()}`,
        icon: 'ri-shield-check-line',
        tone: 'bg-rose-50 text-rose-600'
      },
      {
        title: 'Man-Hours Invested',
        valA: `${analyticsA.totalManHours}h`,
        valB: `${analyticsB.totalManHours}h`,
        diffText: `${deltas.diffHours >= 0 ? '+' : ''}${deltas.diffHours}h`,
        isPositive: deltas.diffHours >= 0,
        subtext: `${analyticsA.operatingDays} active production days vs ${analyticsB.operatingDays} days`,
        icon: 'ri-time-line',
        tone: 'bg-emerald-50 text-emerald-600'
      },
      {
        title: 'Hourly Pace (Productivity)',
        valA: `${analyticsA.shotsPerHour} /h`,
        valB: `${analyticsB.shotsPerHour} /h`,
        diffText: `${deltas.diffShotsPerHour >= 0 ? '+' : ''}${deltas.diffShotsPerHour} /h`,
        isPositive: deltas.diffShotsPerHour >= 0,
        subtext: `Shift efficiency: ${analyticsA.efficiency}% vs ${analyticsB.efficiency}%`,
        icon: 'ri-speed-up-line',
        tone: 'bg-blue-50 text-blue-600'
      }
    ];
  } else if (type === 'worker' || type === 'workers') {
    cards = [
      {
        title: 'Worker Output Produced',
        valA: `${analyticsA.totalGood.toLocaleString()}`,
        valB: `${analyticsB.totalGood.toLocaleString()}`,
        diffText: `${deltas.diffShots >= 0 ? '+' : ''}${deltas.pctShots}% (${deltas.diffShots >= 0 ? '+' : ''}${deltas.diffShots.toLocaleString()})`,
        isPositive: deltas.diffShots >= 0,
        subtext: `Avg ${analyticsA.avgShotsPerDay} units/day vs ${analyticsB.avgShotsPerDay} units/day`,
        icon: 'ri-team-line',
        tone: 'bg-indigo-50 text-indigo-600'
      },
      {
        title: 'Defect Rate (MoM)',
        valA: `${analyticsA.defectRate}%`,
        valB: `${analyticsB.defectRate}%`,
        diffText: `${deltas.diffDefectRate <= 0 ? '' : '+'}${deltas.diffDefectRate}%`,
        isPositive: deltas.diffDefectRate <= 0,
        subtext: `Total defects: ${analyticsA.totalDefects.toLocaleString()} vs ${analyticsB.totalDefects.toLocaleString()}`,
        icon: 'ri-shield-check-line',
        tone: 'bg-rose-50 text-rose-600'
      },
      {
        title: 'Total Labor Hours',
        valA: `${analyticsA.totalManHours}h`,
        valB: `${analyticsB.totalManHours}h`,
        diffText: `${deltas.diffHours >= 0 ? '+' : ''}${deltas.diffHours}h`,
        isPositive: deltas.diffHours >= 0,
        subtext: `${analyticsA.operatingDays} days worked vs ${analyticsB.operatingDays} days`,
        icon: 'ri-time-line',
        tone: 'bg-emerald-50 text-emerald-600'
      },
      {
        title: 'Productivity Pace',
        valA: `${analyticsA.shotsPerHour} /h`,
        valB: `${analyticsB.shotsPerHour} /h`,
        diffText: `${deltas.diffShotsPerHour >= 0 ? '+' : ''}${deltas.diffShotsPerHour} /h`,
        isPositive: deltas.diffShotsPerHour >= 0,
        subtext: `Trouble downtime: ${analyticsA.troubleHours}h vs ${analyticsB.troubleHours}h`,
        icon: 'ri-speed-up-line',
        tone: 'bg-blue-50 text-blue-600'
      }
    ];
  } else {
    // Machines (default)
    cards = [
      {
        title: 'Efficiency (MoM)',
        valA: `${analyticsA.efficiency}%`,
        valB: `${analyticsB.efficiency}%`,
        diffText: `${deltas.diffEfficiency >= 0 ? '+' : ''}${deltas.diffEfficiency}%`,
        isPositive: deltas.diffEfficiency >= 0,
        subtext: `Shift efficiency (${analyticsA.producingHours}h producing vs ${analyticsB.producingHours}h)`,
        icon: 'ri-speed-up-line',
        tone: 'bg-indigo-50 text-indigo-600'
      },
      {
        title: 'Total Output / Shots',
        valA: `${analyticsA.totalGood.toLocaleString()}`,
        valB: `${analyticsB.totalGood.toLocaleString()}`,
        diffText: `${deltas.diffShots >= 0 ? '+' : ''}${deltas.pctShots}% (${deltas.diffShots >= 0 ? '+' : ''}${deltas.diffShots.toLocaleString()})`,
        isPositive: deltas.diffShots >= 0,
        subtext: `Avg ${analyticsA.avgShotsPerDay} shots/day vs ${analyticsB.avgShotsPerDay} shots/day`,
        icon: 'ri-cpu-line',
        tone: 'bg-blue-50 text-blue-600'
      },
      {
        title: 'Working Hours',
        valA: `${analyticsA.producingHours}h`,
        valB: `${analyticsB.producingHours}h`,
        diffText: `${deltas.diffProducingHours >= 0 ? '+' : ''}${deltas.diffProducingHours}h`,
        isPositive: deltas.diffProducingHours >= 0,
        subtext: `${analyticsA.operatingDays} active days vs ${analyticsB.operatingDays} active days`,
        icon: 'ri-time-line',
        tone: 'bg-emerald-50 text-emerald-600'
      },
      {
        title: 'Trouble Downtime',
        valA: `${analyticsA.troubleHours}h`,
        valB: `${analyticsB.troubleHours}h`,
        diffText: `${deltas.diffTroubleHours <= 0 ? '' : '+'}${deltas.diffTroubleHours}h`,
        isPositive: deltas.diffTroubleHours <= 0,
        subtext: `Defect rate: ${analyticsA.defectRate}% (Δ ${deltas.diffDefectRate >= 0 ? '+' : ''}${deltas.diffDefectRate}%)`,
        icon: 'ri-alarm-warning-line',
        tone: 'bg-rose-50 text-rose-600'
      }
    ];
  }

  container.innerHTML = cards.map(c => `
    <div class="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-xs transition hover:border-gray-200">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-gray-500">${c.title}</span>
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
          c.isPositive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20'
        }">
          <i class="${c.isPositive ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm leading-none"></i>
          <span>${c.diffText}</span>
        </span>
      </div>

      <div class="mt-3 flex items-baseline gap-2">
        <span class="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">${c.valA}</span>
        <span class="text-xs text-gray-400 font-medium tabular-nums">vs ${c.valB}</span>
      </div>

      <p class="mt-2 text-xs text-gray-400 truncate" title="${c.subtext}">${c.subtext}</p>
    </div>
  `).join('');
}

function renderAnalyticsMoMTrajectoryChart(result) {
  const containerId = 'analyticsMoMTrajectoryChart';
  const container = document.getElementById(containerId);
  if (!container) return;

  const { trajectory = [], monthA, monthB, type } = result;

  const titleEl = document.getElementById('analyticsMoMTrajectoryTitle');
  const descEl = document.getElementById('analyticsMoMTrajectoryDesc');
  if (titleEl && descEl) {
    if (type === 'product' || type === 'products') {
      titleEl.textContent = 'Product Volume Trajectory (Day 1..31)';
      descEl.textContent = 'Compare product output day-by-day to observe production velocity.';
    } else if (type === 'worker' || type === 'workers') {
      titleEl.textContent = 'Worker Output Trajectory (Day 1..31)';
      descEl.textContent = 'Compare worker output pace day-by-day across both months.';
    } else {
      titleEl.textContent = 'Machine Pace Trajectory (Day 1..31)';
      descEl.textContent = 'Compare pace day-by-day to see if machine is running ahead of or behind baseline.';
    }
  }

  if (trajectory.length === 0) {
    analyticsShowChartEmpty(containerId, 'No trajectory data available');
    return;
  }

  const days = trajectory.map(t => `${t.day}日`);
  const isJa = (typeof currentLanguage !== 'undefined' && currentLanguage === 'ja') || localStorage.getItem('appLanguage') === 'ja';
  const labelA = `${monthA} (${isJa ? '対象月' : 'Target'})`;
  const labelB = `${monthB} (${isJa ? '比較月' : 'Baseline'})`;

  let series = [];
  let yAxisConfig = {};
  let tooltipFormatter;

  if (analyticsMoMChartMode === 'cumulative') {
    series = [
      {
        name: labelA,
        type: 'line',
        data: trajectory.map(t => t.cumShotsA),
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: '#4f46e5' },
        lineStyle: { width: 3, color: '#4f46e5' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(79, 70, 229, 0.18)' },
              { offset: 1, color: 'rgba(79, 70, 229, 0.01)' }
            ]
          }
        }
      },
      {
        name: labelB,
        type: 'line',
        data: trajectory.map(t => t.cumShotsB),
        smooth: true,
        symbolSize: 4,
        itemStyle: { color: '#a855f7' },
        lineStyle: { width: 2, type: 'dashed', color: '#a855f7' }
      }
    ];

    yAxisConfig = {
      type: 'value',
      name: isJa ? '累積ショット数' : 'Cumulative Output',
      axisLabel: { formatter: val => Number(val).toLocaleString() },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    };

    tooltipFormatter = (params) => {
      if (!params || params.length === 0) return '';
      const dayIndex = params[0].dataIndex;
      const tPoint = trajectory[dayIndex];
      if (!tPoint) return '';

      const dayLabel = isJa ? `${tPoint.day}日` : `Day ${tPoint.day}`;
      let html = `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px;">
        <span style="font-weight:700;font-size:12px;color:#1e293b;">${dayLabel}</span>
        <span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${isJa ? '累積比較' : 'Cumulative'}</span>
      </div>`;

      params.forEach(p => {
        const val = p.value;
        const hasVal = val !== null && val !== undefined && !Number.isNaN(Number(val));
        const valStr = hasVal
          ? `<span style="font-weight:700;color:#0f172a;font-feature-settings:'tnum';">${Number(val).toLocaleString()}</span> <span style="font-size:11px;font-weight:500;color:#64748b;">units</span>`
          : `<span style="color:#94a3b8;font-weight:400;">-</span>`;

        html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12px;padding:2px 0;">
          <span style="display:flex;align-items:center;gap:6px;color:${p.color};font-weight:600;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
            ${analyticsEscapeHtml(p.seriesName)}:
          </span>
          <span style="font-size:12px;text-align:right;">${valStr}</span>
        </div>`;
      });

      if (tPoint.cumShotsA !== null && tPoint.cumShotsA !== undefined && tPoint.cumShotsB !== null && tPoint.cumShotsB !== undefined) {
        const diff = tPoint.cumShotsA - tPoint.cumShotsB;
        const sign = diff >= 0 ? '+' : '';
        const isPos = diff >= 0;
        const diffColor = isPos ? '#059669' : '#dc2626';
        html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12px;font-weight:600;">
          <span style="color:${diffColor};">${isJa ? '累積差異' : 'Cumulative Variance'}:</span>
          <span style="color:${diffColor};font-weight:700;font-feature-settings:'tnum';">${sign}${diff.toLocaleString()} <span style="font-size:11px;font-weight:500;">units</span></span>
        </div>`;
      }
      return html;
    };
  } else if (analyticsMoMChartMode === 'daily') {
    series = [
      {
        name: labelA,
        type: 'bar',
        barMaxWidth: 12,
        itemStyle: { color: '#4f46e5', borderRadius: [4, 4, 0, 0] },
        data: trajectory.map(t => t.shotsA)
      },
      {
        name: labelB,
        type: 'bar',
        barMaxWidth: 12,
        itemStyle: { color: '#cbd5e1', borderRadius: [4, 4, 0, 0] },
        data: trajectory.map(t => t.shotsB)
      }
    ];

    yAxisConfig = {
      type: 'value',
      name: isJa ? '日別生産数' : 'Daily Output',
      axisLabel: { formatter: val => Number(val).toLocaleString() },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    };

    tooltipFormatter = (params) => {
      if (!params || params.length === 0) return '';
      const dayIndex = params[0].dataIndex;
      const tPoint = trajectory[dayIndex];
      if (!tPoint) return '';

      const dayLabel = isJa ? `${tPoint.day}日` : `Day ${tPoint.day}`;
      let html = `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px;">
        <span style="font-weight:700;font-size:12px;color:#1e293b;">${dayLabel}</span>
        <span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${isJa ? '日別比較' : 'Daily'}</span>
      </div>`;

      params.forEach(p => {
        const val = p.value;
        const hasVal = val !== null && val !== undefined && !Number.isNaN(Number(val));
        const valStr = hasVal
          ? `<span style="font-weight:700;color:#0f172a;font-feature-settings:'tnum';">${Number(val).toLocaleString()}</span> <span style="font-size:11px;font-weight:500;color:#64748b;">units</span>`
          : `<span style="color:#94a3b8;font-weight:400;">-</span>`;

        html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12px;padding:2px 0;">
          <span style="display:flex;align-items:center;gap:6px;color:${p.color};font-weight:600;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};"></span>
            ${analyticsEscapeHtml(p.seriesName)}:
          </span>
          <span style="font-size:12px;text-align:right;">${valStr}</span>
        </div>`;
      });

      if (tPoint.shotsA !== null && tPoint.shotsA !== undefined && tPoint.shotsB !== null && tPoint.shotsB !== undefined) {
        const diff = tPoint.shotsA - tPoint.shotsB;
        const sign = diff >= 0 ? '+' : '';
        const isPos = diff >= 0;
        const diffColor = isPos ? '#059669' : '#dc2626';
        html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12px;font-weight:600;">
          <span style="color:${diffColor};">${isJa ? '日別差異' : 'Daily Variance'}:</span>
          <span style="color:${diffColor};font-weight:700;font-feature-settings:'tnum';">${sign}${diff.toLocaleString()} <span style="font-size:11px;font-weight:500;">units</span></span>
        </div>`;
      }
      return html;
    };
  } else {
    // Rate mode (Efficiency for machine, Defect rate for product, Pace for worker)
    if (type === 'product' || type === 'products') {
      series = [
        {
          name: labelA,
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: { color: '#ef4444' },
          lineStyle: { width: 2.5, color: '#ef4444' },
          data: trajectory.map(t => t.defRateA)
        },
        {
          name: labelB,
          type: 'line',
          smooth: true,
          symbolSize: 4,
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 2, type: 'dashed', color: '#94a3b8' },
          data: trajectory.map(t => t.defRateB)
        }
      ];
      yAxisConfig = {
        type: 'value',
        name: 'Defect Rate %',
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      };
    } else if (type === 'worker' || type === 'workers') {
      series = [
        {
          name: labelA,
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: { color: '#2563eb' },
          lineStyle: { width: 2.5, color: '#2563eb' },
          data: trajectory.map(t => t.rateA)
        },
        {
          name: labelB,
          type: 'line',
          smooth: true,
          symbolSize: 4,
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 2, type: 'dashed', color: '#94a3b8' },
          data: trajectory.map(t => t.rateB)
        }
      ];
      yAxisConfig = {
        type: 'value',
        name: 'Pace (Units / Hour)',
        axisLabel: { formatter: '{value}/h' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      };
    } else {
      // Efficiency % for machine
      series = [
        {
          name: labelA,
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 2.5, color: '#10b981' },
          data: trajectory.map(t => t.effA)
        },
        {
          name: labelB,
          type: 'line',
          smooth: true,
          symbolSize: 4,
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 2, type: 'dashed', color: '#94a3b8' },
          data: trajectory.map(t => t.effB)
        }
      ];
      yAxisConfig = {
        type: 'value',
        name: 'Efficiency %',
        max: 100,
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      };
    }

    tooltipFormatter = (params) => {
      if (!params || params.length === 0) return '';
      const dayIndex = params[0].dataIndex;
      const tPoint = trajectory[dayIndex];
      if (!tPoint) return '';

      const dayLabel = isJa ? `${tPoint.day}日` : `Day ${tPoint.day}`;
      let modeLabel = isJa ? '設備稼働率比較' : 'Efficiency';
      let unitSuffix = '%';
      let decimals = 1;
      let diffVal = null;
      let betterWhenLower = false;

      if (type === 'product' || type === 'products') {
        modeLabel = isJa ? '不良率比較' : 'Defect Rate';
        unitSuffix = '%';
        decimals = 2;
        betterWhenLower = true;
        if (tPoint.defRateA !== null && tPoint.defRateB !== null) {
          diffVal = tPoint.defRateA - tPoint.defRateB;
        }
      } else if (type === 'worker' || type === 'workers') {
        modeLabel = isJa ? '作業ペース比較' : 'Pace';
        unitSuffix = ' units/h';
        decimals = 0;
        if (tPoint.rateA !== null && tPoint.rateB !== null) {
          diffVal = tPoint.rateA - tPoint.rateB;
        }
      } else {
        modeLabel = isJa ? '設備稼働率比較' : 'Efficiency';
        unitSuffix = '%';
        decimals = 1;
        if (tPoint.effA !== null && tPoint.effB !== null) {
          diffVal = tPoint.effA - tPoint.effB;
        }
      }

      let html = `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px;">
        <span style="font-weight:700;font-size:12px;color:#1e293b;">${dayLabel}</span>
        <span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${modeLabel}</span>
      </div>`;

      params.forEach(p => {
        const val = p.value;
        const hasVal = val !== null && val !== undefined && !Number.isNaN(Number(val));
        const valStr = hasVal
          ? `<span style="font-weight:700;color:#0f172a;font-feature-settings:'tnum';">${decimals === 0 ? Number(val).toLocaleString() : Number(val).toFixed(decimals)}</span><span style="font-size:11px;font-weight:500;color:#64748b;">${unitSuffix}</span>`
          : `<span style="color:#94a3b8;font-weight:400;">-</span>`;

        html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12px;padding:2px 0;">
          <span style="display:flex;align-items:center;gap:6px;color:${p.color};font-weight:600;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
            ${analyticsEscapeHtml(p.seriesName)}:
          </span>
          <span style="font-size:12px;text-align:right;">${valStr}</span>
        </div>`;
      });

      if (diffVal !== null) {
        const sign = diffVal >= 0 ? '+' : '';
        const isGood = betterWhenLower ? diffVal <= 0 : diffVal >= 0;
        const diffColor = isGood ? '#059669' : '#dc2626';
        const formattedDiff = decimals === 0 ? diffVal.toLocaleString() : diffVal.toFixed(decimals);
        html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12px;font-weight:600;">
          <span style="color:${diffColor};">${isJa ? '差異' : 'Variance'}:</span>
          <span style="color:${diffColor};font-weight:700;font-feature-settings:'tnum';">${sign}${formattedDiff}<span style="font-size:11px;font-weight:500;">${unitSuffix}</span></span>
        </div>`;
      }
      return html;
    };
  }

  analyticsRenderChart(containerId, {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 14],
      extraCssText: 'box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05); border-radius: 12px; font-family: Inter, -apple-system, sans-serif;',
      textStyle: { color: '#0f172a', fontSize: 12 },
      axisPointer: { type: analyticsMoMChartMode === 'daily' ? 'shadow' : 'line' },
      formatter: tooltipFormatter
    },
    legend: {
      data: [labelA, labelB],
      top: 0,
      right: 10,
      textStyle: { fontSize: 11, fontWeight: 'bold' }
    },
    grid: { left: 55, right: 20, top: 35, bottom: 25 },
    xAxis: {
      type: 'category',
      data: days,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { fontSize: 10, interval: 2 }
    },
    yAxis: yAxisConfig,
    series
  });
}

function renderAnalyticsMoMBreakdowns(result) {
  const { breakdown1 = {}, breakdown2 = {}, monthA, monthB, type } = result;

  const title1 = document.getElementById('analyticsMoMBreakdown1Title');
  const badge1 = document.getElementById('analyticsMoMBreakdown1Badge');
  const content1 = document.getElementById('analyticsMoMBreakdown1Content');

  const title2 = document.getElementById('analyticsMoMBreakdown2Title');
  const badge2 = document.getElementById('analyticsMoMBreakdown2Badge');
  const content2 = document.getElementById('analyticsMoMBreakdown2Content');

  if (!content1 || !content2) return;

  if (type === 'product' || type === 'products') {
    if (title1) title1.innerHTML = '<i class="ri-cpu-line text-emerald-600 mr-2"></i><span>Machine Allocation Shift</span>';
    if (badge1) badge1.textContent = 'Output by machine';

    const items1 = breakdown1.items || [];
    if (items1.length === 0) {
      content1.innerHTML = `<div class="py-6 text-center text-xs text-gray-400">No machine allocation data found.</div>`;
    } else {
      content1.innerHTML = `
        <table class="min-w-full text-xs divide-y divide-gray-100">
          <thead>
            <tr class="text-left font-semibold text-gray-400">
              <th class="py-2 pr-2">Machine</th>
              <th class="py-2 px-2 text-right">${monthA}</th>
              <th class="py-2 px-2 text-right">${monthB}</th>
              <th class="py-2 px-2 text-right">Volume Δ</th>
              <th class="py-2 pl-2 text-right">Share Δ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${items1.map(m => {
              const isUp = m.diff >= 0;
              return `
                <tr class="hover:bg-gray-50/70 transition">
                  <td class="py-2 pr-2 font-semibold text-gray-900 truncate max-w-[140px]">${analyticsEscapeHtml(m.name)}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-medium text-gray-900">${m.shotsA.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums text-gray-500">${m.shotsB.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-600'}">
                    ${isUp ? '+' : ''}${m.diff.toLocaleString()}
                  </td>
                  <td class="py-2 pl-2 text-right tabular-nums">
                    <span class="inline-flex items-center font-semibold ${Number(m.shareDiff) >= 0 ? 'text-emerald-600' : 'text-rose-500'}">
                      ${Number(m.shareDiff) >= 0 ? '+' : ''}${m.shareDiff}%
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    if (title2) title2.innerHTML = '<i class="ri-alarm-warning-line text-rose-600 mr-2"></i><span>Defect Reason Shift</span>';
    if (badge2) badge2.textContent = 'Defect share';

    const items2 = breakdown2.items || [];
    if (items2.length === 0) {
      content2.innerHTML = `<div class="py-6 text-center text-xs text-gray-400">No defect records found for this product.</div>`;
    } else {
      content2.innerHTML = `
        <table class="min-w-full text-xs divide-y divide-gray-100">
          <thead>
            <tr class="text-left font-semibold text-gray-400">
              <th class="py-2 pr-2">Defect Cause</th>
              <th class="py-2 px-2 text-right">${monthA}</th>
              <th class="py-2 px-2 text-right">${monthB}</th>
              <th class="py-2 px-2 text-right">Count Δ</th>
              <th class="py-2 pl-2 text-right">Share Δ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${items2.map(d => {
              const isWorse = d.diff > 0;
              return `
                <tr class="hover:bg-gray-50/70 transition">
                  <td class="py-2 pr-2 font-semibold text-gray-900 truncate max-w-[140px]">${analyticsEscapeHtml(d.reason)}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-medium text-gray-900">${d.countA.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums text-gray-500">${d.countB.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-semibold ${isWorse ? 'text-rose-600' : 'text-emerald-600'}">
                    ${d.diff >= 0 ? '+' : ''}${d.diff.toLocaleString()}
                  </td>
                  <td class="py-2 pl-2 text-right tabular-nums">
                    <span class="inline-flex items-center font-semibold ${Number(d.shareDiff) <= 0 ? 'text-emerald-600' : 'text-rose-500'}">
                      ${Number(d.shareDiff) >= 0 ? '+' : ''}${d.shareDiff}%
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } else if (type === 'worker' || type === 'workers') {
    if (title1) title1.innerHTML = '<i class="ri-cpu-line text-emerald-600 mr-2"></i><span>Machine Assignment Shift</span>';
    if (badge1) badge1.textContent = 'Hours & output';

    const items1 = breakdown1.items || [];
    if (items1.length === 0) {
      content1.innerHTML = `<div class="py-6 text-center text-xs text-gray-400">No machine assignment data found.</div>`;
    } else {
      content1.innerHTML = `
        <table class="min-w-full text-xs divide-y divide-gray-100">
          <thead>
            <tr class="text-left font-semibold text-gray-400">
              <th class="py-2 pr-2">Machine</th>
              <th class="py-2 px-2 text-right">${monthA}</th>
              <th class="py-2 px-2 text-right">${monthB}</th>
              <th class="py-2 px-2 text-right">Output Δ</th>
              <th class="py-2 pl-2 text-right">Hours Δ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${items1.map(m => {
              const isUp = m.diffShots >= 0;
              return `
                <tr class="hover:bg-gray-50/70 transition">
                  <td class="py-2 pr-2 font-semibold text-gray-900 truncate max-w-[140px]">${analyticsEscapeHtml(m.name)}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-medium text-gray-900">${m.shotsA.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums text-gray-500">${m.shotsB.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-600'}">
                    ${isUp ? '+' : ''}${m.diffShots.toLocaleString()}
                  </td>
                  <td class="py-2 pl-2 text-right tabular-nums text-gray-600">
                    ${m.diffHours >= 0 ? '+' : ''}${m.diffHours}h
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    if (title2) title2.innerHTML = '<i class="ri-box-3-line text-violet-600 mr-2"></i><span>Product Focus Shift</span>';
    if (badge2) badge2.textContent = 'Output & defects';

    const items2 = breakdown2.items || [];
    if (items2.length === 0) {
      content2.innerHTML = `<div class="py-6 text-center text-xs text-gray-400">No product records for this worker.</div>`;
    } else {
      content2.innerHTML = `
        <table class="min-w-full text-xs divide-y divide-gray-100">
          <thead>
            <tr class="text-left font-semibold text-gray-400">
              <th class="py-2 pr-2">Product</th>
              <th class="py-2 px-2 text-right">${monthA}</th>
              <th class="py-2 px-2 text-right">${monthB}</th>
              <th class="py-2 px-2 text-right">Output Δ</th>
              <th class="py-2 pl-2 text-right">Defects Δ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${items2.map(p => {
              const isUp = p.diffShots >= 0;
              return `
                <tr class="hover:bg-gray-50/70 transition">
                  <td class="py-2 pr-2">
                    <span class="font-semibold text-gray-900 block truncate max-w-[140px]" title="${analyticsEscapeHtml(p.hinban)}">${analyticsEscapeHtml(p.hinban)}</span>
                    ${p.productName ? `<span class="text-[10px] text-gray-400 block truncate max-w-[140px]">${analyticsEscapeHtml(p.productName)}</span>` : ''}
                  </td>
                  <td class="py-2 px-2 text-right tabular-nums font-medium text-gray-900">${p.shotsA.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums text-gray-500">${p.shotsB.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-600'}">
                    ${isUp ? '+' : ''}${p.diffShots.toLocaleString()}
                  </td>
                  <td class="py-2 pl-2 text-right tabular-nums ${p.diffDefects > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}">
                    ${p.diffDefects >= 0 ? '+' : ''}${p.diffDefects.toLocaleString()}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } else {
    // Machines (default)
    if (title1) title1.innerHTML = '<i class="ri-pie-chart-2-line text-emerald-600 mr-2"></i><span>Operating Time & Loss Distribution</span>';
    if (badge1) badge1.textContent = 'Shift allocation';

    const renderSingleRow = (title, data, isTarget) => {
      const totHours = data.totalHours || 1;
      const prodPct = Math.round((data.producingHours / totHours) * 100);
      const troublePct = Math.round((data.troubleHours / totHours) * 100);
      const breakPct = Math.round((data.breakHours / totHours) * 100);
      const idlePct = Math.max(0, 100 - prodPct - troublePct - breakPct);

      return `
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="font-semibold ${isTarget ? 'text-indigo-600' : 'text-gray-600'}">${title}</span>
              <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">${data.totalHours}h total</span>
            </div>
            <span class="font-bold text-gray-900">${prodPct}% Producing</span>
          </div>

          <div class="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 shadow-2xs">
            <div class="bg-emerald-500 transition-all" style="width: ${prodPct}%" title="Producing: ${data.producingHours}h (${prodPct}%)"></div>
            <div class="bg-sky-400 transition-all" style="width: ${breakPct}%" title="Break: ${data.breakHours}h (${breakPct}%)"></div>
            <div class="bg-rose-500 transition-all" style="width: ${troublePct}%" title="Trouble: ${data.troubleHours}h (${troublePct}%)"></div>
            <div class="bg-gray-200 transition-all" style="width: ${idlePct}%" title="Other/Idle: ${idlePct}%"></div>
          </div>

          <div class="flex items-center justify-between text-[11px] text-gray-400 pt-0.5">
            <span>Producing: <strong class="text-emerald-700 font-semibold">${data.producingHours}h</strong></span>
            <span>Trouble: <strong class="text-rose-600 font-semibold">${data.troubleHours}h</strong></span>
            <span>Break: <strong class="text-sky-700 font-semibold">${data.breakHours}h</strong></span>
          </div>
        </div>
      `;
    };

    content1.innerHTML = `
      <div class="space-y-4">
        ${renderSingleRow(`${monthA} (Target)`, breakdown1.dataA || {}, true)}
        ${renderSingleRow(`${monthB} (Baseline)`, breakdown1.dataB || {}, false)}
      </div>
    `;

    if (title2) title2.innerHTML = '<i class="ri-box-3-line text-violet-600 mr-2"></i><span>Product Mix Shift (Top Hinbans)</span>';
    if (badge2) badge2.textContent = 'Volume & share';

    const items2 = breakdown2.items || [];
    if (items2.length === 0) {
      content2.innerHTML = `<div class="py-6 text-center text-xs text-gray-400">No product records in this comparison range.</div>`;
    } else {
      content2.innerHTML = `
        <table class="min-w-full text-xs divide-y divide-gray-100">
          <thead>
            <tr class="text-left font-semibold text-gray-400">
              <th class="py-2 pr-3">Part / Hinban</th>
              <th class="py-2 px-2 text-right">${monthA}</th>
              <th class="py-2 px-2 text-right">${monthB}</th>
              <th class="py-2 px-2 text-right">Volume Δ</th>
              <th class="py-2 pl-2 text-right">Share Δ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${items2.map(p => {
              const isUp = p.diff >= 0;
              return `
                <tr class="hover:bg-gray-50/70 transition">
                  <td class="py-2 pr-3">
                    <span class="font-semibold text-gray-900 block truncate max-w-[140px]" title="${analyticsEscapeHtml(p.hinban)}">${analyticsEscapeHtml(p.hinban)}</span>
                    ${p.productName ? `<span class="text-[10px] text-gray-400 block truncate max-w-[140px]">${analyticsEscapeHtml(p.productName)}</span>` : ''}
                  </td>
                  <td class="py-2 px-2 text-right tabular-nums font-medium text-gray-900">${p.shotsA.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums text-gray-500">${p.shotsB.toLocaleString()}</td>
                  <td class="py-2 px-2 text-right tabular-nums font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-600'}">
                    ${isUp ? '+' : ''}${p.diff.toLocaleString()}
                  </td>
                  <td class="py-2 pl-2 text-right tabular-nums">
                    <span class="inline-flex items-center gap-0.5 font-semibold ${Number(p.shareDiff) >= 0 ? 'text-emerald-600' : 'text-rose-500'}">
                      ${Number(p.shareDiff) >= 0 ? '+' : ''}${p.shareDiff}%
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  }
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
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.quality.alertTopDefect'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${topDefectText}</p>
      </div>
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.quality.alertWorstDay'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${worstDayText}</p>
      </div>
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.quality.alertMachineInspect'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${machineInspectText}</p>
      </div>
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.quality.alertProductInspect'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${productInspectText}</p>
      </div>
    </div>`;
}

function renderAnalyticsHotspots(qualityHotspots) {
  const container = document.getElementById('analyticsHotspotsList');
  if (!container) return;

  if (!Array.isArray(qualityHotspots) || qualityHotspots.length === 0) {
    container.innerHTML = `<div class="px-6 py-10 text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.quality.noHotspots'))}</div>`;
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-gray-100 text-sm">
      <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-700">
        <tr>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.quality.tableTimestamp'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.quality.tableProduct'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.quality.tableWorker'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.quality.tableDefectFocus'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.quality.tableTrouble'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.quality.tableRemarks'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
        ${qualityHotspots.map(item => {
          const issueSummary = item.topDefects && item.topDefects.length
            ? item.topDefects.map(defect => `${analyticsEscapeHtml(defect.name)} (${analyticsFormatNumber(defect.count)})`).join(', ')
            : analyticsEscapeHtml(t('analytics.quality.tableNoDefectDetail'));
          const productBits = [item.productName, item.hinban, item.kanbanId].filter(Boolean).map(analyticsEscapeHtml);
          const productMarkup = productBits.length
            ? productBits.map((bit, index) => `<div class="${index === 0 ? '' : 'mt-1 text-xs text-gray-500'}">${bit}</div>`).join('')
            : '-';
          return `
            <tr class="hover:bg-gray-50/70 transition">
              <td class="px-6 py-4 align-top text-gray-500">${analyticsEscapeHtml(analyticsFormatDateTime(item.timestamp))}<div class="mt-1 text-xs text-gray-400">${analyticsEscapeHtml(item.source || t('analytics.common.unknown'))}</div></td>
              <td class="px-6 py-4 align-top font-semibold text-gray-900">${productMarkup}</td>
              <td class="px-6 py-4 align-top font-medium text-gray-900">${(item.operators || []).map(analyticsEscapeHtml).join('<br>') || '-'}</td>
              <td class="px-6 py-4 align-top"><div class="font-semibold text-rose-700">${analyticsEscapeHtml(t('analytics.quality.tableDefectsCount').replace('{n}', analyticsFormatNumber(item.totalDefects)))}</div><div class="mt-1 text-xs text-gray-500">${issueSummary}</div></td>
              <td class="px-6 py-4 align-top tabular-nums text-gray-600">${analyticsFormatHours(item.troubleTime)}</td>
              <td class="px-6 py-4 align-top text-gray-500">${analyticsEscapeHtml(item.remarks || '-')}</td>
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
      tone: 'bg-gray-100 text-gray-700',
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
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.product.noteLead'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${leadText}</p>
      </div>
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.product.noteRiskiest'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${riskText}</p>
      </div>
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(t('analytics.product.noteSlowest'))}</p>
        <p class="mt-1.5 text-sm font-medium text-gray-900">${slowText}</p>
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
    <table class="min-w-full divide-y divide-gray-100 text-sm">
      <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-700">
        <tr>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableProduct'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableRecords'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableGood'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableHours'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableIssues'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableDefectRate'))}</th>
          <th class="px-6 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.product.tableAvgCT'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
        ${rankedProducts.map(product => `
          <tr class="hover:bg-gray-50/70 transition">
            <td class="px-6 py-4 font-semibold text-gray-900">${analyticsEscapeHtml(analyticsGetProductLabel(product))}</td>
            <td class="px-6 py-4 tabular-nums font-medium text-gray-900">${analyticsFormatNumber(product.submissions)}</td>
            <td class="px-6 py-4 tabular-nums font-medium text-gray-900">${analyticsFormatNumber(product.totalGoodCount)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatHours(product.totalManHours)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(product.issueCount)}</td>
            <td class="px-6 py-4 tabular-nums ${Number(product.defectRate || 0) > 2 ? 'font-semibold text-rose-600' : 'text-gray-600'}">${analyticsFormatPercent(product.defectRate)}</td>
            <td class="px-6 py-4 tabular-nums text-gray-600">${analyticsFormatNumber(product.averageCycleTime, 2)}</td>
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
  if (!value) return null;
  const parts = String(value ?? '').trim().split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
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
    <article class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-gray-200">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-medium text-gray-500">${analyticsEscapeHtml(tile.title)}${tile.info ? ` <i class="ri-information-line align-middle text-gray-300" title="${analyticsEscapeHtml(tile.info)}"></i>` : ''}</p>
        ${analyticsTrafficDot(tile.tone)}
      </div>
      <p class="mt-2 text-2xl font-semibold leading-tight tracking-tight tabular-nums ${valueClass}">${tile.value}</p>
      <p class="mt-1 text-xs font-medium tabular-nums text-gray-400">${tile.detail || ''}</p>
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
    <table class="min-w-full divide-y divide-gray-100 text-sm">
      <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-700">
        <tr>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colDate'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colTime'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colMachine'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colProduct'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colOutput'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colDefects'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colBreak'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colTrouble'))}</th>
          <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.workerFocus.colShared'))}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
        ${rows.map(record => `
          <tr class="hover:bg-gray-50/70 transition">
            <td class="px-4 py-3 text-gray-600">${analyticsEscapeHtml(record.date)}</td>
            <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsEscapeHtml(record.startTime)} - ${analyticsEscapeHtml(record.endTime)}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${analyticsEscapeHtml(record.source)}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${analyticsEscapeHtml(analyticsGetProductLabel(record))}</td>
            <td class="px-4 py-3 font-semibold tabular-nums text-gray-900">${analyticsFormatNumber(record.goodCount)}</td>
            <td class="px-4 py-3 tabular-nums ${Number(record.defectCount || 0) > 0 ? 'font-semibold text-rose-600' : 'text-gray-600'}">${analyticsFormatNumber(record.defectCount)}</td>
            <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsFormatHours(record.breakTime)}</td>
            <td class="px-4 py-3 tabular-nums ${Number(record.troubleTime || 0) > 0 ? 'text-amber-600 font-medium' : 'text-gray-600'}">${analyticsFormatHours(record.troubleTime)}</td>
            <td class="px-4 py-3 text-gray-600">${(record.operators || []).length > 1 ? analyticsEscapeHtml((record.operators || []).join(', ')) : '-'}</td>
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
}

function renderAnalyticsMachineTimeline(machineDaily, selectedDate = null) {
  const container = document.getElementById('analyticsMachineTimelineContainer');
  const dateSelect = document.getElementById('analyticsMachineTimelineDateSelect');
  if (!container) return;

  const machines = machineDaily || [];
  
  if (machines.length === 0) {
    container.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.bottleneck.noData'))}</div>`;
    if (dateSelect) dateSelect.innerHTML = '';
    return;
  }

  // Collect all unique dates across all machines
  const allDates = new Set();
  machines.forEach(machine => {
    (machine.days || []).forEach(day => allDates.add(day.date));
  });
  const sortedDates = [...allDates].sort();

  if (sortedDates.length === 0) {
    container.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-400">${analyticsEscapeHtml(t('analytics.bottleneck.noData'))}</div>`;
    if (dateSelect) dateSelect.innerHTML = '';
    return;
  }

  // Determine the date to show
  let targetDate = selectedDate;
  if (!targetDate || !sortedDates.includes(targetDate)) {
    const endDatePicker = document.getElementById('analyticsEndDate')?.value;
    if (endDatePicker && sortedDates.includes(endDatePicker)) {
      targetDate = endDatePicker;
    } else {
      targetDate = sortedDates[sortedDates.length - 1];
    }
  }

  // Populate date dropdown
  if (dateSelect) {
    dateSelect.innerHTML = sortedDates.map(date => 
      `<option value="${analyticsEscapeHtml(date)}" ${date === targetDate ? 'selected' : ''}>${analyticsEscapeHtml(date)}</option>`
    ).join('');
  }

  const shiftProfile = analyticsGetShiftProfile();
  const shiftStart = analyticsParseClockMinutes(shiftProfile.start) ?? (8 * 60 + 30);
  let shiftEnd = analyticsParseClockMinutes(shiftProfile.end) ?? (19 * 60);
  if (shiftEnd <= shiftStart) {
    shiftEnd += 24 * 60;
  }
  const span = Math.max(1, shiftEnd - shiftStart);
  const toPercent = minutes => Math.max(0, Math.min(100, ((minutes - shiftStart) / span) * 100));

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = targetDate === todayStr;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentMarkerMins = (nowMins < shiftStart && shiftEnd > 1440) ? nowMins + 1440 : nowMins;
  const showCurrentTimeLine = isToday && currentMarkerMins >= shiftStart && currentMarkerMins <= shiftEnd;

  const lgProducing = t('analytics.bottleneck.legendProducing');
  const lgInProgress = t('analytics.bottleneck.legendInProgress');
  const lgBreak = t('analytics.bottleneck.legendBreak');
  const lgTrouble = t('analytics.bottleneck.legendTrouble');
  const lgChangeover = t('analytics.bottleneck.legendChangeover');
  const lgIdle = t('analytics.bottleneck.legendIdle');

  let html = `
    <div class="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-gray-600 mb-2">
      <div class="flex items-center gap-1.5"><div class="h-3 w-4 rounded bg-emerald-400"></div>${analyticsEscapeHtml(lgProducing)}</div>
      <div class="flex items-center gap-1.5"><div class="h-3 w-4 rounded bg-blue-400 animate-pulse"></div>${analyticsEscapeHtml(lgInProgress)}</div>
      <div class="flex items-center gap-1.5"><div class="h-3 w-4 rounded bg-rose-400"></div>${analyticsEscapeHtml(lgTrouble)}</div>
      <div class="flex items-center gap-1.5"><div class="h-3 w-4 rounded bg-purple-400"></div>${analyticsEscapeHtml(lgBreak)}</div>
      <div class="flex items-center gap-1.5"><div class="h-3 w-4 rounded bg-amber-400"></div>${analyticsEscapeHtml(lgChangeover)}</div>
      <div class="flex items-center gap-1.5"><div class="h-3 w-4 rounded bg-gray-400"></div>${analyticsEscapeHtml(lgIdle)}</div>
    </div>
    <div class="space-y-4 relative pb-6">
  `;

  machines.forEach(machine => {
    const dayData = (machine.days || []).find(d => d.date === targetDate);
    const records = dayData ? dayData.records || [] : [];
    
    let segments = records.map(record => {
      const start = analyticsParseClockMinutes(record.startTime);
      let end = analyticsParseClockMinutes(record.endTime);
      if (end < start) end += 24 * 60;
      return { ...record, start, end };
    }).filter(s => s.start !== null && s.end !== null).sort((a, b) => a.start - b.start);

    // Keep each submission as its own separate bar (no merging)
    // so admin can see independently submitted records
    segments.forEach(seg => {
      seg.operatorsList = Array.isArray(seg.operators) ? [...seg.operators] : [];
    });

    let blocksHtml = '';

    const buildBlock = (colorClass, left, width, tooltipStr) => {
      if (!tooltipStr) return `<div class="absolute top-0 bottom-0 rounded-md ${colorClass}" style="left:${left}%;width:${width}%"></div>`;
      return `<div class="group absolute top-0 bottom-0 rounded-md ${colorClass} hover:brightness-110 transition-all cursor-pointer" style="left:${left}%;width:${width}%">
        <div class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 w-max rounded bg-gray-800 px-3 py-2 text-left text-xs text-white shadow-lg opacity-0 transition-opacity duration-200 group-hover:delay-500 group-hover:opacity-100 whitespace-pre leading-relaxed">${analyticsEscapeHtml(tooltipStr)}</div>
      </div>`;
    };

    if (segments.length === 0) {
      blocksHtml += buildBlock('bg-gray-400', 0, 100, null);
    } else {
      let lastEnd = shiftStart;

      segments.forEach((segment, index) => {
        if (segment.start > lastEnd) {
          if (index === 0) {
            const left = toPercent(lastEnd);
            const width = toPercent(segment.start) - left;
            if (width > 0) blocksHtml += buildBlock('bg-gray-400', left, width, null);
          } else {
            const left = toPercent(lastEnd);
            const width = toPercent(segment.start) - left;
            const changeoverMins = segment.start - lastEnd;
            const startStr = `${String(Math.floor(lastEnd/60)).padStart(2, '0')}:${String(lastEnd%60).padStart(2, '0')}`;
            const endStr = `${String(Math.floor(segment.start/60)).padStart(2, '0')}:${String(segment.start%60).padStart(2, '0')}`;
            
            const prevSeg = segments[index - 1];
            const isSameHinban = prevSeg && ((prevSeg.hinban === segment.hinban) || (prevSeg.productName === segment.productName && prevSeg.productName));
            
            const color = isSameHinban ? 'bg-gray-400' : 'bg-amber-400';
            const label = isSameHinban ? lgIdle : lgChangeover;
            const tooltipStr = `${label}: ${Math.round(changeoverMins)}m\nTime: ${startStr} - ${endStr}`;
            
            if (width > 0) blocksHtml += buildBlock(color, left, width, tooltipStr);
          }
        }

        const segDuration = segment.end - segment.start;
        const breakMins = (segment.breakTime || 0) * 60;
        const troubleMins = (segment.troubleTime || 0) * 60;
        const producingMins = Math.max(0, segDuration - breakMins - troubleMins);
        
        const hasInterrupt = breakMins > 0 || troubleMins > 0;
        const prod1 = hasInterrupt ? producingMins / 2 : producingMins;
        const prod2 = hasInterrupt ? producingMins - prod1 : 0;

        const buildTooltip = (name, mins, isProducing) => {
          const durationStr = isProducing ? `${(mins / 60).toFixed(2)}h` : `${Math.round(mins)}m`;
          const hinbanStr = segment.hinban || segment.productName || '-';
          const kanbanStr = segment.kanbanId || '-';
          const workerStr = (segment.operators || []).join(', ') || '-';
          return `${name}: ${durationStr}\n品番: ${hinbanStr}\nKanban ID: ${kanbanStr}\nWorker: ${workerStr}\nTime: ${segment.startTime} - ${segment.endTime}`;
        };
        
        let currentMins = segment.start;
        
        if (prod1 > 0) {
          const left = toPercent(currentMins);
          const width = toPercent(currentMins + prod1) - left;
          const color = segment.isInProgress ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400';
          const name = segment.isInProgress ? lgInProgress : lgProducing;
          blocksHtml += buildBlock(color, left, width, buildTooltip(name, producingMins, true));
          currentMins += prod1;
        }
        
        if (troubleMins > 0) {
          const left = toPercent(currentMins);
          const width = toPercent(currentMins + troubleMins) - left;
          blocksHtml += buildBlock('bg-rose-400', left, width, buildTooltip(lgTrouble, troubleMins, false));
          currentMins += troubleMins;
        }

        if (breakMins > 0) {
          const left = toPercent(currentMins);
          const width = toPercent(currentMins + breakMins) - left;
          blocksHtml += buildBlock('bg-purple-400', left, width, buildTooltip(lgBreak, breakMins, false));
          currentMins += breakMins;
        }

        if (prod2 > 0) {
          const left = toPercent(currentMins);
          const width = toPercent(currentMins + prod2) - left;
          const color = segment.isInProgress ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400';
          const name = segment.isInProgress ? lgInProgress : lgProducing;
          blocksHtml += buildBlock(color, left, width, buildTooltip(name, producingMins, true));
          currentMins += prod2;
        }
        
        lastEnd = Math.max(lastEnd, segment.end);
      });

      if (lastEnd < shiftEnd) {
        const left = toPercent(lastEnd);
        const width = toPercent(shiftEnd) - left;
        if (width > 0) blocksHtml += buildBlock('bg-gray-400', left, width, null);
      }
    }

    html += `
      <div class="flex items-center gap-4">
        <div class="w-24 md:w-32 flex-shrink-0 truncate text-right text-sm font-medium text-gray-700" title="${analyticsEscapeHtml(machine.source)}">
          ${analyticsEscapeHtml(machine.source)}
        </div>
        <div class="relative h-6 flex-grow rounded-md bg-gray-100">
          ${blocksHtml}
          ${showCurrentTimeLine ? `<div class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style="left:${toPercent(currentMarkerMins)}%"></div>` : ''}
        </div>
      </div>
    `;
  });

  let ticksHtml = '';
  const step = span > 720 ? 120 : (span > 360 ? 60 : 30);
  const ticks = [shiftStart];
  let firstTick = Math.ceil(shiftStart / step) * step;
  if (firstTick === shiftStart) firstTick += step;
  for (let m = firstTick; m < shiftEnd; m += step) {
    if (m - shiftStart >= (step > 60 ? 30 : 15) && shiftEnd - m >= (step > 60 ? 30 : 15)) {
      ticks.push(m);
    }
  }
  if (!ticks.includes(shiftEnd)) {
    ticks.push(shiftEnd);
  }

  ticks.forEach(mins => {
    const position = toPercent(mins);
    const hours = Math.floor((mins / 60) % 24);
    const minutes = mins % 60;
    const label = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const translate = position < 2 ? '0' : position > 98 ? '-100%' : '-50%';
    ticksHtml += `
      <div class="absolute top-0 text-xs text-gray-400" style="left:${position}%; transform:translateX(${translate})">
        <div class="mx-auto mb-1 h-1 w-px bg-gray-300"></div>
        ${label}
      </div>
    `;
  });

  html += `
      <div class="flex items-center gap-4 mt-2">
        <div class="w-24 md:w-32 flex-shrink-0"></div>
        <div class="relative h-6 flex-grow">
          ${ticksHtml}
          ${showCurrentTimeLine ? `<div class="absolute top-0 -bottom-2 w-0.5 bg-red-500 z-20 pointer-events-none" style="left:${toPercent(currentMarkerMins)}%"></div>` : ''}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function renderAnalyticsMachineTrend(machineDaily) {
  const containerId = 'analyticsMachineTrendChart';
  const machines = machineDaily || [];

  if (machines.length === 0) {
    analyticsShowChartEmpty(containerId, t('analytics.empty.noData'));
    return;
  }

  // Aggregate stats per day across all machines
  const statsByDate = {};
  const shiftProfile = analyticsGetShiftProfile();
  const shiftStart = analyticsParseClockMinutes(shiftProfile.start) ?? (8 * 60 + 30);
  let shiftEnd = analyticsParseClockMinutes(shiftProfile.end) ?? (19 * 60);
  if (shiftEnd <= shiftStart) {
    shiftEnd += 24 * 60;
  }
  const totalShiftMins = Math.max(1, shiftEnd - shiftStart);

  // Find all unique dates
  const allDates = new Set();
  machines.forEach(machine => {
    (machine.days || []).forEach(day => {
      allDates.add(day.date);
    });
  });

  const sortedDates = Array.from(allDates).sort();

  sortedDates.forEach(date => {
    let dayProducing = 0;
    let dayTrouble = 0;
    let dayBreak = 0;
    let dayChangeover = 0;
    let dayIdle = 0;
    let machineCountForDay = 0;

    machines.forEach(machine => {
      const dayData = (machine.days || []).find(d => d.date === date);
      if (!dayData) return;
      machineCountForDay++;

      const records = dayData.records || [];
      let segments = records.map(record => {
        const start = analyticsParseClockMinutes(record.startTime);
        let end = analyticsParseClockMinutes(record.endTime);
        if (end < start) end += 24 * 60;
        return { ...record, start, end };
      }).filter(s => s.start !== null && s.end !== null).sort((a, b) => a.start - b.start);

      if (segments.length === 0) {
        dayIdle += totalShiftMins;
      } else {
        let lastEnd = shiftStart;

        segments.forEach((segment, index) => {
          if (segment.start > lastEnd) {
            if (index === 0) {
              dayIdle += (segment.start - lastEnd);
            } else {
              const gap = segment.start - lastEnd;
              const prevSeg = segments[index - 1];
              const isSameHinban = prevSeg && ((prevSeg.hinban === segment.hinban) || (prevSeg.productName === segment.productName && prevSeg.productName));
              if (isSameHinban) {
                dayIdle += gap;
              } else {
                dayChangeover += gap;
              }
            }
          }

          const segDuration = segment.end - segment.start;
          const breakMins = (segment.breakTime || 0) * 60;
          const troubleMins = (segment.troubleTime || 0) * 60;
          const producingMins = Math.max(0, segDuration - breakMins - troubleMins);

          dayProducing += producingMins;
          dayBreak += breakMins;
          dayTrouble += troubleMins;

          lastEnd = Math.max(lastEnd, segment.end);
        });

        if (lastEnd < shiftEnd) {
          dayIdle += (shiftEnd - lastEnd);
        }
      }
    });

    const maxMins = machineCountForDay * totalShiftMins;
    const efficiency = maxMins > 0 ? (dayProducing / maxMins) * 100 : 0;

    statsByDate[date] = {
      producingHrs: dayProducing / 60,
      idleHrs: dayIdle / 60,
      changeoverHrs: dayChangeover / 60,
      troubleHrs: (dayTrouble + dayBreak) / 60, // Combined as non-productive mapped to trouble/break
      efficiency: efficiency
    };
  });

  const xAxisData = sortedDates.map(d => {
    const pt = d.split('-');
    return `${parseInt(pt[1])}/${parseInt(pt[2])}`;
  });

  const seriesProducing = sortedDates.map(d => statsByDate[d].producingHrs);
  const seriesIdle = sortedDates.map(d => statsByDate[d].idleHrs);
  const seriesChangeover = sortedDates.map(d => statsByDate[d].changeoverHrs);
  const seriesTrouble = sortedDates.map(d => statsByDate[d].troubleHrs);
  const seriesEfficiency = sortedDates.map(d => statsByDate[d].efficiency);

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: [
        t('analytics.bottleneck.legendProducing') || 'Producing',
        t('analytics.bottleneck.legendIdle') || 'Idle',
        t('analytics.bottleneck.legendChangeover') || 'Changeover',
        t('analytics.bottleneck.legendTrouble') || 'Trouble',
        t('analytics.timelineSummary.efficiency') || 'Efficiency'
      ],
      bottom: 0,
      icon: 'circle'
    },
    grid: {
      top: 40,
      left: 20,
      right: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280' }
    },
    yAxis: [
      {
        type: 'value',
        name: t('analytics.worker.hours') || 'Hours',
        nameTextStyle: { color: '#9ca3af', padding: [0, 0, 0, 10] },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: { color: '#6b7280' }
      },
      {
        type: 'value',
        name: '%',
        min: 0,
        max: 100,
        splitLine: { show: false },
        axisLabel: { color: '#6b7280' }
      }
    ],
    series: [
      {
        name: t('analytics.bottleneck.legendProducing') || 'Producing',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#34d399' },
        data: seriesProducing
      },
      {
        name: t('analytics.bottleneck.legendIdle') || 'Idle',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#9ca3af' },
        data: seriesIdle
      },
      {
        name: t('analytics.bottleneck.legendChangeover') || 'Changeover',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#fbbf24' },
        data: seriesChangeover
      },
      {
        name: t('analytics.bottleneck.legendTrouble') || 'Trouble',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#fb7185' },
        data: seriesTrouble
      },
      {
        name: t('analytics.timelineSummary.efficiency') || 'Efficiency',
        type: 'line',
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#3b82f6' },
        lineStyle: { width: 3, shadowColor: 'rgba(59, 130, 246, 0.3)', shadowBlur: 10 },
        data: seriesEfficiency,
        tooltip: { valueFormatter: value => value.toFixed(1) + '%' }
      }
    ]
  };
  analyticsRenderChart(containerId, option);
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
      <table class="min-w-full divide-y divide-gray-100 text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-700">
          <tr>
            <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.finance.colProduct'))}</th>
            <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.finance.colPrice'))}</th>
            <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.finance.colPieces'))}</th>
            <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.finance.colDefects'))}</th>
            <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.finance.colEarned'))}</th>
            <th class="px-4 py-3 font-semibold">${analyticsEscapeHtml(t('analytics.finance.colLost'))}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${rows.map(product => `
            <tr class="hover:bg-gray-50/70 transition">
              <td class="px-4 py-3 font-semibold text-gray-900">
                ${analyticsEscapeHtml(analyticsGetProductLabel(product))}
                ${product.priced ? '' : `<span class="ml-2 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">${analyticsEscapeHtml(t('analytics.finance.unpricedBadge'))}</span>`}
              </td>
              <td class="px-4 py-3 tabular-nums text-gray-600">${product.priced ? analyticsFormatCurrency(product.price) : '-'}</td>
              <td class="px-4 py-3 tabular-nums font-medium text-gray-900">${analyticsFormatNumber(product.scopeGoodCount)}</td>
              <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsFormatNumber(product.defectCount)}</td>
              <td class="px-4 py-3 tabular-nums font-semibold text-emerald-700">${product.priced ? analyticsFormatCurrency(product.scopeEarned) : '-'}</td>
              <td class="px-4 py-3 tabular-nums ${product.scopeLost > 0 ? 'font-semibold text-rose-600' : 'text-gray-600'}">${product.priced ? analyticsFormatCurrency(product.scopeLost) : '-'}</td>
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
  digestEl.innerHTML = `<i class="ri-chat-smile-2-line mr-2 text-base text-gray-400"></i>${analyticsEscapeHtml(sentences.join(' '))}`;
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
          <span class="w-10 text-right font-semibold tabular-nums text-gray-800">${analyticsFormatNumber(defect.count)}</span>
        </div>`).join('');
    }
  }

  // Machines & workers who make it
  if (peopleEl) {
    const machineChips = (profile.machines || []).map(machine =>
      `<span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-sm text-gray-700"><i class="ri-cpu-line text-gray-400"></i>${analyticsEscapeHtml(machine.name)} <span class="text-xs tabular-nums text-gray-400">${analyticsFormatNumber(machine.pieces)}</span></span>`).join(' ');
    const workerChips = (profile.workers || []).map(worker =>
      `<span class="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-sm text-sky-800"><i class="ri-user-line text-sky-400"></i>${analyticsEscapeHtml(worker.name)} <span class="text-xs tabular-nums text-sky-500">${analyticsFormatCount(worker.pieces)}</span></span>`).join(' ');
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
      productCombined: document.getElementById('analyticsProductCombined')?.value || '',
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

    if (stored.tab) {
      analyticsActiveTab = stored.tab === 'overview' ? 'productivity' : stored.tab;
    }
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
    window.__analyticsPendingSelects = { source: stored.source, lhRh: stored.lhRh, productCombined: stored.productCombined };
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
    case 'mom':
      initAnalyticsMoM(analyticsData);
      loadAnalyticsMoM();
      break;
    case 'productivity':
    case 'overview':
    default:
      initAnalyticsProductivity();
      loadAnalyticsProductivity();
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
    analyticsPopulateSelect('analyticsOperator', options.operators || [], t('analytics.filters.searchOperator'), true);

    const combinedSelect = document.getElementById('analyticsProductCombined');
    if (combinedSelect) {
      const currentValue = combinedSelect.value;
      const combinedOptions = (options.products || []).map(p => {
        const text = (p.productName && p.hinban) ? `${p.productName} (${p.hinban})` : (p.productName || p.hinban);
        const val = JSON.stringify({ hinban: p.hinban || '', productName: p.productName || '' });
        return `<option value='${analyticsEscapeHtml(val)}'>${analyticsEscapeHtml(text)}</option>`;
      });
      combinedSelect.innerHTML = `<option value="">${analyticsEscapeHtml(t('analytics.filters.filterByProduct'))}</option>` + combinedOptions.join('');
      combinedSelect.value = currentValue || '';
    }

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
      applySaved('analyticsProductCombined', pending.productCombined);
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

  ['analyticsHinban', 'analyticsProductName', 'analyticsProductCombined', 'analyticsOperator'].forEach(id => {
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

// ------------------------------------------------------------
// Worker Comparison Modal
// ------------------------------------------------------------
let selectedWorkersForComparison = new Set();

function openWorkerComparisonModal() {
  if (!analyticsData) return;
  const modal = document.getElementById('analyticsWorkerComparisonModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  
  const container = document.getElementById('analyticsWorkerCompareCheckboxes');
  const allWorkers = (analyticsData.operatorComparison || []).map(w => w.name);
  allWorkers.sort((a, b) => a.localeCompare(b));
  
  if (selectedWorkersForComparison.size === 0 && allWorkers.length > 0) {
    const currentFocus = document.getElementById('analyticsWorkerFocusSelect')?.value;
    if (currentFocus && allWorkers.includes(currentFocus)) {
      selectedWorkersForComparison.add(currentFocus);
    }
  }

  if (container) {
    container.innerHTML = allWorkers.map(w => `
      <label class="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition">
        <input type="checkbox" value="${analyticsEscapeHtml(w)}" class="text-blue-600 rounded border-gray-300 focus:ring-blue-500" ${selectedWorkersForComparison.has(w) ? 'checked' : ''} onchange="handleWorkerCompareSelection(this)">
        <span class="text-sm font-medium text-gray-700">${analyticsEscapeHtml(w)}</span>
      </label>
    `).join('');
  }

  renderWorkerComparisonTable();
}

function closeWorkerComparisonModal() {
  const modal = document.getElementById('analyticsWorkerComparisonModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function handleWorkerCompareSelection(checkbox) {
  if (checkbox.checked) {
    selectedWorkersForComparison.add(checkbox.value);
  } else {
    selectedWorkersForComparison.delete(checkbox.value);
  }
  renderWorkerComparisonTable();
}

window.analyticsCheckAllWorkers = function() {
  if (!analyticsData) return;
  const allWorkers = (analyticsData.operatorComparison || []).map(w => w.name);
  allWorkers.forEach(w => selectedWorkersForComparison.add(w));
  
  const container = document.getElementById('analyticsWorkerCompareCheckboxes');
  if (container) {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
  }
  
  renderWorkerComparisonTable();
};

window.analyticsUncheckAllWorkers = function() {
  selectedWorkersForComparison.clear();
  
  const container = document.getElementById('analyticsWorkerCompareCheckboxes');
  if (container) {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
  }
  
  renderWorkerComparisonTable();
};

let analyticsWorkerCompareSortCol = 'score';
let analyticsWorkerCompareSortDesc = true;

window.sortWorkerComparison = function(col) {
  if (analyticsWorkerCompareSortCol === col) {
    analyticsWorkerCompareSortDesc = !analyticsWorkerCompareSortDesc;
  } else {
    analyticsWorkerCompareSortCol = col;
    analyticsWorkerCompareSortDesc = true;
  }
  renderWorkerComparisonTable();
};

function renderWorkerComparisonTable() {
  const tbody = document.getElementById('analyticsWorkerCompareTableBody');
  if (!tbody || !analyticsData) return;

  if (selectedWorkersForComparison.size === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">${t('analytics.workerCompare.noSelection') || 'Please select at least one worker to compare.'}</td></tr>`;
    
    // Reset icons
    const allIcons = document.querySelectorAll('[id^="sortIcon-"]');
    allIcons.forEach(icon => {
      icon.className = 'ri-arrow-up-down-line text-gray-400';
    });
    return;
  }

  const selectedArray = Array.from(selectedWorkersForComparison);
  const comparisons = analyticsData.operatorComparison || [];
  
  // 1. Map to row data objects
  const rowDataList = selectedArray.map(workerName => {
    const data = comparisons.find(c => c.name === workerName) || {
      totalGoodCount: 0, totalDefectCount: 0, totalManHours: 0, totalBreakTime: 0, totalTroubleTime: 0
    };
    const computedScore = analyticsComputeWorkerScore(data) || 0;
    return { workerName, data, computedScore };
  });

  // 2. Sort the row data
  rowDataList.sort((a, b) => {
    let valA, valB;
    switch (analyticsWorkerCompareSortCol) {
      case 'worker': valA = a.workerName.toLowerCase(); valB = b.workerName.toLowerCase(); break;
      case 'score': valA = a.computedScore; valB = b.computedScore; break;
      case 'output': valA = Number(a.data.totalGoodCount) || 0; valB = Number(b.data.totalGoodCount) || 0; break;
      case 'defects': valA = Number(a.data.totalDefectCount) || 0; valB = Number(b.data.totalDefectCount) || 0; break;
      case 'workingTime': valA = Number(a.data.totalManHours) || 0; valB = Number(b.data.totalManHours) || 0; break;
      case 'breakTime': valA = Number(a.data.totalBreakTime) || 0; valB = Number(b.data.totalBreakTime) || 0; break;
      case 'troubleTime': valA = Number(a.data.totalTroubleTime) || 0; valB = Number(b.data.totalTroubleTime) || 0; break;
      default: valA = a.computedScore; valB = b.computedScore; break;
    }
    
    if (valA < valB) return analyticsWorkerCompareSortDesc ? 1 : -1;
    if (valA > valB) return analyticsWorkerCompareSortDesc ? -1 : 1;
    return 0;
  });

  // 3. Render HTML
  const rows = rowDataList.map(({ workerName, data, computedScore }) => {
    let scoreToneClass = "text-gray-500 bg-gray-100";
    if (computedScore >= 90) scoreToneClass = "text-green-700 bg-green-100";
    else if (computedScore >= 70) scoreToneClass = "text-yellow-700 bg-yellow-100";
    else if (computedScore > 0) scoreToneClass = "text-rose-700 bg-rose-100";

    return `
      <tr class="hover:bg-gray-50/70 transition">
        <td class="px-4 py-3 font-semibold text-gray-900">${analyticsEscapeHtml(workerName)}</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${scoreToneClass}">
            ${computedScore > 0 ? Math.round(computedScore) : '-'}
          </span>
        </td>
        <td class="px-4 py-3 tabular-nums font-semibold text-gray-900">${analyticsFormatCount(data.totalGoodCount || 0)}</td>
        <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsFormatCount(data.totalDefectCount || 0)}</td>
        <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsFormatHours(data.totalManHours || 0)}</td>
        <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsFormatHours(data.totalBreakTime || 0)}</td>
        <td class="px-4 py-3 tabular-nums text-gray-600">${analyticsFormatHours(data.totalTroubleTime || 0)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');

  // 4. Update Sort Icons
  const allIcons = document.querySelectorAll('[id^="sortIcon-"]');
  allIcons.forEach(icon => {
    const colName = icon.id.replace('sortIcon-', '');
    if (colName === analyticsWorkerCompareSortCol) {
      icon.className = analyticsWorkerCompareSortDesc ? 'ri-arrow-down-line text-blue-600' : 'ri-arrow-up-line text-blue-600';
    } else {
      icon.className = 'ri-arrow-up-down-line text-gray-400';
    }
  });
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
  if (analyticsActiveTab === 'productivity' || analyticsActiveTab === 'overview') {
    initAnalyticsProductivity();
    loadAnalyticsProductivity();
  }
  loadAnalytics();
}

window.addEventListener('resize', () => {
  Object.values(analyticsCharts).forEach(chart => {
    if (chart) chart.resize();
  });
  analyticsProductivityCharts.forEach(chart => {
    if (chart && typeof chart.resize === 'function') chart.resize();
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
window.openWorkerComparisonModal = openWorkerComparisonModal;
window.closeWorkerComparisonModal = closeWorkerComparisonModal;
window.handleWorkerCompareSelection = handleWorkerCompareSelection;
window.setAnalyticsMoMSubTab = setAnalyticsMoMSubTab;
window.handleAnalyticsMoMFilterChange = handleAnalyticsMoMFilterChange;
window.handleAnalyticsMoMSwapMonths = handleAnalyticsMoMSwapMonths;
window.setAnalyticsMoMChartMode = setAnalyticsMoMChartMode;
window.loadAnalyticsMoM = loadAnalyticsMoM;
window.handleAnalyticsMachineMoMChange = handleAnalyticsMoMFilterChange;
window.loadAnalyticsMachineMoM = loadAnalyticsMoM;
window.initAnalyticsProductivity = initAnalyticsProductivity;
window.loadAnalyticsProductivity = loadAnalyticsProductivity;
window.handleAnalyticsProductivityTargetChange = handleAnalyticsProductivityTargetChange;
window.printAnalyticsProductivityWhiteboard = printAnalyticsProductivityWhiteboard;
window.openProductivitySubmittedDetail = openProductivitySubmittedDetail;
window.closeAnalyticsProductivityRecordModal = closeAnalyticsProductivityRecordModal;
window.handleProductivityCellClick = handleProductivityCellClick;
window.switchProductivityDetailTab = switchProductivityDetailTab;
window.handleAnalyticsProdModalEdit = handleAnalyticsProdModalEdit;