// =============================================
// submittedDB.js — Submitted Data Viewer Page
// =============================================

'use strict';

// --- State ---
let _sdbCurrentPage = 1;
let _sdbSortField = 'timestamp';
let _sdbSortDir = 'desc';
let _sdbView = 'active';
let _sdbAllData = [];
let _sdbDebounceTimer = null;
let _sdbSelectedIds = new Set();
let _sdbSelectedRecords = new Map();
let _sdbCounts = { active: 0, trash: 0 };
let _sdbCanPermanentDelete = false;
let _sdbModalRecordId = '';
let _sdbModalEditMode = false;

const SDB_FIXED_KEYS = new Set([
  '_id', 'timestamp', 'date_year', 'date_month', 'date_day',
  'hinban', 'product_name', 'kanban_id', 'hako_iresu', 'lh_rh',
  'operator1', 'operator2', 'good_count', 'man_hours', 'cycle_time',
  'other_description', 'start_time', 'end_time', 'break_time',
  'trouble_time', 'remarks', 'excluded_man_hours', 'submitted_from',
  'is_deleted', 'deleted_at', 'deleted_by', 'deleted_by_role', 'trash_expires_at'
]);

const SDB_EXPORT_ORDER = [
  'timestamp', 'deleted_at', 'trash_expires_at', 'deleted_by', 'deleted_by_role',
  'hinban', 'product_name', 'kanban_id', 'hako_iresu', 'lh_rh',
  'operator1', 'operator2', 'good_count', 'man_hours', 'cycle_time',
  'start_time', 'end_time', 'break_time', 'trouble_time',
  'other_description', 'remarks', 'excluded_man_hours', 'submitted_from', 'is_deleted'
];

const SDB_MODAL_STRING_FIELDS = new Set([
  'hinban', 'product_name', 'kanban_id', 'lh_rh',
  'operator1', 'operator2', 'other_description', 'start_time', 'end_time', 'remarks'
]);

const SDB_MODAL_INTEGER_FIELDS = new Set([
  'good_count', 'hako_iresu'
]);

function sdbDebouncedLoad() {
  clearTimeout(_sdbDebounceTimer);
  _sdbDebounceTimer = setTimeout(() => {
    _sdbCurrentPage = 1;
    sdbResetSelection();
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
    _sdbSortDir = 'desc';
  }

  _sdbCurrentPage = 1;
  loadSubmittedDB();
}

function switchSubmittedDBView(view) {
  if (view !== 'active' && view !== 'trash') return;
  if (_sdbView === view) return;

  _sdbView = view;
  _sdbCurrentPage = 1;
  sdbResetSelection();
  updateSubmittedDBTabs();
  updateSubmittedDBToolbar();
  loadSubmittedDB();
}

function clearSubmittedDBFilters() {
  [
    'sdbFilterStartDate', 'sdbFilterEndDate', 'sdbFilterHinban',
    'sdbFilterKanbanId', 'sdbFilterProductName', 'sdbFilterOperator'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const lhEl = document.getElementById('sdbFilterLhRh');
  const limitEl = document.getElementById('sdbFilterLimit');
  if (lhEl) lhEl.value = 'all';
  if (limitEl) limitEl.value = '100';

  _sdbCurrentPage = 1;
  _sdbSortField = 'timestamp';
  _sdbSortDir = 'desc';
  sdbResetSelection();
  loadSubmittedDB();
}

function sdbToggleSelectAll(checked) {
  _sdbAllData.forEach(record => {
    const recordId = sdbGetRecordId(record);
    if (!recordId) return;

    if (checked) {
      _sdbSelectedIds.add(recordId);
      _sdbSelectedRecords.set(recordId, record);
    } else {
      _sdbSelectedIds.delete(recordId);
      _sdbSelectedRecords.delete(recordId);
    }
  });

  updateSubmittedDBToolbar();
  sdbSyncSelectAllState();
}

function sdbToggleRecordSelection(recordId, checked) {
  const record = _sdbAllData.find(item => sdbGetRecordId(item) === recordId);
  if (!record) return;

  if (checked) {
    _sdbSelectedIds.add(recordId);
    _sdbSelectedRecords.set(recordId, record);
  } else {
    _sdbSelectedIds.delete(recordId);
    _sdbSelectedRecords.delete(recordId);
  }

  updateSubmittedDBToolbar();
  sdbSyncSelectAllState();
}

async function handleSubmittedDBDelete() {
  const selectedIds = Array.from(_sdbSelectedIds);
  if (selectedIds.length === 0) return;

  const isTrashView = _sdbView === 'trash';
  if (isTrashView && !_sdbCanPermanentDelete) {
    alert('完全削除は admin または masterUser ロールのみ可能です');
    return;
  }

  const confirmed = isTrashView
    ? confirm(`選択した ${selectedIds.length} 件を完全削除しますか?\nこの操作は元に戻せません。`)
    : confirm(`選択した ${selectedIds.length} 件をゴミ箱へ移動しますか?`);

  if (!confirmed) return;

  const deleteLabelEl = document.getElementById('submittedDBDeleteBtnLabel');
  const previousLabel = deleteLabelEl ? deleteLabelEl.textContent : '';
  if (deleteLabelEl) {
    deleteLabelEl.textContent = isTrashView ? '削除中...' : '移動中...';
  }

  try {
    const endpoint = isTrashView
      ? '/api/admin/submitted-db/permanent-delete'
      : '/api/admin/submitted-db/soft-delete';

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sdbGetAuthHeaders()
      },
      body: JSON.stringify({ ids: selectedIds })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Delete failed');
    }

    alert(isTrashView
      ? `${result.deletedCount ?? selectedIds.length} 件を完全削除しました`
      : `${result.modifiedCount ?? selectedIds.length} 件をゴミ箱へ移動しました`);

    if (selectedIds.length >= _sdbAllData.length && _sdbCurrentPage > 1) {
      _sdbCurrentPage -= 1;
    }

    sdbResetSelection();
    await loadSubmittedDB();
  } catch (error) {
    console.error('submittedDB delete error:', error);
    alert(`削除エラー: ${error.message}`);
  } finally {
    if (deleteLabelEl) {
      deleteLabelEl.textContent = previousLabel;
    }
    updateSubmittedDBToolbar();
  }
}

async function handleSubmittedDBRestore() {
  if (_sdbView !== 'trash') return;

  const selectedIds = Array.from(_sdbSelectedIds);
  if (selectedIds.length === 0) return;

  const confirmed = confirm(`選択した ${selectedIds.length} 件を復元しますか?`);
  if (!confirmed) return;

  const restoreLabelEl = document.getElementById('submittedDBRestoreBtnLabel');
  const previousLabel = restoreLabelEl ? restoreLabelEl.textContent : '';
  if (restoreLabelEl) {
    restoreLabelEl.textContent = '復元中...';
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/submitted-db/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sdbGetAuthHeaders()
      },
      body: JSON.stringify({ ids: selectedIds })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Restore failed');
    }

    alert(`${result.modifiedCount ?? selectedIds.length} 件を復元しました`);

    if (selectedIds.length >= _sdbAllData.length && _sdbCurrentPage > 1) {
      _sdbCurrentPage -= 1;
    }

    sdbResetSelection();
    await loadSubmittedDB();
  } catch (error) {
    console.error('submittedDB restore error:', error);
    alert(`復元エラー: ${error.message}`);
  } finally {
    if (restoreLabelEl) {
      restoreLabelEl.textContent = previousLabel;
    }
    updateSubmittedDBToolbar();
  }
}

async function exportSubmittedDBCSV() {
  if (_sdbView === 'trash') {
    return;
  }

  try {
    let exportData = Array.from(_sdbSelectedIds)
      .map(id => _sdbSelectedRecords.get(id))
      .filter(Boolean);

    if (exportData.length === 0) {
      const res = await fetch(`${API_URL}/api/admin/submitted-db?${sdbBuildParams({ all: true }).toString()}`, {
        headers: sdbGetAuthHeaders()
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to export submitted data');
      }
      exportData = Array.isArray(result.data) ? result.data : [];
    }

    if (exportData.length === 0) {
      alert('エクスポートするデータがありません');
      return;
    }

    const allKeys = new Set();
    exportData.forEach(record => Object.keys(record).forEach(key => allKeys.add(key)));
    allKeys.delete('_id');

    const dynamicKeys = [...allKeys].filter(key => !SDB_FIXED_KEYS.has(key)).sort();
    const orderedKeys = [...SDB_EXPORT_ORDER.filter(key => allKeys.has(key)), ...dynamicKeys];

    const rows = [
      orderedKeys.map(sdbEscapeCSV).join(','),
      ...exportData.map(record => orderedKeys.map(key => sdbEscapeCSV(record[key] ?? '')).join(','))
    ].join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `submittedDB_${_sdbView}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('submittedDB export error:', error);
    alert(`CSV出力エラー: ${error.message}`);
  }
}

async function loadSubmittedDB() {
  const container = document.getElementById('submittedDBTableContainer');
  if (!container) return;

  container.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center"><i class="ri-loader-4-line animate-spin mr-2"></i>読み込み中...</p>';

  try {
    const res = await fetch(`${API_URL}/api/admin/submitted-db?${sdbBuildParams().toString()}`, {
      headers: sdbGetAuthHeaders()
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to load');
    }

    if (result.totalPages > 0 && _sdbCurrentPage > result.totalPages) {
      _sdbCurrentPage = result.totalPages;
      return loadSubmittedDB();
    }

    _sdbAllData = Array.isArray(result.data) ? result.data : [];
    _sdbCounts = result.counts || { active: 0, trash: 0 };
    _sdbCanPermanentDelete = !!result.canPermanentDelete;

    renderSubmittedDBTable(
      _sdbAllData,
      result.total,
      result.page,
      result.totalPages,
      result.limit,
      result.summary
    );
  } catch (error) {
    console.error('submittedDB load error:', error);
    container.innerHTML = `<p class="text-red-500 text-sm py-8 text-center"><i class="ri-error-warning-line mr-2"></i>エラー: ${sdbEscapeHtml(error.message)}</p>`;
  } finally {
    updateSubmittedDBTabs();
    updateSubmittedDBToolbar();
  }
}

function renderSubmittedDBTable(records, total, page, totalPages, limit, summary) {
  const container = document.getElementById('submittedDBTableContainer');
  const summaryEl = document.getElementById('submittedDBSummary');
  const paginationEl = document.getElementById('submittedDBPagination');
  const pageInfoEl = document.getElementById('submittedDBPageInfo');
  const pageBtnsEl = document.getElementById('submittedDBPageBtns');

  if (!container) return;

  if (summaryEl && summary) {
    const summaryClasses = _sdbView === 'trash'
      ? 'mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm flex flex-wrap gap-4'
      : 'mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex flex-wrap gap-4';
    const accentClass = _sdbView === 'trash' ? 'text-amber-400' : 'text-blue-400';
    const titleClass = _sdbView === 'trash' ? 'text-amber-800' : 'text-blue-800';
    const modeLabel = _sdbView === 'trash' ? 'ゴミ箱' : 'データ一覧';
    const modeIcon = _sdbView === 'trash' ? 'ri-delete-bin-6-line' : 'ri-file-list-3-line';

    summaryEl.className = summaryClasses;
    summaryEl.innerHTML = `
      <span class="font-medium ${titleClass}"><i class="${modeIcon} mr-1"></i>${modeLabel}: <strong>${summary.recordCount}</strong></span>
      <span class="${accentClass}">|</span>
      <span>良品合計: <strong>${summary.totalGoodCount}</strong></span>
      <span class="${accentClass}">|</span>
      <span>工数合計: <strong>${(summary.totalManHours ?? 0).toFixed(2)}</strong> h</span>
      <span class="${accentClass}">|</span>
      <span>休憩合計: <strong>${(summary.totalBreakTime ?? 0).toFixed(2)}</strong> h</span>
      <span class="${accentClass}">|</span>
      <span>トラブル合計: <strong>${(summary.totalTroubleTime ?? 0).toFixed(2)}</strong> h</span>
      <span class="${accentClass} ml-auto text-xs">表示: ${records.length} / ${total} 件</span>
    `;
    summaryEl.classList.remove('hidden');
  }

  if (!records || records.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16">
        <i class="${_sdbView === 'trash' ? 'ri-delete-bin-6-line' : 'ri-file-list-3-line'} text-6xl text-gray-200 mb-4 block"></i>
        <p class="text-gray-400">${_sdbView === 'trash' ? 'ゴミ箱にデータはありません' : '該当するデータがありません'}</p>
      </div>`;

    if (paginationEl) paginationEl.classList.add('hidden');
    sdbSyncSelectAllState();
    return;
  }

  const defectCols = new Set();
  records.forEach(record => Object.keys(record).forEach(key => {
    if (!SDB_FIXED_KEYS.has(key)) defectCols.add(key);
  }));
  const defectColsList = [...defectCols].sort();

  const fixedCols = [
    { key: 'timestamp', label: '日時', fmt: sdbFormatDateTime },
    ...(_sdbView === 'trash'
      ? [
          { key: 'deleted_at', label: '削除日時', fmt: sdbFormatDateTime },
          { key: 'trash_expires_at', label: '自動削除', fmt: sdbFormatDateTime },
          { key: 'deleted_by', label: '削除者' }
        ]
      : []),
    { key: 'hinban', label: '品番' },
    { key: 'product_name', label: '製品名' },
    { key: 'kanban_id', label: '看板ID' },
    { key: 'lh_rh', label: 'LH/RH' },
    { key: 'operator1', label: '作業者①' },
    { key: 'operator2', label: '作業者②' },
    { key: 'good_count', label: '良品数' },
    { key: 'man_hours', label: '工数(h)' },
    { key: 'cycle_time', label: 'CT(min)' },
    { key: 'start_time', label: '開始' },
    { key: 'end_time', label: '終了' },
    { key: 'break_time', label: '休憩(h)' },
    { key: 'trouble_time', label: 'トラブル(h)' }
  ];

  const allCols = [
    ...fixedCols,
    ...defectColsList.map(key => ({ key, label: key, isDefect: true })),
    { key: 'remarks', label: '備考' },
    { key: 'submitted_from', label: '送信元' }
  ];

  const sortIcon = key => {
    if (_sdbSortField !== key) return '<i class="ri-arrow-up-down-line ml-1 text-gray-300"></i>';
    return _sdbSortDir === 'desc'
      ? '<i class="ri-arrow-down-line ml-1 text-blue-500"></i>'
      : '<i class="ri-arrow-up-line ml-1 text-blue-500"></i>';
  };

  const thead = `
    <th class="px-3 py-2 w-12 bg-gray-100 text-center" onclick="event.stopPropagation()">
      <input
        type="checkbox"
        id="sdbSelectAll"
        onchange="sdbToggleSelectAll(this.checked)"
        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      >
    </th>
    ${allCols.map(col => `
      <th onclick="sdbSort('${col.key}')"
          class="px-3 py-2 text-left text-xs font-semibold uppercase whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none ${col.isDefect ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}">
        ${col.label}${sortIcon(col.key)}
      </th>`).join('')}
  `;

  const tbody = records.map((record, idx) => {
    const recordId = sdbGetRecordId(record);
    const checked = recordId && _sdbSelectedIds.has(recordId) ? 'checked' : '';

    const cells = allCols.map(col => {
      let value = record[col.key] ?? '';
      if (col.fmt) value = col.fmt(value);

      if (col.isDefect) {
        const defectCount = Number(record[col.key] ?? 0);
        return defectCount > 0
          ? `<td class="px-3 py-2 text-red-600 font-bold text-center whitespace-nowrap">${defectCount}</td>`
          : '<td class="px-3 py-2 text-center text-gray-300 whitespace-nowrap">0</td>';
      }

      const safeValue = sdbEscapeHtml(value);
      return `<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis" title="${safeValue}">${safeValue}</td>`;
    }).join('');

    return `
      <tr class="hover:bg-blue-50 border-b border-gray-100 cursor-pointer" onclick="openSdbDetail(${idx})">
        <td class="px-3 py-2 text-center" onclick="event.stopPropagation()">
          <input
            type="checkbox"
            class="sdbRowCheckbox rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            value="${recordId}"
            ${checked}
            onchange="sdbToggleRecordSelection('${recordId}', this.checked)"
          >
        </td>
        ${cells}
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="w-full text-sm border-collapse">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  if (paginationEl) {
    if (totalPages <= 1) {
      paginationEl.classList.add('hidden');
    } else {
      paginationEl.classList.remove('hidden');
      if (pageInfoEl) pageInfoEl.textContent = `ページ ${page} / ${totalPages}  （全 ${total} 件）`;
      if (pageBtnsEl) {
        const disabled = cond => cond
          ? 'disabled class="px-2 py-1 rounded border text-sm opacity-30 cursor-not-allowed"'
          : 'class="px-2 py-1 rounded border text-sm hover:bg-gray-100"';

        let btns = '';
        btns += `<button onclick="sdbGoToPage(1)" ${disabled(page === 1)}>«</button>`;
        btns += `<button onclick="sdbGoToPage(${page - 1})" ${disabled(page <= 1)}>‹</button>`;

        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let current = start; current <= end; current += 1) {
          btns += `<button onclick="sdbGoToPage(${current})" class="px-3 py-1 rounded border text-sm ${current === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}">${current}</button>`;
        }

        btns += `<button onclick="sdbGoToPage(${page + 1})" ${disabled(page >= totalPages)}>›</button>`;
        btns += `<button onclick="sdbGoToPage(${totalPages})" ${disabled(page === totalPages)}>»</button>`;
        pageBtnsEl.innerHTML = btns;
      }
    }
  }

  sdbSyncSelectAllState();
}

function sdbBuildParams(options = {}) {
  const { all = false } = options;
  const params = new URLSearchParams();

  const startDate = document.getElementById('sdbFilterStartDate')?.value;
  const endDate = document.getElementById('sdbFilterEndDate')?.value;
  const hinban = document.getElementById('sdbFilterHinban')?.value.trim();
  const kanbanId = document.getElementById('sdbFilterKanbanId')?.value.trim();
  const productName = document.getElementById('sdbFilterProductName')?.value.trim();
  const operator = document.getElementById('sdbFilterOperator')?.value.trim();
  const lhRh = document.getElementById('sdbFilterLhRh')?.value;
  const limit = document.getElementById('sdbFilterLimit')?.value || '100';

  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (hinban) params.set('hinban', hinban);
  if (kanbanId) params.set('kanbanId', kanbanId);
  if (productName) params.set('productName', productName);
  if (operator) params.set('operator', operator);
  if (lhRh && lhRh !== 'all') params.set('lhRh', lhRh);

  params.set('view', _sdbView);
  params.set('sortField', _sdbSortField);
  params.set('sortDir', _sdbSortDir);

  if (all) {
    params.set('all', 'true');
  } else {
    params.set('limit', limit);
    params.set('page', _sdbCurrentPage);
  }

  return params;
}

function sdbGetAuthHeaders() {
  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const token = localStorage.getItem('ksgToken') || '';
  const headers = {};

  if (currentUser.username) headers['x-session-user'] = currentUser.username;
  if (currentUser.role) headers['x-session-role'] = currentUser.role;
  if (currentUser.dbName) headers['x-session-db-name'] = currentUser.dbName;
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

function sdbResetSelection() {
  _sdbSelectedIds = new Set();
  _sdbSelectedRecords = new Map();
  updateSubmittedDBToolbar();
  sdbSyncSelectAllState();
}

function sdbGetRecordId(record) {
  if (!record || record._id === null || record._id === undefined) return '';
  if (typeof record._id === 'string') return record._id;
  if (typeof record._id === 'object' && record._id.$oid) return record._id.$oid;

  const stringValue = String(record._id);
  return stringValue === '[object Object]' ? '' : stringValue;
}

function sdbSyncSelectAllState() {
  const selectAllCheckbox = document.getElementById('sdbSelectAll');
  if (!selectAllCheckbox) return;

  const currentPageIds = _sdbAllData.map(sdbGetRecordId).filter(Boolean);
  const selectedOnPage = currentPageIds.filter(id => _sdbSelectedIds.has(id)).length;

  selectAllCheckbox.checked = currentPageIds.length > 0 && selectedOnPage === currentPageIds.length;
  selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < currentPageIds.length;
}

function updateSubmittedDBTabs() {
  const activeTab = document.getElementById('sdbTabActive');
  const trashTab = document.getElementById('sdbTabTrash');
  const activeBadge = document.getElementById('sdbActiveCountBadge');
  const trashBadge = document.getElementById('sdbTrashCountBadge');

  if (activeBadge) activeBadge.textContent = _sdbCounts.active ?? 0;
  if (trashBadge) trashBadge.textContent = _sdbCounts.trash ?? 0;

  if (activeTab) {
    activeTab.className = _sdbView === 'active'
      ? 'inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors'
      : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700';
  }

  if (trashTab) {
    trashTab.className = _sdbView === 'trash'
      ? 'inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors'
      : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700';
  }
}

function updateSubmittedDBToolbar() {
  const restoreBtn = document.getElementById('submittedDBRestoreBtn');
  const restoreLabel = document.getElementById('submittedDBRestoreBtnLabel');
  const deleteBtn = document.getElementById('submittedDBDeleteBtn');
  const deleteLabel = document.getElementById('submittedDBDeleteBtnLabel');
  const exportBtn = document.getElementById('submittedDBExportBtn');
  const exportLabel = document.getElementById('submittedDBExportBtnLabel');
  const selectionStatus = document.getElementById('submittedDBSelectionStatus');
  const selectedCount = _sdbSelectedIds.size;
  const isTrashView = _sdbView === 'trash';
  const deleteAllowed = selectedCount > 0 && (!isTrashView || _sdbCanPermanentDelete);
  const restoreAllowed = isTrashView && selectedCount > 0;

  if (restoreBtn) {
    restoreBtn.classList.toggle('hidden', !isTrashView);
    restoreBtn.disabled = !restoreAllowed;
    restoreBtn.className = `${isTrashView ? 'flex' : 'hidden'} items-center gap-2 rounded-lg px-4 py-2 text-sm ${restoreAllowed ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-gray-200 text-gray-400 opacity-50 cursor-not-allowed'}`;
  }

  if (restoreLabel) {
    restoreLabel.textContent = selectedCount > 0 ? `復元 (${selectedCount})` : '復元';
  }

  if (deleteLabel) {
    if (isTrashView && !_sdbCanPermanentDelete) {
      deleteLabel.textContent = '完全削除 (Admin / MasterUser)';
    } else if (isTrashView) {
      deleteLabel.textContent = selectedCount > 0 ? `完全削除 (${selectedCount})` : '完全削除';
    } else {
      deleteLabel.textContent = selectedCount > 0 ? `削除 (${selectedCount})` : '削除';
    }
  }

  if (deleteBtn) {
    deleteBtn.disabled = !deleteAllowed;
    deleteBtn.className = deleteAllowed
      ? 'flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700'
      : 'flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-400 opacity-50 cursor-not-allowed';
  }

  if (exportBtn) {
    exportBtn.disabled = isTrashView;
    exportBtn.className = isTrashView
      ? 'flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-400 opacity-50 cursor-not-allowed'
      : 'flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700';
  }

  if (exportLabel) {
    exportLabel.textContent = isTrashView
      ? 'CSV出力不可'
      : (selectedCount > 0 ? `選択CSV出力 (${selectedCount})` : 'CSV出力');
  }

  if (selectionStatus) {
    if (selectedCount > 0) {
      selectionStatus.textContent = `${selectedCount}件選択中`;
      selectionStatus.classList.remove('hidden');
    } else {
      selectionStatus.textContent = '';
      selectionStatus.classList.add('hidden');
    }
  }
}

function sdbFormatDateTime(value) {
  return value ? new Date(value).toLocaleString('ja-JP') : '';
}

function sdbEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sdbEscapeCSV(value) {
  const stringValue = String(value ?? '');
  return (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n'))
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function sdbIsModalEditableRecord(record) {
  return !!record && _sdbView === 'active' && !record.is_deleted;
}

function sdbGetModalRecord() {
  if (!_sdbModalRecordId) return null;
  return _sdbAllData.find(record => sdbGetRecordId(record) === _sdbModalRecordId) || null;
}

function sdbSetModalElementContent(elementId, value, { html = false } = {}) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (html) {
    element.innerHTML = value;
  } else {
    element.textContent = value;
  }
}

function sdbBuildModalInput(fieldKey, value, options = {}) {
  const {
    type = 'text',
    placeholder = '',
    step,
    min,
    integer = false,
    className = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'
  } = options;

  const attrs = [
    `type="${type}"`,
    `data-sdb-field="${sdbEscapeHtml(fieldKey)}"`,
    `data-sdb-value-type="${type === 'number' ? 'number' : 'text'}"`,
    `class="${className}"`,
    `value="${sdbEscapeHtml(value ?? '')}"`,
    `placeholder="${sdbEscapeHtml(placeholder)}"`
  ];

  if (step != null) attrs.push(`step="${step}"`);
  if (min != null) attrs.push(`min="${min}"`);
  if (integer) attrs.push('data-sdb-integer="true"');

  return `<input ${attrs.join(' ')}>`;
}

function sdbBuildModalTextarea(fieldKey, value, options = {}) {
  const {
    rows = 3,
    placeholder = '',
    className = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y'
  } = options;

  return `<textarea data-sdb-field="${sdbEscapeHtml(fieldKey)}" data-sdb-value-type="text" rows="${rows}" placeholder="${sdbEscapeHtml(placeholder)}" class="${className}">${sdbEscapeHtml(value ?? '')}</textarea>`;
}

function sdbBuildModalSelect(fieldKey, value, choices, options = {}) {
  const className = options.className || 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const selectValue = String(value ?? '');
  const choiceMarkup = choices.map(choice => {
    const optionValue = String(choice.value ?? '');
    const selected = optionValue === selectValue ? 'selected' : '';
    return `<option value="${sdbEscapeHtml(optionValue)}" ${selected}>${sdbEscapeHtml(choice.label)}</option>`;
  }).join('');

  return `<select data-sdb-field="${sdbEscapeHtml(fieldKey)}" data-sdb-value-type="text" class="${className}">${choiceMarkup}</select>`;
}

function sdbUpdateModalActions(record) {
  const editBtn = document.getElementById('sdbModalEditBtn');
  const saveBtn = document.getElementById('sdbModalSaveBtn');
  const cancelBtn = document.getElementById('sdbModalCancelBtn');
  const deleteBtn = document.getElementById('sdbModalDeleteBtn');
  const editableRecord = sdbIsModalEditableRecord(record);
  const isEditing = editableRecord && _sdbModalEditMode;

  if (editBtn) editBtn.classList.toggle('hidden', !editableRecord || isEditing);
  if (saveBtn) saveBtn.classList.toggle('hidden', !isEditing);
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !isEditing);
  if (deleteBtn) deleteBtn.classList.toggle('hidden', !isEditing);
}

function sdbRenderModalDefects(record, isEditing) {
  const defectsEl = document.getElementById('sdbModalDefects');
  const defectSection = document.getElementById('sdbModalDefectsSection');
  const defectEntries = Object.entries(record)
    .filter(([key]) => !SDB_FIXED_KEYS.has(key))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (!defectSection || !defectsEl) return;

  if (defectEntries.length === 0) {
    defectSection.classList.add('hidden');
    defectsEl.innerHTML = '';
    return;
  }

  defectSection.classList.remove('hidden');
  defectsEl.innerHTML = defectEntries.map(([key, value]) => {
    const defectCount = Number(value ?? 0);
    const hasDefect = defectCount > 0;

    if (isEditing) {
      return `<label class="rounded-xl border p-3 ${hasDefect ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}">
        <span class="mb-2 block truncate text-xs font-medium ${hasDefect ? 'text-red-700' : 'text-gray-500'}" title="${sdbEscapeHtml(key)}">${sdbEscapeHtml(key)}</span>
        ${sdbBuildModalInput(key, defectCount, {
          type: 'number',
          min: '0',
          step: '1',
          integer: true,
          className: `w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-2xl font-bold shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${hasDefect ? 'text-red-600' : 'text-gray-500'}`
        })}
      </label>`;
    }

    return `<div class="rounded-xl border p-3 text-center ${hasDefect ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}">
      <p class="text-xs font-medium ${hasDefect ? 'text-red-700' : 'text-gray-400'} mb-1 truncate" title="${sdbEscapeHtml(key)}">${sdbEscapeHtml(key)}</p>
      <p class="text-2xl font-bold ${hasDefect ? 'text-red-600' : 'text-gray-300'}">${defectCount}</p>
    </div>`;
  }).join('');
}

function sdbRenderModal(record) {
  if (!record) return;

  const editableRecord = sdbIsModalEditableRecord(record);
  const isEditing = editableRecord && _sdbModalEditMode;
  const timestamp = record.timestamp ? new Date(record.timestamp).toLocaleString('ja-JP') : '';
  const textInputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const metricInputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-2xl font-bold shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

  sdbSetModalElementContent('sdbModalDate', timestamp);

  if (isEditing) {
    sdbSetModalElementContent('sdbModalTitle', sdbBuildModalInput('product_name', record.product_name, {
      placeholder: '製品名',
      className: 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xl font-bold text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'
    }), { html: true });
    sdbSetModalElementContent('sdbModalSub', `
      <span class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label class="text-xs text-gray-400">
          <span class="mb-1 block">品番</span>
          ${sdbBuildModalInput('hinban', record.hinban, { placeholder: '品番', className: textInputClass })}
        </label>
        <label class="text-xs text-gray-400">
          <span class="mb-1 block">看板ID</span>
          ${sdbBuildModalInput('kanban_id', record.kanban_id, { placeholder: '看板ID', className: textInputClass })}
        </label>
      </span>
    `, { html: true });
  } else {
    sdbSetModalElementContent('sdbModalTitle', record.product_name || '—');
    sdbSetModalElementContent('sdbModalSub', [record.hinban, record.kanban_id].filter(Boolean).join('  /  '));
  }

  sdbSetModalElementContent('sdbModalGood', isEditing
    ? sdbBuildModalInput('good_count', record.good_count ?? 0, { type: 'number', min: '0', step: '1', integer: true, className: `${metricInputClass} text-green-600` })
    : String(record.good_count ?? '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalManHours', isEditing
    ? sdbBuildModalInput('man_hours', record.man_hours ?? 0, { type: 'number', min: '0', step: '0.01', className: `${metricInputClass} text-blue-600` })
    : (record.man_hours != null ? Number(record.man_hours).toFixed(2) : '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalCT', isEditing
    ? sdbBuildModalInput('cycle_time', record.cycle_time ?? 0, { type: 'number', min: '0', step: '0.01', className: `${metricInputClass} text-purple-600` })
    : (record.cycle_time != null ? Number(record.cycle_time).toFixed(2) : '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalLhRh', isEditing
    ? sdbBuildModalSelect('lh_rh', record.lh_rh, [
        { value: '', label: '—' },
        { value: 'LH', label: 'LH' },
        { value: 'RH', label: 'RH' }
      ], { className: `${metricInputClass} text-gray-700` })
    : (record.lh_rh || '—'), { html: isEditing });

  sdbSetModalElementContent('sdbModalOp1', isEditing
    ? sdbBuildModalInput('operator1', record.operator1, { placeholder: '作業者①', className: textInputClass })
    : (record.operator1 || '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalOp2', isEditing
    ? sdbBuildModalInput('operator2', record.operator2, { placeholder: '作業者②', className: textInputClass })
    : (record.operator2 || ''), { html: isEditing });

  sdbSetModalElementContent('sdbModalStart', isEditing
    ? sdbBuildModalInput('start_time', record.start_time, { placeholder: 'HH:MM', className: textInputClass })
    : (record.start_time || '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalEnd', isEditing
    ? sdbBuildModalInput('end_time', record.end_time, { placeholder: 'HH:MM', className: textInputClass })
    : (record.end_time || '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalBreak', isEditing
    ? sdbBuildModalInput('break_time', record.break_time ?? 0, { type: 'number', min: '0', step: '0.01', className: textInputClass })
    : (record.break_time != null ? `${record.break_time} h` : '—'), { html: isEditing });
  sdbSetModalElementContent('sdbModalTrouble', isEditing
    ? sdbBuildModalInput('trouble_time', record.trouble_time ?? 0, { type: 'number', min: '0', step: '0.01', className: textInputClass })
    : (record.trouble_time != null ? `${record.trouble_time} h` : '—'), { html: isEditing });

  sdbRenderModalDefects(record, isEditing);

  const remarksSection = document.getElementById('sdbModalRemarksSection');
  if (remarksSection) {
    if (isEditing || record.remarks) {
      remarksSection.classList.remove('hidden');
      sdbSetModalElementContent('sdbModalRemarks', isEditing
        ? sdbBuildModalTextarea('remarks', record.remarks, { rows: 3, placeholder: '備考を入力', className: textInputClass })
        : (record.remarks || ''), { html: isEditing });
    } else {
      remarksSection.classList.add('hidden');
    }
  }

  const otherSection = document.getElementById('sdbModalOtherSection');
  if (otherSection) {
    if (isEditing || record.other_description) {
      otherSection.classList.remove('hidden');
      sdbSetModalElementContent('sdbModalOther', isEditing
        ? sdbBuildModalTextarea('other_description', record.other_description, { rows: 3, placeholder: 'その他詳細を入力', className: textInputClass })
        : (record.other_description || ''), { html: isEditing });
    } else {
      otherSection.classList.add('hidden');
    }
  }

  const footerBits = [];
  if (record.submitted_from) footerBits.push(`送信元: ${record.submitted_from}`);
  if (record.is_deleted) {
    const deletedAt = record.deleted_at ? new Date(record.deleted_at).toLocaleString('ja-JP') : '';
    footerBits.push(`削除: ${deletedAt}${record.deleted_by ? ` / ${record.deleted_by}` : ''}`);
    if (record.trash_expires_at) {
      footerBits.push(`自動削除: ${new Date(record.trash_expires_at).toLocaleString('ja-JP')}`);
    }
  }
  sdbSetModalElementContent('sdbModalFrom', footerBits.join('  |  '));

  sdbUpdateModalActions(record);
  document.getElementById('sdbDetailModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function sdbCollectModalUpdates() {
  const modal = document.getElementById('sdbDetailModal');
  const fields = modal ? modal.querySelectorAll('[data-sdb-field]') : [];
  const updates = {};

  fields.forEach(field => {
    const key = field.dataset.sdbField;
    if (!key) return;

    if ((field.dataset.sdbValueType || 'text') === 'number' && !SDB_MODAL_STRING_FIELDS.has(key)) {
      const rawValue = field.value.trim();
      if (rawValue === '') {
        updates[key] = 0;
        return;
      }

      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) {
        throw new Error(`${key} の値が不正です`);
      }

      updates[key] = field.dataset.sdbInteger === 'true' || SDB_MODAL_INTEGER_FIELDS.has(key)
        ? Math.trunc(parsedValue)
        : parsedValue;
      return;
    }

    updates[key] = field.value.trim();
  });

  return updates;
}

function sdbReplaceCachedRecord(updatedRecord) {
  const recordId = sdbGetRecordId(updatedRecord);
  if (!recordId) return;

  const recordIndex = _sdbAllData.findIndex(record => sdbGetRecordId(record) === recordId);
  if (recordIndex !== -1) {
    _sdbAllData[recordIndex] = updatedRecord;
  }

  if (_sdbSelectedRecords.has(recordId)) {
    _sdbSelectedRecords.set(recordId, updatedRecord);
  }
}

function openSdbDetail(idx) {
  const record = _sdbAllData[idx];
  if (!record) return;

  _sdbModalRecordId = sdbGetRecordId(record);
  _sdbModalEditMode = false;
  sdbRenderModal(record);
}

function handleSdbModalEdit() {
  const record = sdbGetModalRecord();
  if (!sdbIsModalEditableRecord(record)) return;

  _sdbModalEditMode = true;
  sdbRenderModal(record);
}

function handleSdbModalCancel() {
  const record = sdbGetModalRecord();
  if (!record) return;

  _sdbModalEditMode = false;
  sdbRenderModal(record);
}

async function handleSdbModalSave() {
  const record = sdbGetModalRecord();
  if (!sdbIsModalEditableRecord(record) || !_sdbModalEditMode) return;

  const recordId = sdbGetRecordId(record);
  if (!recordId) return;

  let updates;
  try {
    updates = sdbCollectModalUpdates();
  } catch (error) {
    alert(error.message);
    return;
  }

  const saveBtn = document.getElementById('sdbModalSaveBtn');
  const cancelBtn = document.getElementById('sdbModalCancelBtn');
  const deleteBtn = document.getElementById('sdbModalDeleteBtn');
  const previousSaveLabel = saveBtn ? saveBtn.textContent : '';

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }
  if (cancelBtn) cancelBtn.disabled = true;
  if (deleteBtn) deleteBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/admin/submitted-db/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...sdbGetAuthHeaders()
      },
      body: JSON.stringify({ updates })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Update failed');
    }

    if (result.data) {
      sdbReplaceCachedRecord(result.data);
    }

    _sdbModalEditMode = false;
    await loadSubmittedDB();

    const refreshedRecord = sdbGetModalRecord();
    if (refreshedRecord) {
      sdbRenderModal(refreshedRecord);
    } else {
      closeSdbDetail();
    }

    alert('データを更新しました');
  } catch (error) {
    console.error('submittedDB update error:', error);
    alert(`更新エラー: ${error.message}`);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = previousSaveLabel || '保存';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
  }
}

async function handleSdbModalDelete() {
  const record = sdbGetModalRecord();
  if (!sdbIsModalEditableRecord(record) || !_sdbModalEditMode) return;

  const recordId = sdbGetRecordId(record);
  if (!recordId) return;

  const confirmed = confirm('このデータをゴミ箱へ移動しますか?');
  if (!confirmed) return;

  const deleteBtn = document.getElementById('sdbModalDeleteBtn');
  const saveBtn = document.getElementById('sdbModalSaveBtn');
  const cancelBtn = document.getElementById('sdbModalCancelBtn');
  const previousDeleteLabel = deleteBtn ? deleteBtn.textContent : '';

  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = '移動中...';
  }
  if (saveBtn) saveBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/admin/submitted-db/soft-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sdbGetAuthHeaders()
      },
      body: JSON.stringify({ ids: [recordId] })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Delete failed');
    }

    _sdbSelectedIds.delete(recordId);
    _sdbSelectedRecords.delete(recordId);
    _sdbModalEditMode = false;
    closeSdbDetail();
    await loadSubmittedDB();
    updateSubmittedDBToolbar();
    alert('データをゴミ箱へ移動しました');
  } catch (error) {
    console.error('submittedDB modal delete error:', error);
    alert(`削除エラー: ${error.message}`);
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.textContent = previousDeleteLabel || '削除';
    }
    if (saveBtn) saveBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

function closeSdbDetail(e) {
  if (e && e.target !== document.getElementById('sdbDetailModal')) return;
  if (_sdbModalEditMode && !confirm('編集中の変更を破棄して閉じますか?')) return;

  _sdbModalEditMode = false;
  _sdbModalRecordId = '';
  document.getElementById('sdbDetailModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function initializeSubmittedDB() {
  _sdbCurrentPage = 1;
  _sdbSortField = 'timestamp';
  _sdbSortDir = 'desc';
  _sdbView = 'active';
  _sdbAllData = [];
  _sdbCounts = { active: 0, trash: 0 };
  _sdbCanPermanentDelete = false;
  _sdbModalRecordId = '';
  _sdbModalEditMode = false;
  sdbResetSelection();
  updateSubmittedDBTabs();
  updateSubmittedDBToolbar();
  loadSubmittedDB();
}

window.sdbDebouncedLoad = sdbDebouncedLoad;
window.sdbGoToPage = sdbGoToPage;
window.sdbSort = sdbSort;
window.switchSubmittedDBView = switchSubmittedDBView;
window.clearSubmittedDBFilters = clearSubmittedDBFilters;
window.sdbToggleSelectAll = sdbToggleSelectAll;
window.sdbToggleRecordSelection = sdbToggleRecordSelection;
window.handleSubmittedDBRestore = handleSubmittedDBRestore;
window.handleSubmittedDBDelete = handleSubmittedDBDelete;
window.exportSubmittedDBCSV = exportSubmittedDBCSV;
window.handleSdbModalEdit = handleSdbModalEdit;
window.handleSdbModalCancel = handleSdbModalCancel;
window.handleSdbModalSave = handleSdbModalSave;
window.handleSdbModalDelete = handleSdbModalDelete;
window.openSdbDetail = openSdbDetail;
window.closeSdbDetail = closeSdbDetail;
window.initializeSubmittedDB = initializeSubmittedDB;
