// =============================================
// submittedDB.js — Submitted Data Viewer Page
// =============================================

'use strict';

// --- State ---
let _sdbCurrentPage = 1;
let _sdbSortField   = 'timestamp';
let _sdbSortDir     = 'desc';
let _sdbAllData     = [];        // cached current page data for CSV
let _sdbDebounceTimer = null;

// Columns that are structural (not dynamic defect columns)
const SDB_FIXED_KEYS = new Set([
  '_id', 'timestamp', 'date_year', 'date_month', 'date_day',
  'hinban', 'product_name', 'kanban_id', 'hako_iresu', 'lh_rh',
  'operator1', 'operator2', 'good_count', 'man_hours', 'cycle_time',
  'other_description', 'start_time', 'end_time', 'break_time',
  'trouble_time', 'remarks', 'excluded_man_hours', 'submitted_from'
]);

// --- Public helpers (called from HTML inline handlers) ---

function sdbDebouncedLoad() {
  clearTimeout(_sdbDebounceTimer);
  _sdbDebounceTimer = setTimeout(() => {
    _sdbCurrentPage = 1;
    loadSubmittedDB();
  }, 400);
}

function sdbGoToPage(page) {
  _sdbCurrentPage = page;
  loadSubmittedDB();
}

function sdbSort(field) {
  if (_sdbSortField === field) {
    _sdbSortDir = _sdbSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    _sdbSortField = field;
    _sdbSortDir   = 'desc';
  }
  _sdbCurrentPage = 1;
  loadSubmittedDB();
}

// --- Core loader ---

async function loadSubmittedDB() {
  const container = document.getElementById('submittedDBTableContainer');
  if (!container) return;
  container.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center"><i class="ri-loader-4-line animate-spin mr-2"></i>読み込み中...</p>';

  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const username    = currentUser.username || '';
  const token       = localStorage.getItem('ksgToken') || '';

  // Build query string
  const params = new URLSearchParams();
  const startDate   = document.getElementById('sdbFilterStartDate')?.value;
  const endDate     = document.getElementById('sdbFilterEndDate')?.value;
  const hinban      = document.getElementById('sdbFilterHinban')?.value.trim();
  const kanbanId    = document.getElementById('sdbFilterKanbanId')?.value.trim();
  const productName = document.getElementById('sdbFilterProductName')?.value.trim();
  const operator    = document.getElementById('sdbFilterOperator')?.value.trim();
  const lhRh        = document.getElementById('sdbFilterLhRh')?.value;
  const limit       = document.getElementById('sdbFilterLimit')?.value || '100';

  if (startDate)             params.set('startDate', startDate);
  if (endDate)               params.set('endDate', endDate);
  if (hinban)                params.set('hinban', hinban);
  if (kanbanId)              params.set('kanbanId', kanbanId);
  if (productName)           params.set('productName', productName);
  if (operator)              params.set('operator', operator);
  if (lhRh && lhRh !== 'all') params.set('lhRh', lhRh);

  params.set('sortField', _sdbSortField);
  params.set('sortDir',   _sdbSortDir);
  params.set('limit',     limit);
  params.set('page',      _sdbCurrentPage);

  try {
    const headers = { 'x-session-user': username };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res    = await fetch(`${API_URL}/api/admin/submitted-db?${params.toString()}`, { headers });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Failed to load');

    _sdbAllData = result.data;
    renderSubmittedDBTable(result.data, result.total, result.page, result.totalPages, parseInt(limit), result.summary);
  } catch (err) {
    console.error('submittedDB load error:', err);
    container.innerHTML = `<p class="text-red-500 text-sm py-8 text-center"><i class="ri-error-warning-line mr-2"></i>エラー: ${err.message}</p>`;
  }
}

// --- Renderer ---

function renderSubmittedDBTable(records, total, page, totalPages, limit, summary) {
  const container    = document.getElementById('submittedDBTableContainer');
  const summaryEl    = document.getElementById('submittedDBSummary');
  const paginationEl = document.getElementById('submittedDBPagination');
  const pageInfoEl   = document.getElementById('submittedDBPageInfo');
  const pageBtnsEl   = document.getElementById('submittedDBPageBtns');

  // ── Summary bar ──
  if (summaryEl && summary) {
    summaryEl.innerHTML = `
      <span class="font-medium text-blue-800"><i class="ri-file-list-3-line mr-1"></i>総件数: <strong>${summary.recordCount}</strong></span>
      <span class="text-blue-400">|</span>
      <span>良品合計: <strong>${summary.totalGoodCount}</strong></span>
      <span class="text-blue-400">|</span>
      <span>工数合計: <strong>${(summary.totalManHours ?? 0).toFixed(2)}</strong> h</span>
      <span class="text-blue-400">|</span>
      <span>休憩合計: <strong>${(summary.totalBreakTime ?? 0).toFixed(2)}</strong> h</span>
      <span class="text-blue-400">|</span>
      <span>トラブル合計: <strong>${(summary.totalTroubleTime ?? 0).toFixed(2)}</strong> h</span>
      <span class="text-blue-400 ml-auto text-xs">表示: ${records.length} / ${total} 件</span>
    `;
    summaryEl.classList.remove('hidden');
  }

  if (!records || records.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16">
        <i class="ri-file-list-3-line text-6xl text-gray-200 mb-4 block"></i>
        <p class="text-gray-400">該当するデータがありません</p>
      </div>`;
    if (paginationEl) paginationEl.classList.add('hidden');
    return;
  }

  // ── Discover dynamic defect columns ──
  const defectCols = new Set();
  records.forEach(rec => Object.keys(rec).forEach(k => {
    if (!SDB_FIXED_KEYS.has(k)) defectCols.add(k);
  }));
  const defectColsList = [...defectCols].sort();

  // ── Fixed column definitions ──
  const fixedCols = [
    { key: 'timestamp',    label: '日時',        fmt: v => v ? new Date(v).toLocaleString('ja-JP') : '' },
    { key: 'hinban',       label: '品番' },
    { key: 'product_name', label: '製品名' },
    { key: 'kanban_id',    label: '看板ID' },
    { key: 'lh_rh',        label: 'LH/RH' },
    { key: 'operator1',    label: '作業者①' },
    { key: 'operator2',    label: '作業者②' },
    { key: 'good_count',   label: '良品数' },
    { key: 'man_hours',    label: '工数(h)' },
    { key: 'cycle_time',   label: 'CT(min)' },
    { key: 'start_time',   label: '開始' },
    { key: 'end_time',     label: '終了' },
    { key: 'break_time',   label: '休憩(h)' },
    { key: 'trouble_time', label: 'トラブル(h)' },
  ];

  const allCols = [
    ...fixedCols,
    ...defectColsList.map(k => ({ key: k, label: k, isDefect: true })),
    { key: 'remarks',        label: '備考' },
    { key: 'submitted_from', label: '送信元' },
  ];

  const sortIcon = key => {
    if (_sdbSortField !== key) return '<i class="ri-arrow-up-down-line ml-1 text-gray-300"></i>';
    return _sdbSortDir === 'desc'
      ? '<i class="ri-arrow-down-line ml-1 text-blue-500"></i>'
      : '<i class="ri-arrow-up-line ml-1 text-blue-500"></i>';
  };

  // ── Table head ──
  const thead = allCols.map(col => `
    <th onclick="sdbSort('${col.key}')"
        class="px-3 py-2 text-left text-xs font-semibold uppercase whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none ${col.isDefect ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}">
      ${col.label}${sortIcon(col.key)}
    </th>`).join('');

  // ── Table body ──
  const tbody = records.map((rec, idx) => {
    const cells = allCols.map(col => {
      let val = rec[col.key] ?? '';
      if (col.fmt) val = col.fmt(val);
      if (col.isDefect) {
        return val > 0
          ? `<td class="px-3 py-2 text-red-600 font-bold text-center">${val}</td>`
          : `<td class="px-3 py-2 text-center text-gray-300">0</td>`;
      }
      return `<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis" title="${String(val).replace(/"/g, '&quot;')}">${val}</td>`;
    }).join('');
    return `<tr class="hover:bg-blue-50 border-b border-gray-100 cursor-pointer" onclick="openSdbDetail(${idx})">${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="w-full text-sm border-collapse">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  // ── Pagination ──
  if (paginationEl) {
    if (totalPages <= 1) {
      paginationEl.classList.add('hidden');
    } else {
      paginationEl.classList.remove('hidden');
      if (pageInfoEl) pageInfoEl.textContent = `ページ ${page} / ${totalPages}  （全 ${total} 件）`;
      if (pageBtnsEl) {
        const disabled = (cond) => cond ? 'disabled class="px-2 py-1 rounded border text-sm opacity-30 cursor-not-allowed"' : 'class="px-2 py-1 rounded border text-sm hover:bg-gray-100"';
        let btns = '';
        btns += `<button onclick="sdbGoToPage(1)" ${disabled(page === 1)}>«</button>`;
        btns += `<button onclick="sdbGoToPage(${page - 1})" ${disabled(page <= 1)}>‹</button>`;
        const s = Math.max(1, page - 2), e = Math.min(totalPages, page + 2);
        for (let p = s; p <= e; p++) {
          btns += `<button onclick="sdbGoToPage(${p})" class="px-3 py-1 rounded border text-sm ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}">${p}</button>`;
        }
        btns += `<button onclick="sdbGoToPage(${page + 1})" ${disabled(page >= totalPages)}>›</button>`;
        btns += `<button onclick="sdbGoToPage(${totalPages})" ${disabled(page === totalPages)}>»</button>`;
        pageBtnsEl.innerHTML = btns;
      }
    }
  }
}

// --- Filter reset ---

function clearSubmittedDBFilters() {
  ['sdbFilterStartDate','sdbFilterEndDate','sdbFilterHinban','sdbFilterKanbanId',
   'sdbFilterProductName','sdbFilterOperator'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const lhEl    = document.getElementById('sdbFilterLhRh');
  const limitEl = document.getElementById('sdbFilterLimit');
  if (lhEl)    lhEl.value    = 'all';
  if (limitEl) limitEl.value = '100';
  _sdbCurrentPage = 1;
  _sdbSortField   = 'timestamp';
  _sdbSortDir     = 'desc';
  loadSubmittedDB();
}

// --- CSV Export ---

function exportSubmittedDBCSV() {
  if (!_sdbAllData || _sdbAllData.length === 0) {
    alert('エクスポートするデータがありません');
    return;
  }

  const allKeys = new Set();
  _sdbAllData.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
  allKeys.delete('_id');

  const fixedOrder = [
    'timestamp','hinban','product_name','kanban_id','hako_iresu','lh_rh',
    'operator1','operator2','good_count','man_hours','cycle_time',
    'start_time','end_time','break_time','trouble_time',
    'other_description','remarks','excluded_man_hours','submitted_from'
  ];
  const dynamicKeys  = [...allKeys].filter(k => !SDB_FIXED_KEYS.has(k)).sort();
  const orderedKeys  = [...fixedOrder.filter(k => allKeys.has(k)), ...dynamicKeys];

  const escapeCSV = val => {
    const str = String(val ?? '');
    return (str.includes(',') || str.includes('"') || str.includes('\n'))
      ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const rows = [
    orderedKeys.map(escapeCSV).join(','),
    ..._sdbAllData.map(rec => orderedKeys.map(k => escapeCSV(rec[k] ?? '')).join(','))
  ].join('\n');

  const bom  = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `submittedDB_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Detail Modal ---

function openSdbDetail(idx) {
  const rec = _sdbAllData[idx];
  if (!rec) return;

  const ts = rec.timestamp ? new Date(rec.timestamp).toLocaleString('ja-JP') : '';

  // Header
  document.getElementById('sdbModalDate').textContent       = ts;
  document.getElementById('sdbModalTitle').textContent      = rec.product_name || '—';
  document.getElementById('sdbModalSub').textContent        = [rec.hinban, rec.kanban_id].filter(Boolean).join('  /  ');

  // Stats
  document.getElementById('sdbModalGood').textContent      = rec.good_count ?? '—';
  document.getElementById('sdbModalManHours').textContent  = rec.man_hours != null ? Number(rec.man_hours).toFixed(2) : '—';
  document.getElementById('sdbModalCT').textContent        = rec.cycle_time != null ? Number(rec.cycle_time).toFixed(2) : '—';
  document.getElementById('sdbModalLhRh').textContent      = rec.lh_rh || '—';

  // Operators
  document.getElementById('sdbModalOp1').textContent = rec.operator1 || '—';
  document.getElementById('sdbModalOp2').textContent = rec.operator2 || '';

  // Time
  document.getElementById('sdbModalStart').textContent   = rec.start_time || '—';
  document.getElementById('sdbModalEnd').textContent     = rec.end_time   || '—';
  document.getElementById('sdbModalBreak').textContent   = rec.break_time   != null ? `${rec.break_time} h`   : '—';
  document.getElementById('sdbModalTrouble').textContent = rec.trouble_time != null ? `${rec.trouble_time} h` : '—';

  // Defects — build cards for all non-fixed keys
  const defectsEl = document.getElementById('sdbModalDefects');
  const defectEntries = Object.entries(rec).filter(([k]) => !SDB_FIXED_KEYS.has(k)).sort((a, b) => a[0].localeCompare(b[0]));
  if (defectEntries.length === 0) {
    document.getElementById('sdbModalDefectsSection').classList.add('hidden');
  } else {
    document.getElementById('sdbModalDefectsSection').classList.remove('hidden');
    defectsEl.innerHTML = defectEntries.map(([k, v]) => {
      const hasDefect = Number(v) > 0;
      return `<div class="rounded-xl border p-3 text-center ${hasDefect ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}">
        <p class="text-xs font-medium ${hasDefect ? 'text-red-700' : 'text-gray-400'} mb-1 truncate" title="${k}">${k}</p>
        <p class="text-2xl font-bold ${hasDefect ? 'text-red-600' : 'text-gray-300'}">${v ?? 0}</p>
      </div>`;
    }).join('');
  }

  // Remarks
  const remarksSection = document.getElementById('sdbModalRemarksSection');
  if (rec.remarks) {
    document.getElementById('sdbModalRemarks').textContent = rec.remarks;
    remarksSection.classList.remove('hidden');
  } else {
    remarksSection.classList.add('hidden');
  }

  // Other description
  const otherSection = document.getElementById('sdbModalOtherSection');
  if (rec.other_description) {
    document.getElementById('sdbModalOther').textContent = rec.other_description;
    otherSection.classList.remove('hidden');
  } else {
    otherSection.classList.add('hidden');
  }

  // Footer
  document.getElementById('sdbModalFrom').textContent = rec.submitted_from ? `送信元: ${rec.submitted_from}` : '';

  document.getElementById('sdbDetailModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSdbDetail(e) {
  // If called from backdrop click, only close if the click was on the backdrop itself
  if (e && e.target !== document.getElementById('sdbDetailModal')) return;
  document.getElementById('sdbDetailModal').classList.add('hidden');
  document.body.style.overflow = '';
}

// --- Init ---
function initializeSubmittedDB() {
  loadSubmittedDB();
}
