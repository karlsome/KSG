// masterDB.js for KSG - Enhanced with modals, checkboxes, and activity logging

// ====================
// OPC UA Configuration Management
// ====================
let opcuaDevicesCache = [];

async function loadOpcua() {
    try {
        const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
        const response = await fetch(`${API_URL}/api/opcua/admin/raspberries`, {
            headers: { 'x-session-user': currentUser.username || 'admin' }
        });
        const data = await response.json();
        
        if (data.success) {
            opcuaDevicesCache = data.raspberries;
            renderOpcuaTable();
        } else {
            console.error('Failed to load OPC UA devices');
        }
    } catch (error) {
        console.error('Error loading OPC UA devices:', error);
    }
}

function renderOpcuaTable() {
    const container = document.getElementById('opcuaTableContainer');
    
    if (!opcuaDevicesCache || opcuaDevicesCache.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="ri-node-tree text-4xl mb-3 block text-gray-300"></i>
                <p class="text-sm font-medium">No OPC UA devices configured.</p>
                <button onclick="showOpcuaAddModal()" class="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer">
                    <i class="ri-add-line"></i> Add OPC UA Device
                </button>
            </div>
        `;
        return;
    }

    let html = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-sm font-semibold text-gray-900">OPC UA Devices</h3>
            <button onclick="showOpcuaAddModal()" class="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer">
                <i class="ri-add-line"></i> Add Device
            </button>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
            <table class="min-w-full divide-y divide-gray-100 text-xs">
                <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
                    <tr>
                        <th class="px-3 py-2 select-none whitespace-nowrap">Device ID</th>
                        <th class="px-3 py-2 select-none whitespace-nowrap">Name</th>
                        <th class="px-3 py-2 select-none whitespace-nowrap">Server IP</th>
                        <th class="px-3 py-2 select-none whitespace-nowrap">Port</th>
                        <th class="px-3 py-2 select-none whitespace-nowrap">Poll (ms)</th>
                        <th class="px-3 py-2 select-none whitespace-nowrap">Status</th>
                        <th class="px-3 py-2 text-right select-none whitespace-nowrap">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
    `;

    opcuaDevicesCache.forEach(device => {
        const isOnline = device.status === 'online';
        const statusBadge = isOnline 
            ? `<span class="inline-flex items-center rounded-lg px-2 py-0.5 text-2xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">online</span>`
            : `<span class="inline-flex items-center rounded-lg px-2 py-0.5 text-2xs font-medium bg-gray-100 text-gray-600 border border-gray-200">${device.status || 'offline'}</span>`;
        
        html += `
            <tr class="hover:bg-gray-50/70 transition">
                <td class="px-3 py-2 font-mono font-semibold text-gray-900 text-xs whitespace-nowrap">${device.raspberryId}</td>
                <td class="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">${device.raspberryName}</td>
                <td class="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">${device.opcua_server_ip}</td>
                <td class="px-3 py-2 tabular-nums text-gray-600 whitespace-nowrap">${device.opcua_server_port}</td>
                <td class="px-3 py-2 tabular-nums text-gray-600 whitespace-nowrap">${device.poll_interval}</td>
                <td class="px-3 py-2 whitespace-nowrap">
                    ${statusBadge}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                    <div class="flex justify-end gap-1">
                        <button onclick="editOpcuaDevice('${device.raspberryId}')" class="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition" title="Edit">
                            <i class="ri-edit-line text-sm"></i>
                        </button>
                        <button onclick="deleteOpcuaDevice('${device.raspberryId}')" class="p-1 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Delete">
                            <i class="ri-delete-bin-line text-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

async function showOpcuaAddModal() {
    currentModalType = 'opcua';
    isEditMode = true; // force edit mode for new items
    
    document.getElementById('modalTitle').textContent = 'Add OPC UA Device';
    document.getElementById('modalTabHistory').classList.add('hidden'); // Hide history tab for new items
    document.getElementById('modalEditBtn').classList.add('hidden');
    document.getElementById('modalSaveBtn').classList.remove('hidden');
    document.getElementById('modalCancelBtn').classList.remove('hidden');
    
    // Fetch available devices from deviceInfo to populate dropdown
    let availableDevices = [];
    try {
        const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
        const company = currentUser.dbName || "KSG";
        const response = await fetch(`${API_URL}/api/deviceInfo?company=${company}`);
        const data = await response.json();
        if (data.success) {
            availableDevices = data.devices || [];
        }
    } catch (e) {
        console.error('Failed to load device info', e);
    }
    
    let deviceOptions = availableDevices.map(d => 
        `<option value="${d.device_id}" data-name="${d.device_name}">${d.device_name} (${d.device_id})</option>`
    ).join('');
    
    const bodyHTML = `
        <form id="opcuaAddForm" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Select Raspberry Pi Device *</label>
                <select id="opcuaDeviceId" class="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" required>
                    <option value="">-- Select Device --</option>
                    ${deviceOptions}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Device Name *</label>
                <input type="text" id="opcuaDeviceName" class="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" required placeholder="ksg3">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">OPC UA Server IP *</label>
                <input type="text" id="opcuaServerIp" class="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" required placeholder="192.168.0.77">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">OPC UA Server Port *</label>
                <input type="number" id="opcuaServerPort" class="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" value="4840" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Poll Interval (ms)</label>
                <input type="number" id="opcuaPollInterval" class="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" value="5000" min="1000">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Connection Timeout (ms)</label>
                <input type="number" id="opcuaTimeout" class="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" value="60000">
            </div>
            <input type="hidden" id="opcuaIsNew" value="true">
        </form>
    `;
    
    document.getElementById('modalDetailsBody').innerHTML = bodyHTML;
    
    // Auto-fill device name when selecting from dropdown
    document.getElementById('opcuaDeviceId').addEventListener('change', (e) => {
        const option = e.target.options[e.target.selectedIndex];
        if (option && option.dataset.name) {
            document.getElementById('opcuaDeviceName').value = option.dataset.name;
        }
    });
    
    document.getElementById('detailModal').classList.remove('hidden');
    switchModalTab('details');
}

async function editOpcuaDevice(raspberryId) {
    const device = opcuaDevicesCache.find(d => d.raspberryId === raspberryId);
    if (!device) return;
    
    currentModalType = 'opcua';
    currentRecordId = raspberryId;
    isEditMode = false;
    
    document.getElementById('modalTitle').textContent = `Edit OPC UA: ${device.raspberryName}`;
    document.getElementById('modalTabHistory').classList.add('hidden');
    document.getElementById('modalEditBtn').classList.remove('hidden');
    document.getElementById('modalSaveBtn').classList.add('hidden');
    document.getElementById('modalCancelBtn').classList.add('hidden');
    
    const bodyHTML = `
        <form id="opcuaEditForm" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Device ID (Read-only)</label>
                <input type="text" id="opcuaDeviceId" class="w-full border border-gray-300 rounded-lg shadow-sm bg-gray-50 px-3 py-2" value="${device.raspberryId}" disabled>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Device Name *</label>
                <input type="text" id="opcuaDeviceName" class="w-full border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 px-3 py-2" value="${device.raspberryName}" disabled required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">OPC UA Server IP *</label>
                <input type="text" id="opcuaServerIp" class="w-full border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 px-3 py-2" value="${device.opcua_server_ip}" disabled required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">OPC UA Server Port *</label>
                <input type="number" id="opcuaServerPort" class="w-full border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 px-3 py-2" value="${device.opcua_server_port}" disabled required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Poll Interval (ms)</label>
                <input type="number" id="opcuaPollInterval" class="w-full border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 px-3 py-2" value="${device.poll_interval || 5000}" disabled min="1000">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Connection Timeout (ms)</label>
                <input type="number" id="opcuaTimeout" class="w-full border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 px-3 py-2" value="${device.connection_timeout || 60000}" disabled>
            </div>
            <input type="hidden" id="opcuaIsNew" value="false">
        </form>
    `;
    
    document.getElementById('modalDetailsBody').innerHTML = bodyHTML;
    document.getElementById('detailModal').classList.remove('hidden');
    switchModalTab('details');
}

async function saveOpcuaModal() {
    const isNew = document.getElementById('opcuaIsNew').value === 'true';
    const raspberryId = document.getElementById('opcuaDeviceId').value;
    const raspberryName = document.getElementById('opcuaDeviceName').value;
    const opcua_ip = document.getElementById('opcuaServerIp').value;
    const opcua_port = document.getElementById('opcuaServerPort').value;
    const poll_interval = document.getElementById('opcuaPollInterval').value;
    const timeout = document.getElementById('opcuaTimeout').value;
    
    if (!raspberryId || !opcua_ip || !opcua_port) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    
    const payload = {
        raspberryId,
        raspberryName,
        opcua_server_ip: opcua_ip,
        opcua_server_port: parseInt(opcua_port, 10),
        poll_interval: parseInt(poll_interval, 10),
        timeout: parseInt(timeout, 10)
    };
    
    try {
        const url = `${API_URL}/api/opcua/admin/raspberry`;
        const method = 'POST';
            
        const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
        
        const response = await fetch(url, {
            method,
            headers: { 
                'Content-Type': 'application/json',
                'x-session-user': currentUser.username || 'admin'
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.success) {
            showToast(`OPC UA Device ${isNew ? 'added' : 'updated'} successfully`, 'success');
            closeDetailModal();
            loadOpcua();
        } else {
            showToast(result.error || 'Failed to save', 'error');
        }
    } catch (e) {
        console.error('Error saving OPC UA config', e);
        showToast('Network error', 'error');
    }
}

async function deleteOpcuaDevice(raspberryId) {
    if (!confirm('Are you sure you want to remove this OPC UA device configuration?')) return;
    
    try {
        const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
        const response = await fetch(`${API_URL}/api/opcua/admin/raspberry/${raspberryId}`, {
            method: 'DELETE',
            headers: { 'x-session-user': currentUser.username || 'admin' }
        });
        const result = await response.json();
        if (result.success) {
            showToast('Device deleted successfully', 'success');
            loadOpcua();
        } else {
            showToast(result.error || 'Failed to delete', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    }
}

let currentTab = 'master';
let currentSubTab = 'data';
let masterSearchQuery = '';
let masterSortField = '';
let masterSortOrder = 'asc';
let allMasterData = [];
let allFactories = [];
let allEquipment = [];
let allRoles = [];
let allDepartments = [];
let allSections = [];
let allTablets = [];
let allNGGroups = [];
let allGoogleSheetTargets = [];
let selectedItems = [];
let currentModalData = null;
let currentModalType = null;
let isEditMode = false;
let currentGoogleSheetInspection = null;
let currentGoogleSheetAnalysis = null;
let currentGoogleSheetEditTargetId = '';
let googleSheetServiceAccountInfo = { configured: false, serviceAccountEmail: '' };

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fallback for showToast since masterDB.html does not include a toast element
function showToast(message, type = 'info') {
  alert(message);
}

// ====================
// Language Change Listener
// ====================
window.addEventListener('languageChanged', () => {
  // Reload the current tab data to refresh all rendered strings
  loadTabData(currentTab);
  // Also reload history if the history sub-tab is active
  if (currentSubTab === 'history') {
    loadActivityHistory(currentTab);
  }
});

// ====================
// Tab Switching Functions
// ====================
function switchMainTab(tabName) {
  // Hide all content
  document.getElementById('contentMaster').classList.add('hidden');
  document.getElementById('contentMasterNG').classList.add('hidden');
  document.getElementById('contentFactory').classList.add('hidden');
  document.getElementById('contentEquipment').classList.add('hidden');
  document.getElementById('contentRoles').classList.add('hidden');
  document.getElementById('contentDepartment').classList.add('hidden');
  document.getElementById('contentSection').classList.add('hidden');
  document.getElementById('contentRpiServer').classList.add('hidden');
  document.getElementById('contentTablet').classList.add('hidden');
  document.getElementById('contentGoogleSheets').classList.add('hidden');
  document.getElementById('contentOpcua').classList.add('hidden');

  // Remove active class from all tabs
  const tabIds = [
    'tabMaster', 'tabMasterNG', 'tabFactory', 'tabEquipment',
    'tabRoles', 'tabDepartment', 'tabSection', 'tabRpiServer',
    'tabTablet', 'tabGoogleSheets', 'tabOpcua'
  ];
  tabIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('bg-gray-100', 'text-gray-900', 'font-semibold', 'shadow-xs', 'tab-active', 'border-blue-600', 'text-blue-600');
      el.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-50', 'font-medium');
    }
  });

  // Show selected content and activate tab
  currentTab = tabName;
  currentSubTab = 'data'; // Reset to data tab
  document.getElementById(`content${capitalizeFirst(tabName)}`).classList.remove('hidden');
  
  const activeTabEl = document.getElementById(`tab${capitalizeFirst(tabName)}`);
  if (activeTabEl) {
    activeTabEl.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-50', 'border-transparent');
    activeTabEl.classList.add('bg-gray-100', 'text-gray-900', 'font-semibold', 'shadow-xs', 'tab-active');
  }

  // Reset sub-tab buttons (if they exist)
  if (tabName !== 'rpiServer' && tabName !== 'masterNG' && tabName !== 'googleSheets') {
    switchSubTab(tabName, 'data');
  }

  // Disable/enable 新規登録 button based on tab
  const quickCreateBtn = document.querySelector('button[onclick="showQuickCreateModal()"]');
  if (quickCreateBtn) {
    if (tabName === 'rpiServer' || tabName === 'masterNG' || tabName === 'googleSheets' || tabName === 'opcua') {
      quickCreateBtn.disabled = true;
      quickCreateBtn.classList.add('opacity-50', 'cursor-not-allowed');
      quickCreateBtn.classList.remove('hover:bg-emerald-700', 'hover:bg-green-700');
    } else {
      quickCreateBtn.disabled = false;
      quickCreateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      quickCreateBtn.classList.add('hover:bg-emerald-700');
    }
  }

  // Load data for the tab
  loadTabData(tabName);
}

function switchSubTab(tabName, subTab) {
  currentSubTab = subTab;
  
  // Update button styles
  const dataBtn = document.getElementById(`${tabName}SubTabData`);
  const historyBtn = document.getElementById(`${tabName}SubTabHistory`);
  
  const activeClass = 'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold bg-white text-gray-900 shadow-2xs transition cursor-pointer';
  const inactiveClass = 'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition cursor-pointer';

  if (subTab === 'data') {
    if (dataBtn) dataBtn.className = activeClass;
    if (historyBtn) historyBtn.className = inactiveClass;
    const dataContent = document.getElementById(`${tabName}DataContent`);
    const histContent = document.getElementById(`${tabName}HistoryContent`);
    if (dataContent) dataContent.classList.remove('hidden');
    if (histContent) histContent.classList.add('hidden');
  } else {
    if (dataBtn) dataBtn.className = inactiveClass;
    if (historyBtn) historyBtn.className = activeClass;
    const dataContent = document.getElementById(`${tabName}DataContent`);
    const histContent = document.getElementById(`${tabName}HistoryContent`);
    if (dataContent) dataContent.classList.add('hidden');
    if (histContent) histContent.classList.remove('hidden');
    loadActivityHistory(tabName);
  }
}

function loadTabData(tabName) {
  switch(tabName) {
    case 'master':
      loadMasterData();
      break;
    case 'factory':
      loadFactories();
      break;
    case 'equipment':
      loadEquipment();
      break;
    case 'roles':
      loadRoles();
      break;
    case 'department':
      loadDepartments();
      break;
    case 'opcua':
      loadOpcua();
      break;
    case 'section':
      loadSections();
      break;
    case 'rpiServer':
      loadRpiServers();
      break;
    case 'tablet':
      loadTablets();
      break;
    case 'masterNG':
      loadNGGroups();
      break;
    case 'googleSheets':
      loadGoogleSheetTargets();
      break;
  }
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ====================
// Activity History Functions
// ====================
async function loadActivityHistory(tabName) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  
  const collectionMap = {
    'master': 'masterDB',
    'factory': 'factory',
    'equipment': 'equipment',
    'roles': 'roles',
    'department': 'department',
    'section': 'section',
    'tablet': 'tabletDB'
  };
  
  const collection = collectionMap[tabName];
  
  try {
    const res = await fetch(BASE_URL + "getActivityLogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName, collection })
    });
    
    const logs = await res.json();
    renderActivityHistory(tabName, logs);
  } catch (err) {
    console.error("Failed to load activity logs:", err);
    document.getElementById(`${tabName}HistoryContainer`).innerHTML =
      `<p class="text-red-600">${t('masterDB.failedToLoadHistory')}</p>`;
  }
}

function renderActivityHistory(tabName, logs) {
  const historyHTML = `
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.dateTime')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.action')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.user')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.recordCount')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${logs.map(log => `
            <tr class="hover:bg-gray-50/70 transition">
              <td class="px-3 py-2 tabular-nums text-gray-600 whitespace-nowrap">${new Date(log.timestamp).toLocaleString('ja-JP')}</td>
              <td class="px-3 py-2 whitespace-nowrap">
                <span class="inline-flex items-center rounded-lg px-2 py-0.5 text-2xs font-medium ${log.action.includes('create') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                  ${log.action.includes('create') ? t('masterDB.created') : t('masterDB.deleted')}
                </span>
              </td>
              <td class="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">${log.performedBy || 'Unknown'}</td>
              <td class="px-3 py-2 tabular-nums text-gray-600 whitespace-nowrap">${log.recordsAffected || 1} ${t('common.records')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  document.getElementById(`${tabName}HistoryContainer`).innerHTML = logs.length > 0 ? historyHTML : `<p class="text-sm font-medium text-gray-400 py-6 text-center">${t('masterDB.noHistoryFound')}</p>`;
}

// ====================
// Master Tab Functions
// ====================
async function loadMasterData() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const role = currentUser.role || "admin";

  try {
    // Load master data and ngGroups in parallel
    const [masterRes, ngGroupsRes] = await Promise.all([
      fetch(BASE_URL + "getMasterDB", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName, role })
      }),
      fetch(BASE_URL + "getNGGroups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName })
      })
    ]);

    if (!masterRes.ok) throw new Error(`HTTP ${masterRes.status}: ${masterRes.statusText}`);

    allMasterData = await masterRes.json();
    if (ngGroupsRes.ok) {
      allNGGroups = await ngGroupsRes.json();
    } else {
      allNGGroups = [];
    }
    renderMasterTable(allMasterData);
  } catch (err) {
    console.error("Failed to load master data:", err);
    document.getElementById("masterTableContainer").innerHTML = `<p class="text-red-600">${t('common.failedToLoad')}: ${err.message}</p>`;
  }
}

function renderMasterTable(data) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  let filteredData = [...data];
  
  if (masterSearchQuery) {
    const q = masterSearchQuery.toLowerCase();
    filteredData = filteredData.filter(record => 
      (record.品番 || '').toLowerCase().includes(q) ||
      (record.製品名 || '').toLowerCase().includes(q) ||
      (record.kanbanID || '').toLowerCase().includes(q) ||
      (record.設備 || '').toLowerCase().includes(q) ||
      (record.工場 || '').toLowerCase().includes(q) ||
      (record['LH/RH'] || '').toLowerCase().includes(q)
    );
  }

  if (masterSortField) {
    filteredData.sort((a, b) => {
      let valA = a[masterSortField] || '';
      let valB = b[masterSortField] || '';
      
      if (['cycleTime', 'grossProfit', '収容数', '検査メンバー数', '目標', '警戒'].includes(masterSortField)) {
         valA = parseFloat(valA) || 0;
         valB = parseFloat(valB) || 0;
         return masterSortOrder === 'asc' ? valA - valB : valB - valA;
      }
      
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return masterSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return masterSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const headers = [
    { key: "品番", label: t('masterDB.productNumber') },
    { key: "製品名", label: t('masterDB.productName') },
    { key: "LH/RH", label: t('masterDB.lhrh') },
    { key: "kanbanID", label: t('masterDB.kanbanId') },
    { key: "設備", label: t('masterDB.equipment') },
    { key: "工場", label: t('masterDB.factory') },
    { key: "ngGroupId", label: t('masterDB.ngGroup') || "不良グループ", isNGGroup: true },
    { key: "cycleTime", label: t('masterDB.cycleTime') },
    { key: "grossProfit", label: t('masterDB.grossProfit') },
    { key: "検査メンバー数", label: t('masterDB.inspectionMembers') },
    { key: "収容数", label: t('masterDB.capacity') },
    { key: "目標", label: t('masterDB.target') || "目標" },
    { key: "警戒", label: t('masterDB.warning') || "警戒" }
  ];

  const tableHTML = `
    <div class="flex justify-between items-center mb-3.5">
      <div class="flex gap-2">
        <button id="deleteMasterBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('master')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelectedItems')} (<span id="masterSelectedCount">0</span>)
        </button>
      </div>
      <div class="flex items-center gap-3">
        <div class="relative">
          <i class="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input type="text" placeholder="${t('common.search')}..." class="rounded-xl border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none shadow-2xs w-56" value="${escapeHtml(masterSearchQuery)}" oninput="handleMasterSearch(this.value)">
        </div>
        <div class="text-xs font-medium text-gray-500 tabular-nums">Total: <span class="text-xs font-semibold text-gray-900 tabular-nums">${filteredData.length}</span> ${t('masterDB.recordCount')}</div>
      </div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="w-10 px-3 py-2 text-center select-none"><input type="checkbox" id="selectAllMaster" onchange="toggleSelectAll('master')" class="rounded border-gray-300 text-indigo-600 focus:ring-0 w-3.5 h-3.5"></th>
            ${headers.map(h => {
              const isSorted = masterSortField === h.key;
              const sortIcon = isSorted ? (masterSortOrder === 'asc' ? 'ri-sort-asc text-indigo-600' : 'ri-sort-desc text-indigo-600') : 'ri-arrow-up-down-line text-gray-400';
              return `
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100/80 transition select-none whitespace-nowrap" onclick="handleMasterSort('${h.key}')">
                  <div class="flex items-center gap-1">
                    <span>${h.label}</span>
                    <i class="${sortIcon}"></i>
                  </div>
                </th>
              `;
            }).join("")}
            <th class="px-3 py-2 text-left text-xs font-semibold text-gray-600 select-none whitespace-nowrap">${t('common.image')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${filteredData.length > 0 ? filteredData.map(record => `
            <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('master', '${record._id}')">
              <td class="w-10 px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="masterCheckbox rounded border-gray-300 text-indigo-600 focus:ring-0 w-3.5 h-3.5" value="${record._id}" onchange="updateSelectedCount('master')"></td>
              ${headers.map(h => {
                let value = record[h.key] ?? "";
                // Handle kensaMembers specifically to show default value if missing
                if (h.key === "検査メンバー数" && !value && record.kensaMembers !== undefined) {
                  value = record.kensaMembers;
                }
                if (h.key === "検査メンバー数" && !value) {
                  value = "2"; // Default value
                }
                // Lookup ngGroup name from ngGroupId
                if (h.isNGGroup && value) {
                  const group = allNGGroups.find(g => String(g._id) === String(value));
                  value = group ? `<span class="font-medium text-gray-800">${escapeHtml(group.groupName)}</span>` : `<span class="text-gray-400 text-2xs">ID: ${value}</span>`;
                } else if (h.isNGGroup && !value) {
                  value = `<span class="text-gray-400 text-2xs">未割当</span>`;
                }

                let cellClass = "px-3 py-2 text-gray-600 whitespace-nowrap";
                if (h.key === "品番") cellClass = "px-3 py-2 font-semibold text-gray-900 whitespace-nowrap";
                else if (['cycleTime', 'grossProfit', '収容数', '検査メンバー数', '目標', '警戒'].includes(h.key)) cellClass = "px-3 py-2 tabular-nums font-medium text-gray-700 whitespace-nowrap";
                
                return `<td class="${cellClass}">${value}</td>`;
              }).join("")}
              <td class="px-3 py-1.5 whitespace-nowrap">
                ${record.imageURL ? `<img src="${record.imageURL}" alt="Product" class="h-7 w-7 object-cover rounded-lg border border-gray-100" />` : `<span class="text-gray-400 text-2xs">${t('common.noImage')}</span>`}
              </td>
            </tr>
          `).join("") : `<tr><td colspan="15" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("masterTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('master');
}

window.handleMasterSearch = function(query) {
  masterSearchQuery = query;
  renderMasterTable(allMasterData);
};

window.handleMasterSort = function(field) {
  if (masterSortField === field) {
    masterSortOrder = masterSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    masterSortField = field;
    masterSortOrder = 'asc';
  }
  renderMasterTable(allMasterData);
};

// ====================
// Checkbox & Selection Functions
// ====================
function toggleSelectAll(type) {
  const selectAllCheckbox = document.getElementById(`selectAll${capitalizeFirst(type)}`);
  const checkboxes = document.querySelectorAll(`.${type}Checkbox`);
  
  checkboxes.forEach(cb => {
    cb.checked = selectAllCheckbox.checked;
  });
  
  updateSelectedCount(type);
}

function updateSelectedCount(type) {
  const checkboxes = document.querySelectorAll(`.${type}Checkbox:checked`);
  const count = checkboxes.length;
  const countSpan = document.getElementById(`${type}SelectedCount`);
  
  // Handle the button ID - some are plural (deleteTabletsBtn) vs singular pattern
  let deleteBtn;
  if (type === 'tablet') {
    deleteBtn = document.getElementById('deleteTabletsBtn');
  } else {
    deleteBtn = document.getElementById(`delete${capitalizeFirst(type)}Btn`);
  }
  
  if (countSpan) countSpan.textContent = count;
  if (deleteBtn) {
    if (count > 0) {
      deleteBtn.disabled = false;
      deleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
      deleteBtn.disabled = true;
      deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  }
}

// ====================
// Detail Modal Functions
// ====================
async function openDetailModal(type, id) {
  currentModalType = type;
  let data = null;
  
  // Find the data
  switch(type) {
    case 'master':
      data = allMasterData.find(item => item._id === id);
      break;
    case 'factory':
      data = allFactories.find(item => item._id === id);
      break;
    case 'equipment':
      data = allEquipment.find(item => item._id === id);
      break;
    case 'roles':
      data = allRoles.find(item => item._id === id);
      break;
    case 'department':
      data = allDepartments.find(item => item._id === id);
      break;
    case 'section':
      data = allSections.find(item => item._id === id);
      break;
    case 'tablet':
      data = allTablets.find(item => item._id === id);
      break;
  }
  
  if (!data) {
    alert(t('common.dataNotFound'));
    return;
  }

  currentModalData = data;

  // Ensure reference data is available before rendering tablet details
  if (type === 'tablet') {
    await ensureTabletModalReferenceDataLoaded();
  }

  // Set modal title
  const titleMap = {
    'master': t('masterDB.productDetails'),
    'factory': t('masterDB.factoryDetails'),
    'equipment': t('masterDB.equipmentDetails'),
    'roles': t('masterDB.roleDetails'),
    'department': t('masterDB.departmentDetails'),
    'section': t('masterDB.sectionDetails'),
    'tablet': t('masterDB.tabletDetails')
  };
  document.getElementById('modalTitle').textContent = titleMap[type];
  
  // Render details
  renderModalDetails(type, data);
  
  // Show modal
  document.getElementById('detailModal').classList.remove('hidden');
  
  // Reset to details tab
  switchModalTab('details');
}

async function ensureTabletModalReferenceDataLoaded() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const requests = [];

    if (!Array.isArray(allFactories) || allFactories.length === 0) {
      requests.push(
        fetch(BASE_URL + "getFactories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbName })
        }).then(res => res.ok ? res.json() : [])
      );
    } else {
      requests.push(Promise.resolve(allFactories));
    }

    if (!Array.isArray(allEquipment) || allEquipment.length === 0) {
      requests.push(
        fetch(BASE_URL + "getEquipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbName })
        }).then(res => res.ok ? res.json() : [])
      );
    } else {
      requests.push(Promise.resolve(allEquipment));
    }

    const [factories, equipment] = await Promise.all(requests);
    allFactories = Array.isArray(factories) ? factories : [];
    allEquipment = Array.isArray(equipment) ? equipment : [];
  } catch (err) {
    console.error('Failed to preload tablet modal reference data:', err);
    if (!Array.isArray(allFactories)) allFactories = [];
    if (!Array.isArray(allEquipment)) allEquipment = [];
  }
}

function renderModalDetails(type, data) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);
  
  let detailsHTML = '';
  
  switch(type) {
    case 'master':
      detailsHTML = `
        ${data.imageURL ? `
          <div class="mb-4 relative">
            <label class="block text-xs font-semibold text-gray-600 mb-1.5">${t('masterDB.productImage')}</label>
            <div id="imagePreviewContainer" class="relative inline-block">
              <img id="modalImage" src="${data.imageURL}" alt="Product" class="max-w-xs max-h-40 w-auto rounded-xl border border-gray-100 shadow-xs object-cover" />
              <button id="removeImageBtn" type="button" class="hidden absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1.5 hover:bg-rose-700 shadow-md transition" onclick="removeImage()">
                <i class="ri-delete-bin-line text-xs"></i>
              </button>
            </div>
            <p id="noImageText" class="text-gray-400 text-xs mb-1.5 hidden">${t('common.noImage')}</p>
            <input type="file" id="modalImageUpload" accept="image/*" class="hidden mt-1.5 w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs" onchange="previewImage()" />
            <input type="hidden" id="removeImageFlag" value="false" />
          </div>
        ` : `
          <div class="mb-4">
            <label class="block text-xs font-semibold text-gray-600 mb-1.5">${t('masterDB.productImage')}</label>
            <div id="imagePreviewContainer" class="relative inline-block w-full">
              <img id="modalImage" src="" alt="Product" class="hidden max-w-xs max-h-40 w-auto rounded-xl border border-gray-100 shadow-xs object-cover" />
              <button id="removeImageBtn" type="button" class="hidden absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1.5 hover:bg-rose-700 shadow-md transition" onclick="removeImage()">
                <i class="ri-delete-bin-line text-xs"></i>
              </button>
            </div>
            <p id="noImageText" class="text-gray-400 text-xs mb-1.5">${t('common.noImage')}</p>
            <input type="file" id="modalImageUpload" accept="image/*" class="hidden mt-1.5 w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs" onchange="previewImage()" />
            <input type="hidden" id="removeImageFlag" value="false" />
          </div>
        `}
        <div class="grid grid-cols-2 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.productNumber')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.品番 || ''}" disabled data-field="品番" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.productName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.製品名 || ''}" disabled data-field="製品名" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.lhrh')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data['LH/RH'] || ''}" disabled data-field="LH/RH" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.kanbanId')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.kanbanID || ''}" disabled data-field="kanbanID" /></div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.equipment')}</label>
            <input type="text" id="modalEquipmentDisplay" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.設備 || ''}" disabled data-field="設備" />
            <select id="modalEquipmentSelect" class="hidden w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs" data-field="設備"></select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.factory')}</label>
            <input type="text" id="modalFactoryDisplay" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.工場 || ''}" disabled data-field="工場" />
            <div id="modalFactoryTags" class="hidden w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white min-h-[34px]" data-field="工場"></div>
            <select id="modalFactorySelect" class="hidden w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs mt-1.5"></select>
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.cycleTime')}</label><input type="number" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.cycleTime || ''}" disabled data-field="cycleTime" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.grossProfit')}</label><input type="number" step="0.01" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.grossProfit || ''}" disabled data-field="grossProfit" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.inspectionMembers')}</label><input type="number" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.kensaMembers || 2}" disabled data-field="kensaMembers" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.capacity')}</label><input type="number" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.収容数 || ''}" disabled data-field="収容数" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.target') || '目標'}</label><input type="number" step="any" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.目標 !== undefined && data.目標 !== null ? data.目標 : ''}" disabled data-field="目標" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.warning') || '警戒'}</label><input type="number" step="any" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.警戒 !== undefined && data.警戒 !== null ? data.警戒 : ''}" disabled data-field="警戒" /></div>
          <div class="col-span-2">
            <label class="block text-xs font-semibold text-gray-600 mb-1">不良グループ</label>
            <input type="text" id="modalNGGroupDisplay" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.ngGroupId ? '...' : '未割当'}" disabled />
            <select id="modalNGGroupSelect" class="hidden w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs" data-field="ngGroupId">
              <option value="">未割当（なし）</option>
            </select>
          </div>
        </div>
      `;
      // Populate NG group display name after innerHTML is set
      if (data.ngGroupId) {
        setTimeout(() => {
          const existing = allNGGroups.find(g => g._id?.toString() === data.ngGroupId?.toString());
          const displayEl = document.getElementById('modalNGGroupDisplay');
          if (displayEl && existing) displayEl.value = existing.groupName;
        }, 50);
      }
      break;
      
    case 'factory':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.factoryName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.address')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.address || ''}" disabled data-field="address" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.phone')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.phone || ''}" disabled data-field="phone" /></div>
        </div>
      `;
      break;
      
    case 'equipment':
      const opcVars = data.opcVariables || {};
      detailsHTML = `
        <div class="grid grid-cols-1 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.equipmentName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.設備名 || ''}" disabled data-field="設備名" /></div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.factory')}</label>
            <input type="text" id="modalEquipmentFactoryDisplay" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${(data.工場 || []).join(', ')}" disabled data-field="工場" />
            <div id="modalEquipmentFactoryTags" class="hidden w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white min-h-[34px]" data-field="工場"></div>
            <select id="modalEquipmentFactorySelect" class="hidden w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs mt-1.5"></select>
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>

          <div class="border-t border-gray-100 pt-3.5 mt-2">
            <h4 class="text-xs font-semibold text-gray-900 mb-2.5 flex items-center">
              <i class="ri-line-chart-line mr-1.5 text-indigo-600"></i>
              ${t('masterDB.opcVariableMappings')}
            </h4>
            <div class="grid grid-cols-1 gap-2.5">
              <div>
                <label class="block text-2xs font-semibold text-gray-500 mb-0.5">${t('masterDB.kanbanVariable')}</label>
                <select id="modalEquipmentKanbanVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" disabled data-field="opcVariables.kanbanVariable">
                  <option value="">${t('masterDB.selectVariable')}</option>
                </select>
                <p class="text-2xs text-gray-400 mt-0.5">${t('masterDB.forProductLookup')}</p>
              </div>
              <div>
                <label class="block text-2xs font-semibold text-gray-500 mb-0.5">${t('masterDB.productionCountVariable')}</label>
                <select id="modalEquipmentProductionVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" disabled data-field="opcVariables.productionCountVariable">
                  <option value="">${t('masterDB.selectVariable')}</option>
                </select>
                <p class="text-2xs text-gray-400 mt-0.5">${t('masterDB.forProductionCalc')}</p>
              </div>
              <div>
                <label class="block text-2xs font-semibold text-gray-500 mb-0.5">${t('masterDB.boxQuantityVariable')}</label>
                <select id="modalEquipmentBoxQtyVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" disabled data-field="opcVariables.boxQuantityVariable">
                  <option value="">${t('masterDB.selectVariable')}</option>
                </select>
                <p class="text-2xs text-gray-400 mt-0.5">${t('masterDB.forBoxQtyDisplay')}</p>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Load OPC variables and populate dropdowns after rendering
      setTimeout(async () => {
        try {
          const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
          const company = currentUser.dbName || "KSG";
          const response = await fetch(`${API_URL}/api/opcua/conversions?company=${company}`);
          const apiData = await response.json();
          const conversions = Array.isArray(apiData) ? apiData : (apiData.conversions || []);
          const opcVariables = conversions.map(v => v.variableName).filter(Boolean);
          
          // Populate all three dropdowns
          const kanbanSelect = document.getElementById('modalEquipmentKanbanVar');
          const productionSelect = document.getElementById('modalEquipmentProductionVar');
          const boxQtySelect = document.getElementById('modalEquipmentBoxQtyVar');
          
          [kanbanSelect, productionSelect, boxQtySelect].forEach(select => {
            if (select) {
              opcVariables.forEach(v => {
                const option = document.createElement('option');
                option.value = v;
                option.textContent = v;
                select.appendChild(option);
              });
            }
          });
          
          // Set current values
          if (kanbanSelect) kanbanSelect.value = opcVars.kanbanVariable || '';
          if (productionSelect) productionSelect.value = opcVars.productionCountVariable || '';
          if (boxQtySelect) boxQtySelect.value = opcVars.boxQuantityVariable || '';
          
        } catch (error) {
          console.error('Failed to load OPC variables for modal:', error);
        }
      }, 100);
      
      break;
      
    case 'roles':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.roleName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.roleName || ''}" disabled data-field="roleName" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
        </div>
      `;
      break;
      
    case 'department':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.departmentName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
        </div>
      `;
      break;

    case 'section':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.sectionName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
        </div>
      `;
      break;
      
    case 'tablet':
      // Generate factory dropdown options from already loaded data
      const factoryOptions = allFactories.map(f => 
        `<option value="${f.name || ''}" ${f.name === data.factoryLocation ? 'selected' : ''}>${f.name || ''}</option>`
      ).join('');
      
      // Filter equipment based on the current factory
      const filteredEquipment = data.factoryLocation 
        ? allEquipment.filter(eq => eq.工場 && Array.isArray(eq.工場) && eq.工場.includes(data.factoryLocation))
        : [];
      
      // Generate equipment dropdown options from filtered data
      const equipmentOptions = filteredEquipment.map(eq => 
        `<option value="${eq.設備名 || ''}" ${eq.設備名 === data.設備名 ? 'selected' : ''}>${eq.設備名 || ''}</option>`
      ).join('');
      
      const tabletUrl = `https://ksg.freyaaccess.com/tablet.html?tabletName=${encodeURIComponent(data.tabletName || '')}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tabletUrl)}`;
      
      detailsHTML = `
        <div class="grid grid-cols-2 gap-3.5">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.tabletName')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.tabletName || ''}" disabled data-field="tabletName" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.brand')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.tabletBrand || ''}" disabled data-field="tabletBrand" /></div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.factoryLocation')}</label>
            <select class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" disabled data-field="factoryLocation" id="tabletFactorySelect" onchange="updateTabletEquipmentDropdownModal()">
              <option value="">${t('common.selectFactory')}</option>
              ${factoryOptions}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.equipmentName')}</label>
            <select class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" disabled data-field="設備名" id="tabletEquipmentSelect">
              <option value="">${t('common.selectEquipment')}</option>
              ${equipmentOptions}
            </select>
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.registeredDate')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs tabular-nums" value="${data.registeredAt ? new Date(data.registeredAt).toLocaleString('ja-JP') : ''}" disabled /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.registeredBy')}</label><input type="text" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" value="${data.registeredBy || ''}" disabled /></div>
        </div>

        <!-- Quick Access Section -->
        <div class="mt-4 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-indigo-900 flex items-center">
              <i class="ri-qr-code-line mr-1.5"></i>${t('masterDB.quickAccess')}
            </h3>
            <button onclick="toggleTabletQR()" class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs transition text-xs font-semibold cursor-pointer">
              <i class="ri-eye-line"></i>${t('masterDB.showQRCode')}
            </button>
          </div>
          <div id="tabletQRSection" class="hidden mt-3">
            <div class="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
              <div class="text-center mb-3">
                <img src="${qrCodeUrl}" alt="QR Code" class="mx-auto rounded-lg shadow-xs" style="width: 180px; height: 180px;" />
              </div>
              <div class="space-y-2">
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.tabletAccessUrl')}</label>
                  <div class="flex gap-2">
                    <input type="text" id="tabletUrlInput" value="${tabletUrl}" readonly class="flex-1 px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-xs" />
                    <button onclick="copyTabletUrl()" class="px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition text-xs font-semibold whitespace-nowrap cursor-pointer">
                      <i class="ri-file-copy-line mr-1"></i>${t('masterDB.copy')}
                    </button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button onclick="downloadTabletQR()" class="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition text-xs font-semibold cursor-pointer">
                    <i class="ri-download-line mr-1"></i>${t('masterDB.downloadQRCode')}
                  </button>
                  <button onclick="openTabletUrl()" class="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition text-xs font-semibold cursor-pointer">
                    <i class="ri-external-link-line mr-1"></i>${t('masterDB.openTablet')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      break;
  }
  
  document.getElementById('modalDetailsBody').innerHTML = detailsHTML;
  
  // Render history
  renderModalHistory(data);
  
  // Always show edit button
  document.getElementById('modalEditBtn').classList.remove('hidden');
}

function renderModalHistory(data) {
  const changeHistory = data.changeHistory || [];
  
  if (changeHistory.length === 0) {
    document.getElementById('modalHistoryBody').innerHTML = `<p class="text-xs text-gray-400 py-4 text-center">${t('masterDB.noChangeHistory')}</p>`;
    return;
  }
  
  const historyHTML = `
    <div class="space-y-3">
      ${changeHistory.map(entry => `
        <div class="border-l-2 border-indigo-500 pl-3 py-1.5">
          <div class="flex justify-between items-start mb-1.5">
            <div>
              <p class="text-xs font-semibold text-gray-900">${entry.action}</p>
              <p class="text-2xs text-gray-500">${t('masterDB.by')}: ${entry.changedBy}</p>
            </div>
            <p class="text-2xs text-gray-400 tabular-nums">${new Date(entry.timestamp).toLocaleString('ja-JP')}</p>
          </div>
          <div class="space-y-1">
            ${entry.changes.map(change => `
              <div class="text-xs bg-gray-50 p-2 rounded-lg border border-gray-100">
                <span class="font-medium text-gray-700">${change.field}:</span> 
                <span class="text-rose-600">${change.oldValue}</span> → 
                <span class="text-emerald-600">${change.newValue}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  document.getElementById('modalHistoryBody').innerHTML = historyHTML;
}

function switchModalTab(tab) {
  if (tab === 'details') {
    document.getElementById('modalTabDetails').className = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white text-gray-900 shadow-2xs transition cursor-pointer';
    document.getElementById('modalTabHistory').className = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition cursor-pointer';
    document.getElementById('modalDetailsContent').classList.remove('hidden');
    document.getElementById('modalHistoryContent').classList.add('hidden');
  } else {
    document.getElementById('modalTabDetails').className = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition cursor-pointer';
    document.getElementById('modalTabHistory').className = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white text-gray-900 shadow-2xs transition cursor-pointer';
    document.getElementById('modalDetailsContent').classList.add('hidden');
    document.getElementById('modalHistoryContent').classList.remove('hidden');
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  currentModalData = null;
  currentModalType = null;
  isEditMode = false;
}

async function toggleEditMode() {
  isEditMode = true;
  
  // Load factories and equipment data for both master and equipment tabs
  if (currentModalType === 'master') {
    await loadFactoriesAndEquipmentForModal();
    // Load NG groups for master tab
    await loadNGGroupsForModal();
  } else if (currentModalType === 'equipment') {
    await loadFactoriesForEquipmentModal();
  }
  
  // Enable all inputs
  document.querySelectorAll('#modalDetailsBody input, #modalDetailsBody textarea, #modalDetailsBody select').forEach(el => {
    if (el.id !== 'modalEquipmentDisplay' && el.id !== 'modalFactoryDisplay' && el.id !== 'modalNGGroupDisplay' && el.id !== 'modalEquipmentFactoryDisplay' && el.id !== 'opcuaDeviceId') {
      el.disabled = false;
      el.classList.remove('bg-gray-50');
      el.classList.add('bg-white');
    }
  });
  
  // Show image upload
  const imageUpload = document.getElementById('modalImageUpload');
  if (imageUpload) imageUpload.classList.remove('hidden');
  
  // Show remove image button if image exists
  const removeImageBtn = document.getElementById('removeImageBtn');
  const modalImage = document.getElementById('modalImage');
  if (removeImageBtn && modalImage && !modalImage.classList.contains('hidden') && modalImage.src) {
    removeImageBtn.classList.remove('hidden');
  }
  
  // Toggle buttons
  document.getElementById('modalEditBtn').classList.add('hidden');
  document.getElementById('modalSaveBtn').classList.remove('hidden');
  document.getElementById('modalCancelBtn').classList.remove('hidden');
}

let selectedModalFactories = [];

async function loadFactoriesAndEquipmentForModal() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  
  try {
    // Load factories
    const factoriesRes = await fetch(BASE_URL + "getFactories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });
    const factories = await factoriesRes.json();
    
    // Load equipment
    const equipmentRes = await fetch(BASE_URL + "getEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });
    const equipment = await equipmentRes.json();
    
    // Setup Equipment dropdown
    const equipmentSelect = document.getElementById('modalEquipmentSelect');
    const equipmentDisplay = document.getElementById('modalEquipmentDisplay');
    
    if (equipmentSelect && equipmentDisplay) {
      if (equipment.length === 0) {
        equipmentSelect.innerHTML = `<option value="" class="text-red-600">${t('common.noEquipmentData')}</option>`;
        equipmentSelect.classList.add('border-red-500');
      } else {
        equipmentSelect.innerHTML = `<option value="">${t('common.pleaseSelect')}</option>` +
          equipment.map(eq => `<option value="${eq.設備名}" ${currentModalData.設備 === eq.設備名 ? 'selected' : ''}>${eq.設備名}</option>`).join('');
      }
      equipmentDisplay.classList.add('hidden');
      equipmentSelect.classList.remove('hidden');
    }
    
    // Setup Factory multi-select with tags
    const factoryDisplay = document.getElementById('modalFactoryDisplay');
    const factoryTags = document.getElementById('modalFactoryTags');
    const factorySelect = document.getElementById('modalFactorySelect');
    
    if (factoryDisplay && factoryTags && factorySelect) {
      if (factories.length === 0) {
        factorySelect.innerHTML = `<option value="" class="text-red-600">${t('common.noFactoryData')}</option>`;
        factorySelect.classList.add('border-red-500');
      } else {
        factorySelect.innerHTML = `<option value="">${t('common.addFactory')}</option>` +
          factories.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
        factorySelect.onchange = (e) => {
          if (e.target.value && !selectedModalFactories.includes(e.target.value)) {
            selectedModalFactories.push(e.target.value);
            renderModalFactoryTags();
          }
          e.target.value = '';
        };
      }
      
      // Initialize selected factories from comma-delimited string
      selectedModalFactories = currentModalData.工場 ? currentModalData.工場.split(',').map(f => f.trim()).filter(f => f) : [];
      
      factoryDisplay.classList.add('hidden');
      factoryTags.classList.remove('hidden');
      factorySelect.classList.remove('hidden');
      
      renderModalFactoryTags();
    }
    
  } catch (err) {
    console.error('Failed to load factories/equipment:', err);
  }
}

function renderModalFactoryTags() {
  const factoryTags = document.getElementById('modalFactoryTags');
  if (!factoryTags) return;
  
  factoryTags.innerHTML = selectedModalFactories.length > 0 ? 
    selectedModalFactories.map(f => `
      <span class="inline-flex items-center px-2 py-1 mr-2 mb-2 bg-blue-100 text-blue-800 rounded">
        ${f}
        <button type="button" onclick="removeModalFactoryTag('${f}')" class="ml-2 text-blue-600 hover:text-blue-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-sm">${t('common.selectFactoryFirst')}</span>`;
}

function removeModalFactoryTag(factory) {
  selectedModalFactories = selectedModalFactories.filter(f => f !== factory);
  renderModalFactoryTags();
}

let selectedEquipmentModalFactories = [];

async function loadFactoriesForEquipmentModal() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  
  try {
    // Load factories
    const factoriesRes = await fetch(BASE_URL + "getFactories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });
    const factories = await factoriesRes.json();
    
    // Setup Equipment Factory multi-select
    const factoryDisplay = document.getElementById('modalEquipmentFactoryDisplay');
    const factoryTags = document.getElementById('modalEquipmentFactoryTags');
    const factorySelect = document.getElementById('modalEquipmentFactorySelect');
    
    if (factoryDisplay && factoryTags && factorySelect) {
      if (factories.length === 0) {
        factorySelect.innerHTML = `<option value="" class="text-red-600">${t('common.noFactoryData')}</option>`;
        factorySelect.classList.add('border-red-500');
      } else {
        factorySelect.innerHTML = `<option value="">${t('common.addFactory')}</option>` +
          factories.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
        factorySelect.onchange = (e) => {
          if (e.target.value && !selectedEquipmentModalFactories.includes(e.target.value)) {
            selectedEquipmentModalFactories.push(e.target.value);
            renderEquipmentModalFactoryTags();
          }
          e.target.value = '';
        };
      }
      
      // Initialize selected factories from array
      selectedEquipmentModalFactories = currentModalData.工場 ? Array.isArray(currentModalData.工場) ? currentModalData.工場 : [currentModalData.工場] : [];
      
      factoryDisplay.classList.add('hidden');
      factoryTags.classList.remove('hidden');
      factorySelect.classList.remove('hidden');
      
      renderEquipmentModalFactoryTags();
    }
    
  } catch (err) {
    console.error('Failed to load factories for equipment modal:', err);
  }
}

function renderEquipmentModalFactoryTags() {
  const factoryTags = document.getElementById('modalEquipmentFactoryTags');
  if (!factoryTags) return;
  
  factoryTags.innerHTML = selectedEquipmentModalFactories.length > 0 ? 
    selectedEquipmentModalFactories.map(f => `
      <span class="inline-flex items-center px-2 py-1 mr-2 mb-2 bg-blue-100 text-blue-800 rounded">
        ${f}
        <button type="button" onclick="removeEquipmentModalFactoryTag('${f}')" class="ml-2 text-blue-600 hover:text-blue-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-sm">${t('common.selectFactoryFirst')}</span>`;
}

function removeEquipmentModalFactoryTag(factory) {
  selectedEquipmentModalFactories = selectedEquipmentModalFactories.filter(f => f !== factory);
  renderEquipmentModalFactoryTags();
}

let selectedQuickEquipmentFactories = [];

async function loadFactoriesForEquipmentCreate() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  
  try {
    const res = await fetch(BASE_URL + "getFactories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });
    allFactories = await res.json();
  } catch (err) {
    console.error('Failed to load factories:', err);
    allFactories = [];
  }
}

function renderQuickEquipmentFactoryTags() {
  const tagsDiv = document.getElementById('quickEquipmentFactoryTags');
  if (!tagsDiv) return;
  
  tagsDiv.innerHTML = selectedQuickEquipmentFactories.length > 0 ? 
    selectedQuickEquipmentFactories.map(f => `
      <span class="inline-flex items-center px-2 py-1 mr-2 mb-2 bg-blue-100 text-blue-800 rounded">
        ${f}
        <button type="button" onclick="removeQuickEquipmentFactoryTag('${f}')" class="ml-2 text-blue-600 hover:text-blue-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-sm">${t('common.selectFactoryFirst')}</span>`;
}

function removeQuickEquipmentFactoryTag(factory) {
  selectedQuickEquipmentFactories = selectedQuickEquipmentFactories.filter(f => f !== factory);
  renderQuickEquipmentFactoryTags();
}

function cancelEditMode() {
  isEditMode = false;
  
  // Re-render modal to reset values
  renderModalDetails(currentModalType, currentModalData);
  
  // Toggle buttons
  document.getElementById('modalEditBtn').classList.remove('hidden');
  document.getElementById('modalSaveBtn').classList.add('hidden');
  document.getElementById('modalCancelBtn').classList.add('hidden');
}

async function saveModalChanges() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";
  
  if (currentModalType === 'opcua') {
      saveOpcuaModal();
      return;
  }
  
  const updateData = {};
  
  // Handle special fields for master
  if (currentModalType === 'master') {
    // Get equipment from dropdown
    const equipmentSelect = document.getElementById('modalEquipmentSelect');
    if (equipmentSelect && !equipmentSelect.classList.contains('hidden')) {
      updateData['設備'] = equipmentSelect.value;
    }
    
    // Get factories from tags (comma-delimited)
    if (selectedModalFactories.length > 0) {
      updateData['工場'] = selectedModalFactories.join(',');
    } else {
      updateData['工場'] = '';
    }

    // Get NG group assignment
    const ngGroupSelect = document.getElementById('modalNGGroupSelect');
    if (ngGroupSelect && !ngGroupSelect.classList.contains('hidden')) {
      updateData['ngGroupId'] = ngGroupSelect.value || null;
    }
  }
  
  // Handle special fields for equipment
  if (currentModalType === 'equipment') {
    // Get factories from tags (array)
    if (selectedEquipmentModalFactories && selectedEquipmentModalFactories.length > 0) {
      updateData['工場'] = selectedEquipmentModalFactories;
    }
  }
  
  // Handle special fields for tablet
  if (currentModalType === 'tablet') {
    // Get factory from dropdown
    const factorySelect = document.getElementById('tabletFactorySelect');
    if (factorySelect && !factorySelect.disabled) {
      updateData['factoryLocation'] = factorySelect.value;
    }
    
    // Get equipment from dropdown
    const equipmentSelect = document.getElementById('tabletEquipmentSelect');
    if (equipmentSelect && !equipmentSelect.disabled) {
      updateData['設備名'] = equipmentSelect.value;
    }
  }
  
  // Get other fields (excluding selects which are handled above)
  document.querySelectorAll('#modalDetailsBody input[data-field]:not(#modalEquipmentDisplay):not(#modalFactoryDisplay):not(#modalNGGroupDisplay):not(#modalEquipmentFactoryDisplay), #modalDetailsBody textarea[data-field]').forEach(el => {
    if (!el.disabled) {
      const field = el.dataset.field;
      let value = el.value;
      
      // Special handling for equipment 工場 field - convert comma-separated string to array
      if (currentModalType === 'equipment' && field === '工場') {
        value = value.split(',').map(f => f.trim()).filter(f => f);
      }
      
      if (currentModalType === 'master' && (field === '目標' || field === '警戒')) {
        value = value !== '' && !isNaN(Number(value)) ? Number(value) : (value === '' ? null : value);
      }
      
      updateData[field] = value;
    }
  });
  
  // Handle equipment OPC variable selects (with nested fields)
  if (currentModalType === 'equipment') {
    document.querySelectorAll('#modalDetailsBody select[data-field]').forEach(el => {
      if (!el.disabled) {
        const field = el.dataset.field;
        // Handle nested fields like "opcVariables.kanbanVariable"
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (!updateData[parent]) updateData[parent] = {};
          updateData[parent][child] = el.value;
        } else {
          updateData[field] = el.value;
        }
      }
    });
  }
  
  // Handle image upload
  const imageFile = document.getElementById('modalImageUpload');
  if (imageFile && imageFile.files.length > 0) {
    const base64 = await fileToBase64(imageFile.files[0]);
    updateData.imageBase64 = base64;
  } else {
    // If no new image was uploaded, check if the image was removed
    const removeImageFlag = document.getElementById('removeImageFlag');
    if (removeImageFlag && removeImageFlag.value === 'true') {
      updateData.removeImage = true;
    }
  }
  
  try {
    const endpoints = {
      'master': 'updateMasterRecord',
      'factory': 'updateFactory',
      'equipment': 'updateEquipment',
      'roles': 'updateRole',
      'tablet': 'updateTablet'
    };
    
    const idField = currentModalType === 'master' ? 'recordId' : 
                    currentModalType === 'factory' ? 'factoryId' :
                    currentModalType === 'equipment' ? 'equipmentId' : 
                    currentModalType === 'tablet' ? 'tabletId' : 'roleId';
    
    const res = await fetch(BASE_URL + endpoints[currentModalType], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [idField]: currentModalData._id,
        updateData,
        dbName,
        username
      })
    });
    
    if (!res.ok) throw new Error("Update failed");
    
    alert(t('common.updatedSuccessfully'));
    closeDetailModal();
    loadTabData(currentTab);
  } catch (err) {
    alert(t('common.updateFailed') + ": " + err.message);
  }
}

function previewImage() {
  const file = document.getElementById('modalImageUpload').files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const modalImage = document.getElementById('modalImage');
      const noImageText = document.getElementById('noImageText');
      const removeImageBtn = document.getElementById('removeImageBtn');
      const removeImageFlag = document.getElementById('removeImageFlag');
      
      modalImage.src = e.target.result;
      modalImage.classList.remove('hidden');
      if (noImageText) noImageText.classList.add('hidden');
      if (removeImageBtn) removeImageBtn.classList.remove('hidden');
      if (removeImageFlag) removeImageFlag.value = 'false';
    };
    reader.readAsDataURL(file);
  }
}

window.removeImage = function() {
  const modalImage = document.getElementById('modalImage');
  const modalImageUpload = document.getElementById('modalImageUpload');
  const removeImageBtn = document.getElementById('removeImageBtn');
  const removeImageFlag = document.getElementById('removeImageFlag');
  const noImageText = document.getElementById('noImageText');

  if (modalImage) {
    modalImage.src = '';
    modalImage.classList.add('hidden');
  }
  if (modalImageUpload) modalImageUpload.value = '';
  if (removeImageBtn) removeImageBtn.classList.add('hidden');
  if (removeImageFlag) removeImageFlag.value = 'true';
  if (noImageText) noImageText.classList.remove('hidden');
};

// ====================
// Delete Confirmation Functions
// ====================
function showDeleteConfirmation(type) {
  const checkboxes = document.querySelectorAll(`.${type}Checkbox:checked`);
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedIds.length === 0) {
    alert(t('common.noItemsSelected'));
    return;
  }
  
  // Get item details for confirmation
  let items = [];
  switch(type) {
    case 'master':
      items = allMasterData.filter(item => selectedIds.includes(item._id));
      break;
    case 'factory':
      items = allFactories.filter(item => selectedIds.includes(item._id));
      break;
    case 'equipment':
      items = allEquipment.filter(item => selectedIds.includes(item._id));
      break;
    case 'roles':
      items = allRoles.filter(item => selectedIds.includes(item._id));
      break;
    case 'department':
      items = allDepartments.filter(item => selectedIds.includes(item._id));
      break;
    case 'section':
      items = allSections.filter(item => selectedIds.includes(item._id));
      break;
    case 'tablet':
      items = allTablets.filter(item => selectedIds.includes(item._id));
      break;
  }
  
  const itemsListHTML = items.map(item => {
    let displayName;
    // Determine display name based on type
    switch(type) {
      case 'master':
        displayName = item.品番 || item._id;
        break;
      case 'factory':
        displayName = item.name || item._id;
        break;
      case 'equipment':
        displayName = item.設備名 || item._id;
        break;
      case 'roles':
        displayName = item.roleName || item._id;
        break;
      case 'department':
        displayName = item.name || item._id;
        break;
      case 'section':
        displayName = item.name || item._id;
        break;
      case 'tablet':
        displayName = item.tabletName || item._id;
        break;
      default:
        displayName = item._id;
    }
    return `<div class="py-1">• ${displayName}</div>`;
  }).join('');
  
  document.getElementById('deleteItemsList').innerHTML = itemsListHTML;
  document.getElementById('deleteConfirmModal').classList.remove('hidden');
  
  // Store for later
  window.pendingDelete = { type, ids: selectedIds };
}

function closeDeleteConfirmModal() {
  document.getElementById('deleteConfirmModal').classList.add('hidden');
  window.pendingDelete = null;
}

async function confirmDelete() {
  if (!window.pendingDelete) return;
  
  const { type, ids } = window.pendingDelete;
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";
  
  try {
    const endpoints = {
      'master': 'deleteMultipleMasterRecords',
      'factory': 'deleteMultipleFactories',
      'equipment': 'deleteMultipleEquipment',
      'roles': 'deleteMultipleRoles',
      'tablet': 'deleteMultipleTablets'
    };
    
    const res = await fetch(BASE_URL + endpoints[type], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        [type === 'tablet' ? 'tabletIds' : 'ids']: ids, 
        dbName, 
        username 
      })
    });
    
    if (!res.ok) throw new Error("Delete failed");
    
    alert(`${ids.length} ${t('masterDB.itemsDeletedSuccess')}`);
    closeDeleteConfirmModal();
    loadTabData(type);
  } catch (err) {
    alert(t('common.deleteFailed') + ": " + err.message);
  }
}

function showCreateMasterForm() {
  const container = document.getElementById("masterTableContainer");

  // Load factories and equipment for dropdowns
  loadFactoriesAndEquipmentForMaster().then(() => {
    const factoryOptions = allFactories.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
    const equipmentOptions = allEquipment.map(e => `<option value="${e.設備名}">${e.設備名}</option>`).join("");

    const formHTML = `
      <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
        <h3 class="text-xl font-semibold text-gray-900 mb-4">${t('masterDB.newRegistration')} (${t('masterDB.tabMaster')})</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.productNumber')}</label>
            <input type="text" id="new品番" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.productName')}</label>
            <input type="text" id="new製品名" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.lhrh')}</label>
            <select id="newLHRH" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">${t('common.pleaseSelect')}</option>
              <option value="LH">LH</option>
              <option value="RH">RH</option>
              <option value="BOTH">BOTH</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.kanbanId')}</label>
            <input type="text" id="newKanbanID" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.equipment')}</label>
            <select id="new設備" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">${t('common.selectEquipment')}</option>
              ${equipmentOptions}
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.factory')}</label>
            <select id="new工場" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">${t('common.selectFactory')}</option>
              ${factoryOptions}
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.cycleTime')}</label>
            <input type="number" id="newCycleTime" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.grossProfit')}</label>
            <input type="number" step="0.01" id="newGrossProfit" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.target') || '目標'}</label>
            <input type="number" step="any" id="new目標" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.warning') || '警戒'}</label>
            <input type="number" step="any" id="new警戒" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">${t('masterDB.imageUpload')}</label>
            <input type="file" id="newImageFile" accept="image/*" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
        <div class="flex gap-3">
          <button class="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" onclick="submitNewMaster()">
            <i class="ri-check-line mr-2"></i>${t('common.save')}
          </button>
          <button class="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" onclick="loadMasterData()">
            <i class="ri-close-line mr-2"></i>${t('common.cancel')}
          </button>
        </div>
      </div>
    `;

    container.innerHTML = formHTML + container.innerHTML;
  });
}

async function loadFactoriesAndEquipmentForMaster() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const [factoriesRes, equipmentRes] = await Promise.all([
      fetch(BASE_URL + "getFactories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName })
      }),
      fetch(BASE_URL + "getEquipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName })
      })
    ]);

    allFactories = await factoriesRes.json();
    allEquipment = await equipmentRes.json();
  } catch (err) {
    console.error("Failed to load factories/equipment:", err);
  }
}

async function submitNewMaster() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  const data = {
    品番: document.getElementById("new品番").value.trim(),
    製品名: document.getElementById("new製品名").value.trim(),
    "LH/RH": document.getElementById("newLHRH").value,
    kanbanID: document.getElementById("newKanbanID").value.trim(),
    設備: document.getElementById("new設備").value,
    工場: document.getElementById("new工場").value,
    cycleTime: document.getElementById("newCycleTime").value,
    grossProfit: document.getElementById("newGrossProfit").value ? parseFloat(document.getElementById("newGrossProfit").value) : null,
    目標: document.getElementById("new目標")?.value ? parseFloat(document.getElementById("new目標").value) : null,
    警戒: document.getElementById("new警戒")?.value ? parseFloat(document.getElementById("new警戒").value) : null,
    dbName,
    username
  };

  if (!data.品番 || !data.製品名) {
    return alert(t('common.fillRequiredFields'));
  }

  // Handle image upload
  const imageFile = document.getElementById("newImageFile").files[0];
  if (imageFile) {
    const base64 = await fileToBase64(imageFile);
    data.imageBase64 = base64;
  }

  try {
    const res = await fetch(BASE_URL + "createMasterRecord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to create record");

    alert(t('masterDB.masterRecordCreated'));
    loadMasterData();
  } catch (err) {
    console.error("Create error:", err);
    alert(t('common.createFailed') + ": " + err.message);
  }
}

async function editMasterRecord(recordId) {
  // Find the record
  const record = allMasterData.find(r => r._id === recordId);
  if (!record) return alert(t('masterDB.recordNotFound'));

  // Similar form to create, but pre-filled
  // For brevity, I'll implement a simplified version
  alert("Edit functionality: Will be implemented with inline editing or modal");
}

async function deleteMasterRecord(recordId) {
  if (!confirm(t('masterDB.confirmDeleteRecord'))) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  try {
    const res = await fetch(BASE_URL + "deleteMasterRecord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, dbName, username })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to delete");

    alert(t('masterDB.recordDeleted'));
    loadMasterData();
  } catch (err) {
    console.error("Delete error:", err);
    alert(t('common.deleteFailed') + ": " + err.message);
  }
}

// ====================
// Factory Tab Functions
// ====================
async function loadFactories() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getFactories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    allFactories = await res.json();
    renderFactoryTable(allFactories);
  } catch (err) {
    console.error("Failed to load factories:", err);
    document.getElementById("factoryTableContainer").innerHTML = `<p class="text-red-600">${t('common.failedToLoad')}: ${err.message}</p>`;
  }
}

function renderFactoryTable(factories) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-3.5">
      <div class="flex gap-2">
        <button id="deleteFactoryBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('factory')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelected')} (<span id="factorySelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">${t('common.total')}: <span class="text-xs font-semibold text-gray-900 tabular-nums">${factories.length}</span> ${t('masterDB.factories')}</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="w-10 px-3 py-2 text-center select-none"><input type="checkbox" id="selectAllFactory" onchange="toggleSelectAll('factory')" class="rounded border-gray-300 text-indigo-600 focus:ring-0 w-3.5 h-3.5"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.factoryName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.address')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.phone')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${factories.length > 0 ? factories.map(f => `
            <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('factory', '${f._id}')">
              <td class="w-10 px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="factoryCheckbox rounded border-gray-300 text-indigo-600 focus:ring-0 w-3.5 h-3.5" value="${f._id}" onchange="updateSelectedCount('factory')"></td>
              <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(f.name || "")}</td>
              <td class="px-3 py-2 text-gray-600">${escapeHtml(f.address || "")}</td>
              <td class="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">${escapeHtml(f.phone || "")}</td>
            </tr>
          `).join("") : `<tr><td colspan="4" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("factoryTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('factory');
}

function showCreateFactoryForm() {
  const container = document.getElementById("factoryTableContainer");
  
  const formHTML = `
    <div class="bg-white border border-gray-100 rounded-2xl shadow-xs p-5 mb-5">
      <h3 class="text-sm font-semibold text-gray-900 mb-3.5">${t('masterDB.createNewFactory')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.factoryName')}</label>
          <input type="text" id="newFactoryName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.address')}</label>
          <input type="text" id="newFactoryAddress" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">${t('masterDB.phone')}</label>
          <input type="text" id="newFactoryPhone" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
      </div>
      <div class="flex gap-2">
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs cursor-pointer" onclick="submitNewFactory()">${t('common.save')}</button>
        <button class="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition shadow-2xs cursor-pointer" onclick="loadFactories()">${t('common.cancel')}</button>
      </div>
    </div>
  `;
  
  container.innerHTML = formHTML + container.innerHTML;
}

async function submitNewFactory() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  const data = {
    name: document.getElementById("newFactoryName").value.trim(),
    address: document.getElementById("newFactoryAddress").value.trim(),
    phone: document.getElementById("newFactoryPhone").value.trim(),
    dbName
  };

  if (!data.name) return alert(t('masterDB.factoryNameRequired'));

  try {
    const res = await fetch(BASE_URL + "createFactory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (res.ok) {
      alert(t('masterDB.factoryCreatedSuccessfully'));
      loadFactories();
    } else {
      alert(t('common.error') + ": " + (result.message || t('masterDB.failedToCreateFactory')));
    }
  } catch (err) {
    console.error(err);
    alert(t('common.errorOccurred') + ": " + err.message);
  }
}

// ====================
// Division Tab Functions
// ====================
async function loadDivisions() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getDivisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    const result = await res.json();
    allDivisions = result.divisions || [];
    renderDivisionsTable(allDivisions);
  } catch (err) {
    console.error(err);
    alert(t('masterDB.failedToLoadDivisions'));
  }
}

function renderDivisionsTable(divisions) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  const tableHTML = `
    ${canEdit ? `
      <div class="mb-3.5">
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer" onclick="showCreateDivisionForm()">
          <i class="ri-add-line"></i>${t('masterDB.addDivision')}
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('common.name')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.code')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.manager')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('common.description')}</th>
            ${canEdit ? `<th class="px-3 py-2 text-right select-none whitespace-nowrap">${t('common.actions')}</th>` : ""}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${divisions.length > 0 ? divisions.map((div, idx) => `
            <tr class="hover:bg-gray-50/70 transition">
              <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(div.name || "")}</td>
              <td class="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">${escapeHtml(div.code || "")}</td>
              <td class="px-3 py-2 text-gray-600 whitespace-nowrap">${escapeHtml(div.manager || "")}</td>
              <td class="px-3 py-2 text-gray-600">${escapeHtml(div.description || "")}</td>
              ${canEdit ? `
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <button class="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-900 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-100 transition cursor-pointer" onclick="deleteDivision(${idx})">
                    <i class="ri-delete-bin-line"></i>${t('common.delete')}
                  </button>
                </td>
              ` : ""}
            </tr>
          `).join("") : `<tr><td colspan="${canEdit ? 5 : 4}" class="px-4 py-8 text-center text-sm font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("divisionTableContainer").innerHTML = tableHTML;
}

function showCreateDivisionForm() {
  const container = document.getElementById("divisionTableContainer");
  
  const formHTML = `
    <div class="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 mb-6">
      <h3 class="text-base font-semibold text-gray-900 mb-4">${t('masterDB.addNewDivision')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('common.name')}</label>
          <input type="text" id="newDivName" class="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.code')}</label>
          <input type="text" id="newDivCode" class="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none shadow-2xs font-mono" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.manager')}</label>
          <input type="text" id="newDivManager" class="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('common.description')}</label>
          <input type="text" id="newDivDescription" class="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-2xs cursor-pointer" onclick="submitNewDivision()">${t('common.save')}</button>
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition cursor-pointer" onclick="loadDivisions()">${t('common.cancel')}</button>
      </div>
    </div>
  `;
  
  container.innerHTML = formHTML + container.innerHTML;
}

async function submitNewDivision() {
  const factoryId = document.getElementById("factorySelectForDivision").value;
  if (!factoryId) return alert(t('masterDB.pleaseSelectFactory'));

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  const newDiv = {
    name: document.getElementById("newDivName").value.trim(),
    code: document.getElementById("newDivCode").value.trim(),
    manager: document.getElementById("newDivManager").value.trim(),
    description: document.getElementById("newDivDescription").value.trim()
  };

  if (!newDiv.name) return alert(t('masterDB.nameRequired'));

  try {
    const res = await fetch(BASE_URL + "addDivision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factoryId, division: newDiv, dbName })
    });

    if (!res.ok) throw new Error("Failed to add division");
    
    alert(t('masterDB.divisionAdded'));
    await loadFactoriesForDivisionDropdown(); // Reload factories to get updated divisions
    document.getElementById("factorySelectForDivision").value = factoryId;
    loadDivisions();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteDivision(divisionIndex) {
  if (!confirm(t('masterDB.deleteThisDivision'))) return;

  const factoryId = document.getElementById("factorySelectForDivision").value;
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteDivision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factoryId, divisionIndex, dbName })
    });

    if (!res.ok) throw new Error("Failed");
    alert(t('masterDB.divisionDeleted'));
    await loadFactoriesForDivisionDropdown();
    document.getElementById("factorySelectForDivision").value = factoryId;
    loadDivisions();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// ====================
// Equipment Tab Functions
// ====================
async function loadEquipment() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    allEquipment = await res.json();
    renderEquipmentTable(allEquipment);
  } catch (err) {
    console.error("Failed to load equipment:", err);
    document.getElementById("equipmentTableContainer").innerHTML = `<p class="text-red-600">${t('common.failedToLoad')}: ${err.message}</p>`;
  }
}

function renderEquipmentTable(equipment) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteEquipmentBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('equipment')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelected')} (<span id="equipmentSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">${t('common.total')}: <span class="text-xs font-semibold text-gray-900 tabular-nums">${equipment.length}</span> ${t('common.items')}</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 w-10 text-center select-none"><input type="checkbox" id="selectAllEquipment" onchange="toggleSelectAll('equipment')" class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.equipmentName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.factoriesLabel')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('common.description')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.opcVariables')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${equipment.length > 0 ? equipment.map(eq => {
            const opcVars = eq.opcVariables || {};
            const opcDisplay = `
              <div class="text-xs space-y-0.5">
                <div><span class="text-gray-500">${t('masterDB.kanbanVariable')}:</span> <span class="font-mono text-gray-800">${escapeHtml(opcVars.kanbanVariable || '-')}</span></div>
                <div><span class="text-gray-500">${t('masterDB.productionCountVariable')}:</span> <span class="font-mono text-gray-800">${escapeHtml(opcVars.productionCountVariable || '-')}</span></div>
                <div><span class="text-gray-500">${t('masterDB.boxQuantityVariable')}:</span> <span class="font-mono text-gray-800">${escapeHtml(opcVars.boxQuantityVariable || '-')}</span></div>
              </div>
            `;
            
            return `
              <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('equipment', '${eq._id}')">
                <td class="px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="equipmentCheckbox w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${eq._id}" onchange="updateSelectedCount('equipment')"></td>
                <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(eq.設備名 || "")}</td>
                <td class="px-3 py-2 whitespace-nowrap">
                  ${(eq.工場 || []).map(f => `<span class="tag">${escapeHtml(f)}</span>`).join(" ")}
                </td>
                <td class="px-3 py-2 text-gray-600">${escapeHtml(eq.description || "")}</td>
                <td class="px-3 py-2">${opcDisplay}</td>
              </tr>
            `;
          }).join("") : `<tr><td colspan="5" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("equipmentTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('equipment');
}

function showCreateEquipmentForm() {
  const container = document.getElementById("equipmentTableContainer");
  
  const factoryOptions = allFactories.map(f => f.name);
  
  const formHTML = `
    <div class="bg-white border border-gray-100 rounded-2xl shadow-xs p-5 mb-5">
      <h3 class="text-sm font-semibold text-gray-900 mb-3">${t('masterDB.createEquipment')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.equipmentName')}</label>
          <input type="text" id="newEq設備名" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('common.description')}</label>
          <input type="text" id="newEqDescription" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.factory')} (${t('masterDB.selectMultiple')})</label>
          <div id="factoryTagContainer" class="border border-gray-200 rounded-xl p-2 mb-2 min-h-[34px] bg-gray-50/50"></div>
          <select id="factorySelect" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" onchange="addFactoryTag()">
            <option value="">${t('common.selectFactory')}</option>
            ${factoryOptions.map(f => `<option value="${f}">${f}</option>`).join("")}
          </select>
        </div>
        <div class="md:col-span-2 border-t border-gray-100 pt-3 mt-1">
          <h4 class="text-xs font-semibold text-gray-900 mb-2.5">${t('masterDB.opcVariableMappings')}</h4>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.kanbanVariable')}</label>
              <input type="text" id="newEqKanbanVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs font-mono" placeholder="例: kenyokiRHKanban" value="" />
              <p class="text-2xs text-gray-400 mt-1">${t('masterDB.forProductLookup')}</p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.productionCountVariable')}</label>
              <input type="text" id="newEqProductionVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs font-mono" placeholder="seisanSu" value="seisanSu" />
              <p class="text-2xs text-gray-400 mt-1">${t('masterDB.forProductionCalc')}</p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.boxQuantityVariable')}</label>
              <input type="text" id="newEqBoxQtyVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs font-mono" placeholder="hakoIresu" value="hakoIresu" />
              <p class="text-2xs text-gray-400 mt-1">${t('masterDB.forBoxQtyDisplay')}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="flex gap-2.5">
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs cursor-pointer" onclick="submitNewEquipment()">${t('common.save')}</button>
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition cursor-pointer" onclick="loadEquipment()">${t('common.cancel')}</button>
      </div>
    </div>
  `;
  
  container.innerHTML = formHTML + container.innerHTML;
}

let selectedFactories = [];

function addFactoryTag() {
  const select = document.getElementById("factorySelect");
  const factory = select.value;
  if (!factory || selectedFactories.includes(factory)) {
    select.value = "";
    return;
  }

  selectedFactories.push(factory);
  renderFactoryTags();
  select.value = "";
}

function renderFactoryTags() {
  const container = document.getElementById("factoryTagContainer");
  container.innerHTML = selectedFactories.map(f => `
    <span class="tag">
      ${f}
      <span class="tag-remove" onclick="removeFactoryTag('${f}')">×</span>
    </span>
  `).join("");
}

function removeFactoryTag(factory) {
  selectedFactories = selectedFactories.filter(f => f !== factory);
  renderFactoryTags();
}

async function submitNewEquipment() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  const data = {
    設備名: document.getElementById("newEq設備名").value.trim(),
    工場: selectedFactories,
    description: document.getElementById("newEqDescription").value.trim(),
    opcVariables: {
      kanbanVariable: document.getElementById("newEqKanbanVar")?.value.trim() || "",
      productionCountVariable: document.getElementById("newEqProductionVar")?.value.trim() || "seisanSu",
      boxQuantityVariable: document.getElementById("newEqBoxQtyVar")?.value.trim() || "hakoIresu"
    },
    dbName
  };

  if (!data.設備名) return alert(t('masterDB.equipmentNameRequired'));

  try {
    const res = await fetch(BASE_URL + "createEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(t('common.createFailed'));
    alert(t('masterDB.equipmentCreated'));
    selectedFactories = [];
    loadEquipment();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function editEquipment(equipmentId) {
  alert("Edit equipment: Will implement tag-based editing UI");
}

async function deleteEquipment(equipmentId) {
  if (!confirm(t('masterDB.deleteThisEquipment'))) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentId, dbName })
    });

    if (!res.ok) throw new Error(t('common.deleteFailed'));
    alert(t('masterDB.equipmentDeleted'));
    loadEquipment();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// ====================
// Roles Tab Functions
// ====================
async function loadRoles() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getRoles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    allRoles = await res.json();
    renderRolesTable(allRoles);
  } catch (err) {
    console.error("Failed to load roles:", err);
    document.getElementById("rolesTableContainer").innerHTML = `<p class="text-red-600">${t('common.failedToLoad')}: ${err.message}</p>`;
  }
}

function renderRolesTable(roles) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteRolesBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('roles')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelected')} (<span id="rolesSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">${t('common.total')}: <span class="text-xs font-semibold text-gray-900 tabular-nums">${roles.length}</span> ${t('masterDB.roles')}</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 w-10 text-center select-none"><input type="checkbox" id="selectAllRoles" onchange="toggleSelectAll('roles')" class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.roleName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('common.description')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${roles.length > 0 ? roles.map(r => `
            <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('roles', '${r._id}')">
              <td class="px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="rolesCheckbox w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${r._id}" onchange="updateSelectedCount('roles')"></td>
              <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(r.roleName || "")}</td>
              <td class="px-3 py-2 text-gray-600">${escapeHtml(r.description || "")}</td>
            </tr>
          `).join("") : `<tr><td colspan="3" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("rolesTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('roles');
}

function showCreateRoleForm() {
  const container = document.getElementById("rolesTableContainer");
  
  const formHTML = `
    <div class="bg-white border border-gray-100 rounded-2xl shadow-xs p-5 mb-5">
      <h3 class="text-sm font-semibold text-gray-900 mb-3">${t('masterDB.createRole')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.roleName')}</label>
          <input type="text" id="newRoleName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('common.description')}</label>
          <input type="text" id="newRoleDescription" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" />
        </div>
      </div>
      <div class="flex gap-2.5">
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs cursor-pointer" onclick="submitNewRole()">${t('common.save')}</button>
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition cursor-pointer" onclick="loadRoles()">${t('common.cancel')}</button>
      </div>
    </div>
  `;
  
  container.innerHTML = formHTML + container.innerHTML;
}

async function submitNewRole() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  const data = {
    roleName: document.getElementById("newRoleName").value.trim(),
    description: document.getElementById("newRoleDescription").value.trim(),
    dbName
  };

  if (!data.roleName) return alert(t('masterDB.roleNameRequired'));

  try {
    const res = await fetch(BASE_URL + "createRole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(t('common.createFailed'));
    alert(t('masterDB.roleCreated'));
    loadRoles();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteRole(roleId) {
  if (!confirm(t('masterDB.deleteThisRole'))) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteRole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId, dbName })
    });

    if (!res.ok) throw new Error(t('common.deleteFailed'));
    alert(t('masterDB.roleDeleted'));
    loadRoles();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// ====================
// Department Tab Functions
// ====================
async function loadDepartments() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getDepartments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    const result = await res.json();
    allDepartments = result.departments || [];
    renderDepartmentsTable(allDepartments);
  } catch (err) {
    console.error(err);
    alert(t('masterDB.failedToLoadDepartments'));
  }
}

function renderDepartmentsTable(departments) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteDepartmentBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('department')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelected')} (<span id="departmentSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">${t('common.total')}: <span class="text-xs font-semibold text-gray-900 tabular-nums">${departments.length}</span> ${t('masterDB.departments')}</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 w-10 text-center select-none"><input type="checkbox" id="selectAllDepartment" onchange="toggleSelectAll('department')" class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.departmentName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('common.description')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${departments.length > 0 ? departments.map(d => `
            <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('department', '${d._id}')">
              <td class="px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="departmentCheckbox w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${d._id}" onchange="updateSelectedCount('department')"></td>
              <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(d.name || "")}</td>
              <td class="px-3 py-2 text-gray-600">${escapeHtml(d.description || "")}</td>
            </tr>
          `).join("") : `<tr><td colspan="3" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("departmentTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('department');
}

// ====================
// Section Tab Functions
// ====================
async function loadSections() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getSections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    const result = await res.json();
    allSections = result.sections || [];
    renderSectionsTable(allSections);
  } catch (err) {
    console.error(err);
    alert(t('masterDB.failedToLoadSections'));
  }
}

function renderSectionsTable(sections) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteSectionBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('section')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelected')} (<span id="sectionSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">${t('common.total')}: <span class="text-xs font-semibold text-gray-900 tabular-nums">${sections.length}</span> ${t('masterDB.sections')}</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 w-10 text-center select-none"><input type="checkbox" id="selectAllSection" onchange="toggleSelectAll('section')" class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.sectionName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('common.description')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${sections.length > 0 ? sections.map(s => `
            <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('section', '${s._id}')">
              <td class="px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="sectionCheckbox w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${s._id}" onchange="updateSelectedCount('section')"></td>
              <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(s.name || "")}</td>
              <td class="px-3 py-2 text-gray-600">${escapeHtml(s.description || "")}</td>
            </tr>
          `).join("") : `<tr><td colspan="3" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("sectionTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('section');
}

// ====================
// CSV Upload Functions
// ====================
let csvData = [];

function showCSVUploadModal() {
  document.getElementById('csvUploadModal').classList.remove('hidden');
}

function closeCSVUploadModal() {
  document.getElementById('csvUploadModal').classList.add('hidden');
  document.getElementById('csvFileInput').value = '';
  document.getElementById('csvPreview').classList.add('hidden');
  csvData = [];
}

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
    
    // Assuming first row is headers
    const headers = rows[0];
    csvData = rows.slice(1).filter(row => row.some(cell => cell)).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] || '';
      });
      return obj;
    });

    // Show preview
    const previewTable = document.getElementById('csvPreviewTable');
    previewTable.innerHTML = `
      <thead>
        <tr>${headers.map(h => `<th class="px-2 py-1 text-left border">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${csvData.slice(0, 5).map(row => 
          `<tr>${headers.map(h => `<td class="px-2 py-1 border">${row[h]}</td>`).join('')}</tr>`
        ).join('')}
        ${csvData.length > 5 ? `<tr><td colspan="${headers.length}" class="px-2 py-1 text-center text-gray-500">... ${t('common.moreRows').replace('{count}', csvData.length - 5)}</td></tr>` : ''}
      </tbody>
    `;
    
    document.getElementById('csvPreview').classList.remove('hidden');
    document.getElementById('csvUploadBtn').classList.remove('hidden');
  };
  reader.readAsText(file);
}

async function uploadCSVData() {
  if (csvData.length === 0) {
    alert(t('masterDB.noCSVData'));
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  try {
    let successCount = 0;
    for (const record of csvData) {
      const data = {
        品番: record['品番'] || record['Part Number'],
        製品名: record['製品名'] || record['Product Name'],
        'LH/RH': record['LH/RH'],
        kanbanID: record['kanbanID'],
        設備: record['設備'] || record['Equipment'],
        工場: record['工場'] || record['Factory'],
        cycleTime: record['cycleTime'],
        目標: (record['目標'] || record['Target']) ? parseFloat(record['目標'] || record['Target']) : null,
        警戒: (record['警戒'] || record['Warning']) ? parseFloat(record['警戒'] || record['Warning']) : null,
        dbName,
        username
      };

      const res = await fetch(BASE_URL + "createMasterRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (res.ok) successCount++;
    }

    alert(t('masterDB.recordsRegistered').replace('{success}', successCount).replace('{total}', csvData.length));
    closeCSVUploadModal();
    loadMasterData();
  } catch (err) {
    alert(t('masterDB.uploadError') + ': ' + err.message);
  }
}

// ====================
// Quick Create Functions
// ====================
async function showQuickCreateModal() {
  // Dynamically populate modal based on current tab
  const modalTitle = document.querySelector('#quickCreateModal h3');
  const modalBody = document.querySelector('#quickCreateModal .p-6 .grid');
  
  switch(currentTab) {
    case 'master':
      // Load equipment and factory data first
      await loadEquipment();
      await loadFactories();
      
      const equipmentOptions = allEquipment.length > 0 ? 
        allEquipment.map(e => `<option value="${e.設備名}">${e.設備名}</option>`).join('') :
        `<option value="" class="text-rose-600">⚠️ ${t('common.noEquipmentData')}</option>`;

      const factoryOptions = allFactories.length > 0 ?
        allFactories.map(f => `<option value="${f.name}">${f.name}</option>`).join('') :
        `<option value="" class="text-rose-600">⚠️ ${t('common.noFactoryData')}</option>`;

      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabMaster')})`;
      modalBody.innerHTML = `
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.productNumber')} *</label>
          <input type="text" id="quick品番" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: A001">
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.productName')} *</label>
          <input type="text" id="quick製品名" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: ProductA">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.lhrh')}</label>
          <select id="quickLHRH" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
            <option value="">${t('common.pleaseSelect')}</option>
            <option value="LH">LH</option>
            <option value="RH">RH</option>
            <option value="MID">MID</option>
            <option value="CTR">CTR</option>
            <option value="BOTH">BOTH</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.kanbanId')}</label>
          <input type="text" id="quickKanbanID" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.equipment')}</label>
          <select id="quick設備" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs ${allEquipment.length === 0 ? 'border-rose-300' : ''}">
            <option value="">${t('common.pleaseSelect')}</option>
            ${equipmentOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.factory')}</label>
          <select id="quick工場" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs ${allFactories.length === 0 ? 'border-rose-300' : ''}">
            <option value="">${t('common.pleaseSelect')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.cycleTime')}</label>
          <input type="number" id="quickCycleTime" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.enterCycleTime')}">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.grossProfit')}</label>
          <input type="number" step="0.01" id="quickGrossProfit" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: 1500.50">
        </div>
        <div class="rounded-xl p-2.5 bg-sky-50/70 border border-sky-200">
          <label class="block text-xs font-semibold text-sky-900 mb-1">${t('masterDB.inspectionMembers')} *</label>
          <input type="number" id="quickKensaMembers" class="w-full px-3 py-1.5 border border-sky-300 rounded-xl text-xs bg-white focus:border-sky-500 focus:outline-none shadow-2xs font-semibold" placeholder="${t('masterDB.example')}: 2" value="2" required>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.capacity')}</label>
          <input type="number" id="quick収容数" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.enterCapacity')}">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.target') || '目標'}</label>
          <input type="number" step="any" id="quick目標" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: 220">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.warning') || '警戒'}</label>
          <input type="number" step="any" id="quick警戒" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: 210">
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.productImage')}</label>
          <input type="file" id="quickImage" accept="image/*" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200">
        </div>
      `;
      break;
      
    case 'factory': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabFactory')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.factoryName')} *</label>
          <input type="text" id="quickFactoryName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="例: Tokyo Factory">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.address')}</label>
          <input type="text" id="quickFactoryAddress" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.phone')}</label>
          <input type="text" id="quickFactoryPhone" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="例: 03-1234-5678">
        </div>
      `;
      break;
    }
      
    case 'equipment': {
      // Load factories for dropdown
      await loadFactoriesForEquipmentCreate();
      
      // Load OPC variables for dropdown
      let opcVariables = [];
      try {
        const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
        const company = currentUser.dbName || "KSG";
        const response = await fetch(`${API_URL}/api/opcua/conversions?company=${company}`);
        const data = await response.json();
        console.log('📡 OPC API Response:', data);
        
        // Handle both array and object response formats
        const conversions = Array.isArray(data) ? data : (data.conversions || []);
        opcVariables = conversions.map(v => v.variableName).filter(Boolean);
        console.log('📊 Loaded OPC variables:', opcVariables);
      } catch (error) {
        console.error('❌ Failed to load OPC variables:', error);
      }
      
      const factoryOptions = allFactories.length > 0 ? 
        allFactories.map(f => `<option value="${f.name}">${f.name}</option>`).join('') :
        `<option value="" class="text-rose-600">⚠️ ${t('common.noFactoryData')}</option>`;

      const variableOptions = opcVariables.length > 0 ?
        opcVariables.map(v => `<option value="${v}">${v}</option>`).join('') :
        `<option value="">${t('masterDB.selectVariable')}</option>`;

      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabEquipment')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.equipmentName')} *</label>
          <input type="text" id="quickEquipmentName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="例: Machine A">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.factory')} (${t('masterDB.selectMultiple')})</label>
          <div id="quickEquipmentFactoryTags" class="w-full px-2.5 py-1.5 border border-gray-200 rounded-xl bg-gray-50/50 min-h-[34px] mb-2"></div>
          <select id="quickEquipmentFactorySelect" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs focus:border-indigo-500 focus:outline-none shadow-2xs ${allFactories.length === 0 ? 'border-rose-300' : ''}">
            <option value="">${t('common.addFactory')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('common.description')}</label>
          <textarea id="quickEquipmentDesc" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" rows="2"></textarea>
        </div>

        <!-- OPC Variable Mappings Section -->
        <div class="col-span-2 border-t border-gray-100 pt-3 mt-2">
          <h4 class="text-xs font-semibold text-gray-900 mb-2.5 flex items-center">
            <i class="ri-line-chart-line mr-1.5"></i>
            ${t('masterDB.opcVariableMappings')}
          </h4>
          <div class="grid grid-cols-1 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.kanbanVariable')}</label>
              <select id="quickEquipmentKanbanVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
                <option value="">${t('masterDB.selectVariable')}</option>
                ${variableOptions}
              </select>
              <p class="text-2xs text-gray-400 mt-1">${t('masterDB.forProductLookup')}</p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.productionCountVariable')}</label>
              <select id="quickEquipmentProductionVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
                <option value="">${t('masterDB.selectVariable')}</option>
                ${variableOptions}
              </select>
              <p class="text-2xs text-gray-400 mt-1">${t('masterDB.forProductionCalc')}</p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.boxQuantityVariable')}</label>
              <select id="quickEquipmentBoxQtyVar" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
                <option value="">${t('masterDB.selectVariable')}</option>
                ${variableOptions}
              </select>
              <p class="text-2xs text-gray-400 mt-1">${t('masterDB.forBoxQtyDisplay')}</p>
            </div>
          </div>
          <p class="text-2xs text-gray-400 mt-2">
            ${t('masterDB.opcConfigTip')} <strong>${t('masterDB.opcManagementPage')}</strong>
          </p>
        </div>
      `;
      
      // Initialize factory selection
      selectedQuickEquipmentFactories = [];
      renderQuickEquipmentFactoryTags();
      
      // Setup factory select handler
      const factorySelectEl = document.getElementById('quickEquipmentFactorySelect');
      if (factorySelectEl) {
        factorySelectEl.onchange = (e) => {
          if (e.target.value && !selectedQuickEquipmentFactories.includes(e.target.value)) {
            selectedQuickEquipmentFactories.push(e.target.value);
            renderQuickEquipmentFactoryTags();
          }
          e.target.value = '';
        };
      }
      
      // Set default values for OPC variable dropdowns
      setTimeout(() => {
        const kanbanSelect = document.getElementById('quickEquipmentKanbanVar');
        const productionSelect = document.getElementById('quickEquipmentProductionVar');
        const boxQtySelect = document.getElementById('quickEquipmentBoxQtyVar');
        
        // Do not force default for kanban variable so it stays blank unless chosen
        if (kanbanSelect) {
          kanbanSelect.value = '';
        }
        if (productionSelect && opcVariables.includes('seisanSu')) {
          productionSelect.value = 'seisanSu';
        }
        if (boxQtySelect && opcVariables.includes('hakoIresu')) {
          boxQtySelect.value = 'hakoIresu';
        }
      }, 100);
      
      break;
    }
      
    case 'roles': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabRoles')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.roleName')} *</label>
          <input type="text" id="quickRoleName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: operator">
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('common.description')}</label>
          <textarea id="quickRoleDesc" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" rows="2"></textarea>
        </div>
      `;
    }
      break;
      
    case 'department': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabDepartment')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.departmentName')} *</label>
          <input type="text" id="quickDepartmentName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: 製造部">
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('common.description')}</label>
          <textarea id="quickDepartmentDesc" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" rows="2"></textarea>
        </div>
      `;
    }
      break;
      
    case 'section': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabSection')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.sectionName')} *</label>
          <input type="text" id="quickSectionName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: 品質管理係">
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('common.description')}</label>
          <textarea id="quickSectionDesc" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" rows="2"></textarea>
        </div>
      `;
    }
      break;
      
    case 'tablet': {
      // Load equipment and factory data first
      await loadEquipment();
      await loadFactories();

      const factoryOptions = allFactories.length > 0 ?
        allFactories.map(f => `<option value="${f.name}">${f.name}</option>`).join('') :
        `<option value="" class="text-rose-600">⚠️ ${t('common.noFactoryData')}</option>`;

      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabTablet')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.tabletName')} *</label>
          <input type="text" id="quickTabletName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: Tablet1">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.brand')} *</label>
          <input type="text" id="quickTabletBrand" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: samsung">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.factoryLocation')} *</label>
          <select id="quickTabletFactory" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs ${allFactories.length === 0 ? 'border-rose-300' : ''}" onchange="updateQuickTabletEquipmentDropdown()">
            <option value="">${t('common.pleaseSelect')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.equipmentName')} *</label>
          <select id="quickTablet設備" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:border-indigo-500 focus:outline-none shadow-2xs">
            <option value="">${t('common.selectFactoryFirst')}</option>
          </select>
        </div>
      `;
    }
      break;
  }
  
  document.getElementById('quickCreateModal').classList.remove('hidden');
}

function closeQuickCreateModal() {
  document.getElementById('quickCreateModal').classList.add('hidden');
  // Form will be regenerated on next open, so no need to clear
}

async function submitQuickCreate() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";
  
  let data = {};
  let endpoint = '';
  
  try {
    switch(currentTab) {
      case 'master':
        data = {
          品番: document.getElementById("quick品番").value.trim(),
          製品名: document.getElementById("quick製品名").value.trim(),
          "LH/RH": document.getElementById("quickLHRH").value,
          kanbanID: document.getElementById("quickKanbanID").value.trim(),
          設備: document.getElementById("quick設備").value.trim(),
          工場: document.getElementById("quick工場").value.trim(),
          cycleTime: document.getElementById("quickCycleTime").value,
          grossProfit: document.getElementById("quickGrossProfit").value ? parseFloat(document.getElementById("quickGrossProfit").value) : null,
          kensaMembers: parseInt(document.getElementById("quickKensaMembers").value) || 2,
          収容数: document.getElementById("quick収容数").value ? parseInt(document.getElementById("quick収容数").value) : null,
          目標: document.getElementById("quick目標")?.value ? parseFloat(document.getElementById("quick目標").value) : null,
          警戒: document.getElementById("quick警戒")?.value ? parseFloat(document.getElementById("quick警戒").value) : null,
          dbName,
          username
        };
        
        if (!data.品番 || !data.製品名) {
          return alert(t('common.fillRequiredFields'));
        }
        
        // Handle image upload
        const imageFile = document.getElementById("quickImage");
        if (imageFile && imageFile.files[0]) {
          const base64 = await fileToBase64(imageFile.files[0]);
          data.imageBase64 = base64;
        }
        
        endpoint = "createMasterRecord";
        break;
        
      case 'factory':
        data = {
          name: document.getElementById("quickFactoryName").value.trim(),
          address: document.getElementById("quickFactoryAddress").value.trim(),
          phone: document.getElementById("quickFactoryPhone").value.trim(),
          divisions: [],
          dbName
        };
        
        if (!data.name) {
          return alert(t('masterDB.factoryNameRequired'));
        }
        
        endpoint = "createFactory";
        break;
        
      case 'equipment':
        data = {
          設備名: document.getElementById("quickEquipmentName").value.trim(),
          工場: selectedQuickEquipmentFactories,
          description: document.getElementById("quickEquipmentDesc").value.trim(),
          opcVariables: {
            kanbanVariable: document.getElementById("quickEquipmentKanbanVar")?.value.trim() || "",
            productionCountVariable: document.getElementById("quickEquipmentProductionVar")?.value.trim() || "seisanSu",
            boxQuantityVariable: document.getElementById("quickEquipmentBoxQtyVar")?.value.trim() || "hakoIresu"
          },
          dbName
        };
        
        if (!data.設備名) {
          return alert(t('masterDB.equipmentNameRequired'));
        }
        
        endpoint = "createEquipment";
        break;
        
      case 'roles':
        data = {
          roleName: document.getElementById("quickRoleName").value.trim(),
          description: document.getElementById("quickRoleDesc").value.trim(),
          dbName
        };
        
        if (!data.roleName) {
          return alert(t('masterDB.roleNameRequired'));
        }
        
        endpoint = "createRole";
        break;
        
      case 'department':
        data = {
          name: document.getElementById("quickDepartmentName").value.trim(),
          description: document.getElementById("quickDepartmentDesc").value.trim(),
          dbName
        };

        if (!data.name) {
          return alert(t('masterDB.departmentNameRequired'));
        }
        
        endpoint = "createDepartment";
        break;
        
      case 'section':
        data = {
          name: document.getElementById("quickSectionName").value.trim(),
          description: document.getElementById("quickSectionDesc").value.trim(),
          dbName
        };

        if (!data.name) {
          return alert(t('masterDB.sectionNameRequired'));
        }
        
        endpoint = "createSection";
        break;
        
      case 'tablet':
        const tabletData = {
          tabletName: document.getElementById("quickTabletName").value.trim(),
          tabletBrand: document.getElementById("quickTabletBrand").value.trim(),
          factoryLocation: document.getElementById("quickTabletFactory").value.trim(),
          設備名: document.getElementById("quickTablet設備").value.trim()
        };
        
        if (!tabletData.tabletName || !tabletData.tabletBrand || !tabletData.factoryLocation || !tabletData.設備名) {
          return alert(t('masterDB.fillAllRequired'));
        }
        
        data = {
          dbName,
          username,
          tabletData
        };
        
        endpoint = "createTablet";
        break;
    }

    const res = await fetch(BASE_URL + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to create record");

    alert(t('common.createdSuccessfully'));
    closeQuickCreateModal();
    loadTabData(currentTab);
  } catch (err) {
    console.error("Create error:", err);
    alert(t('common.createFailed') + ": " + err.message);
  }
}

// ====================
// Utility Functions
// ====================

// Helper function to update equipment dropdown in Quick Create modal for tablets
function updateQuickTabletEquipmentDropdown() {
  const factorySelect = document.getElementById('quickTabletFactory');
  const equipmentSelect = document.getElementById('quickTablet設備');

  if (!factorySelect || !equipmentSelect) return;

  const selectedFactory = factorySelect.value;

  if (!selectedFactory) {
    equipmentSelect.innerHTML = `<option value="">${t('common.selectFactoryFirst')}</option>`;
    return;
  }

  // Filter equipment by selected factory
  const filteredEquipment = allEquipment.filter(eq =>
    eq.工場 && eq.工場.includes(selectedFactory)
  );

  if (filteredEquipment.length === 0) {
    equipmentSelect.innerHTML = `<option value="">${t('common.noEquipmentForFactory')}</option>`;
  } else {
    equipmentSelect.innerHTML = `<option value="">${t('common.pleaseSelect')}</option>` +
      filteredEquipment.map(eq => `<option value="${eq.設備名}">${eq.設備名}</option>`).join('');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    console.log(`[ImageUpload] Original file size: ${(file.size / 1024 / 1024).toFixed(2)} MB (${file.type})`);
    
    if (!file.type.startsWith('image/')) {
      console.log(`[ImageUpload] Not an image, skipping compression.`);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        console.log(`[ImageUpload] Original dimensions: ${width}x${height}`);

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        console.log(`[ImageUpload] Compressed dimensions: ${width}x${height}`);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        // Fill white background in case of transparent images
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64 = dataUrl.split(',')[1];
        
        // Calculate rough size of base64 string
        const sizeInBytes = (base64.length * (3/4)) - 2;
        console.log(`[ImageUpload] Compressed approximate size: ${(sizeInBytes / 1024).toFixed(2)} KB`);
        
        resolve(base64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Initialize on page load
if (typeof window !== 'undefined') {
  window.switchMainTab = switchMainTab;
  window.switchSubTab = switchSubTab;
  window.switchModalTab = switchModalTab;
  window.toggleSelectAll = toggleSelectAll;
  window.updateSelectedCount = updateSelectedCount;
  window.openDetailModal = openDetailModal;
  window.closeDetailModal = closeDetailModal;
  window.toggleEditMode = toggleEditMode;
  window.cancelEditMode = cancelEditMode;
  window.saveModalChanges = saveModalChanges;
  window.previewImage = previewImage;
  window.showDeleteConfirmation = showDeleteConfirmation;
  window.closeDeleteConfirmModal = closeDeleteConfirmModal;
  window.confirmDelete = confirmDelete;
  window.showCSVUploadModal = showCSVUploadModal;
  window.closeCSVUploadModal = closeCSVUploadModal;
  window.handleCSVUpload = handleCSVUpload;
  window.uploadCSVData = uploadCSVData;
  window.showQuickCreateModal = showQuickCreateModal;
  window.closeQuickCreateModal = closeQuickCreateModal;
  window.submitQuickCreate = submitQuickCreate;
  window.removeModalFactoryTag = removeModalFactoryTag;
  window.removeQuickEquipmentFactoryTag = removeQuickEquipmentFactoryTag;
  window.updateQuickTabletEquipmentDropdown = updateQuickTabletEquipmentDropdown;
  window.loadMasterData = loadMasterData;
  window.showCreateMasterForm = showCreateMasterForm;
  window.submitNewMaster = submitNewMaster;
  window.editMasterRecord = editMasterRecord;
  window.deleteMasterRecord = deleteMasterRecord;
  window.loadFactories = loadFactories;
  window.showCreateFactoryForm = showCreateFactoryForm;
  window.submitNewFactory = submitNewFactory;
  window.startEditingFactory = startEditingFactory;
  window.saveFactory = saveFactory;
  window.deleteFactory = deleteFactory;
  window.loadFactoriesForDivisionDropdown = loadFactoriesForDivisionDropdown;
  window.loadDivisions = loadDivisions;
  window.showCreateDivisionForm = showCreateDivisionForm;
  window.submitNewDivision = submitNewDivision;
  window.deleteDivision = deleteDivision;
  window.loadEquipment = loadEquipment;
  window.showCreateEquipmentForm = showCreateEquipmentForm;
  window.addFactoryTag = addFactoryTag;
  window.removeFactoryTag = removeFactoryTag;
  window.submitNewEquipment = submitNewEquipment;
  window.editEquipment = editEquipment;
  window.deleteEquipment = deleteEquipment;
  window.loadRoles = loadRoles;
  window.showCreateRoleForm = showCreateRoleForm;
  window.submitNewRole = submitNewRole;
  window.deleteRole = deleteRole;
  window.loadDepartments = loadDepartments;
  window.loadSections = loadSections;
  window.loadGoogleSheetTargets = loadGoogleSheetTargets;
  window.showGoogleSheetTargetModal = showGoogleSheetTargetModal;
  window.closeGoogleSheetTargetModal = closeGoogleSheetTargetModal;
  window.inspectGoogleSheetFromModal = inspectGoogleSheetFromModal;
  window.handleGoogleSheetTargetGroupChange = handleGoogleSheetTargetGroupChange;
  window.toggleAllGoogleSheetTargetProducts = toggleAllGoogleSheetTargetProducts;
  window.updateGoogleSheetTargetProductCount = updateGoogleSheetTargetProductCount;
  window.resetGoogleSheetAnalysisView = resetGoogleSheetAnalysisView;
  window.analyzeGoogleSheetModal = analyzeGoogleSheetModal;
  window.saveGoogleSheetTarget = saveGoogleSheetTarget;
  window.deleteGoogleSheetTarget = deleteGoogleSheetTarget;

  // Load master data by default
  loadMasterData();
}

// ====================
// Google Sheets Target Functions
// ====================

async function ensureGoogleSheetReferenceData() {
  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const dbName = currentUser.dbName || 'KSG';
  const role = currentUser.role || 'admin';

  const [productsResponse, ngGroupsResponse] = await Promise.all([
    fetch(BASE_URL + 'getMasterDB', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbName, role })
    }),
    fetch(BASE_URL + 'getNGGroups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbName })
    })
  ]);

  if (!productsResponse.ok) {
    throw new Error('Failed to load products');
  }

  if (!ngGroupsResponse.ok) {
    throw new Error('Failed to load defect groups');
  }

  allMasterData = await productsResponse.json();
  allNGGroups = await ngGroupsResponse.json();
}

function gsText(key, replacements = {}) {
  const template = String(t(`masterDB.googleSheets.${key}`));

  return template.replace(/\{(\w+)\}/g, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(replacements, token)) {
      return replacements[token];
    }
    return match;
  });
}

function getGoogleSheetsLocale() {
  return typeof getCurrentLanguage === 'function' && getCurrentLanguage() === 'ja' ? 'ja-JP' : 'en-US';
}

function formatGoogleSheetsDate(value) {
  return value ? new Date(value).toLocaleString(getGoogleSheetsLocale()) : '';
}

async function loadGoogleSheetTargets() {
  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const dbName = currentUser.dbName || 'KSG';
  const container = document.getElementById('googleSheetsTargetContainer');

  if (!container) return;
  container.innerHTML = `<p class="text-gray-500">${t('common.loading')}</p>`;

  try {
    const [infoRes, targetsRes] = await Promise.all([
      fetch(BASE_URL + 'getGoogleSheetServiceAccountInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }),
      fetch(BASE_URL + 'getGoogleSheetTargets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbName })
      })
    ]);

    googleSheetServiceAccountInfo = infoRes.ok
      ? await infoRes.json()
      : { configured: false, serviceAccountEmail: '' };

    if (!targetsRes.ok) {
      throw new Error(gsText('loadTargetsFailed'));
    }

    allGoogleSheetTargets = await targetsRes.json();
    renderGoogleSheetTargets(allGoogleSheetTargets);
  } catch (error) {
    console.error('Failed to load Google Sheet targets:', error);
    container.innerHTML = `<p class="text-red-600">${gsText('loadFailed', { message: escapeHtml(error.message) })}</p>`;
  }
}

function renderGoogleSheetTargets(targets = []) {
  const container = document.getElementById('googleSheetsTargetContainer');
  if (!container) return;

  const serviceEmail = escapeHtml(googleSheetServiceAccountInfo.serviceAccountEmail || gsText('serviceAccountNotConfigured'));
  const configured = Boolean(googleSheetServiceAccountInfo.configured);

  const statusBadge = configured
    ? `<span class="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-2xs font-medium text-emerald-700 border border-emerald-200">${gsText('configured')}</span>`
    : `<span class="inline-flex items-center rounded-lg bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-700 border border-amber-200">${gsText('notConfigured')}</span>`;

  const rowsHtml = targets.length === 0
    ? `
      <tr>
        <td colspan="7" class="px-3 py-8 text-center text-xs font-medium text-gray-400">
          ${gsText('emptyState')}
        </td>
      </tr>
    `
    : targets.map(target => {
        const productCount = Array.isArray(target.masterRecords) ? target.masterRecords.length : 0;
        const productNames = Array.isArray(target.masterRecords)
          ? target.masterRecords.slice(0, 3).map(product => escapeHtml(product.hinban || product.productName)).join(' / ')
          : '';
        const remainingProducts = productCount > 3
          ? ` +${productCount - 3}`
          : '';
        const syncBadge = target.lastSyncStatus === 'success'
          ? `<span class="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-2xs font-medium text-emerald-700 border border-emerald-200">${gsText('statusSyncOk')}</span>`
          : target.lastSyncStatus === 'error'
            ? `<span class="inline-flex items-center rounded-lg bg-rose-50 px-2 py-0.5 text-2xs font-medium text-rose-700 border border-rose-200">${gsText('statusSyncError')}</span>`
            : `<span class="inline-flex items-center rounded-lg bg-gray-100 px-2 py-0.5 text-2xs font-medium text-gray-600 border border-gray-200">${gsText('statusNotRun')}</span>`;
        const lastStatusText = target.lastSyncError
          ? escapeHtml(target.lastSyncError)
          : target.lastUsedAt
            ? escapeHtml(formatGoogleSheetsDate(target.lastUsedAt))
            : gsText('notSentYet');

        return `
          <tr class="hover:bg-gray-50/70 transition">
            <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(target.label || '')}</td>
            <td class="px-3 py-2">
              <div class="font-medium text-gray-900">${escapeHtml(target.spreadsheetTitle || '')}</div>
              <div class="text-2xs text-gray-500 font-mono">${escapeHtml(target.spreadsheetId || '')}</div>
            </td>
            <td class="px-3 py-2 text-gray-600">${escapeHtml(target.sheetName || '')}</td>
            <td class="px-3 py-2 text-gray-600">${escapeHtml(target.ngGroupName || '')}</td>
            <td class="px-3 py-2">
              <div class="text-xs text-gray-900">${productNames || '-'}</div>
              <div class="text-2xs text-gray-500 tabular-nums">${gsText('productCount', { count: productCount })}${remainingProducts}</div>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              ${syncBadge}
              <div class="mt-0.5 text-2xs text-gray-500">${lastStatusText}</div>
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <div class="flex justify-end gap-1.5">
                <button type="button" class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 px-2.5 py-1.5 rounded-xl border border-indigo-100 transition cursor-pointer" onclick="showGoogleSheetTargetModal('${escapeHtml(String(target._id))}')">
                  <i class="ri-edit-line"></i>${t('common.edit')}
                </button>
                <button type="button" class="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-900 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-100 transition cursor-pointer" onclick="deleteGoogleSheetTarget('${escapeHtml(String(target._id))}')">
                  <i class="ri-delete-bin-line"></i>${t('common.delete')}
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

  container.innerHTML = `
    <div class="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="mb-1.5 flex items-center gap-2.5">
            <h2 class="text-sm font-semibold text-gray-900">${gsText('title')}</h2>
            ${statusBadge}
          </div>
          <p class="text-xs text-gray-500">${gsText('description')}</p>
        </div>
        <button type="button" class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer" onclick="showGoogleSheetTargetModal()">
          <i class="ri-add-line"></i>${gsText('registerButton')}
        </button>
      </div>
      <div class="mt-3 rounded-xl border border-dashed ${configured ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'} p-3 text-xs">
        <div class="font-semibold text-gray-900 text-xs">${gsText('serviceAccountTitle')}</div>
        <div class="mt-0.5 font-mono text-xs text-gray-700 select-all">${serviceEmail}</div>
        <p class="mt-1 text-2xs text-gray-500">${gsText('serviceAccountDescription')}</p>
      </div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 select-none whitespace-nowrap">${gsText('tableLinkName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${gsText('tableSpreadsheet')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${gsText('tableSheet')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${gsText('tableNgGroup')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${gsText('tableTargetProducts')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${gsText('tableLastStatus')}</th>
            <th class="px-3 py-2 text-right select-none whitespace-nowrap">${t('common.actions')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function buildGoogleSheetTargetModalHtml(target = {}) {
  const label = escapeHtml(target.label || '');
  const spreadsheetUrl = escapeHtml(target.spreadsheetUrl || target.spreadsheetId || '');
  const serviceAccountEmail = escapeHtml(googleSheetServiceAccountInfo.serviceAccountEmail || gsText('serviceAccountNotConfigured'));
  const modalTitle = target._id ? gsText('modalEditTitle') : gsText('modalCreateTitle');
  const serviceAccountStatus = googleSheetServiceAccountInfo.configured
    ? gsText('serviceAccountConfigured')
    : gsText('serviceAccountMissing');

  return `
    <div id="googleSheetTargetModal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
      <div class="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">${modalTitle}</h2>
            <p class="mt-0.5 text-xs text-gray-500">${gsText('modalDescription')}</p>
          </div>
          <button type="button" class="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition cursor-pointer" onclick="closeGoogleSheetTargetModal()">
            <i class="ri-close-line text-xl"></i>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-6">
          <div class="space-y-6">
            <div class="rounded-2xl border ${googleSheetServiceAccountInfo.configured ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'} p-4">
              <div class="text-xs font-semibold text-gray-900">${gsText('serviceAccountTitle')}</div>
              <div id="gstServiceAccountEmail" class="mt-1 font-mono text-xs text-gray-700 select-all">${serviceAccountEmail}</div>
              <div id="gstServiceAccountStatus" class="mt-2 text-xs font-medium ${googleSheetServiceAccountInfo.configured ? 'text-emerald-700' : 'text-amber-700'}">${serviceAccountStatus}</div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-xs font-semibold text-gray-700">${gsText('labelField')}</label>
                <input id="gstLabel" type="text" value="${label}" class="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${gsText('labelPlaceholder')}" />
              </div>
              <div class="md:col-span-1">
                <label class="mb-1.5 block text-xs font-semibold text-gray-700">${gsText('spreadsheetUrlField')}</label>
                <div class="flex gap-2">
                  <input id="gstSpreadsheetUrl" type="text" value="${spreadsheetUrl}" class="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="https://docs.google.com/spreadsheets/d/..." />
                  <button type="button" class="inline-flex items-center gap-1 shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer" onclick="inspectGoogleSheetFromModal()">${gsText('verifyAccess')}</button>
                </div>
                <p id="gstInspectStatus" class="mt-1.5 text-xs text-gray-400">${gsText('verifyUrlHint')}</p>
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-semibold text-gray-700">${gsText('sheetField')}</label>
                <select id="gstSheetName" class="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" onchange="handleGoogleSheetTargetSheetChange()">
                  <option value="">${gsText('sheetPlaceholderAfterVerify')}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-semibold text-gray-700">${gsText('ngGroupField')}</label>
                <select id="gstNgGroupId" class="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-2xs" onchange="handleGoogleSheetTargetGroupChange()">
                  <option value="">${gsText('ngGroupPlaceholder')}</option>
                </select>
              </div>
            </div>

            <div class="rounded-2xl border border-gray-100 p-4 bg-gray-50/30">
              <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 class="text-sm font-semibold text-gray-900">${gsText('targetProductsTitle')}</h3>
                  <p class="text-xs text-gray-400">${gsText('targetProductsDescription')}</p>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" class="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition cursor-pointer" onclick="toggleAllGoogleSheetTargetProducts(true)">${gsText('selectAll')}</button>
                  <button type="button" class="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition cursor-pointer" onclick="toggleAllGoogleSheetTargetProducts(false)">${gsText('clearAll')}</button>
                </div>
              </div>
              <div id="gstProductCount" class="mb-2 text-xs font-medium text-gray-500 tabular-nums">${gsText('selectedCount', { count: 0 })}</div>
              <div id="gstProductList" class="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
                <p class="text-xs text-gray-400">${gsText('selectNgGroupHint')}</p>
              </div>
            </div>

            <div id="gstDuplicateWarning" class="hidden rounded-xl border border-amber-200 bg-amber-50 p-4"></div>

            <div class="rounded-2xl border border-gray-100 p-4 bg-gray-50/30">
              <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 class="text-sm font-semibold text-gray-900">${gsText('columnCheckTitle')}</h3>
                  <p class="text-xs text-gray-400">${gsText('columnCheckDescription')}</p>
                </div>
                <button type="button" class="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer" onclick="analyzeGoogleSheetModal()">${gsText('checkColumns')}</button>
              </div>
              <div id="gstAnalysisSection" class="hidden">
                <div id="gstAnalysisContainer"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition cursor-pointer" onclick="closeGoogleSheetTargetModal()">${t('common.cancel')}</button>
          <button id="gstSaveBtn" type="button" class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-2xs disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer" onclick="saveGoogleSheetTarget()" disabled>${t('common.save')}</button>
        </div>
      </div>
    </div>
  `;
}

async function showGoogleSheetTargetModal(targetId = '') {
  await ensureGoogleSheetReferenceData();

  const target = allGoogleSheetTargets.find(item => String(item._id) === String(targetId)) || null;
  currentGoogleSheetEditTargetId = target ? String(target._id) : '';
  currentGoogleSheetInspection = null;
  currentGoogleSheetAnalysis = null;

  closeGoogleSheetTargetModal();
  document.body.insertAdjacentHTML('beforeend', buildGoogleSheetTargetModalHtml(target || {}));

  populateGoogleSheetNgGroupOptions(target?.ngGroupId || '');
  renderGoogleSheetTargetProductChecklist(target?.ngGroupId || '', target?.masterRecordIds || []);
  renderGoogleSheetTargetDuplicateWarning();

  if (target?.spreadsheetUrl || target?.spreadsheetId) {
    await inspectGoogleSheetFromModal(target?.sheetName || '');
    if (target?.sheetName) {
      const sheetSelect = document.getElementById('gstSheetName');
      if (sheetSelect) {
        sheetSelect.value = target.sheetName;
      }
    }

    renderGoogleSheetTargetDuplicateWarning();

    if ((target?.masterRecordIds || []).length > 0 && target?.ngGroupId) {
      await analyzeGoogleSheetModal(target.fieldMappings || []);
    }
  }
}

function closeGoogleSheetTargetModal() {
  const modal = document.getElementById('googleSheetTargetModal');
  if (modal) {
    modal.remove();
  }
  currentGoogleSheetInspection = null;
  currentGoogleSheetAnalysis = null;
  currentGoogleSheetEditTargetId = '';
}

function populateGoogleSheetNgGroupOptions(selectedId = '') {
  const select = document.getElementById('gstNgGroupId');
  if (!select) return;

  const sortedGroups = [...allNGGroups].sort((a, b) => String(a.groupName || '').localeCompare(String(b.groupName || ''), 'ja'));
  select.innerHTML = `<option value="">${gsText('ngGroupPlaceholder')}</option>` + sortedGroups.map(group => `
    <option value="${escapeHtml(String(group._id))}" ${String(group._id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(group.groupName || '')}</option>
  `).join('');
}

function renderGoogleSheetTargetProductChecklist(ngGroupId = '', selectedIds = []) {
  const list = document.getElementById('gstProductList');
  if (!list) return;

  const normalizedSelected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(id => String(id)));
  const products = allMasterData
    .filter(product => String(product.ngGroupId || '') === String(ngGroupId))
    .sort((a, b) => String(a.品番 || '').localeCompare(String(b.品番 || ''), 'ja'));

  if (!ngGroupId) {
    list.innerHTML = `<p class="text-sm text-gray-500">${gsText('selectNgGroupHint')}</p>`;
    updateGoogleSheetTargetProductCount();
    return;
  }

  if (products.length === 0) {
    list.innerHTML = `<p class="text-sm text-amber-600">${gsText('noProductsForGroup')}</p>`;
    updateGoogleSheetTargetProductCount();
    return;
  }

  list.innerHTML = products.map(product => {
    const productId = String(product._id);
    return `
      <label class="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-blue-300">
        <input type="checkbox" class="mt-1 rounded border-gray-300 gst-product-checkbox" value="${escapeHtml(productId)}" ${normalizedSelected.has(productId) ? 'checked' : ''} onchange="updateGoogleSheetTargetProductCount()">
        <span class="min-w-0">
          <span class="block font-medium text-slate-900">${escapeHtml(product.品番 || '-')}</span>
          <span class="block text-xs text-slate-500">${escapeHtml(product.製品名 || '')} / ${escapeHtml(product.kanbanID || '')}</span>
        </span>
      </label>
    `;
  }).join('');

  updateGoogleSheetTargetProductCount();
}

function handleGoogleSheetTargetGroupChange() {
  const groupId = document.getElementById('gstNgGroupId')?.value || '';
  renderGoogleSheetTargetProductChecklist(groupId, []);
  resetGoogleSheetAnalysisView();
}

function handleGoogleSheetTargetSheetChange() {
  resetGoogleSheetAnalysisView();
  renderGoogleSheetTargetDuplicateWarning();
}

function toggleAllGoogleSheetTargetProducts(checked) {
  document.querySelectorAll('.gst-product-checkbox').forEach(checkbox => {
    checkbox.checked = Boolean(checked);
  });
  updateGoogleSheetTargetProductCount();
}

function updateGoogleSheetTargetProductCount() {
  const selectedCount = document.querySelectorAll('.gst-product-checkbox:checked').length;
  const countEl = document.getElementById('gstProductCount');
  if (countEl) {
    countEl.textContent = gsText('selectedCount', { count: selectedCount });
  }

  renderGoogleSheetTargetDuplicateWarning();
}

function getSelectedGoogleSheetProductIds() {
  return Array.from(document.querySelectorAll('.gst-product-checkbox:checked')).map(checkbox => checkbox.value);
}

function getGoogleSheetTargetOverlapInfo() {
  const selectedIds = new Set(getSelectedGoogleSheetProductIds().map(id => String(id)));
  const spreadsheetId = String(currentGoogleSheetAnalysis?.spreadsheetId || currentGoogleSheetInspection?.spreadsheetId || '').trim();
  const sheetName = String(document.getElementById('gstSheetName')?.value || '').trim();

  if (selectedIds.size === 0) {
    return {
      overlaps: [],
      overlappingProductIds: [],
      hasSameDestinationOverlap: false,
    };
  }

  const overlaps = allGoogleSheetTargets
    .filter(target => target?.isActive !== false && String(target?._id || '') !== String(currentGoogleSheetEditTargetId || ''))
    .map(target => {
      const targetProductIds = (Array.isArray(target?.masterRecordIds) ? target.masterRecordIds : []).map(id => String(id));
      const overlappingProductIds = targetProductIds.filter(id => selectedIds.has(id));
      const targetSpreadsheetId = String(target?.spreadsheetId || '').trim();
      const targetSheetName = String(target?.sheetName || '').trim();
      const sheetLabel = [String(target?.spreadsheetTitle || '').trim(), targetSheetName].filter(Boolean).join(' / ');

      return {
        targetId: String(target?._id || ''),
        label: String(target?.label || sheetLabel).trim() || '-',
        sheetLabel,
        overlappingProductIds,
        sameDestination: Boolean(spreadsheetId && sheetName && spreadsheetId === targetSpreadsheetId && sheetName === targetSheetName),
      };
    })
    .filter(target => target.overlappingProductIds.length > 0);

  return {
    overlaps,
    overlappingProductIds: [...new Set(overlaps.flatMap(target => target.overlappingProductIds))],
    hasSameDestinationOverlap: overlaps.some(target => target.sameDestination),
  };
}

function renderGoogleSheetTargetDuplicateWarning() {
  const warningEl = document.getElementById('gstDuplicateWarning');
  if (!warningEl) return;

  const { overlaps, overlappingProductIds, hasSameDestinationOverlap } = getGoogleSheetTargetOverlapInfo();
  if (overlaps.length === 0) {
    warningEl.className = 'hidden rounded-xl border border-amber-200 bg-amber-50 p-4';
    warningEl.innerHTML = '';
    return;
  }

  const overlapItems = overlaps.map(target => `
      <li class="text-xs text-amber-800">
        ${escapeHtml(gsText('duplicateWarningItem', {
          label: target.label,
          sheet: target.sheetLabel || '-',
          count: target.overlappingProductIds.length,
        }))}
      </li>
    `).join('');

  warningEl.className = 'rounded-xl border border-amber-200 bg-amber-50 p-4';
  warningEl.innerHTML = `
    <div class="flex items-start gap-3">
      <i class="ri-alert-line mt-0.5 text-lg text-amber-700"></i>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-amber-900">${gsText('duplicateWarningTitle')}</div>
        <p class="mt-1 text-xs text-amber-800">${gsText('duplicateWarningDescription')}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <span class="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">${gsText('duplicateWarningOverlapCount', { count: overlappingProductIds.length })}</span>
          <span class="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">${gsText('duplicateWarningTargetCount', { count: overlaps.length })}</span>
        </div>
        ${hasSameDestinationOverlap ? `<p class="mt-3 text-xs font-medium text-red-700">${gsText('duplicateWarningSameDestination')}</p>` : ''}
        <div class="mt-3 text-xs font-semibold text-amber-900">${gsText('duplicateWarningListTitle')}</div>
        <ul class="mt-2 space-y-1">${overlapItems}</ul>
      </div>
    </div>
  `;
}

function resetGoogleSheetAnalysisView() {
  currentGoogleSheetAnalysis = null;
  const section = document.getElementById('gstAnalysisSection');
  const container = document.getElementById('gstAnalysisContainer');
  const saveBtn = document.getElementById('gstSaveBtn');

  if (section) section.classList.add('hidden');
  if (container) container.innerHTML = '';
  if (saveBtn) saveBtn.disabled = true;
}

async function inspectGoogleSheetFromModal(selectedSheetName = '') {
  const spreadsheetUrl = document.getElementById('gstSpreadsheetUrl')?.value?.trim() || '';
  const statusEl = document.getElementById('gstInspectStatus');
  const sheetSelect = document.getElementById('gstSheetName');
  const emailEl = document.getElementById('gstServiceAccountEmail');

  if (!spreadsheetUrl) {
    alert(gsText('enterSpreadsheetUrl'));
    return;
  }

  if (statusEl) {
    statusEl.textContent = gsText('verifyingAccess');
    statusEl.className = 'mt-2 text-xs text-slate-500';
  }

  try {
    const response = await fetch(BASE_URL + 'inspectGoogleSheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetUrl })
    });

    const result = await response.json();
    const serviceAccountEmail = result?.serviceAccountEmail || googleSheetServiceAccountInfo.serviceAccountEmail || '';

    if (serviceAccountEmail) {
      googleSheetServiceAccountInfo = {
        configured: googleSheetServiceAccountInfo.configured || Boolean(result?.success),
        serviceAccountEmail,
      };

      if (emailEl) {
        emailEl.textContent = serviceAccountEmail;
      }
    }

    if (!response.ok || !result.success) {
      const rawError = String(result?.error || gsText('inspectFailedNoAccess'));
      const normalizedError = rawError.toLowerCase();

      if (serviceAccountEmail && (normalizedError.includes('permission') || normalizedError.includes('forbidden') || normalizedError.includes('insufficient'))) {
        const shareMessage = gsText('shareSheetMessage', { email: serviceAccountEmail });

        if (statusEl) {
          statusEl.textContent = shareMessage;
          statusEl.className = 'mt-2 text-xs text-amber-700';
        }

        alert(shareMessage);
        resetGoogleSheetAnalysisView();
        return;
      }

      throw new Error(rawError);
    }

    googleSheetServiceAccountInfo = {
      configured: true,
      serviceAccountEmail,
    };
    currentGoogleSheetInspection = result;

    if (sheetSelect) {
      const sheetOptions = (result.sheets || []).map(sheet => `
        <option value="${escapeHtml(sheet.sheetName)}" ${sheet.sheetName === selectedSheetName ? 'selected' : ''}>${escapeHtml(sheet.sheetName)}</option>
      `).join('');
      sheetSelect.innerHTML = `<option value="">${gsText('sheetPlaceholderSelect')}</option>` + sheetOptions;
    }

    if (statusEl) {
      statusEl.textContent = gsText('accessSuccess', {
        title: result.spreadsheetTitle,
        count: (result.sheets || []).length,
      });
      statusEl.className = 'mt-2 text-xs text-emerald-700';
    }
  } catch (error) {
    console.error('Failed to inspect Google Sheet:', error);
    currentGoogleSheetInspection = null;
    if (sheetSelect) {
      sheetSelect.innerHTML = `<option value="">${gsText('sheetPlaceholderAfterVerify')}</option>`;
    }
    if (statusEl) {
      statusEl.textContent = gsText('accessFailed', { message: error.message });
      statusEl.className = 'mt-2 text-xs text-red-600';
    }
  }

  renderGoogleSheetTargetDuplicateWarning();

  resetGoogleSheetAnalysisView();
}

function buildGoogleSheetFieldSelectOptions(field, analysis) {
  const seen = new Set();
  const candidateHeaders = [];

  (field.candidateHeaders || []).forEach(candidate => {
    const name = candidate.headerName;
    if (name && !seen.has(name)) {
      seen.add(name);
      candidateHeaders.push(name);
    }
  });

  (analysis.unusedHeaders || []).forEach(candidate => {
    const name = candidate.headerName;
    if (name && !seen.has(name)) {
      seen.add(name);
      candidateHeaders.push(name);
    }
  });

  (analysis.headers || []).forEach(name => {
    const normalized = String(name || '').trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      candidateHeaders.push(normalized);
    }
  });

  const options = [];
  if (field.status === 'review') {
    options.push(`<option value="">${gsText('selectColumnPrompt')}</option>`);
  }

  candidateHeaders.forEach(headerName => {
    options.push(`<option value="${escapeHtml(headerName)}">${gsText('existingColumnOption', { name: escapeHtml(headerName) })}</option>`);
  });

  options.push(`<option value="__create__" ${field.status === 'new' ? 'selected' : ''}>${gsText('createNewColumnOption', { name: escapeHtml(field.fieldLabel) })}</option>`);
  return options.join('');
}

function renderGoogleSheetAnalysis(analysis) {
  const section = document.getElementById('gstAnalysisSection');
  const container = document.getElementById('gstAnalysisContainer');
  const saveBtn = document.getElementById('gstSaveBtn');
  if (!section || !container) return;

  const matchedCount = analysis.fields.filter(field => field.status === 'matched').length;
  const reviewFields = analysis.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.status !== 'matched');
  const reviewRows = reviewFields.length === 0
    ? `<p class="text-sm text-emerald-700">${gsText('allColumnsMatched')}</p>`
    : reviewFields.map(({ field, index }) => `
        <div class="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-[1.2fr_1.5fr]">
          <div>
            <div class="font-medium text-slate-900">${escapeHtml(field.fieldLabel)}</div>
            <div class="mt-1 text-xs ${field.status === 'review' ? 'text-amber-700' : 'text-slate-500'}">
              ${field.status === 'review' ? gsText('reviewNeededMultiple') : gsText('reviewNeededMissing')}
            </div>
          </div>
          <div>
            <select id="gstFieldMap_${index}" data-field-key="${escapeHtml(field.fieldKey)}" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              ${buildGoogleSheetFieldSelectOptions(field, analysis)}
            </select>
          </div>
        </div>
      `).join('');

  const matchedRows = analysis.fields
    .filter(field => field.status === 'matched')
    .slice(0, 12)
    .map(field => `
      <span class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        ${escapeHtml(field.fieldLabel)} → ${escapeHtml(field.headerName)}
      </span>
    `).join('');

  container.innerHTML = `
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div class="rounded-xl bg-emerald-50 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-emerald-700">${gsText('summaryAutoMatched')}</div>
        <div class="mt-2 text-2xl font-semibold text-emerald-900">${matchedCount}</div>
      </div>
      <div class="rounded-xl bg-amber-50 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-amber-700">${gsText('summaryNeedsReview')}</div>
        <div class="mt-2 text-2xl font-semibold text-amber-900">${analysis.fields.filter(field => field.status === 'review').length}</div>
      </div>
      <div class="rounded-xl bg-slate-50 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-slate-600">${gsText('summaryNewColumns')}</div>
        <div class="mt-2 text-2xl font-semibold text-slate-900">${analysis.fields.filter(field => field.status === 'new').length}</div>
      </div>
    </div>
    <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div class="mb-3 text-sm font-semibold text-slate-900">${gsText('matchedFieldsTitle')}</div>
      <div class="flex flex-wrap gap-2">${matchedRows || `<span class="text-sm text-gray-500">${gsText('noMatchedFields')}</span>`}</div>
    </div>
    <div class="mt-4 space-y-3">
      ${reviewRows}
    </div>
  `;

  section.classList.remove('hidden');
  if (saveBtn) saveBtn.disabled = false;
}

function collectGoogleSheetTargetFieldMappings() {
  if (!currentGoogleSheetAnalysis) {
    return [];
  }

  return currentGoogleSheetAnalysis.fields.map((field, index) => {
    if (field.status === 'matched') {
      return { fieldKey: field.fieldKey, headerName: field.headerName, action: 'map' };
    }

    const select = document.getElementById(`gstFieldMap_${index}`);
    const selectedValue = select?.value || '';

    if (!selectedValue) {
      throw new Error(gsText('mappingRequired', { field: field.fieldLabel }));
    }

    if (selectedValue === '__create__') {
      return { fieldKey: field.fieldKey, headerName: field.fieldLabel, action: 'create' };
    }

    return { fieldKey: field.fieldKey, headerName: selectedValue, action: 'map' };
  });
}

async function analyzeGoogleSheetModal(initialMappings = null) {
  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const dbName = currentUser.dbName || 'KSG';
  const spreadsheetUrl = document.getElementById('gstSpreadsheetUrl')?.value?.trim() || '';
  const sheetName = document.getElementById('gstSheetName')?.value || '';
  const ngGroupId = document.getElementById('gstNgGroupId')?.value || '';
  const selectedProducts = getSelectedGoogleSheetProductIds();

  if (!spreadsheetUrl || !sheetName || !ngGroupId) {
    alert(gsText('selectUrlTabGroup'));
    return;
  }

  if (selectedProducts.length === 0) {
    alert(gsText('selectAtLeastOneProduct'));
    return;
  }

  const requestedMappings = Array.isArray(initialMappings)
    ? initialMappings
    : (currentGoogleSheetAnalysis ? collectGoogleSheetTargetFieldMappings() : []);

  try {
    const response = await fetch(BASE_URL + 'analyzeGoogleSheetTarget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbName,
        spreadsheetUrl,
        sheetName,
        ngGroupId,
        masterRecordIds: selectedProducts,
        fieldMappings: requestedMappings,
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || gsText('columnCheckFailed'));
    }

    currentGoogleSheetAnalysis = result;
    if (result.serviceAccountEmail) {
      const emailEl = document.getElementById('gstServiceAccountEmail');
      if (emailEl) emailEl.textContent = result.serviceAccountEmail;
    }
    renderGoogleSheetAnalysis(result);
  } catch (error) {
    console.error('Failed to analyze Google Sheet target:', error);
    alert(`${gsText('columnCheckFailed')}: ${error.message}`);
    resetGoogleSheetAnalysisView();
  }
}

async function saveGoogleSheetTarget() {
  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const dbName = currentUser.dbName || 'KSG';
  const username = currentUser.username || 'admin';
  const label = document.getElementById('gstLabel')?.value?.trim() || '';
  const spreadsheetUrl = document.getElementById('gstSpreadsheetUrl')?.value?.trim() || '';
  const sheetName = document.getElementById('gstSheetName')?.value || '';
  const ngGroupId = document.getElementById('gstNgGroupId')?.value || '';
  const masterRecordIds = getSelectedGoogleSheetProductIds();

  if (!currentGoogleSheetAnalysis) {
    alert(gsText('runColumnCheckBeforeSave'));
    return;
  }

  if (!spreadsheetUrl || !sheetName || !ngGroupId || masterRecordIds.length === 0) {
    alert(gsText('confirmUrlTabGroupProducts'));
    return;
  }

  const overlapInfo = getGoogleSheetTargetOverlapInfo();
  if (overlapInfo.overlaps.length > 0) {
    let confirmationMessage = gsText('duplicateConfirm', {
      targetCount: overlapInfo.overlaps.length,
      productCount: overlapInfo.overlappingProductIds.length,
    });

    if (overlapInfo.hasSameDestinationOverlap) {
      confirmationMessage += `\n\n${gsText('duplicateConfirmSameDestination')}`;
    }

    if (!confirm(confirmationMessage)) {
      return;
    }
  }

  try {
    const fieldMappings = collectGoogleSheetTargetFieldMappings();
    const response = await fetch(BASE_URL + 'saveGoogleSheetTarget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbName,
        username,
        targetId: currentGoogleSheetEditTargetId,
        target: {
          label,
          spreadsheetUrl,
          spreadsheetId: currentGoogleSheetAnalysis.spreadsheetId,
          sheetName,
          ngGroupId,
          masterRecordIds,
          fieldMappings,
          isActive: true,
        }
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || gsText('saveFailed'));
    }

    alert(gsText('saveSuccess'));
    closeGoogleSheetTargetModal();
    loadGoogleSheetTargets();
  } catch (error) {
    console.error('Failed to save Google Sheet target:', error);
    alert(`${gsText('saveFailed')}: ${error.message}`);
  }
}

async function deleteGoogleSheetTarget(targetId) {
  if (!confirm(gsText('deleteConfirm'))) {
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem('authUser') || '{}');
  const dbName = currentUser.dbName || 'KSG';
  const username = currentUser.username || 'admin';

  try {
    const response = await fetch(BASE_URL + 'deleteGoogleSheetTarget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbName, username, targetId })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || gsText('deleteFailed'));
    }

    alert(gsText('deleteSuccess'));
    loadGoogleSheetTargets();
  } catch (error) {
    console.error('Failed to delete Google Sheet target:', error);
    alert(`${gsText('deleteFailed')}: ${error.message}`);
  }
}

// ====================
// Rpi Server Functions
// ====================
async function loadRpiServers() {
  try {
    const response = await fetch(`${API_URL}/api/deviceInfo?company=${COMPANY}`);
    const data = await response.json();
    
    if (data.success) {
      if (!Array.isArray(allFactories) || allFactories.length === 0) {
        const factoriesRes = await fetch(BASE_URL + "getFactories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbName: COMPANY })
        });
        const factories = await factoriesRes.json();
        allFactories = Array.isArray(factories) ? factories : [];
      }
      renderRpiServerTable(data.devices);
    } else {
      showToast(t('masterDB.failedToLoadDevices'), 'error');
    }
  } catch (error) {
    console.error('Error loading RPI servers:', error);
    showToast(t('masterDB.failedToLoadDevices'), 'error');
  }
}

function renderRpiServerTable(devices) {
  const container = document.getElementById('rpiServerTableContainer');
  
  if (!devices || devices.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-gray-500">
        <i class="ri-server-line text-3xl text-gray-300 mb-2.5 block"></i>
        <p class="text-xs font-medium text-gray-600">${t('masterDB.noDevicesRegistered')}</p>
        <p class="text-2xs text-gray-400 mt-0.5">${t('masterDB.devicesAppearAutomatically')}</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.deviceId')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.deviceName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.localIp')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.owner')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.factory') || 'Factory'}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.status')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.lastSeen')}</th>
            <th class="px-3 py-2 text-right select-none whitespace-nowrap">${t('common.actions')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
  `;

  devices.forEach(device => {
    const isActive = isDeviceActive(device.updated_at);
    const statusBadge = isActive
      ? `<span class="inline-flex items-center rounded-lg px-2 py-0.5 text-2xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">${t('masterDB.active')}</span>`
      : `<span class="inline-flex items-center rounded-lg px-2 py-0.5 text-2xs font-medium bg-gray-100 text-gray-600 border border-gray-200">${t('masterDB.inactive')}</span>`;

    const lastUpdated = new Date(device.updated_at).toLocaleString('ja-JP');
    const authorizedUntil = new Date(device.authorized_until).toLocaleDateString('ja-JP');

    const factoryObj = device.factoryId ? allFactories.find(f => f._id === device.factoryId) : null;
    const factoryName = factoryObj ? factoryObj.name : '-';

    html += `
      <tr class="hover:bg-gray-50/70 transition">
        <td class="px-3 py-2 whitespace-nowrap">
          <div class="flex items-center">
            <i class="ri-cpu-line text-indigo-500 mr-1.5 text-sm"></i>
            <span class="font-mono font-semibold text-gray-900 text-xs">${device.device_id}</span>
          </div>
        </td>
        <td class="px-3 py-2 whitespace-nowrap">
          <div class="font-medium text-gray-900">${device.device_name || '-'}</div>
          <div class="text-2xs text-gray-400">${device.device_brand || 'Raspberry Pi'}</div>
        </td>
        <td class="px-3 py-2 whitespace-nowrap">
          <span class="font-mono text-xs text-gray-600">${device.local_ip || '-'}</span>
        </td>
        <td class="px-3 py-2 text-gray-600 whitespace-nowrap">
          <span>${device.owner || '-'}</span>
        </td>
        <td class="px-3 py-2 text-gray-600 whitespace-nowrap">
          <span>${factoryName}</span>
        </td>
        <td class="px-3 py-2 whitespace-nowrap">${statusBadge}</td>
        <td class="px-3 py-2 whitespace-nowrap">
          <div class="text-xs font-medium text-gray-900 tabular-nums">${lastUpdated}</div>
          <div class="text-2xs text-gray-400 tabular-nums">${t('masterDB.validUntil')}: ${authorizedUntil}</div>
        </td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          <button onclick="editRpiServer('${device._id}')"
            class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 px-2.5 py-1.5 rounded-xl border border-indigo-100 transition cursor-pointer">
            <i class="ri-edit-line"></i> ${t('common.edit')}
          </button>
        </td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  container.innerHTML = html;
}

function isDeviceActive(updatedAt) {
  const lastUpdate = new Date(updatedAt);
  const now = new Date();
  const diffMinutes = (now - lastUpdate) / 1000 / 60;
  return diffMinutes < 10; // Consider active if updated within last 10 minutes
}

let editingRpiServerId = null;
let originalRpiServerData = null;

async function editRpiServer(deviceId) {
  try {
    if (!Array.isArray(allFactories) || allFactories.length === 0) {
      const factoriesRes = await fetch(BASE_URL + "getFactories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName: COMPANY })
      });
      const factories = await factoriesRes.json();
      allFactories = Array.isArray(factories) ? factories : [];
    }

    const response = await fetch(`${API_URL}/api/deviceInfo/${deviceId}?company=${COMPANY}`);
    const data = await response.json();
    
    if (data.success) {
      editingRpiServerId = deviceId;
      originalRpiServerData = { ...data.device };
      showRpiServerEditModal(data.device);
    }
  } catch (error) {
    console.error('Error loading device:', error);
    showToast(t('masterDB.failedToLoadDeviceDetails'), 'error');
  }
}

function showRpiServerEditModal(device) {
  const modalHtml = `
    <div id="rpiServerEditModal" class="fixed inset-0 bg-gray-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full overflow-hidden">
        <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">${t('masterDB.editDevice')}</h2>
          <button onclick="closeRpiServerEditModal()" class="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition cursor-pointer">
            <i class="ri-close-line text-xl"></i>
          </button>
        </div>

        <div class="p-6">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.deviceIdReadOnly')}</label>
              <input type="text" value="${device.device_id}" disabled
                class="w-full px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 font-mono text-sm">
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.deviceName')} *</label>
              <input type="text" id="editDeviceName" value="${device.device_name || ''}"
                class="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none shadow-2xs">
              <p class="mt-1 text-xs text-gray-400">${t('masterDB.friendlyNameHint')}</p>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.owner')}</label>
              <input type="text" id="editDeviceOwner" value="${device.owner || ''}"
                class="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none shadow-2xs">
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.factory') || 'Factory'}</label>
              <select id="editDeviceFactory"
                class="w-full px-3.5 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:border-indigo-500 focus:outline-none shadow-2xs">
                <option value="">${t('common.selectFactory') || 'Select Factory'}</option>
                ${allFactories.map(f => `<option value="${f._id}" ${device.factoryId === f._id ? 'selected' : ''}>${f.name}</option>`).join('')}
              </select>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.localIpReadOnly')}</label>
                <input type="text" value="${device.local_ip || '-'}" disabled
                  class="w-full px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 font-mono text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.lastSeen')}</label>
                <input type="text" value="${new Date(device.updated_at).toLocaleString('ja-JP')}" disabled
                  class="w-full px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm tabular-nums">
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1.5">${t('masterDB.authorizedUntil')}</label>
              <input type="text" value="${new Date(device.authorized_until).toLocaleDateString('ja-JP')}" disabled
                class="w-full px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm tabular-nums">
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onclick="closeRpiServerEditModal()"
            class="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition cursor-pointer">
            ${t('common.cancel')}
          </button>
          <button onclick="saveRpiServer()"
            class="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer">
            <i class="ri-save-line"></i>${t('masterDB.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeRpiServerEditModal() {
  const modal = document.getElementById('rpiServerEditModal');
  if (modal) {
    modal.remove();
  }
  editingRpiServerId = null;
  originalRpiServerData = null;
}

async function saveRpiServer() {
  const deviceName = document.getElementById('editDeviceName').value.trim();
  const owner = document.getElementById('editDeviceOwner').value.trim();
  const factoryId = document.getElementById('editDeviceFactory').value;

  if (!deviceName) {
    showToast(t('masterDB.deviceNameRequired'), 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/deviceInfo/${editingRpiServerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: COMPANY,
        device_name: deviceName,
        owner: owner,
        factoryId: factoryId
      })
    });

    const data = await response.json();

    if (data.success) {
      showToast(t('masterDB.deviceUpdatedSuccess'), 'success');
      closeRpiServerEditModal();
      loadRpiServers();
    } else {
      showToast(data.message || t('masterDB.failedToUpdateDevice'), 'error');
    }
  } catch (error) {
    console.error('Error updating device:', error);
    showToast(t('masterDB.failedToUpdateDevice'), 'error');
  }
}

// ====================
// Tablet Functions
// ====================

async function loadTablets() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getTablets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    allTablets = await res.json();
    renderTabletsTable(allTablets);
  } catch (err) {
    console.error("Failed to load tablets:", err);
    document.getElementById("tabletTableContainer").innerHTML = `<p class="text-red-600">${t('common.failedToLoad')}: ${err.message}</p>`;
  }
}

function renderTabletsTable(tablets) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteTabletsBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="showDeleteConfirmation('tablet')">
          <i class="ri-delete-bin-line"></i>${t('masterDB.deleteSelected')} (<span id="tabletSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">${t('common.total')}: <span class="text-xs font-semibold text-gray-900 tabular-nums">${tablets.length}</span> ${t('masterDB.tabTablet')}</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 w-10 text-center select-none"><input type="checkbox" id="selectAllTablets" onchange="toggleSelectAll('tablet')" class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.tabletName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.brand')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.factoryLocation')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.equipmentName')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.registeredDate')}</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">${t('masterDB.registeredBy')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${tablets.length > 0 ? tablets.map(tab => `
            <tr class="hover:bg-gray-50/70 transition cursor-pointer" onclick="openDetailModal('tablet', '${tab._id}')">
              <td class="px-3 py-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="tabletCheckbox w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${tab._id}" onchange="updateSelectedCount('tablet')"></td>
              <td class="px-3 py-2 whitespace-nowrap font-semibold text-gray-900"><i class="ri-tablet-line text-indigo-500 mr-1.5"></i>${escapeHtml(tab.tabletName || "")}</td>
              <td class="px-3 py-2 text-gray-600 whitespace-nowrap">${escapeHtml(tab.tabletBrand || "")}</td>
              <td class="px-3 py-2 text-gray-600 whitespace-nowrap">${escapeHtml(tab.factoryLocation || "")}</td>
              <td class="px-3 py-2 text-gray-600 whitespace-nowrap">${escapeHtml(tab.設備名 || "")}</td>
              <td class="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">${tab.registeredAt ? new Date(tab.registeredAt).toLocaleDateString('ja-JP') : ""}</td>
              <td class="px-3 py-2 text-gray-600 whitespace-nowrap">${escapeHtml(tab.registeredBy || "")}</td>
            </tr>
          `).join("") : `<tr><td colspan="7" class="px-3 py-8 text-center text-xs font-medium text-gray-400">${t('common.noResults') || 'No results found'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("tabletTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('tablet');
}

async function showCreateTabletForm() {
  const container = document.getElementById("tabletTableContainer");
  
  // Load equipment list if not already loaded
  if (allEquipment.length === 0) {
    await loadEquipment();
  }
  
  // Load factory list if not already loaded
  if (allFactories.length === 0) {
    await loadFactories();
  }
  
  // Generate factory dropdown options
  const factoryOptions = allFactories.map(f => 
    `<option value="${f.name || ''}">${f.name || ''}</option>`
  ).join('');
  
  const formHTML = `
    <div class="bg-white border border-gray-100 p-5 rounded-2xl shadow-xs mb-5">
      <h3 class="text-sm font-semibold text-gray-900 mb-3">${t('masterDB.tabletRegistration')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.tabletName')} *</label>
          <input type="text" id="newTabletName" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: Tablet-001" oninput="checkTabletNameUnique()" />
          <p id="tabletNameError" class="text-rose-600 text-2xs mt-1 hidden">${t('masterDB.tabletNameInUse')}</p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.brand')} *</label>
          <input type="text" id="newTabletBrand" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.example')}: iPad, Samsung" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.factoryLocation')} *</label>
          <select id="newFactoryLocation" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" onchange="updateTabletEquipmentDropdown()">
            <option value="">${t('common.selectFactory')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.equipmentName')} *</label>
          <select id="new設備名" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl bg-white text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" disabled>
            <option value="">${t('common.selectFactoryFirst')}</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-gray-700 mb-1">${t('masterDB.accessRestriction')}</label>
          <p class="text-2xs text-gray-400 mb-1.5">${t('masterDB.accessRestrictionDesc')}</p>
          <input type="text" id="newAuthorizedUsers" class="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:border-indigo-500 focus:outline-none shadow-2xs" placeholder="${t('masterDB.accessRestrictionPlaceholder')}" />
        </div>
      </div>
      <div class="flex gap-2.5">
        <button id="submitTabletBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs cursor-pointer" onclick="submitNewTablet()">
          <i class="ri-save-line"></i>${t('common.register')}
        </button>
        <button class="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition cursor-pointer" onclick="loadTablets()">
          <i class="ri-close-line"></i>${t('common.cancel')}
        </button>
      </div>
    </div>
  `;
  
  container.innerHTML = formHTML + container.innerHTML;
}

// Check if tablet name is unique
function checkTabletNameUnique() {
  const nameInput = document.getElementById('newTabletName');
  const errorMsg = document.getElementById('tabletNameError');
  const submitBtn = document.getElementById('submitTabletBtn');
  
  if (!nameInput || !errorMsg || !submitBtn) return;
  
  const inputName = nameInput.value.trim();
  
  if (!inputName) {
    errorMsg.classList.add('hidden');
    nameInput.classList.remove('border-red-500');
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    return;
  }
  
  // Check if name exists in allTablets
  const nameExists = allTablets.some(tablet => 
    tablet.tabletName && tablet.tabletName.toLowerCase() === inputName.toLowerCase()
  );
  
  if (nameExists) {
    errorMsg.classList.remove('hidden');
    nameInput.classList.add('border-red-500');
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    errorMsg.classList.add('hidden');
    nameInput.classList.remove('border-red-500');
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

// Function to update equipment dropdown based on selected factory
function updateTabletEquipmentDropdown() {
  const factorySelect = document.getElementById('newFactoryLocation');
  const equipmentSelect = document.getElementById('new設備名');

  const selectedFactory = factorySelect.value;

  if (!selectedFactory) {
    // No factory selected, disable and reset equipment dropdown
    equipmentSelect.disabled = true;
    equipmentSelect.innerHTML = `<option value="">${t('common.selectFactoryFirst')}</option>`;
    return;
  }
  
  // Filter equipment by selected factory
  const filteredEquipment = allEquipment.filter(eq => {
    // Check if equipment's 工場 array includes the selected factory
    return eq.工場 && Array.isArray(eq.工場) && eq.工場.includes(selectedFactory);
  });
  
  // Generate options for filtered equipment
  const equipmentOptions = filteredEquipment.map(eq => 
    `<option value="${eq.設備名 || ''}">${eq.設備名 || ''}</option>`
  ).join('');
  
  // Update dropdown
  equipmentSelect.disabled = false;
  equipmentSelect.innerHTML = `<option value="">${t('common.selectEquipment')}</option>${equipmentOptions}`;
}

// Function to update equipment dropdown in modal (for editing)
function updateTabletEquipmentDropdownModal() {
  const factorySelect = document.getElementById('tabletFactorySelect');
  const equipmentSelect = document.getElementById('tabletEquipmentSelect');
  
  const selectedFactory = factorySelect.value;
  const currentEquipment = equipmentSelect.value; // Preserve current selection if possible
  
  if (!selectedFactory) {
    // No factory selected, disable and reset equipment dropdown
    equipmentSelect.disabled = true;
    equipmentSelect.innerHTML = `<option value="">${t('common.selectFactoryFirst')}</option>`;
    return;
  }

  // Filter equipment by selected factory
  const filteredEquipment = allEquipment.filter(eq => {
    return eq.工場 && Array.isArray(eq.工場) && eq.工場.includes(selectedFactory);
  });

  // Generate options for filtered equipment
  const equipmentOptions = filteredEquipment.map(eq =>
    `<option value="${eq.設備名 || ''}" ${eq.設備名 === currentEquipment ? 'selected' : ''}>${eq.設備名 || ''}</option>`
  ).join('');

  // Update dropdown
  equipmentSelect.disabled = false;
  equipmentSelect.innerHTML = `<option value="">${t('common.selectEquipment')}</option>${equipmentOptions}`;
}

async function submitNewTablet() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  const tabletData = {
    tabletName: document.getElementById("newTabletName").value.trim(),
    tabletBrand: document.getElementById("newTabletBrand").value.trim(),
    factoryLocation: document.getElementById("newFactoryLocation").value.trim(),
    設備名: document.getElementById("new設備名").value.trim()
  };
  
  // Parse authorized users (optional, comma-separated)
  const authorizedUsersInput = document.getElementById("newAuthorizedUsers").value.trim();
  if (authorizedUsersInput) {
    tabletData.authorizedUsers = authorizedUsersInput.split(',').map(u => u.trim()).filter(u => u);
  } else {
    tabletData.authorizedUsers = []; // Empty array means no restriction
  }

  if (!tabletData.tabletName || !tabletData.tabletBrand || !tabletData.factoryLocation || !tabletData.設備名) {
    return alert(t('masterDB.fillAllRequired'));
  }

  // Check for duplicate tablet name
  const nameExists = allTablets.some(tablet =>
    tablet.tabletName && tablet.tabletName.toLowerCase() === tabletData.tabletName.toLowerCase()
  );

  if (nameExists) {
    return alert(t('masterDB.tabletNameExists'));
  }

  try {
    const res = await fetch(BASE_URL + "createTablet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName, username, tabletData })
    });

    if (!res.ok) throw new Error("Failed");
    alert(t('masterDB.tabletCreated'));
    loadTablets();
  } catch (err) {
    alert(t('common.error') + ": " + err.message);
  }
}

async function deleteTablet(tabletId) {
  if (!confirm(t('masterDB.deleteTabletConfirm'))) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  try {
    const res = await fetch(BASE_URL + "deleteTablet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabletId, dbName, username })
    });

    if (!res.ok) throw new Error("Failed");
    alert(t('masterDB.tabletDeleted'));
    loadTablets();
  } catch (err) {
    alert(t('common.error') + ": " + err.message);
  }
}

// ====================
// Tablet QR Code Functions
// ====================
function toggleTabletQR() {
  const qrSection = document.getElementById('tabletQRSection');
  const button = event.target.closest('button');
  
  if (qrSection.classList.contains('hidden')) {
    qrSection.classList.remove('hidden');
    button.innerHTML = `<i class="ri-eye-off-line mr-1"></i>${t('masterDB.hideQRCode')}`;
  } else {
    qrSection.classList.add('hidden');
    button.innerHTML = `<i class="ri-eye-line mr-1"></i>${t('masterDB.showQRCode')}`;
  }
}

function copyTabletUrl() {
  const urlInput = document.getElementById('tabletUrlInput');
  urlInput.select();
  urlInput.setSelectionRange(0, 99999); // For mobile devices
  
  navigator.clipboard.writeText(urlInput.value).then(() => {
    // Change button text temporarily
    const button = event.target.closest('button');
    const originalHTML = button.innerHTML;
    button.innerHTML = `<i class="ri-check-line mr-1"></i>${t('masterDB.copied')}`;
    button.classList.remove('bg-green-600', 'hover:bg-green-700');
    button.classList.add('bg-emerald-600');
    
    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('bg-emerald-600');
      button.classList.add('bg-green-600', 'hover:bg-green-700');
    }, 2000);
  }).catch(err => {
    alert(t('masterDB.urlCopyFailed'));
    console.error('Copy failed:', err);
  });
}

function downloadTabletQR() {
  const qrImg = document.querySelector('#tabletQRSection img');
  const tabletName = currentModalData.tabletName || 'tablet';
  
  // Create a temporary link to download the QR code
  fetch(qrImg.src)
    .then(response => response.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `QR_${tabletName}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Show success feedback
      const button = event.target.closest('button');
      const originalHTML = button.innerHTML;
      button.innerHTML = `<i class="ri-check-line mr-1"></i>${t('masterDB.downloadComplete')}`;
      button.classList.remove('bg-purple-600', 'hover:bg-purple-700');
      button.classList.add('bg-emerald-600');

      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.classList.remove('bg-emerald-600');
        button.classList.add('bg-purple-600', 'hover:bg-purple-700');
      }, 2000);
    })
    .catch(err => {
      alert(t('masterDB.urlCopyFailed'));
      console.error('Download failed:', err);
    });
}

function openTabletUrl() {
  const url = document.getElementById('tabletUrlInput').value;
  window.open(url, '_blank');
}

// ====================
// NG Groups - Modal Helper (edit mode in master record)
// ====================
async function loadNGGroupsForModal() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  try {
    const res = await fetch(BASE_URL + "getNGGroups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });
    allNGGroups = await res.json();
  } catch (e) {
    console.error("Failed to load ngGroups for modal:", e);
    allNGGroups = [];
  }

  // Populate select
  const select = document.getElementById('modalNGGroupSelect');
  const display = document.getElementById('modalNGGroupDisplay');
  if (!select) return;

  select.innerHTML = '<option value="">未割当（なし）</option>';
  allNGGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g._id;
    opt.textContent = g.groupName;
    if (currentModalData && String(currentModalData.ngGroupId) === String(g._id)) opt.selected = true;
    select.appendChild(opt);
  });

  // Swap display → select
  if (display) display.classList.add('hidden');
  select.classList.remove('hidden');
}

// ====================
// Master NG Tab Functions
// ====================
async function loadNGGroups() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  document.getElementById('masterNGTableContainer').innerHTML = '<p class="text-gray-500">読み込み中...</p>';
  try {
    const res = await fetch(BASE_URL + "getNGGroups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });
    allNGGroups = await res.json();
    renderNGGroupsTable(allNGGroups);
  } catch (e) {
    console.error("Failed to load ngGroups:", e);
    document.getElementById('masterNGTableContainer').innerHTML = '<p class="text-red-500">読み込みエラー</p>';
  }
}

function renderNGGroupsTable(groups) {
  const container = document.getElementById('masterNGTableContainer');
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button onclick="showNGGroupModal()" class="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition shadow-2xs cursor-pointer">
          <i class="ri-add-line"></i>新規グループ作成
        </button>
        <button id="deleteNGGroupsBtn" class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs opacity-50 cursor-not-allowed cursor-pointer" disabled onclick="confirmDeleteNGGroups()">
          <i class="ri-delete-bin-line"></i>削除 (<span id="ngGroupSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-xs font-medium text-gray-500 tabular-nums">合計: <span class="text-xs font-semibold text-gray-900 tabular-nums">${groups.length}</span> グループ</div>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-gray-100 text-xs">
        <thead class="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th class="px-3 py-2 w-10 text-center select-none"><input type="checkbox" id="selectAllNGGroups" onchange="toggleSelectAllNGGroups()" class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>
            <th class="px-3 py-2 select-none whitespace-nowrap">グループ名</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">不良項目数</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">カラープレビュー</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">作成者</th>
            <th class="px-3 py-2 select-none whitespace-nowrap">作成日時</th>
            <th class="px-3 py-2 text-right select-none whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white text-gray-700">
          ${groups.length === 0 ? `
            <tr><td colspan="7" class="px-3 py-8 text-center text-xs font-medium text-gray-400">グループがありません。「新規グループ作成」から作成してください。</td></tr>
          ` : groups.map(g => `
            <tr class="hover:bg-gray-50/70 transition">
              <td class="px-3 py-2 text-center"><input type="checkbox" class="ngGroupCheckbox w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${g._id}" onchange="updateNGGroupSelectCount()"></td>
              <td class="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">${escapeHtml(g.groupName || '')}</td>
              <td class="px-3 py-2 tabular-nums text-gray-600 whitespace-nowrap">${(g.items || []).length} 項目</td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap gap-1 items-center">
                  ${(g.items || []).slice(0, 8).map(item => `
                    <span class="inline-block w-3.5 h-3.5 rounded-full border border-gray-200 shadow-2xs" style="background:${item.color || '#ccc'}" title="${escapeHtml(item.name || '')}"></span>
                  `).join('')}
                  ${(g.items || []).length > 8 ? `<span class="text-2xs text-gray-400 tabular-nums font-medium">+${(g.items || []).length - 8}</span>` : ''}
                </div>
              </td>
              <td class="px-3 py-2 text-gray-600 whitespace-nowrap">${escapeHtml(g.createdBy || '-')}</td>
              <td class="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">${g.createdAt ? new Date(g.createdAt).toLocaleDateString('ja-JP') : '-'}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button onclick="showNGGroupModal(${JSON.stringify(g).replace(/"/g, '&quot;')})" class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 px-2.5 py-1.5 rounded-xl border border-indigo-100 transition cursor-pointer">
                  <i class="ri-edit-line"></i>編集
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  container.innerHTML = tableHTML;
}

function toggleSelectAllNGGroups() {
  const selectAll = document.getElementById('selectAllNGGroups');
  document.querySelectorAll('.ngGroupCheckbox').forEach(cb => cb.checked = selectAll.checked);
  updateNGGroupSelectCount();
}

function updateNGGroupSelectCount() {
  const checked = document.querySelectorAll('.ngGroupCheckbox:checked').length;
  const countEl = document.getElementById('ngGroupSelectedCount');
  const btn = document.getElementById('deleteNGGroupsBtn');
  if (countEl) countEl.textContent = checked;
  if (btn) {
    if (checked > 0) {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  }
}

async function confirmDeleteNGGroups() {
  const checked = document.querySelectorAll('.ngGroupCheckbox:checked');
  const ids = Array.from(checked).map(cb => cb.value);
  if (ids.length === 0) return;
  if (!confirm(`選択した ${ids.length} 件のグループを削除しますか？\n割り当て済みの製品の不良グループは解除されません。`)) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  try {
    const res = await fetch(BASE_URL + "deleteNGGroups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIds: ids, dbName, username })
    });
    const result = await res.json();
    alert(`${result.deletedCount} 件削除しました`);
    loadNGGroups();
  } catch (e) {
    alert("削除エラー: " + e.message);
  }
}

// Track which color input is currently focused for palette click
let _focusedColorInput = null;
let _editingNGGroup = null;

function setFocusedColorInput(input) {
  _focusedColorInput = input;
}

function applyPresetColor(color) {
  if (_focusedColorInput) {
    _focusedColorInput.value = color;
    // Update swatch preview next to the input
    const swatch = _focusedColorInput.nextElementSibling;
    if (swatch && swatch.classList.contains('ng-color-swatch')) {
      swatch.style.background = color;
    }
  }
}

function showNGGroupModal(group = null) {
  _editingNGGroup = group;
  const modal = document.getElementById('ngGroupModal');
  const title = document.getElementById('ngGroupModalTitle');
  const nameInput = document.getElementById('ngGroupName');
  const itemsList = document.getElementById('ngItemsList');
  const emptyMsg = document.getElementById('ngItemsEmpty');

  title.textContent = group ? `不良グループ編集: ${group.groupName}` : '不良グループ新規作成';
  nameInput.value = group ? group.groupName : '';
  itemsList.innerHTML = '';
  _focusedColorInput = null;

  // Wire up palette clicks
  document.querySelectorAll('.ng-preset-color').forEach(el => {
    el.onclick = () => applyPresetColor(el.dataset.color);
  });

  if (group && group.items && group.items.length > 0) {
    group.items.forEach(item => addNGItemRow(item));
    emptyMsg.classList.add('hidden');
  } else {
    emptyMsg.classList.remove('hidden');
  }

  modal.classList.remove('hidden');
}

function closeNGGroupModal() {
  document.getElementById('ngGroupModal').classList.add('hidden');
  _editingNGGroup = null;
  _focusedColorInput = null;
}

function addNGItemRow(item = null) {
  const list = document.getElementById('ngItemsList');
  const emptyMsg = document.getElementById('ngItemsEmpty');
  if (emptyMsg) emptyMsg.classList.add('hidden');

  const color = (item && item.color) ? item.color : '#f44336';
  const name = (item && item.name) ? item.name : '';
  const countUp = item ? (item.countUp !== false) : true;

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 ng-item-row p-1.5 bg-gray-50 border border-gray-200 rounded-xl';
  row.draggable = true;
  row.innerHTML = `
    <span class="ng-drag-handle flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 px-1 text-base select-none" title="ドラッグして並び替え">⠿</span>
    <span class="ng-order-badge flex-shrink-0 w-5 h-5 rounded-full bg-gray-300 text-gray-700 text-2xs font-bold flex items-center justify-center select-none">?</span>
    <input type="text" placeholder="不良名（例: シルバー）" value="${name.replace(/"/g, '&quot;')}"
           class="flex-1 px-2.5 py-1 border border-gray-200 rounded-lg ng-item-name text-xs bg-white focus:border-indigo-500 focus:outline-none" />
    <div class="flex items-center gap-1">
      <input type="color" value="${color}" class="w-7 h-7 border border-gray-200 rounded-lg cursor-pointer ng-item-color p-0"
             onfocus="setFocusedColorInput(this)" oninput="this.nextElementSibling.style.background=this.value" />
      <span class="ng-color-swatch w-4 h-4 rounded-full border border-gray-300 flex-shrink-0" style="background:${color}"></span>
    </div>
    <label class="flex items-center gap-1 text-2xs whitespace-nowrap cursor-pointer select-none text-gray-600" title="チェックON: 不良合計にカウント / チェックOFF: カウントしない">
      <input type="checkbox" class="ng-item-countup w-3.5 h-3.5 rounded border-gray-300 text-indigo-600" ${countUp ? 'checked' : ''}>
      <span>合計に含む</span>
    </label>
    <button type="button" onclick="removeNGItem(this)" class="text-rose-400 hover:text-rose-600 flex-shrink-0 p-1 cursor-pointer">
      <i class="ri-delete-bin-line"></i>
    </button>
  `;

  // Drag-and-drop events
  row.addEventListener('dragstart', _ngDragStart);
  row.addEventListener('dragover',  _ngDragOver);
  row.addEventListener('dragenter', _ngDragEnter);
  row.addEventListener('dragleave', _ngDragLeave);
  row.addEventListener('drop',      _ngDrop);
  row.addEventListener('dragend',   _ngDragEnd);

  list.appendChild(row);
  renumberNGItems();
}

function removeNGItem(btn) {
  const row = btn.closest('.ng-item-row');
  if (row) row.remove();
  const list = document.getElementById('ngItemsList');
  if (list && list.children.length === 0) {
    document.getElementById('ngItemsEmpty')?.classList.remove('hidden');
  }
  renumberNGItems();
}

// Update the ① ② … badges on every row
function renumberNGItems() {
  const rows = document.querySelectorAll('#ngItemsList .ng-item-row');
  rows.forEach((row, i) => {
    const badge = row.querySelector('.ng-order-badge');
    if (badge) badge.textContent = i + 1;
  });
}

// ── Drag-and-drop state ──────────────────────────────────────
let _ngDragSrc = null;

function _ngDragStart(e) {
  _ngDragSrc = this;
  e.dataTransfer.effectAllowed = 'move';
  this.style.opacity = '0.5';
}

function _ngDragEnter(e) {
  e.preventDefault();
  if (this !== _ngDragSrc) {
    this.classList.add('ring-2', 'ring-blue-400');
  }
}

function _ngDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function _ngDragLeave() {
  this.classList.remove('ring-2', 'ring-blue-400');
}

function _ngDrop(e) {
  e.stopPropagation();
  if (_ngDragSrc && this !== _ngDragSrc) {
    const list = document.getElementById('ngItemsList');
    const rows = Array.from(list.querySelectorAll('.ng-item-row'));
    const srcIdx  = rows.indexOf(_ngDragSrc);
    const destIdx = rows.indexOf(this);

    if (srcIdx < destIdx) {
      list.insertBefore(_ngDragSrc, this.nextSibling);
    } else {
      list.insertBefore(_ngDragSrc, this);
    }
    renumberNGItems();
  }
  this.classList.remove('ring-2', 'ring-blue-400');
  return false;
}

function _ngDragEnd() {
  this.style.opacity = '';
  document.querySelectorAll('#ngItemsList .ng-item-row').forEach(row => {
    row.classList.remove('ring-2', 'ring-blue-400');
  });
}

async function saveNGGroup() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";

  const groupName = document.getElementById('ngGroupName').value.trim();
  if (!groupName) { alert('グループ名を入力してください'); return; }

  const items = [];
  document.querySelectorAll('#ngItemsList .ng-item-row').forEach(row => {
    const name = row.querySelector('.ng-item-name')?.value.trim();
    const color = row.querySelector('.ng-item-color')?.value || '#f44336';
    const countUp = row.querySelector('.ng-item-countup')?.checked !== false;
    if (name) items.push({ name, color, countUp });
  });

  try {
    if (_editingNGGroup && _editingNGGroup._id) {
      // Update existing
      const res = await fetch(BASE_URL + "updateNGGroup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: _editingNGGroup._id, dbName, username, groupName, items })
      });
      if (!res.ok) throw new Error("Update failed");
      alert('グループを更新しました');
    } else {
      // Create new
      const res = await fetch(BASE_URL + "createNGGroup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName, username, groupName, items })
      });
      if (!res.ok) throw new Error("Create failed");
      alert('グループを作成しました');
    }
    closeNGGroupModal();
    loadNGGroups();
  } catch (e) {
    alert('保存エラー: ' + e.message);
  }
}

