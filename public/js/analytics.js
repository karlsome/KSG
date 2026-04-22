'use strict';

let analyticsRequestId = 0;
let analyticsCharts = {};
let analyticsActiveTab = 'overview';
let analyticsData = null;

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
  return `${analyticsFormatNumber(value, 2)} h`;
}

function analyticsFormatTooltipMetric(seriesName, value) {
  const number = Number(Array.isArray(value) ? value[value.length - 1] : value);
  if (!Number.isFinite(number)) return '-';

  if (/(hour|time)/i.test(seriesName)) {
    return `${analyticsFormatNumber(number, 2)} h`;
  }

  if (/(rate|%)/i.test(seriesName)) {
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
    const seriesName = analyticsEscapeHtml(item.seriesName || 'Value');
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
  const bits = [item.productName || item.product_name || item.hinban || 'Unknown'];
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
    : '<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-sm text-gray-400">No data for this section.</div>';
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
    analyticsShowChartEmpty(containerId, 'Chart library not available');
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

function renderAnalyticsMeta(filters, summary, generatedAt) {
  const metaEl = document.getElementById('analyticsMetaChips');
  const updatedEl = document.getElementById('analyticsLastUpdated');
  const focusMetaEl = document.getElementById('analyticsOperatorFocusMeta');
  if (!metaEl || !updatedEl || !focusMetaEl) return;

  updatedEl.textContent = analyticsFormatDateTime(generatedAt);

  const chips = [
    {
      label: 'Range',
      value: `${analyticsEscapeHtml(filters.startDate || 'All')} to ${analyticsEscapeHtml(filters.endDate || 'All')}`,
      tone: 'border-slate-100 bg-slate-50'
    },
    {
      label: 'Records',
      value: analyticsFormatNumber(summary.submissions),
      tone: 'border-emerald-100 bg-emerald-50'
    },
    {
      label: 'Workers',
      value: analyticsFormatNumber(summary.uniqueOperators),
      tone: 'border-sky-100 bg-sky-50'
    },
    {
      label: 'Machines',
      value: analyticsFormatNumber(summary.uniqueSources),
      tone: 'border-violet-100 bg-violet-50'
    }
  ];

  if (filters.source) chips.push({ label: 'Machine', value: analyticsEscapeHtml(filters.source), tone: 'border-gray-200 bg-white' });
  if (filters.lhRh) chips.push({ label: 'Direction', value: analyticsEscapeHtml(filters.lhRh), tone: 'border-gray-200 bg-white' });
  if (filters.hinban) chips.push({ label: 'Hinban', value: analyticsEscapeHtml(filters.hinban), tone: 'border-gray-200 bg-white' });
  if (filters.productName) chips.push({ label: 'Product', value: analyticsEscapeHtml(filters.productName), tone: 'border-gray-200 bg-white' });
  if (filters.operator) chips.push({ label: 'Worker', value: analyticsEscapeHtml(filters.operator), tone: 'border-gray-200 bg-white' });

  metaEl.innerHTML = chips.map(chip => `
    <div class="rounded-xl border px-3 py-2 text-sm ${chip.tone}">
      <span class="text-gray-600">${chip.label}:</span>
      <strong class="ml-2 font-semibold text-gray-900">${chip.value}</strong>
    </div>`).join('');
  focusMetaEl.textContent = filters.focusOperator
    ? `Focused on ${filters.focusOperator} for the worker timeline.`
    : 'Auto-selecting the busiest worker in the current filter.';
}

function renderAnalyticsKpis(summary) {
  const cards = [
    {
      eyebrow: 'Good Pieces',
      value: analyticsFormatNumber(summary.totalGoodCount),
      detail: `${analyticsFormatNumber(summary.submissions)} records in scope`,
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-checkbox-circle-line'
    },
    {
      eyebrow: 'Defect Rate',
      value: analyticsFormatPercent(summary.defectRate),
      detail: `${analyticsFormatNumber(summary.totalDefectCount)} total defects`,
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: 'Issue Records',
      value: analyticsFormatNumber(summary.totalIssueRecords),
      detail: 'Records with defects, trouble, or remarks',
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: 'Man Hours',
      value: analyticsFormatHours(summary.totalManHours),
      detail: `${analyticsFormatHours(summary.totalTroubleTime)} trouble time`,
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-time-line'
    },
    {
      eyebrow: 'Active Workers',
      value: analyticsFormatNumber(summary.uniqueOperators),
      detail: `${analyticsFormatNumber(summary.uniqueKanbans)} kanbans`,
      tone: 'bg-violet-50 text-violet-700',
      icon: 'ri-team-line'
    },
    {
      eyebrow: 'Active Machines',
      value: analyticsFormatNumber(summary.uniqueSources),
      detail: `${analyticsFormatNumber(summary.uniqueProducts)} products`,
      tone: 'bg-cyan-50 text-cyan-700',
      icon: 'ri-cpu-line'
    }
  ];

  analyticsRenderCardGrid('analyticsKpiGrid', cards);
}

function renderAnalyticsOverviewTrendChart(dailyTrend) {
  if (!Array.isArray(dailyTrend) || dailyTrend.length === 0) {
    analyticsShowChartEmpty('analyticsTrendChart', 'No trend data for the selected filters.');
    return;
  }

  analyticsRenderChart('analyticsTrendChart', {
    color: ['#0f172a', '#14b8a6', '#f59e0b', '#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: ['Good Pieces', 'Man Hours', 'Issue Records', 'Defect Rate'] },
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
        name: 'Pieces / Hours',
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
        name: 'Good Pieces',
        type: 'bar',
        barMaxWidth: 24,
        data: dailyTrend.map(item => Number(item.goodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] },
        yAxisIndex: 0
      },
      {
        name: 'Man Hours',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: dailyTrend.map(item => Number(item.manHours || 0)),
        yAxisIndex: 0
      },
      {
        name: 'Issue Records',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: dailyTrend.map(item => Number(item.issueCount || 0)),
        yAxisIndex: 1
      },
      {
        name: 'Defect Rate',
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
      eyebrow: 'Main Defect Driver',
      value: topDefect ? analyticsEscapeHtml(topDefect.name) : 'No defects',
      detail: topDefect ? `${analyticsFormatNumber(topDefect.count)} defect hits in scope` : 'No quality loss in the current filter',
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: 'Most Loaded Worker',
      value: busiestWorker ? analyticsEscapeHtml(busiestWorker.name) : 'No worker data',
      detail: busiestWorker ? `${analyticsFormatHours(busiestWorker.totalManHours)} across ${analyticsFormatNumber(busiestWorker.submissions)} records` : 'No worker activity for the current filter',
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-user-star-line'
    },
    {
      eyebrow: 'Most Unstable Machine',
      value: unstableMachine ? analyticsEscapeHtml(unstableMachine.source) : 'No machine data',
      detail: unstableMachine ? `${analyticsFormatHours(unstableMachine.totalTroubleTime)} trouble time, ${analyticsFormatPercent(unstableMachine.defectRate)} defect rate` : 'No machine activity for the current filter',
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-cpu-line'
    },
    {
      eyebrow: 'Lead Product',
      value: leadProduct ? analyticsEscapeHtml(analyticsGetProductLabel(leadProduct)) : 'No product data',
      detail: leadProduct ? `${analyticsFormatNumber(leadProduct.totalGoodCount)} good pieces, ${analyticsFormatPercent(leadProduct.defectRate)} defect rate` : 'No product activity for the current filter',
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-box-3-line'
    }
  ]);

  renderAnalyticsOverviewTrendChart(dailyTrend);

  const overviewDrivers = document.getElementById('analyticsOverviewDrivers');
  if (overviewDrivers) {
    const machineAlert = unstableMachine
      ? `${analyticsEscapeHtml(unstableMachine.source)} is carrying ${analyticsFormatHours(unstableMachine.totalTroubleTime)} of trouble time with ${analyticsFormatPercent(unstableMachine.defectRate)} defect rate.`
      : 'No machine alerts for the selected filter.';
    const workerAlert = busiestWorker
      ? `${analyticsEscapeHtml(busiestWorker.name)} logged ${analyticsFormatHours(busiestWorker.totalManHours)} with ${analyticsFormatNumber(busiestWorker.issueCount)} issue records.`
      : 'No worker alerts for the selected filter.';
    const dayAlert = worstDay
      ? `${analyticsEscapeHtml(worstDay.label)} had ${analyticsFormatNumber(worstDay.issueCount)} issue records and ${analyticsFormatPercent(worstDay.defectRate)} defect rate.`
      : 'No daily issue pattern available.';

    overviewDrivers.innerHTML = `
      <div class="space-y-4">
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Quality signal</p>
          <p class="mt-2 text-sm text-slate-700">${topDefect ? `${analyticsEscapeHtml(topDefect.name)} is the leading defect with ${analyticsFormatNumber(topDefect.count)} hits.` : 'No defect signal in the current filter.'}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Machine signal</p>
          <p class="mt-2 text-sm text-slate-700">${machineAlert}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Labor signal</p>
          <p class="mt-2 text-sm text-slate-700">${workerAlert}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Daily pattern</p>
          <p class="mt-2 text-sm text-slate-700">${dayAlert}</p>
        </div>
      </div>`;
  }
}

function renderAnalyticsOperatorsChart(operatorComparison) {
  const rankedWorkers = (operatorComparison || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0))
    .slice(0, 10);

  if (rankedWorkers.length === 0) {
    analyticsShowChartEmpty('analyticsOperatorsChart', 'No worker data for the selected filters.');
    return;
  }

  analyticsRenderChart('analyticsOperatorsChart', {
    color: ['#0f766e', '#ea580c'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: ['Good Pieces', 'Defect Rate'] },
    grid: { left: 40, right: 40, top: 48, bottom: 48, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankedWorkers.map(item => item.name),
      axisTick: { show: false },
      axisLabel: { interval: 0, rotate: 18 }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Pieces',
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: '%',
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Good Pieces',
        type: 'bar',
        barMaxWidth: 28,
        data: rankedWorkers.map(item => Number(item.totalGoodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Defect Rate',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rankedWorkers.map(item => Number(item.defectRate || 0))
      }
    ]
  });
}

function renderAnalyticsOperatorFocusChart(operatorFocus) {
  if (!operatorFocus || !Array.isArray(operatorFocus.points) || operatorFocus.points.length === 0) {
    analyticsShowChartEmpty('analyticsOperatorFocusChart', 'No daily worker history for the selected focus worker.');
    return;
  }

  analyticsRenderChart('analyticsOperatorFocusChart', {
    color: ['#1e293b', '#f59e0b', '#ef4444', '#10b981'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: ['Man Hours', 'Break Time', 'Trouble Time', 'Good Pieces'] },
    grid: { left: 32, right: 32, top: 56, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: operatorFocus.points.map(item => item.label),
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Hours',
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: 'Pieces',
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Man Hours',
        type: 'bar',
        data: operatorFocus.points.map(item => Number(item.manHours || 0)),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Break Time',
        type: 'bar',
        data: operatorFocus.points.map(item => Number(item.breakTime || 0)),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Trouble Time',
        type: 'bar',
        data: operatorFocus.points.map(item => Number(item.troubleTime || 0)),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Good Pieces',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: operatorFocus.points.map(item => Number(item.goodCount || 0))
      }
    ]
  });
}

function renderAnalyticsWorkerTable(operatorComparison) {
  const container = document.getElementById('analyticsWorkerTable');
  if (!container) return;

  const rankedWorkers = (operatorComparison || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0));

  if (rankedWorkers.length === 0) {
    analyticsRenderTableState('analyticsWorkerTable', 'No worker data for the selected filters.');
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">Worker</th>
          <th class="px-6 py-3 font-medium">Records</th>
          <th class="px-6 py-3 font-medium">Good</th>
          <th class="px-6 py-3 font-medium">Hours</th>
          <th class="px-6 py-3 font-medium">Trouble</th>
          <th class="px-6 py-3 font-medium">Issues</th>
          <th class="px-6 py-3 font-medium">Defect Rate</th>
          <th class="px-6 py-3 font-medium">Avg CT</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${rankedWorkers.map(worker => `
          <tr>
            <td class="px-6 py-4 font-medium text-slate-900">${analyticsEscapeHtml(worker.name)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.submissions)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.totalGoodCount)}</td>
            <td class="px-6 py-4">${analyticsFormatHours(worker.totalManHours)}</td>
            <td class="px-6 py-4">${analyticsFormatHours(worker.totalTroubleTime)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.issueCount)}</td>
            <td class="px-6 py-4">${analyticsFormatPercent(worker.defectRate)}</td>
            <td class="px-6 py-4">${analyticsFormatNumber(worker.averageCycleTime, 2)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalyticsWorkerTab(data) {
  const workers = data.operatorComparison || [];
  const topOutputWorker = analyticsGetHighestBy(workers, item => Number(item.totalGoodCount || 0));
  const topTroubleWorker = analyticsGetHighestBy(workers, item => Number(item.totalTroubleTime || 0));
  const topIssueWorker = analyticsGetHighestBy(workers, item => Number(item.issueCount || 0));
  const bestQualityWorker = analyticsGetHighestBy(
    workers,
    item => Number(item.totalGoodCount || 0),
    item => Number(item.issueCount || 0) === 0 && Number(item.totalGoodCount || 0) > 0
  );

  analyticsRenderCardGrid('analyticsWorkerSummary', [
    {
      eyebrow: 'Highest Output Worker',
      value: topOutputWorker ? analyticsEscapeHtml(topOutputWorker.name) : 'No worker data',
      detail: topOutputWorker ? `${analyticsFormatNumber(topOutputWorker.totalGoodCount)} good pieces` : 'No output signal in this filter',
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-medal-line'
    },
    {
      eyebrow: 'Most Trouble Time',
      value: topTroubleWorker ? analyticsEscapeHtml(topTroubleWorker.name) : 'No worker data',
      detail: topTroubleWorker ? `${analyticsFormatHours(topTroubleWorker.totalTroubleTime)} trouble time` : 'No trouble signal in this filter',
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: 'Most Issue Records',
      value: topIssueWorker ? analyticsEscapeHtml(topIssueWorker.name) : 'No worker data',
      detail: topIssueWorker ? `${analyticsFormatNumber(topIssueWorker.issueCount)} issue records` : 'No issue signal in this filter',
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: 'Cleanest High-Output Worker',
      value: bestQualityWorker ? analyticsEscapeHtml(bestQualityWorker.name) : 'No candidate',
      detail: bestQualityWorker ? `${analyticsFormatNumber(bestQualityWorker.totalGoodCount)} good pieces with no issue records` : 'No clean high-output worker in this filter',
      tone: 'bg-sky-50 text-sky-700',
      icon: 'ri-shield-check-line'
    }
  ]);

  renderAnalyticsOperatorsChart(workers);
  renderAnalyticsOperatorFocusChart(data.operatorFocus || null);
  renderAnalyticsWorkerTable(workers);
}

function renderAnalyticsMachineChart(sourceBreakdown) {
  const rankedSources = (sourceBreakdown || [])
    .slice()
    .sort((a, b) => Number(b.totalGoodCount || 0) - Number(a.totalGoodCount || 0))
    .slice(0, 10);

  if (rankedSources.length === 0) {
    analyticsShowChartEmpty('analyticsSourceChart', 'No machine data for the selected filters.');
    return;
  }

  analyticsRenderChart('analyticsSourceChart', {
    color: ['#06b6d4', '#f59e0b', '#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: ['Good Pieces', 'Trouble Time', 'Defect Rate'] },
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
        name: 'Pieces / Hours',
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: '%',
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Good Pieces',
        type: 'bar',
        barMaxWidth: 26,
        data: rankedSources.map(item => Number(item.totalGoodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Trouble Time',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        data: rankedSources.map(item => Number(item.totalTroubleTime || 0)),
        yAxisIndex: 0
      },
      {
        name: 'Defect Rate',
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
    container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-400">No machine/source records for the selected filters.</div>';
    return;
  }

  container.innerHTML = `<div class="space-y-4">${topSources.map(source => `
    <article class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-slate-900">${analyticsEscapeHtml(source.source)}</p>
          <p class="mt-1 text-xs text-slate-500">${analyticsFormatNumber(source.submissions)} records, ${analyticsFormatNumber(source.issueCount)} issue records</p>
        </div>
        <span class="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">${analyticsFormatPercent(source.defectRate)}</span>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div class="rounded-xl bg-white px-3 py-2"><span class="block text-slate-400">Good</span><span class="mt-1 block text-sm font-semibold text-slate-900">${analyticsFormatNumber(source.totalGoodCount)}</span></div>
        <div class="rounded-xl bg-white px-3 py-2"><span class="block text-slate-400">Trouble</span><span class="mt-1 block text-sm font-semibold text-slate-900">${analyticsFormatHours(source.totalTroubleTime)}</span></div>
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
    analyticsRenderTableState('analyticsMachineTable', 'No machine data for the selected filters.');
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">Machine Source</th>
          <th class="px-6 py-3 font-medium">Records</th>
          <th class="px-6 py-3 font-medium">Good</th>
          <th class="px-6 py-3 font-medium">Hours</th>
          <th class="px-6 py-3 font-medium">Trouble</th>
          <th class="px-6 py-3 font-medium">Issues</th>
          <th class="px-6 py-3 font-medium">Defect Rate</th>
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
      eyebrow: 'Highest Output Machine',
      value: topOutputSource ? analyticsEscapeHtml(topOutputSource.source) : 'No machine data',
      detail: topOutputSource ? `${analyticsFormatNumber(topOutputSource.totalGoodCount)} good pieces` : 'No machine output data',
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-cpu-line'
    },
    {
      eyebrow: 'Most Trouble Time',
      value: topTroubleSource ? analyticsEscapeHtml(topTroubleSource.source) : 'No machine data',
      detail: topTroubleSource ? `${analyticsFormatHours(topTroubleSource.totalTroubleTime)} trouble time` : 'No trouble signal',
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: 'Most Issue Records',
      value: topIssueSource ? analyticsEscapeHtml(topIssueSource.source) : 'No machine data',
      detail: topIssueSource ? `${analyticsFormatNumber(topIssueSource.issueCount)} issue records` : 'No issue signal',
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: 'Highest Defect Rate',
      value: worstQualitySource ? analyticsEscapeHtml(worstQualitySource.source) : 'No machine data',
      detail: worstQualitySource ? `${analyticsFormatPercent(worstQualitySource.defectRate)} defect rate` : 'No quality signal',
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
    analyticsShowChartEmpty('analyticsDefectsChart', 'No defect records for the selected filters.');
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

  container.innerHTML = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Top defect</p>
        <p class="mt-2 text-sm text-slate-700">${topDefect ? `${analyticsEscapeHtml(topDefect.name)} accounts for ${analyticsFormatNumber(topDefect.count)} counted defects.` : 'No defect signal in the current filter.'}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Worst day</p>
        <p class="mt-2 text-sm text-slate-700">${worstDay ? `${analyticsEscapeHtml(worstDay.label)} reached ${analyticsFormatPercent(worstDay.defectRate)} defect rate with ${analyticsFormatNumber(worstDay.issueCount)} issue records.` : 'No day-level quality signal in the current filter.'}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Machine to inspect</p>
        <p class="mt-2 text-sm text-slate-700">${riskiestMachine ? `${analyticsEscapeHtml(riskiestMachine.source)} is running at ${analyticsFormatPercent(riskiestMachine.defectRate)} defect rate.` : 'No machine quality signal in the current filter.'}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Product to inspect</p>
        <p class="mt-2 text-sm text-slate-700">${riskiestProduct ? `${analyticsEscapeHtml(analyticsGetProductLabel(riskiestProduct))} is running at ${analyticsFormatPercent(riskiestProduct.defectRate)} defect rate.` : 'No product quality signal in the current filter.'}</p>
      </div>
    </div>`;
}

function renderAnalyticsHotspots(qualityHotspots) {
  const container = document.getElementById('analyticsHotspotsList');
  if (!container) return;

  if (!Array.isArray(qualityHotspots) || qualityHotspots.length === 0) {
    container.innerHTML = '<div class="px-6 py-10 text-sm text-slate-400">No issue-heavy records for the selected filters.</div>';
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">Timestamp</th>
          <th class="px-6 py-3 font-medium">Product</th>
          <th class="px-6 py-3 font-medium">Worker</th>
          <th class="px-6 py-3 font-medium">Defect Focus</th>
          <th class="px-6 py-3 font-medium">Trouble</th>
          <th class="px-6 py-3 font-medium">Remarks</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
        ${qualityHotspots.map(item => {
          const issueSummary = item.topDefects && item.topDefects.length
            ? item.topDefects.map(defect => `${analyticsEscapeHtml(defect.name)} (${analyticsFormatNumber(defect.count)})`).join(', ')
            : 'No defect detail';
          const productBits = [item.productName, item.hinban, item.kanbanId].filter(Boolean).map(analyticsEscapeHtml);
          const productMarkup = productBits.length
            ? productBits.map((bit, index) => `<div class="${index === 0 ? '' : 'mt-1 text-xs text-slate-500'}">${bit}</div>`).join('')
            : '-';
          return `
            <tr>
              <td class="px-6 py-4 align-top text-slate-500">${analyticsEscapeHtml(analyticsFormatDateTime(item.timestamp))}<div class="mt-1 text-xs text-slate-400">${analyticsEscapeHtml(item.source || 'Unknown')}</div></td>
              <td class="px-6 py-4 align-top font-medium text-slate-900">${productMarkup}</td>
              <td class="px-6 py-4 align-top">${(item.operators || []).map(analyticsEscapeHtml).join('<br>') || '-'}</td>
              <td class="px-6 py-4 align-top"><div class="font-medium text-rose-700">${analyticsFormatNumber(item.totalDefects)} defects</div><div class="mt-1 text-xs text-slate-500">${issueSummary}</div></td>
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
      eyebrow: 'Defect Rate',
      value: analyticsFormatPercent(data.summary?.defectRate || 0),
      detail: `${analyticsFormatNumber(data.summary?.totalDefectCount || 0)} total defects`,
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: 'Issue Records',
      value: analyticsFormatNumber(data.summary?.totalIssueRecords || 0),
      detail: 'Records needing review',
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-alarm-warning-line'
    },
    {
      eyebrow: 'Top Defect',
      value: topDefect ? analyticsEscapeHtml(topDefect.name) : 'No defects',
      detail: topDefect ? `${analyticsFormatNumber(topDefect.count)} counted events` : 'No defect activity in this filter',
      tone: 'bg-slate-100 text-slate-700',
      icon: 'ri-bug-line'
    },
    {
      eyebrow: 'Highest-Risk Product',
      value: worstProduct ? analyticsEscapeHtml(analyticsGetProductLabel(worstProduct)) : 'No product data',
      detail: worstProduct ? `${analyticsFormatPercent(worstProduct.defectRate)} defect rate` : 'No product quality signal',
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
    analyticsShowChartEmpty('analyticsProductsChart', 'No product data for the selected filters.');
    return;
  }

  analyticsRenderChart('analyticsProductsChart', {
    color: ['#0ea5e9', '#ef4444'],
    tooltip: { trigger: 'axis', formatter: analyticsAxisTooltipFormatter },
    legend: { top: 0, data: ['Good Pieces', 'Defect Rate'] },
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
        name: 'Pieces',
        splitLine: { lineStyle: { color: '#e2e8f0' } }
      },
      {
        type: 'value',
        name: '%',
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Good Pieces',
        type: 'bar',
        barMaxWidth: 26,
        data: rankedProducts.map(item => Number(item.totalGoodCount || 0)),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Defect Rate',
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

  container.innerHTML = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Lead product</p>
        <p class="mt-2 text-sm text-slate-700">${leadProduct ? `${analyticsEscapeHtml(analyticsGetProductLabel(leadProduct))} produced ${analyticsFormatNumber(leadProduct.totalGoodCount)} good pieces.` : 'No lead product in the current filter.'}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Riskiest product</p>
        <p class="mt-2 text-sm text-slate-700">${riskiestProduct ? `${analyticsEscapeHtml(analyticsGetProductLabel(riskiestProduct))} is running at ${analyticsFormatPercent(riskiestProduct.defectRate)} defect rate.` : 'No product quality signal in the current filter.'}</p>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Slowest cycle</p>
        <p class="mt-2 text-sm text-slate-700">${slowestProduct ? `${analyticsEscapeHtml(analyticsGetProductLabel(slowestProduct))} is averaging ${analyticsFormatNumber(slowestProduct.averageCycleTime, 2)} cycle time.` : 'No cycle-time signal in the current filter.'}</p>
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
    analyticsRenderTableState('analyticsProductTable', 'No product data for the selected filters.');
    return;
  }

  container.innerHTML = `
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-6 py-3 font-medium">Product</th>
          <th class="px-6 py-3 font-medium">Records</th>
          <th class="px-6 py-3 font-medium">Good</th>
          <th class="px-6 py-3 font-medium">Hours</th>
          <th class="px-6 py-3 font-medium">Issues</th>
          <th class="px-6 py-3 font-medium">Defect Rate</th>
          <th class="px-6 py-3 font-medium">Avg CT</th>
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
      eyebrow: 'Lead Product',
      value: leadProduct ? analyticsEscapeHtml(analyticsGetProductLabel(leadProduct)) : 'No product data',
      detail: leadProduct ? `${analyticsFormatNumber(leadProduct.totalGoodCount)} good pieces` : 'No product output data',
      tone: 'bg-emerald-50 text-emerald-700',
      icon: 'ri-box-3-line'
    },
    {
      eyebrow: 'Highest Defect Rate',
      value: riskiestProduct ? analyticsEscapeHtml(analyticsGetProductLabel(riskiestProduct)) : 'No product data',
      detail: riskiestProduct ? `${analyticsFormatPercent(riskiestProduct.defectRate)} defect rate` : 'No quality signal',
      tone: 'bg-rose-50 text-rose-700',
      icon: 'ri-error-warning-line'
    },
    {
      eyebrow: 'Slowest Cycle',
      value: slowestProduct ? analyticsEscapeHtml(analyticsGetProductLabel(slowestProduct)) : 'No product data',
      detail: slowestProduct ? `${analyticsFormatNumber(slowestProduct.averageCycleTime, 2)} average cycle time` : 'No cycle-time signal',
      tone: 'bg-amber-50 text-amber-700',
      icon: 'ri-timer-2-line'
    },
    {
      eyebrow: 'Most Issue Records',
      value: issueHeavyProduct ? analyticsEscapeHtml(analyticsGetProductLabel(issueHeavyProduct)) : 'No product data',
      detail: issueHeavyProduct ? `${analyticsFormatNumber(issueHeavyProduct.issueCount)} issue records` : 'No issue signal',
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
    analyticsPopulateSelect('analyticsSource', options.sources || [], 'All sources');
    analyticsPopulateSelect('analyticsFocusOperator', options.operators || [], 'Auto (top worker)', true);
    analyticsPopulateDatalist('analyticsHinbanList', options.hinban || []);
    analyticsPopulateDatalist('analyticsProductList', options.productNames || []);
    analyticsPopulateDatalist('analyticsOperatorList', options.operators || []);

    const lhRhSelect = document.getElementById('analyticsLhRh');
    if (lhRhSelect && Array.isArray(options.lhRh) && options.lhRh.length > 0) {
      const currentValue = lhRhSelect.value;
      const values = [...new Set(options.lhRh.filter(Boolean))];
      lhRhSelect.innerHTML = ['<option value="all">All directions</option>']
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
  const previousLabel = refreshLabel ? refreshLabel.textContent : 'Refresh';
  analyticsSetError('');

  if (refreshBtn) refreshBtn.disabled = true;
  if (refreshLabel) refreshLabel.textContent = 'Refreshing...';

  try {
    const response = await fetch(`${API_URL}/api/admin/analytics?${analyticsBuildParams().toString()}`, {
      headers: analyticsGetAuthHeaders()
    });
    const result = await response.json();

    if (requestId !== analyticsRequestId || !document.getElementById('analyticsRoot')) {
      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to load analytics');
    }

    renderAnalytics(result);
  } catch (error) {
    console.error('analytics load error:', error);
    analyticsSetError(error.message || 'Failed to load analytics');
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

function initializeAnalytics() {
  if (!document.getElementById('analyticsRoot')) return;
  analyticsSetDefaultFilters();
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
window.handleAnalyticsFilterKeydown = handleAnalyticsFilterKeydown;
window.disposeAnalyticsCharts = disposeAnalyticsCharts;
window.setAnalyticsTab = setAnalyticsTab;