// masterDB.js for KSG - Enhanced with modals, checkboxes, and activity logging


let currentTab = 'master';
let currentSubTab = 'data';
let allMasterData = [];
let allFactories = [];
let allEquipment = [];
let allRoles = [];
let allDepartments = [];
let allSections = [];
let allTablets = [];
let allNGGroups = [];
let selectedItems = [];
let currentModalData = null;
let currentModalType = null;
let isEditMode = false;

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

  // Remove active class from all tabs
  document.getElementById('tabMaster').classList.remove('tab-active');
  document.getElementById('tabMasterNG').classList.remove('tab-active');
  document.getElementById('tabFactory').classList.remove('tab-active');
  document.getElementById('tabEquipment').classList.remove('tab-active');
  document.getElementById('tabRoles').classList.remove('tab-active');
  document.getElementById('tabDepartment').classList.remove('tab-active');
  document.getElementById('tabSection').classList.remove('tab-active');
  document.getElementById('tabRpiServer').classList.remove('tab-active');
  document.getElementById('tabTablet').classList.remove('tab-active');

  // Show selected content and activate tab
  currentTab = tabName;
  currentSubTab = 'data'; // Reset to data tab
  document.getElementById(`content${capitalizeFirst(tabName)}`).classList.remove('hidden');
  document.getElementById(`tab${capitalizeFirst(tabName)}`).classList.add('tab-active');

  // Reset sub-tab buttons (if they exist)
  if (tabName !== 'rpiServer' && tabName !== 'masterNG') {
    switchSubTab(tabName, 'data');
  }

  // Disable/enable 新規登録 button based on tab
  const quickCreateBtn = document.querySelector('button[onclick="showQuickCreateModal()"]');
  if (quickCreateBtn) {
    if (tabName === 'rpiServer' || tabName === 'masterNG') {
      quickCreateBtn.disabled = true;
      quickCreateBtn.classList.add('opacity-50', 'cursor-not-allowed');
      quickCreateBtn.classList.remove('hover:bg-green-700');
    } else {
      quickCreateBtn.disabled = false;
      quickCreateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      quickCreateBtn.classList.add('hover:bg-green-700');
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
  
  if (subTab === 'data') {
    dataBtn.className = 'px-4 py-2 rounded-lg bg-blue-600 text-white';
    historyBtn.className = 'px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200';
    document.getElementById(`${tabName}DataContent`).classList.remove('hidden');
    document.getElementById(`${tabName}HistoryContent`).classList.add('hidden');
  } else {
    dataBtn.className = 'px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200';
    historyBtn.className = 'px-4 py-2 rounded-lg bg-blue-600 text-white';
    document.getElementById(`${tabName}DataContent`).classList.add('hidden');
    document.getElementById(`${tabName}HistoryContent`).classList.remove('hidden');
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
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left">${t('masterDB.dateTime')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.action')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.user')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.recordCount')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${logs.map(log => `
            <tr>
              <td class="px-4 py-3">${new Date(log.timestamp).toLocaleString('ja-JP')}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 rounded ${log.action.includes('create') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                  ${log.action.includes('create') ? t('masterDB.created') : t('masterDB.deleted')}
                </span>
              </td>
              <td class="px-4 py-3">${log.performedBy || 'Unknown'}</td>
              <td class="px-4 py-3">${log.recordsAffected || 1} ${t('common.records')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  document.getElementById(`${tabName}HistoryContainer`).innerHTML = logs.length > 0 ? historyHTML : `<p class="text-gray-500">${t('masterDB.noHistoryFound')}</p>`;
}

// ====================
// Master Tab Functions
// ====================
async function loadMasterData() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const role = currentUser.role || "admin";

  try {
    const res = await fetch(BASE_URL + "getMasterDB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName, role })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    allMasterData = await res.json();
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

  const headers = [
    { key: "品番", label: t('masterDB.productNumber') },
    { key: "製品名", label: t('masterDB.productName') },
    { key: "LH/RH", label: t('masterDB.lhrh') },
    { key: "kanbanID", label: t('masterDB.kanbanId') },
    { key: "設備", label: t('masterDB.equipment') },
    { key: "工場", label: t('masterDB.factory') },
    { key: "cycleTime", label: t('masterDB.cycleTime') },
    { key: "検査メンバー数", label: t('masterDB.inspectionMembers') },
    { key: "収容数", label: t('masterDB.capacity') }
  ];

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteMasterBtn" class="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('master')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelectedItems')} (<span id="masterSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">Total: ${data.length} ${t('masterDB.recordCount')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllMaster" onchange="toggleSelectAll('master')" class="rounded"></th>
            ${headers.map(h => `<th class="px-4 py-3 text-left font-semibold text-gray-700">${h.label}</th>`).join("")}
            <th class="px-4 py-3 text-left font-semibold text-gray-700">${t('common.image')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${data.map(record => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('master', '${record._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="masterCheckbox rounded" value="${record._id}" onchange="updateSelectedCount('master')"></td>
              ${headers.map(h => {
                let value = record[h.key] || "";
                // Handle kensaMembers specifically to show default value if missing
                if (h.key === "検査メンバー数" && !value && record.kensaMembers !== undefined) {
                  value = record.kensaMembers;
                }
                if (h.key === "検査メンバー数" && !value) {
                  value = "2"; // Default value
                }
                return `<td class="px-4 py-3">${value}</td>`;
              }).join("")}
              <td class="px-4 py-3">
                ${record.imageURL ? `<img src="${record.imageURL}" alt="Product" class="h-12 w-12 object-cover rounded" />` : `<span class="text-gray-400 text-xs">${t('common.noImage')}</span>`}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("masterTableContainer").innerHTML = tableHTML;
  selectedItems = [];
  updateSelectedCount('master');
}

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

function renderModalDetails(type, data) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);
  
  let detailsHTML = '';
  
  switch(type) {
    case 'master':
      detailsHTML = `
        ${data.imageURL ? `
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.productImage')}</label>
            <img id="modalImage" src="${data.imageURL}" alt="Product" class="max-w-md w-full rounded-lg shadow" />
            <input type="file" id="modalImageUpload" accept="image/*" class="hidden mt-2 w-full px-3 py-2 border rounded-lg" onchange="previewImage()" />
          </div>
        ` : `
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.productImage')}</label>
            <p class="text-gray-500 mb-2">${t('common.noImage')}</p>
            <input type="file" id="modalImageUpload" accept="image/*" class="hidden w-full px-3 py-2 border rounded-lg" onchange="previewImage()" />
          </div>
        `}
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.productNumber')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.品番 || ''}" disabled data-field="品番" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.productName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.製品名 || ''}" disabled data-field="製品名" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.lhrh')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data['LH/RH'] || ''}" disabled data-field="LH/RH" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.kanbanId')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.kanbanID || ''}" disabled data-field="kanbanID" /></div>
          <div>
            <label class="block text-sm font-medium mb-1">${t('masterDB.equipment')}</label>
            <input type="text" id="modalEquipmentDisplay" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.設備 || ''}" disabled data-field="設備" />
            <select id="modalEquipmentSelect" class="hidden w-full px-3 py-2 border rounded-lg bg-white" data-field="設備"></select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">${t('masterDB.factory')}</label>
            <input type="text" id="modalFactoryDisplay" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.工場 || ''}" disabled data-field="工場" />
            <div id="modalFactoryTags" class="hidden w-full px-3 py-2 border rounded-lg bg-white min-h-[42px]" data-field="工場"></div>
            <select id="modalFactorySelect" class="hidden w-full px-3 py-2 border rounded-lg bg-white mt-2"></select>
          </div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.cycleTime')}</label><input type="number" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.cycleTime || ''}" disabled data-field="cycleTime" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.inspectionMembers')}</label><input type="number" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.kensaMembers || 2}" disabled data-field="kensaMembers" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.capacity')}</label><input type="number" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.収容数 || ''}" disabled data-field="収容数" /></div>
          <div class="col-span-2">
            <label class="block text-sm font-medium mb-1">不良グループ</label>
            <input type="text" id="modalNGGroupDisplay" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.ngGroupId ? '...' : '未割当'}" disabled />
            <select id="modalNGGroupSelect" class="hidden w-full px-3 py-2 border rounded-lg bg-white" data-field="ngGroupId">
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
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.factoryName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.address')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.address || ''}" disabled data-field="address" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.phone')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.phone || ''}" disabled data-field="phone" /></div>
        </div>
      `;
      break;
      
    case 'equipment':
      const opcVars = data.opcVariables || {};
      detailsHTML = `
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.equipmentName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.設備名 || ''}" disabled data-field="設備名" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.factory')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${(data.工場 || []).join(', ')}" disabled data-field="工場" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-2 border rounded-lg bg-gray-50" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>

          <div class="border-t pt-4 mt-4">
            <h4 class="text-sm font-semibold mb-3 flex items-center">
              <i class="ri-line-chart-line mr-2"></i>
              ${t('masterDB.opcVariableMappings')}
            </h4>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">${t('masterDB.kanbanVariable')}</label>
                <select id="modalEquipmentKanbanVar" class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="opcVariables.kanbanVariable">
                  <option value="">${t('masterDB.selectVariable')}</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">${t('masterDB.forProductLookup')}</p>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">${t('masterDB.productionCountVariable')}</label>
                <select id="modalEquipmentProductionVar" class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="opcVariables.productionCountVariable">
                  <option value="">${t('masterDB.selectVariable')}</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">${t('masterDB.forProductionCalc')}</p>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">${t('masterDB.boxQuantityVariable')}</label>
                <select id="modalEquipmentBoxQtyVar" class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="opcVariables.boxQuantityVariable">
                  <option value="">${t('masterDB.selectVariable')}</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">${t('masterDB.forBoxQtyDisplay')}</p>
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
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.roleName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.roleName || ''}" disabled data-field="roleName" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-2 border rounded-lg bg-gray-50" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
        </div>
      `;
      break;
      
    case 'department':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.departmentName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-2 border rounded-lg bg-gray-50" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
        </div>
      `;
      break;

    case 'section':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.sectionName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('common.description')}</label><textarea class="w-full px-3 py-2 border rounded-lg bg-gray-50" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
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
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.tabletName')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.tabletName || ''}" disabled data-field="tabletName" /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.brand')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.tabletBrand || ''}" disabled data-field="tabletBrand" /></div>
          <div>
            <label class="block text-sm font-medium mb-1">${t('masterDB.factoryLocation')}</label>
            <select class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="factoryLocation" id="tabletFactorySelect" onchange="updateTabletEquipmentDropdownModal()">
              <option value="">${t('common.selectFactory')}</option>
              ${factoryOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">${t('masterDB.equipmentName')}</label>
            <select class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="設備名" id="tabletEquipmentSelect">
              <option value="">${t('common.selectEquipment')}</option>
              ${equipmentOptions}
            </select>
          </div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.registeredDate')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.registeredAt ? new Date(data.registeredAt).toLocaleString('ja-JP') : ''}" disabled /></div>
          <div><label class="block text-sm font-medium mb-1">${t('masterDB.registeredBy')}</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.registeredBy || ''}" disabled /></div>
        </div>

        <!-- Quick Access Section -->
        <div class="mt-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-blue-900 flex items-center">
              <i class="ri-qr-code-line mr-2"></i>${t('masterDB.quickAccess')}
            </h3>
            <button onclick="toggleTabletQR()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              <i class="ri-eye-line mr-1"></i>${t('masterDB.showQRCode')}
            </button>
          </div>
          <div id="tabletQRSection" class="hidden mt-4">
            <div class="bg-white p-4 rounded-lg shadow-sm">
              <div class="text-center mb-4">
                <img src="${qrCodeUrl}" alt="QR Code" class="mx-auto rounded-lg shadow-md" style="width: 300px; height: 300px;" />
              </div>
              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">${t('masterDB.tabletAccessUrl')}</label>
                  <div class="flex gap-2">
                    <input type="text" id="tabletUrlInput" value="${tabletUrl}" readonly class="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm" />
                    <button onclick="copyTabletUrl()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap">
                      <i class="ri-file-copy-line mr-1"></i>${t('masterDB.copy')}
                    </button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button onclick="downloadTabletQR()" class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium">
                    <i class="ri-download-line mr-1"></i>${t('masterDB.downloadQRCode')}
                  </button>
                  <button onclick="openTabletUrl()" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">
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
    document.getElementById('modalHistoryBody').innerHTML = `<p class="text-gray-500">${t('masterDB.noChangeHistory')}</p>`;
    return;
  }
  
  const historyHTML = `
    <div class="space-y-4">
      ${changeHistory.map(entry => `
        <div class="border-l-4 border-blue-500 pl-4 py-2">
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="font-medium">${entry.action}</p>
              <p class="text-sm text-gray-600">${t('masterDB.by')}: ${entry.changedBy}</p>
            </div>
            <p class="text-sm text-gray-500">${new Date(entry.timestamp).toLocaleString('ja-JP')}</p>
          </div>
          <div class="space-y-1">
            ${entry.changes.map(change => `
              <div class="text-sm bg-gray-50 p-2 rounded">
                <strong>${change.field}:</strong> 
                <span class="text-red-600">${change.oldValue}</span> → 
                <span class="text-green-600">${change.newValue}</span>
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
    document.getElementById('modalTabDetails').className = 'px-4 py-2 rounded-t-lg bg-blue-600 text-white';
    document.getElementById('modalTabHistory').className = 'px-4 py-2 rounded-t-lg bg-gray-100 text-gray-700 hover:bg-gray-200';
    document.getElementById('modalDetailsContent').classList.remove('hidden');
    document.getElementById('modalHistoryContent').classList.add('hidden');
  } else {
    document.getElementById('modalTabDetails').className = 'px-4 py-2 rounded-t-lg bg-gray-100 text-gray-700 hover:bg-gray-200';
    document.getElementById('modalTabHistory').className = 'px-4 py-2 rounded-t-lg bg-blue-600 text-white';
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
  
  // Load factories and equipment data for master tab
  if (currentModalType === 'master') {
    await loadFactoriesAndEquipmentForModal();
    // Load NG groups for master tab
    await loadNGGroupsForModal();
  }
  
  // Enable all inputs
  document.querySelectorAll('#modalDetailsBody input, #modalDetailsBody textarea, #modalDetailsBody select').forEach(el => {
    if (el.id !== 'modalEquipmentDisplay' && el.id !== 'modalFactoryDisplay' && el.id !== 'modalNGGroupDisplay') {
      el.disabled = false;
      el.classList.remove('bg-gray-50');
      el.classList.add('bg-white');
    }
  });
  
  // Show image upload
  const imageUpload = document.getElementById('modalImageUpload');
  if (imageUpload) imageUpload.classList.remove('hidden');
  
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
  document.querySelectorAll('#modalDetailsBody input[data-field]:not(#modalEquipmentDisplay):not(#modalFactoryDisplay):not(#modalNGGroupDisplay), #modalDetailsBody textarea[data-field]').forEach(el => {
    if (!el.disabled) {
      const field = el.dataset.field;
      let value = el.value;
      
      // Special handling for equipment 工場 field - convert comma-separated string to array
      if (currentModalType === 'equipment' && field === '工場') {
        value = value.split(',').map(f => f.trim()).filter(f => f);
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
      document.getElementById('modalImage').src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

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
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteFactoryBtn" class="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('factory')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelected')} (<span id="factorySelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">${t('common.total')}: ${factories.length} ${t('masterDB.factories')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllFactory" onchange="toggleSelectAll('factory')" class="rounded"></th>
            <th class="px-4 py-3 text-left font-semibold">${t('masterDB.factoryName')}</th>
            <th class="px-4 py-3 text-left font-semibold">${t('masterDB.address')}</th>
            <th class="px-4 py-3 text-left font-semibold">${t('masterDB.phone')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${factories.map(f => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('factory', '${f._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="factoryCheckbox rounded" value="${f._id}" onchange="updateSelectedCount('factory')"></td>
              <td class="px-4 py-3">${f.name || ""}</td>
              <td class="px-4 py-3">${f.address || ""}</td>
              <td class="px-4 py-3">${f.phone || ""}</td>
            </tr>
          `).join("")}
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
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
      <h3 class="text-xl font-semibold mb-4">${t('masterDB.createNewFactory')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.factoryName')}</label>
          <input type="text" id="newFactoryName" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.address')}</label>
          <input type="text" id="newFactoryAddress" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.phone')}</label>
          <input type="text" id="newFactoryPhone" class="w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-emerald-600 text-white rounded-lg" onclick="submitNewFactory()">${t('common.save')}</button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg" onclick="loadFactories()">${t('common.cancel')}</button>
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
    divisions: [], // Initialize empty divisions array
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
    if (!res.ok) throw new Error(result.error || "Failed");

    alert(t('masterDB.factoryCreatedSuccess'));
    loadFactories();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function startEditingFactory(factoryId) {
  document.querySelectorAll(`[factory-id='${factoryId}']`).forEach(el => el.disabled = false);
  document.getElementById(`factoryActions-${factoryId}`).innerHTML = `
    <button class="text-green-600 hover:underline text-sm mr-2" onclick="saveFactory('${factoryId}')">${t('common.save')}</button>
    <button class="text-gray-600 hover:underline text-sm" onclick="loadFactories()">${t('common.cancel')}</button>
  `;
}

async function saveFactory(factoryId) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  const updated = {};
  document.querySelectorAll(`[factory-id='${factoryId}']`).forEach(el => {
    if (el.dataset.field) {
      updated[el.dataset.field] = el.value;
    }
  });

  try {
    const res = await fetch(BASE_URL + "updateFactory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factoryId, updateData: updated, dbName })
    });

    if (!res.ok) throw new Error(t('common.updateFailed'));
    alert(t('masterDB.factoryUpdated'));
    loadFactories();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteFactory(factoryId) {
  if (!confirm(t('masterDB.deleteThisFactory'))) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteFactory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factoryId, dbName })
    });

    if (!res.ok) throw new Error(t('common.deleteFailed'));
    alert(t('masterDB.factoryDeleted'));
    loadFactories();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// ====================
// Division Tab Functions
// ====================
async function loadFactoriesForDivisionDropdown() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getFactories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    allFactories = await res.json();
    
    const select = document.getElementById("factorySelectForDivision");
    select.innerHTML = `<option value="">${t('common.selectFactory')}</option>` +
      allFactories.map(f => `<option value="${f._id}">${f.name}</option>`).join("");
  } catch (err) {
    console.error("Failed to load factories:", err);
  }
}

async function loadDivisions() {
  const factoryId = document.getElementById("factorySelectForDivision").value;
  if (!factoryId) {
    document.getElementById("divisionTableContainer").innerHTML = `<p class="text-gray-500">${t('masterDB.selectAFactory')}</p>`;
    return;
  }

  const factory = allFactories.find(f => f._id === factoryId);
  if (!factory) return;

  const divisions = factory.divisions || [];
  
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  const tableHTML = `
    ${canEdit ? `
      <div class="mb-4">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg" onclick="showCreateDivisionForm()">
          <i class="ri-add-line mr-2"></i>${t('masterDB.addDivision')}
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left">${t('common.name')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.code')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.manager')}</th>
            <th class="px-4 py-3 text-left">${t('common.description')}</th>
            ${canEdit ? `<th class="px-4 py-3 text-left">${t('common.actions')}</th>` : ""}
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${divisions.map((div, idx) => `
            <tr>
              <td class="px-4 py-3">${div.name || ""}</td>
              <td class="px-4 py-3">${div.code || ""}</td>
              <td class="px-4 py-3">${div.manager || ""}</td>
              <td class="px-4 py-3">${div.description || ""}</td>
              ${canEdit ? `
                <td class="px-4 py-3">
                  <button class="text-red-600 hover:underline text-sm" onclick="deleteDivision(${idx})">${t('common.delete')}</button>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("divisionTableContainer").innerHTML = tableHTML;
}

function showCreateDivisionForm() {
  const container = document.getElementById("divisionTableContainer");
  
  const formHTML = `
    <div class="bg-white border p-4 rounded-xl mb-4">
      <h3 class="font-semibold mb-3">${t('masterDB.addNewDivision')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm mb-1">${t('common.name')}</label>
          <input type="text" id="newDivName" class="w-full px-2 py-1 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">${t('masterDB.code')}</label>
          <input type="text" id="newDivCode" class="w-full px-2 py-1 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">${t('masterDB.manager')}</label>
          <input type="text" id="newDivManager" class="w-full px-2 py-1 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">${t('common.description')}</label>
          <input type="text" id="newDivDescription" class="w-full px-2 py-1 border rounded" />
        </div>
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1 bg-emerald-600 text-white rounded" onclick="submitNewDivision()">${t('common.save')}</button>
        <button class="px-3 py-1 bg-gray-100 rounded" onclick="loadDivisions()">${t('common.cancel')}</button>
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
        <button id="deleteEquipmentBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('equipment')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelected')} (<span id="equipmentSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">${t('common.total')}: ${equipment.length} ${t('common.items')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllEquipment" onchange="toggleSelectAll('equipment')" class="rounded"></th>
            <th class="px-4 py-3 text-left">${t('masterDB.equipmentName')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.factoriesLabel')}</th>
            <th class="px-4 py-3 text-left">${t('common.description')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.opcVariables')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${equipment.map(eq => {
            const opcVars = eq.opcVariables || {};
            const opcDisplay = `
              <div class="text-xs space-y-1">
                <div><strong>${t('masterDB.kanbanVariable')}:</strong> ${opcVars.kanbanVariable || '-'}</div>
                <div><strong>${t('masterDB.productionCountVariable')}:</strong> ${opcVars.productionCountVariable || '-'}</div>
                <div><strong>${t('masterDB.boxQuantityVariable')}:</strong> ${opcVars.boxQuantityVariable || '-'}</div>
              </div>
            `;
            
            return `
              <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('equipment', '${eq._id}')">
                <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="equipmentCheckbox rounded" value="${eq._id}" onchange="updateSelectedCount('equipment')"></td>
                <td class="px-4 py-3">${eq.設備名 || ""}</td>
                <td class="px-4 py-3">
                  ${(eq.工場 || []).map(f => `<span class="tag">${f}</span>`).join(" ")}
                </td>
                <td class="px-4 py-3">${eq.description || ""}</td>
                <td class="px-4 py-3">${opcDisplay}</td>
              </tr>
            `;
          }).join("")}
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
    <div class="bg-white border p-6 rounded-xl mb-6">
      <h3 class="text-xl font-semibold mb-4">${t('masterDB.createEquipment')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.equipmentName')}</label>
          <input type="text" id="newEq設備名" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('common.description')}</label>
          <input type="text" id="newEqDescription" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium mb-1">${t('masterDB.factory')} (${t('masterDB.selectMultiple')})</label>
          <div id="factoryTagContainer" class="border rounded-lg p-2 mb-2 min-h-10"></div>
          <select id="factorySelect" class="w-full px-3 py-2 border rounded-lg bg-white" onchange="addFactoryTag()">
            <option value="">${t('common.selectFactory')}</option>
            ${factoryOptions.map(f => `<option value="${f}">${f}</option>`).join("")}
          </select>
        </div>
        <div class="md:col-span-2 border-t pt-4 mt-4">
          <h4 class="text-lg font-semibold mb-3">${t('masterDB.opcVariableMappings')}</h4>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">${t('masterDB.kanbanVariable')}</label>
              <input type="text" id="newEqKanbanVar" class="w-full px-3 py-2 border rounded-lg" placeholder="kenyokiRHKanban" value="kenyokiRHKanban" />
              <p class="text-xs text-gray-500 mt-1">${t('masterDB.forProductLookup')}</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">${t('masterDB.productionCountVariable')}</label>
              <input type="text" id="newEqProductionVar" class="w-full px-3 py-2 border rounded-lg" placeholder="seisanSu" value="seisanSu" />
              <p class="text-xs text-gray-500 mt-1">${t('masterDB.forProductionCalc')}</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">${t('masterDB.boxQuantityVariable')}</label>
              <input type="text" id="newEqBoxQtyVar" class="w-full px-3 py-2 border rounded-lg" placeholder="hakoIresu" value="hakoIresu" />
              <p class="text-xs text-gray-500 mt-1">${t('masterDB.forBoxQtyDisplay')}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-emerald-600 text-white rounded-lg" onclick="submitNewEquipment()">${t('common.save')}</button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg" onclick="loadEquipment()">${t('common.cancel')}</button>
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
      kanbanVariable: document.getElementById("newEqKanbanVar")?.value.trim() || "kenyokiRHKanban",
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
        <button id="deleteRolesBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('roles')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelected')} (<span id="rolesSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">${t('common.total')}: ${roles.length} ${t('masterDB.roles')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllRoles" onchange="toggleSelectAll('roles')" class="rounded"></th>
            <th class="px-4 py-3 text-left">${t('masterDB.roleName')}</th>
            <th class="px-4 py-3 text-left">${t('common.description')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${roles.map(r => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('roles', '${r._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="rolesCheckbox rounded" value="${r._id}" onchange="updateSelectedCount('roles')"></td>
              <td class="px-4 py-3">${r.roleName || ""}</td>
              <td class="px-4 py-3">${r.description || ""}</td>
            </tr>
          `).join("")}
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
    <div class="bg-white border p-6 rounded-xl mb-6">
      <h3 class="text-xl font-semibold mb-4">${t('masterDB.createRole')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.roleName')}</label>
          <input type="text" id="newRoleName" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('common.description')}</label>
          <input type="text" id="newRoleDescription" class="w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-emerald-600 text-white rounded-lg" onclick="submitNewRole()">${t('common.save')}</button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg" onclick="loadRoles()">${t('common.cancel')}</button>
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
        <button id="deleteDepartmentBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('department')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelected')} (<span id="departmentSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">${t('common.total')}: ${departments.length} ${t('masterDB.departments')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllDepartment" onchange="toggleSelectAll('department')" class="rounded"></th>
            <th class="px-4 py-3 text-left">${t('masterDB.departmentName')}</th>
            <th class="px-4 py-3 text-left">${t('common.description')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${departments.map(d => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('department', '${d._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="departmentCheckbox rounded" value="${d._id}" onchange="updateSelectedCount('department')"></td>
              <td class="px-4 py-3">${d.name || ""}</td>
              <td class="px-4 py-3">${d.description || ""}</td>
            </tr>
          `).join("")}
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
        <button id="deleteSectionBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('section')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelected')} (<span id="sectionSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">${t('common.total')}: ${sections.length} ${t('masterDB.sections')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllSection" onchange="toggleSelectAll('section')" class="rounded"></th>
            <th class="px-4 py-3 text-left">${t('masterDB.sectionName')}</th>
            <th class="px-4 py-3 text-left">${t('common.description')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${sections.map(s => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('section', '${s._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="sectionCheckbox rounded" value="${s._id}" onchange="updateSelectedCount('section')"></td>
              <td class="px-4 py-3">${s.name || ""}</td>
              <td class="px-4 py-3">${s.description || ""}</td>
            </tr>
          `).join("")}
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
        `<option value="" class="text-red-600">⚠️ ${t('common.noEquipmentData')}</option>`;

      const factoryOptions = allFactories.length > 0 ?
        allFactories.map(f => `<option value="${f.name}">${f.name}</option>`).join('') :
        `<option value="" class="text-red-600">⚠️ ${t('common.noFactoryData')}</option>`;

      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabMaster')})`;
      modalBody.innerHTML = `
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('masterDB.productNumber')} *</label>
          <input type="text" id="quick品番" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: A001">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('masterDB.productName')} *</label>
          <input type="text" id="quick製品名" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: ProductA">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.lhrh')}</label>
          <select id="quickLHRH" class="w-full px-3 py-2 border rounded-lg">
            <option value="">${t('common.pleaseSelect')}</option>
            <option value="LH">LH</option>
            <option value="RH">RH</option>
            <option value="MID">MID</option>
            <option value="CTR">CTR</option>
            <option value="BOTH">BOTH</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.kanbanId')}</label>
          <input type="text" id="quickKanbanID" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.equipment')}</label>
          <select id="quick設備" class="w-full px-3 py-2 border rounded-lg ${allEquipment.length === 0 ? 'border-red-500' : ''}">
            <option value="">${t('common.pleaseSelect')}</option>
            ${equipmentOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.factory')}</label>
          <select id="quick工場" class="w-full px-3 py-2 border rounded-lg ${allFactories.length === 0 ? 'border-red-500' : ''}">
            <option value="">${t('common.pleaseSelect')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.cycleTime')}</label>
          <input type="number" id="quickCycleTime" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.enterCycleTime')}">
        </div>
        <div style="background-color: #f0f9ff; border: 2px solid #0ea5e9;">
          <label class="block text-sm font-medium mb-1 text-blue-800">${t('masterDB.inspectionMembers')} *</label>
          <input type="number" id="quickKensaMembers" class="w-full px-3 py-2 border-2 border-blue-500 rounded-lg" placeholder="${t('masterDB.example')}: 2" value="2" required>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.capacity')}</label>
          <input type="number" id="quick収容数" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.enterCapacity')}">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('masterDB.productImage')}</label>
          <input type="file" id="quickImage" accept="image/*" class="w-full px-3 py-2 border rounded-lg">
        </div>
      `;
      break;
      
    case 'factory': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabFactory')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.factoryName')} *</label>
          <input type="text" id="quickFactoryName" class="w-full px-3 py-2 border rounded-lg" placeholder="例: Tokyo Factory">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.address')}</label>
          <input type="text" id="quickFactoryAddress" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.phone')}</label>
          <input type="text" id="quickFactoryPhone" class="w-full px-3 py-2 border rounded-lg" placeholder="例: 03-1234-5678">
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
        `<option value="" class="text-red-600">⚠️ ${t('common.noFactoryData')}</option>`;

      const variableOptions = opcVariables.length > 0 ?
        opcVariables.map(v => `<option value="${v}">${v}</option>`).join('') :
        `<option value="">${t('masterDB.selectVariable')}</option>`;

      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabEquipment')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.equipmentName')} *</label>
          <input type="text" id="quickEquipmentName" class="w-full px-3 py-2 border rounded-lg" placeholder="例: Machine A">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.factory')} (${t('masterDB.selectMultiple')})</label>
          <div id="quickEquipmentFactoryTags" class="w-full px-3 py-2 border rounded-lg bg-white min-h-[42px] mb-2"></div>
          <select id="quickEquipmentFactorySelect" class="w-full px-3 py-2 border rounded-lg ${allFactories.length === 0 ? 'border-red-500' : ''}">
            <option value="">${t('common.addFactory')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('common.description')}</label>
          <textarea id="quickEquipmentDesc" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
        </div>

        <!-- OPC Variable Mappings Section -->
        <div class="col-span-2 border-t pt-4 mt-4">
          <h4 class="text-sm font-semibold mb-3 flex items-center">
            <i class="ri-line-chart-line mr-2"></i>
            ${t('masterDB.opcVariableMappings')}
          </h4>
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1">${t('masterDB.kanbanVariable')}</label>
              <select id="quickEquipmentKanbanVar" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">${t('masterDB.selectVariable')}</option>
                ${variableOptions}
              </select>
              <p class="text-xs text-gray-500 mt-1">${t('masterDB.forProductLookup')}</p>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">${t('masterDB.productionCountVariable')}</label>
              <select id="quickEquipmentProductionVar" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">${t('masterDB.selectVariable')}</option>
                ${variableOptions}
              </select>
              <p class="text-xs text-gray-500 mt-1">${t('masterDB.forProductionCalc')}</p>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">${t('masterDB.boxQuantityVariable')}</label>
              <select id="quickEquipmentBoxQtyVar" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">${t('masterDB.selectVariable')}</option>
                ${variableOptions}
              </select>
              <p class="text-xs text-gray-500 mt-1">${t('masterDB.forBoxQtyDisplay')}</p>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">
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
        
        if (kanbanSelect && opcVariables.includes('kenyokiRHKanban')) {
          kanbanSelect.value = 'kenyokiRHKanban';
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
          <label class="block text-sm font-medium mb-1">${t('masterDB.roleName')} *</label>
          <input type="text" id="quickRoleName" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: operator">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('common.description')}</label>
          <textarea id="quickRoleDesc" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
        </div>
      `;
    }
      break;
      
    case 'department': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabDepartment')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.departmentName')} *</label>
          <input type="text" id="quickDepartmentName" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: 製造部">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('common.description')}</label>
          <textarea id="quickDepartmentDesc" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
        </div>
      `;
    }
      break;
      
    case 'section': {
      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabSection')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.sectionName')} *</label>
          <input type="text" id="quickSectionName" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: 品質管理係">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">${t('common.description')}</label>
          <textarea id="quickSectionDesc" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
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
        `<option value="" class="text-red-600">⚠️ ${t('common.noFactoryData')}</option>`;

      modalTitle.innerHTML = `<i class="ri-add-line mr-2"></i>${t('masterDB.newRegistration')} (${t('masterDB.tabTablet')})`;
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.tabletName')} *</label>
          <input type="text" id="quickTabletName" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: Tablet1">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.brand')} *</label>
          <input type="text" id="quickTabletBrand" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: samsung">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.factoryLocation')} *</label>
          <select id="quickTabletFactory" class="w-full px-3 py-2 border rounded-lg ${allFactories.length === 0 ? 'border-red-500' : ''}" onchange="updateQuickTabletEquipmentDropdown()">
            <option value="">${t('common.pleaseSelect')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.equipmentName')} *</label>
          <select id="quickTablet設備" class="w-full px-3 py-2 border rounded-lg">
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
          kensaMembers: parseInt(document.getElementById("quickKensaMembers").value) || 2,
          収容数: document.getElementById("quick収容数").value ? parseInt(document.getElementById("quick収容数").value) : null,
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
            kanbanVariable: document.getElementById("quickEquipmentKanbanVar")?.value.trim() || "kenyokiRHKanban",
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
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
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

  // Load master data by default
  loadMasterData();
}

// ====================
// Rpi Server Functions
// ====================
async function loadRpiServers() {
  try {
    const response = await fetch(`${API_URL}/api/deviceInfo?company=${COMPANY}`);
    const data = await response.json();
    
    if (data.success) {
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
      <div class="text-center py-12">
        <i class="ri-server-line text-6xl text-gray-300 mb-4"></i>
        <p class="text-gray-500 text-lg">${t('masterDB.noDevicesRegistered')}</p>
        <p class="text-gray-400 text-sm mt-2">${t('masterDB.devicesAppearAutomatically')}</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 border-b-2 border-gray-200">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('masterDB.deviceId')}</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('masterDB.deviceName')}</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('masterDB.localIp')}</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('masterDB.owner')}</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('masterDB.status')}</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('masterDB.lastSeen')}</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">${t('common.actions')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
  `;

  devices.forEach(device => {
    const isActive = isDeviceActive(device.updated_at);
    const statusBadge = isActive
      ? `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">${t('masterDB.active')}</span>`
      : `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">${t('masterDB.inactive')}</span>`;

    const lastUpdated = new Date(device.updated_at).toLocaleString('ja-JP');
    const authorizedUntil = new Date(device.authorized_until).toLocaleDateString('ja-JP');

    html += `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-4 py-3">
          <div class="flex items-center">
            <i class="ri-cpu-line text-blue-600 mr-2"></i>
            <span class="font-mono font-semibold">${device.device_id}</span>
          </div>
        </td>
        <td class="px-4 py-3">
          <div class="font-medium text-gray-900">${device.device_name || '-'}</div>
          <div class="text-sm text-gray-500">${device.device_brand || 'Raspberry Pi'}</div>
        </td>
        <td class="px-4 py-3">
          <span class="font-mono text-sm">${device.local_ip || '-'}</span>
        </td>
        <td class="px-4 py-3">
          <span class="text-sm">${device.owner || '-'}</span>
        </td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3">
          <div class="text-sm text-gray-900">${lastUpdated}</div>
          <div class="text-xs text-gray-500">${t('masterDB.validUntil')}: ${authorizedUntil}</div>
        </td>
        <td class="px-4 py-3 text-center">
          <button onclick="editRpiServer('${device._id}')"
            class="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors">
            <i class="ri-edit-line mr-1"></i> ${t('common.edit')}
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
    <div id="rpiServerEditModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
        <div class="flex items-center justify-between p-6 border-b">
          <h2 class="text-2xl font-semibold">${t('masterDB.editDevice')}</h2>
          <button onclick="closeRpiServerEditModal()" class="text-gray-500 hover:text-gray-700">
            <i class="ri-close-line text-2xl"></i>
          </button>
        </div>

        <div class="p-6">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.deviceIdReadOnly')}</label>
              <input type="text" value="${device.device_id}" disabled
                class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.deviceName')} *</label>
              <input type="text" id="editDeviceName" value="${device.device_name || ''}"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <p class="mt-1 text-sm text-gray-500">${t('masterDB.friendlyNameHint')}</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.owner')}</label>
              <input type="text" id="editDeviceOwner" value="${device.owner || ''}"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.localIpReadOnly')}</label>
                <input type="text" value="${device.local_ip || '-'}" disabled
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.lastSeen')}</label>
                <input type="text" value="${new Date(device.updated_at).toLocaleString('ja-JP')}" disabled
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">${t('masterDB.authorizedUntil')}</label>
              <input type="text" value="${new Date(device.authorized_until).toLocaleDateString('ja-JP')}" disabled
                class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button onclick="closeRpiServerEditModal()"
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
            ${t('common.cancel')}
          </button>
          <button onclick="saveRpiServer()"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i class="ri-save-line mr-2"></i>${t('masterDB.saveChanges')}
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
        owner: owner
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
        <button id="deleteTabletsBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('tablet')">
          <i class="ri-delete-bin-line mr-2"></i>${t('masterDB.deleteSelected')} (<span id="tabletSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">${t('common.total')}: ${tablets.length} ${t('masterDB.tabTablet')}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllTablets" onchange="toggleSelectAll('tablet')" class="rounded"></th>
            <th class="px-4 py-3 text-left">${t('masterDB.tabletName')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.brand')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.factoryLocation')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.equipmentName')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.registeredDate')}</th>
            <th class="px-4 py-3 text-left">${t('masterDB.registeredBy')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${tablets.map(tab => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('tablet', '${tab._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="tabletCheckbox rounded" value="${tab._id}" onchange="updateSelectedCount('tablet')"></td>
              <td class="px-4 py-3"><i class="ri-tablet-line text-blue-600 mr-2"></i>${tab.tabletName || ""}</td>
              <td class="px-4 py-3">${tab.tabletBrand || ""}</td>
              <td class="px-4 py-3">${tab.factoryLocation || ""}</td>
              <td class="px-4 py-3">${tab.設備名 || ""}</td>
              <td class="px-4 py-3">${tab.registeredAt ? new Date(tab.registeredAt).toLocaleDateString('ja-JP') : ""}</td>
              <td class="px-4 py-3">${tab.registeredBy || ""}</td>
            </tr>
          `).join("")}
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
    <div class="bg-white border p-6 rounded-xl mb-6">
      <h3 class="text-xl font-semibold mb-4">${t('masterDB.tabletRegistration')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.tabletName')} *</label>
          <input type="text" id="newTabletName" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: Tablet-001" oninput="checkTabletNameUnique()" />
          <p id="tabletNameError" class="text-red-600 text-sm mt-1 hidden">${t('masterDB.tabletNameInUse')}</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.brand')} *</label>
          <input type="text" id="newTabletBrand" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.example')}: iPad, Samsung" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.factoryLocation')} *</label>
          <select id="newFactoryLocation" class="w-full px-3 py-2 border rounded-lg bg-white" onchange="updateTabletEquipmentDropdown()">
            <option value="">${t('common.selectFactory')}</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${t('masterDB.equipmentName')} *</label>
          <select id="new設備名" class="w-full px-3 py-2 border rounded-lg bg-white" disabled>
            <option value="">${t('common.selectFactoryFirst')}</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium mb-1">${t('masterDB.accessRestriction')}</label>
          <p class="text-xs text-gray-500 mb-2">${t('masterDB.accessRestrictionDesc')}</p>
          <input type="text" id="newAuthorizedUsers" class="w-full px-3 py-2 border rounded-lg" placeholder="${t('masterDB.accessRestrictionPlaceholder')}" />
        </div>
      </div>
      <div class="flex gap-3">
        <button id="submitTabletBtn" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" onclick="submitNewTablet()">
          <i class="ri-save-line mr-2"></i>${t('common.register')}
        </button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" onclick="loadTablets()">
          <i class="ri-close-line mr-2"></i>${t('common.cancel')}
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
        <button onclick="showNGGroupModal()" class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
          <i class="ri-add-line mr-2"></i>新規グループ作成
        </button>
        <button id="deleteNGGroupsBtn" class="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 opacity-50 cursor-not-allowed" disabled onclick="confirmDeleteNGGroups()">
          <i class="ri-delete-bin-line mr-2"></i>削除 (<span id="ngGroupSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">合計: ${groups.length} グループ</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllNGGroups" onchange="toggleSelectAllNGGroups()" class="rounded"></th>
            <th class="px-4 py-3 text-left font-semibold text-gray-700">グループ名</th>
            <th class="px-4 py-3 text-left font-semibold text-gray-700">不良項目数</th>
            <th class="px-4 py-3 text-left font-semibold text-gray-700">カラープレビュー</th>
            <th class="px-4 py-3 text-left font-semibold text-gray-700">作成者</th>
            <th class="px-4 py-3 text-left font-semibold text-gray-700">作成日時</th>
            <th class="px-4 py-3 text-left font-semibold text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${groups.length === 0 ? `
            <tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">グループがありません。「新規グループ作成」から作成してください。</td></tr>
          ` : groups.map(g => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3"><input type="checkbox" class="ngGroupCheckbox rounded" value="${g._id}" onchange="updateNGGroupSelectCount()"></td>
              <td class="px-4 py-3 font-medium">${g.groupName || ''}</td>
              <td class="px-4 py-3">${(g.items || []).length} 項目</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  ${(g.items || []).slice(0, 8).map(item => `
                    <span class="inline-block w-5 h-5 rounded-full border border-gray-200" style="background:${item.color || '#ccc'}" title="${item.name || ''}"></span>
                  `).join('')}
                  ${(g.items || []).length > 8 ? `<span class="text-xs text-gray-400">+${(g.items || []).length - 8}</span>` : ''}
                </div>
              </td>
              <td class="px-4 py-3 text-gray-500">${g.createdBy || '-'}</td>
              <td class="px-4 py-3 text-gray-500">${g.createdAt ? new Date(g.createdAt).toLocaleDateString('ja-JP') : '-'}</td>
              <td class="px-4 py-3">
                <button onclick="showNGGroupModal(${JSON.stringify(g).replace(/"/g, '&quot;')})" class="text-blue-600 hover:underline text-sm mr-3">
                  <i class="ri-edit-line mr-1"></i>編集
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
  row.className = 'flex items-center gap-2 ng-item-row p-2 bg-gray-50 border border-gray-200 rounded-lg';
  row.innerHTML = `
    <input type="text" placeholder="不良名（例: シルバー）" value="${name.replace(/"/g, '&quot;')}"
           class="flex-1 px-2 py-1.5 border rounded ng-item-name text-sm" />
    <div class="flex items-center gap-1">
      <input type="color" value="${color}" class="w-9 h-8 border rounded cursor-pointer ng-item-color p-0"
             onfocus="setFocusedColorInput(this)" oninput="this.nextElementSibling.style.background=this.value" />
      <span class="ng-color-swatch w-5 h-5 rounded-full border border-gray-300 flex-shrink-0" style="background:${color}"></span>
    </div>
    <label class="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer select-none" title="チェックON: 不良合計にカウント / チェックOFF: カウントしない">
      <input type="checkbox" class="ng-item-countup" ${countUp ? 'checked' : ''}>
      <span>合計に含む</span>
    </label>
    <button type="button" onclick="removeNGItem(this)" class="text-red-400 hover:text-red-600 flex-shrink-0 p-1">
      <i class="ri-delete-bin-line"></i>
    </button>
  `;
  list.appendChild(row);
}

function removeNGItem(btn) {
  const row = btn.closest('.ng-item-row');
  if (row) row.remove();
  const list = document.getElementById('ngItemsList');
  if (list && list.children.length === 0) {
    document.getElementById('ngItemsEmpty')?.classList.remove('hidden');
  }
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

