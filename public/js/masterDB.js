// masterDB.js for KSG - Enhanced with modals, checkboxes, and activity logging


let currentTab = 'master';
let currentSubTab = 'data';
let allMasterData = [];
let allFactories = [];
let allEquipment = [];
let allRoles = [];
let allTablets = [];
let selectedItems = [];
let currentModalData = null;
let currentModalType = null;
let isEditMode = false;

// ====================
// Tab Switching Functions
// ====================
function switchMainTab(tabName) {
  // Hide all content
  document.getElementById('contentMaster').classList.add('hidden');
  document.getElementById('contentFactory').classList.add('hidden');
  document.getElementById('contentEquipment').classList.add('hidden');
  document.getElementById('contentRoles').classList.add('hidden');
  document.getElementById('contentRpiServer').classList.add('hidden');
  document.getElementById('contentTablet').classList.add('hidden');

  // Remove active class from all tabs
  document.getElementById('tabMaster').classList.remove('tab-active');
  document.getElementById('tabFactory').classList.remove('tab-active');
  document.getElementById('tabEquipment').classList.remove('tab-active');
  document.getElementById('tabRoles').classList.remove('tab-active');
  document.getElementById('tabRpiServer').classList.remove('tab-active');
  document.getElementById('tabTablet').classList.remove('tab-active');

  // Show selected content and activate tab
  currentTab = tabName;
  currentSubTab = 'data'; // Reset to data tab
  document.getElementById(`content${capitalizeFirst(tabName)}`).classList.remove('hidden');
  document.getElementById(`tab${capitalizeFirst(tabName)}`).classList.add('tab-active');

  // Reset sub-tab buttons (if they exist)
  if (tabName !== 'rpiServer') {
    switchSubTab(tabName, 'data');
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
    case 'rpiServer':
      loadRpiServers();
      break;
    case 'tablet':
      loadTablets();
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
      `<p class="text-red-600">Failed to load history</p>`;
  }
}

function renderActivityHistory(tabName, logs) {
  const historyHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left">Date/Time</th>
            <th class="px-4 py-3 text-left">Action</th>
            <th class="px-4 py-3 text-left">User</th>
            <th class="px-4 py-3 text-left">Records</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${logs.map(log => `
            <tr>
              <td class="px-4 py-3">${new Date(log.timestamp).toLocaleString('ja-JP')}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 rounded ${log.action.includes('create') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                  ${log.action.includes('create') ? '作成' : '削除'}
                </span>
              </td>
              <td class="px-4 py-3">${log.performedBy || 'Unknown'}</td>
              <td class="px-4 py-3">${log.recordsAffected || 1} record(s)</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  document.getElementById(`${tabName}HistoryContainer`).innerHTML = logs.length > 0 ? historyHTML : '<p class="text-gray-500">No history found</p>';
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
    document.getElementById("masterTableContainer").innerHTML = `<p class="text-red-600">Failed to load data: ${err.message}</p>`;
  }
}

function renderMasterTable(data) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  const headers = ["品番", "製品名", "LH/RH", "kanbanID", "設備", "工場", "cycleTime", "検査メンバー数"];

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button id="deleteMasterBtn" class="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('master')">
          <i class="ri-delete-bin-line mr-2"></i>選択した項目を削除 (<span id="masterSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">Total: ${data.length} records</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllMaster" onchange="toggleSelectAll('master')" class="rounded"></th>
            ${headers.map(h => `<th class="px-4 py-3 text-left font-semibold text-gray-700">${h}</th>`).join("")}
            <th class="px-4 py-3 text-left font-semibold text-gray-700">Image</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${data.map(record => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('master', '${record._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="masterCheckbox rounded" value="${record._id}" onchange="updateSelectedCount('master')"></td>
              ${headers.map(h => {
                let value = record[h] || "";
                // Handle kensaMembers specifically to show default value if missing
                if (h === "検査メンバー数" && !value && record.kensaMembers !== undefined) {
                  value = record.kensaMembers;
                }
                if (h === "検査メンバー数" && !value) {
                  value = "2"; // Default value
                }
                return `<td class="px-4 py-3">${value}</td>`;
              }).join("")}
              <td class="px-4 py-3">
                ${record.imageURL ? `<img src="${record.imageURL}" alt="Product" class="h-12 w-12 object-cover rounded" />` : `<span class="text-gray-400 text-xs">No image</span>`}
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
    case 'tablet':
      data = allTablets.find(item => item._id === id);
      break;
  }
  
  if (!data) {
    alert("Data not found");
    return;
  }
  
  currentModalData = data;
  
  // Set modal title
  const titleMap = {
    'master': '製品詳細',
    'factory': '工場詳細',
    'equipment': '設備詳細',
    'roles': 'ロール詳細',
    'tablet': 'タブレット詳細'
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
            <label class="block text-sm font-medium text-gray-700 mb-2">製品画像</label>
            <img id="modalImage" src="${data.imageURL}" alt="Product" class="max-w-md w-full rounded-lg shadow" />
            <input type="file" id="modalImageUpload" accept="image/*" class="hidden mt-2 w-full px-3 py-2 border rounded-lg" onchange="previewImage()" />
          </div>
        ` : `
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">製品画像</label>
            <p class="text-gray-500 mb-2">No image</p>
            <input type="file" id="modalImageUpload" accept="image/*" class="hidden w-full px-3 py-2 border rounded-lg" onchange="previewImage()" />
          </div>
        `}
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-sm font-medium mb-1">品番</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.品番 || ''}" disabled data-field="品番" /></div>
          <div><label class="block text-sm font-medium mb-1">製品名</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.製品名 || ''}" disabled data-field="製品名" /></div>
          <div><label class="block text-sm font-medium mb-1">LH/RH</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data['LH/RH'] || ''}" disabled data-field="LH/RH" /></div>
          <div><label class="block text-sm font-medium mb-1">kanbanID</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.kanbanID || ''}" disabled data-field="kanbanID" /></div>
          <div>
            <label class="block text-sm font-medium mb-1">設備</label>
            <input type="text" id="modalEquipmentDisplay" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.設備 || ''}" disabled data-field="設備" />
            <select id="modalEquipmentSelect" class="hidden w-full px-3 py-2 border rounded-lg bg-white" data-field="設備"></select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">工場</label>
            <input type="text" id="modalFactoryDisplay" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.工場 || ''}" disabled data-field="工場" />
            <div id="modalFactoryTags" class="hidden w-full px-3 py-2 border rounded-lg bg-white min-h-[42px]" data-field="工場"></div>
            <select id="modalFactorySelect" class="hidden w-full px-3 py-2 border rounded-lg bg-white mt-2"></select>
          </div>
          <div><label class="block text-sm font-medium mb-1">cycleTime</label><input type="number" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.cycleTime || ''}" disabled data-field="cycleTime" /></div>
          <div><label class="block text-sm font-medium mb-1">検査メンバー数</label><input type="number" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.kensaMembers || 2}" disabled data-field="kensaMembers" /></div>
        </div>
      `;
      break;
      
    case 'factory':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">Factory Name</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.name || ''}" disabled data-field="name" /></div>
          <div><label class="block text-sm font-medium mb-1">Address</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.address || ''}" disabled data-field="address" /></div>
          <div><label class="block text-sm font-medium mb-1">Phone</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.phone || ''}" disabled data-field="phone" /></div>
        </div>
      `;
      break;
      
    case 'equipment':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">設備名</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.設備名 || ''}" disabled data-field="設備名" /></div>
          <div><label class="block text-sm font-medium mb-1">工場</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${(data.工場 || []).join(', ')}" disabled data-field="工場" /></div>
          <div><label class="block text-sm font-medium mb-1">Description</label><textarea class="w-full px-3 py-2 border rounded-lg bg-gray-50" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
        </div>
      `;
      break;
      
    case 'roles':
      detailsHTML = `
        <div class="grid grid-cols-1 gap-4">
          <div><label class="block text-sm font-medium mb-1">Role Name</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.roleName || ''}" disabled data-field="roleName" /></div>
          <div><label class="block text-sm font-medium mb-1">Description</label><textarea class="w-full px-3 py-2 border rounded-lg bg-gray-50" rows="3" disabled data-field="description">${data.description || ''}</textarea></div>
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
      
      detailsHTML = `
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-sm font-medium mb-1">タブレット名</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.tabletName || ''}" disabled data-field="tabletName" /></div>
          <div><label class="block text-sm font-medium mb-1">ブランド</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.tabletBrand || ''}" disabled data-field="tabletBrand" /></div>
          <div>
            <label class="block text-sm font-medium mb-1">工場名</label>
            <select class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="factoryLocation" id="tabletFactorySelect" onchange="updateTabletEquipmentDropdownModal()">
              <option value="">-- 工場を選択 --</option>
              ${factoryOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">設備名</label>
            <select class="w-full px-3 py-2 border rounded-lg bg-gray-50" disabled data-field="設備名" id="tabletEquipmentSelect">
              <option value="">-- 設備を選択 --</option>
              ${equipmentOptions}
            </select>
          </div>
          <div><label class="block text-sm font-medium mb-1">登録日</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.registeredAt ? new Date(data.registeredAt).toLocaleString('ja-JP') : ''}" disabled /></div>
          <div><label class="block text-sm font-medium mb-1">登録者</label><input type="text" class="w-full px-3 py-2 border rounded-lg bg-gray-50" value="${data.registeredBy || ''}" disabled /></div>
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
    document.getElementById('modalHistoryBody').innerHTML = '<p class="text-gray-500">No change history</p>';
    return;
  }
  
  const historyHTML = `
    <div class="space-y-4">
      ${changeHistory.map(entry => `
        <div class="border-l-4 border-blue-500 pl-4 py-2">
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="font-medium">${entry.action}</p>
              <p class="text-sm text-gray-600">By: ${entry.changedBy}</p>
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
  }
  
  // Enable all inputs
  document.querySelectorAll('#modalDetailsBody input, #modalDetailsBody textarea, #modalDetailsBody select').forEach(el => {
    if (el.id !== 'modalEquipmentDisplay' && el.id !== 'modalFactoryDisplay') {
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
        equipmentSelect.innerHTML = '<option value="" class="text-red-600">⚠️ 設備データがありません</option>';
        equipmentSelect.classList.add('border-red-500');
      } else {
        equipmentSelect.innerHTML = '<option value="">選択してください</option>' + 
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
        factorySelect.innerHTML = '<option value="" class="text-red-600">⚠️ 工場データがありません</option>';
        factorySelect.classList.add('border-red-500');
      } else {
        factorySelect.innerHTML = '<option value="">+ 工場を追加</option>' + 
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
    `).join('') : '<span class="text-gray-400 text-sm">工場を選択してください</span>';
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
    `).join('') : '<span class="text-gray-400 text-sm">工場を選択してください</span>';
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
  document.querySelectorAll('#modalDetailsBody input[data-field]:not(#modalEquipmentDisplay):not(#modalFactoryDisplay), #modalDetailsBody textarea[data-field]').forEach(el => {
    if (!el.disabled) {
      updateData[el.dataset.field] = el.value;
    }
  });
  
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
    
    alert("Updated successfully");
    closeDetailModal();
    loadTabData(currentTab);
  } catch (err) {
    alert("Update failed: " + err.message);
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
    alert("No items selected");
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
    
    alert(`${ids.length} item(s) deleted successfully`);
    closeDeleteConfirmModal();
    loadTabData(type);
  } catch (err) {
    alert("Delete failed: " + err.message);
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
        <h3 class="text-xl font-semibold text-gray-900 mb-4">Create New Master Record</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">品番</label>
            <input type="text" id="new品番" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">製品名</label>
            <input type="text" id="new製品名" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">LH/RH</label>
            <select id="newLHRH" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Select</option>
              <option value="LH">LH</option>
              <option value="RH">RH</option>
              <option value="BOTH">BOTH</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">kanbanID</label>
            <input type="text" id="newKanbanID" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">設備</label>
            <select id="new設備" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Select 設備</option>
              ${equipmentOptions}
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">工場</label>
            <select id="new工場" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Select 工場</option>
              ${factoryOptions}
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">cycleTime</label>
            <input type="number" id="newCycleTime" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div class="space-y-1">
            <label class="block text-sm font-medium text-gray-700">Image Upload</label>
            <input type="file" id="newImageFile" accept="image/*" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
        <div class="flex gap-3">
          <button class="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" onclick="submitNewMaster()">
            <i class="ri-check-line mr-2"></i>Save
          </button>
          <button class="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" onclick="loadMasterData()">
            <i class="ri-close-line mr-2"></i>Cancel
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
    return alert("Please fill in required fields (品番, 製品名)");
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

    alert("Master record created successfully");
    loadMasterData();
  } catch (err) {
    console.error("Create error:", err);
    alert("Create failed: " + err.message);
  }
}

async function editMasterRecord(recordId) {
  // Find the record
  const record = allMasterData.find(r => r._id === recordId);
  if (!record) return alert("Record not found");

  // Similar form to create, but pre-filled
  // For brevity, I'll implement a simplified version
  alert("Edit functionality: Will be implemented with inline editing or modal");
}

async function deleteMasterRecord(recordId) {
  if (!confirm("Are you sure you want to delete this record?")) return;

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

    alert("Record deleted successfully");
    loadMasterData();
  } catch (err) {
    console.error("Delete error:", err);
    alert("Delete failed: " + err.message);
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
    document.getElementById("factoryTableContainer").innerHTML = `<p class="text-red-600">Failed to load: ${err.message}</p>`;
  }
}

function renderFactoryTable(factories) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onclick="showCreateFactoryForm()">
          <i class="ri-add-line mr-2"></i>Create New Factory
        </button>
        <button id="deleteFactoryBtn" class="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('factory')">
          <i class="ri-delete-bin-line mr-2"></i>Delete Selected (<span id="factorySelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">Total: ${factories.length} factories</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllFactory" onchange="toggleSelectAll('factory')" class="rounded"></th>
            <th class="px-4 py-3 text-left font-semibold">Factory Name</th>
            <th class="px-4 py-3 text-left font-semibold">Address</th>
            <th class="px-4 py-3 text-left font-semibold">Phone</th>
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
      <h3 class="text-xl font-semibold mb-4">Create New Factory</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">Factory Name</label>
          <input type="text" id="newFactoryName" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Address</label>
          <input type="text" id="newFactoryAddress" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone</label>
          <input type="text" id="newFactoryPhone" class="w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-emerald-600 text-white rounded-lg" onclick="submitNewFactory()">Save</button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg" onclick="loadFactories()">Cancel</button>
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

  if (!data.name) return alert("Factory name is required");

  try {
    const res = await fetch(BASE_URL + "createFactory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed");

    alert("Factory created successfully");
    loadFactories();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function startEditingFactory(factoryId) {
  document.querySelectorAll(`[factory-id='${factoryId}']`).forEach(el => el.disabled = false);
  document.getElementById(`factoryActions-${factoryId}`).innerHTML = `
    <button class="text-green-600 hover:underline text-sm mr-2" onclick="saveFactory('${factoryId}')">Save</button>
    <button class="text-gray-600 hover:underline text-sm" onclick="loadFactories()">Cancel</button>
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

    if (!res.ok) throw new Error("Update failed");
    alert("Factory updated");
    loadFactories();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteFactory(factoryId) {
  if (!confirm("Delete this factory?")) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteFactory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factoryId, dbName })
    });

    if (!res.ok) throw new Error("Delete failed");
    alert("Factory deleted");
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
    select.innerHTML = '<option value="">-- Select Factory --</option>' +
      allFactories.map(f => `<option value="${f._id}">${f.name}</option>`).join("");
  } catch (err) {
    console.error("Failed to load factories:", err);
  }
}

async function loadDivisions() {
  const factoryId = document.getElementById("factorySelectForDivision").value;
  if (!factoryId) {
    document.getElementById("divisionTableContainer").innerHTML = `<p class="text-gray-500">Select a factory</p>`;
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
          <i class="ri-add-line mr-2"></i>Add Division
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left">Name</th>
            <th class="px-4 py-3 text-left">Code</th>
            <th class="px-4 py-3 text-left">Manager</th>
            <th class="px-4 py-3 text-left">Description</th>
            ${canEdit ? `<th class="px-4 py-3 text-left">Actions</th>` : ""}
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
                  <button class="text-red-600 hover:underline text-sm" onclick="deleteDivision(${idx})">Delete</button>
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
      <h3 class="font-semibold mb-3">Add New Division</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm mb-1">Name</label>
          <input type="text" id="newDivName" class="w-full px-2 py-1 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Code</label>
          <input type="text" id="newDivCode" class="w-full px-2 py-1 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Manager</label>
          <input type="text" id="newDivManager" class="w-full px-2 py-1 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Description</label>
          <input type="text" id="newDivDescription" class="w-full px-2 py-1 border rounded" />
        </div>
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1 bg-emerald-600 text-white rounded" onclick="submitNewDivision()">Save</button>
        <button class="px-3 py-1 bg-gray-100 rounded" onclick="loadDivisions()">Cancel</button>
      </div>
    </div>
  `;
  
  container.innerHTML = formHTML + container.innerHTML;
}

async function submitNewDivision() {
  const factoryId = document.getElementById("factorySelectForDivision").value;
  if (!factoryId) return alert("Please select a factory");

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  const newDiv = {
    name: document.getElementById("newDivName").value.trim(),
    code: document.getElementById("newDivCode").value.trim(),
    manager: document.getElementById("newDivManager").value.trim(),
    description: document.getElementById("newDivDescription").value.trim()
  };

  if (!newDiv.name) return alert("Name is required");

  try {
    const res = await fetch(BASE_URL + "addDivision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factoryId, division: newDiv, dbName })
    });

    if (!res.ok) throw new Error("Failed to add division");
    
    alert("Division added");
    await loadFactoriesForDivisionDropdown(); // Reload factories to get updated divisions
    document.getElementById("factorySelectForDivision").value = factoryId;
    loadDivisions();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteDivision(divisionIndex) {
  if (!confirm("Delete this division?")) return;

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
    alert("Division deleted");
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
    document.getElementById("equipmentTableContainer").innerHTML = `<p class="text-red-600">Failed: ${err.message}</p>`;
  }
}

function renderEquipmentTable(equipment) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg" onclick="showCreateEquipmentForm()">
          <i class="ri-add-line mr-2"></i>Create Equipment
        </button>
        <button id="deleteEquipmentBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('equipment')">
          <i class="ri-delete-bin-line mr-2"></i>Delete Selected (<span id="equipmentSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">Total: ${equipment.length} items</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllEquipment" onchange="toggleSelectAll('equipment')" class="rounded"></th>
            <th class="px-4 py-3 text-left">設備名</th>
            <th class="px-4 py-3 text-left">工場 (Factories)</th>
            <th class="px-4 py-3 text-left">Description</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${equipment.map(eq => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('equipment', '${eq._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="equipmentCheckbox rounded" value="${eq._id}" onchange="updateSelectedCount('equipment')"></td>
              <td class="px-4 py-3">${eq.設備名 || ""}</td>
              <td class="px-4 py-3">
                ${(eq.工場 || []).map(f => `<span class="tag">${f}</span>`).join(" ")}
              </td>
              <td class="px-4 py-3">${eq.description || ""}</td>
            </tr>
          `).join("")}
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
      <h3 class="text-xl font-semibold mb-4">Create Equipment</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">設備名</label>
          <input type="text" id="newEq設備名" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <input type="text" id="newEqDescription" class="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium mb-1">工場 (Select multiple)</label>
          <div id="factoryTagContainer" class="border rounded-lg p-2 mb-2 min-h-10"></div>
          <select id="factorySelect" class="w-full px-3 py-2 border rounded-lg bg-white" onchange="addFactoryTag()">
            <option value="">-- Select Factory --</option>
            ${factoryOptions.map(f => `<option value="${f}">${f}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-emerald-600 text-white rounded-lg" onclick="submitNewEquipment()">Save</button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg" onclick="loadEquipment()">Cancel</button>
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
    dbName
  };

  if (!data.設備名) return alert("設備名 is required");

  try {
    const res = await fetch(BASE_URL + "createEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error("Failed");
    alert("Equipment created");
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
  if (!confirm("Delete this equipment?")) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentId, dbName })
    });

    if (!res.ok) throw new Error("Failed");
    alert("Equipment deleted");
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
    document.getElementById("rolesTableContainer").innerHTML = `<p class="text-red-600">Failed: ${err.message}</p>`;
  }
}

function renderRolesTable(roles) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const role = currentUser.role || "member";

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg" onclick="showCreateRoleForm()">
          <i class="ri-add-line mr-2"></i>Create Role
        </button>
        <button id="deleteRolesBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('roles')">
          <i class="ri-delete-bin-line mr-2"></i>Delete Selected (<span id="rolesSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">Total: ${roles.length} roles</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllRoles" onchange="toggleSelectAll('roles')" class="rounded"></th>
            <th class="px-4 py-3 text-left">Role Name</th>
            <th class="px-4 py-3 text-left">Description</th>
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
      <h3 class="text-xl font-semibold mb-4">Create Role</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">Role Name</label>
          <input type="text" id="newRoleName" class="w-full px-3 py-2 border rounded-lg" placeholder="e.g., member, 班長, 係長" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <input type="text" id="newRoleDescription" class="w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-emerald-600 text-white rounded-lg" onclick="submitNewRole()">Save</button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg" onclick="loadRoles()">Cancel</button>
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

  if (!data.roleName) return alert("Role name is required");

  try {
    const res = await fetch(BASE_URL + "createRole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error("Failed");
    alert("Role created");
    loadRoles();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteRole(roleId) {
  if (!confirm("Delete this role?")) return;

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "deleteRole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId, dbName })
    });

    if (!res.ok) throw new Error("Failed");
    alert("Role deleted");
    loadRoles();
  } catch (err) {
    alert("Error: " + err.message);
  }
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
        ${csvData.length > 5 ? `<tr><td colspan="${headers.length}" class="px-2 py-1 text-center text-gray-500">... and ${csvData.length - 5} more rows</td></tr>` : ''}
      </tbody>
    `;
    
    document.getElementById('csvPreview').classList.remove('hidden');
    document.getElementById('csvUploadBtn').classList.remove('hidden');
  };
  reader.readAsText(file);
}

async function uploadCSVData() {
  if (csvData.length === 0) {
    alert('CSVデータがありません');
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

    alert(`${successCount}/${csvData.length} レコードを登録しました`);
    closeCSVUploadModal();
    loadMasterData();
  } catch (err) {
    alert('アップロードエラー: ' + err.message);
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
      modalTitle.innerHTML = '<i class="ri-add-line mr-2"></i>新規登録 (Master)';
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">品番 *</label>
          <input type="text" id="quick品番" class="w-full px-3 py-2 border rounded-lg" placeholder="例: A001">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">製品名 *</label>
          <input type="text" id="quick製品名" class="w-full px-3 py-2 border rounded-lg" placeholder="例: ProductA">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">LH/RH</label>
          <select id="quickLHRH" class="w-full px-3 py-2 border rounded-lg">
            <option value="">選択してください</option>
            <option value="LH">LH</option>
            <option value="RH">RH</option>
            <option value="MID">MID</option>
            <option value="CTR">CTR</option>
            <option value="BOTH">BOTH</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">kanbanID</label>
          <input type="text" id="quickKanbanID" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">設備</label>
          <input type="text" id="quick設備" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">工場</label>
          <input type="text" id="quick工場" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">cycleTime</label>
          <input type="number" id="quickCycleTime" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">画像</label>
          <input type="file" id="quickImage" accept="image/*" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">kensaMembers</label>
          <input type="number" id="quickKensaMembers" class="w-full px-3 py-2 border rounded-lg" placeholder="検査メンバー数を入力">
        </div>
      `;
      break;
      
    case 'factory':
      modalTitle.innerHTML = '<i class="ri-add-line mr-2"></i>新規登録 (工場)';
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">Factory Name *</label>
          <input type="text" id="quickFactoryName" class="w-full px-3 py-2 border rounded-lg" placeholder="例: Tokyo Factory">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Address</label>
          <input type="text" id="quickFactoryAddress" class="w-full px-3 py-2 border rounded-lg" placeholder="例: 〒100-0001 Tokyo">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone</label>
          <input type="text" id="quickFactoryPhone" class="w-full px-3 py-2 border rounded-lg" placeholder="例: 03-1234-5678">
        </div>
      `;
      break;
      
    case 'equipment':
      // Load factories for dropdown
      await loadFactoriesForEquipmentCreate();
      
      const factoryOptions = allFactories.length > 0 ? 
        allFactories.map(f => `<option value="${f.name}">${f.name}</option>`).join('') :
        '<option value="" class="text-red-600">⚠️ 工場データがありません</option>';
      
      modalTitle.innerHTML = '<i class="ri-add-line mr-2"></i>新規登録 (設備)';
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">設備名 *</label>
          <input type="text" id="quickEquipmentName" class="w-full px-3 py-2 border rounded-lg" placeholder="例: Machine A">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">工場 (複数選択可能)</label>
          <div id="quickEquipmentFactoryTags" class="w-full px-3 py-2 border rounded-lg bg-white min-h-[42px] mb-2"></div>
          <select id="quickEquipmentFactorySelect" class="w-full px-3 py-2 border rounded-lg ${allFactories.length === 0 ? 'border-red-500' : ''}">
            <option value="">+ 工場を追加</option>
            ${factoryOptions}
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea id="quickEquipmentDesc" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
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
      break;
      
    case 'roles':
      modalTitle.innerHTML = '<i class="ri-add-line mr-2"></i>新規登録 (Role)';
      modalBody.innerHTML = `
        <div>
          <label class="block text-sm font-medium mb-1">Role Name *</label>
          <input type="text" id="quickRoleName" class="w-full px-3 py-2 border rounded-lg" placeholder="例: operator">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea id="quickRoleDesc" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
        </div>
      `;
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
          dbName,
          username
        };
        
        if (!data.品番 || !data.製品名) {
          return alert("品番と製品名は必須です");
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
          return alert("Factory Nameは必須です");
        }
        
        endpoint = "createFactory";
        break;
        
      case 'equipment':
        data = {
          設備名: document.getElementById("quickEquipmentName").value.trim(),
          工場: selectedQuickEquipmentFactories,
          description: document.getElementById("quickEquipmentDesc").value.trim(),
          dbName
        };
        
        if (!data.設備名) {
          return alert("設備名は必須です");
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
          return alert("Role Nameは必須です");
        }
        
        endpoint = "createRole";
        break;
    }

    const res = await fetch(BASE_URL + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to create record");

    alert("登録しました");
    closeQuickCreateModal();
    loadTabData(currentTab);
  } catch (err) {
    console.error("Create error:", err);
    alert("登録失敗: " + err.message);
  }
}

// ====================
// Utility Functions
// ====================
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
      showToast('Failed to load Raspberry Pi devices', 'error');
    }
  } catch (error) {
    console.error('Error loading RPI servers:', error);
    showToast('Failed to load Raspberry Pi devices', 'error');
  }
}

function renderRpiServerTable(devices) {
  const container = document.getElementById('rpiServerTableContainer');
  
  if (!devices || devices.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="ri-server-line text-6xl text-gray-300 mb-4"></i>
        <p class="text-gray-500 text-lg">No Raspberry Pi devices registered yet</p>
        <p class="text-gray-400 text-sm mt-2">Devices will appear here automatically when they connect</p>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 border-b-2 border-gray-200">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device ID</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device Name</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local IP</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
  `;
  
  devices.forEach(device => {
    const isActive = isDeviceActive(device.updated_at);
    const statusBadge = isActive 
      ? '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Active</span>'
      : '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Inactive</span>';
    
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
          <div class="text-xs text-gray-500">Valid until: ${authorizedUntil}</div>
        </td>
        <td class="px-4 py-3 text-center">
          <button onclick="editRpiServer('${device._id}')" 
            class="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors">
            <i class="ri-edit-line mr-1"></i> Edit
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
    showToast('Failed to load device details', 'error');
  }
}

function showRpiServerEditModal(device) {
  const modalHtml = `
    <div id="rpiServerEditModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
        <div class="flex items-center justify-between p-6 border-b">
          <h2 class="text-2xl font-semibold">Edit Raspberry Pi Device</h2>
          <button onclick="closeRpiServerEditModal()" class="text-gray-500 hover:text-gray-700">
            <i class="ri-close-line text-2xl"></i>
          </button>
        </div>
        
        <div class="p-6">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Device ID (Read-only)</label>
              <input type="text" value="${device.device_id}" disabled 
                class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Device Name *</label>
              <input type="text" id="editDeviceName" value="${device.device_name || ''}" 
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <p class="mt-1 text-sm text-gray-500">Friendly name for this device (e.g., KSG2, Factory Line 1)</p>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Owner</label>
              <input type="text" id="editDeviceOwner" value="${device.owner || ''}" 
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Local IP (Read-only)</label>
                <input type="text" value="${device.local_ip || '-'}" disabled 
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Last Updated</label>
                <input type="text" value="${new Date(device.updated_at).toLocaleString('ja-JP')}" disabled 
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm">
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Authorized Until</label>
              <input type="text" value="${new Date(device.authorized_until).toLocaleDateString('ja-JP')}" disabled 
                class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
            </div>
          </div>
        </div>
        
        <div class="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button onclick="closeRpiServerEditModal()" 
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
            Cancel
          </button>
          <button onclick="saveRpiServer()" 
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i class="ri-save-line mr-2"></i>Save Changes
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
    showToast('Device name is required', 'error');
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
      showToast('Raspberry Pi device updated successfully', 'success');
      closeRpiServerEditModal();
      loadRpiServers();
    } else {
      showToast(data.message || 'Failed to update device', 'error');
    }
  } catch (error) {
    console.error('Error updating device:', error);
    showToast('Failed to update device', 'error');
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
    document.getElementById("tabletTableContainer").innerHTML = `<p class="text-red-600">Failed: ${err.message}</p>`;
  }
}

function renderTabletsTable(tablets) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");

  const tableHTML = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-3">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onclick="showCreateTabletForm()">
          <i class="ri-add-line mr-2"></i>タブレット登録
        </button>
        <button id="deleteTabletsBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg opacity-50 cursor-not-allowed" disabled onclick="showDeleteConfirmation('tablet')">
          <i class="ri-delete-bin-line mr-2"></i>選択削除 (<span id="tabletSelectedCount">0</span>)
        </button>
      </div>
      <div class="text-sm text-gray-600">Total: ${tablets.length} tablets</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 w-12"><input type="checkbox" id="selectAllTablets" onchange="toggleSelectAll('tablet')" class="rounded"></th>
            <th class="px-4 py-3 text-left">タブレット名</th>
            <th class="px-4 py-3 text-left">ブランド</th>
            <th class="px-4 py-3 text-left">工場名</th>
            <th class="px-4 py-3 text-left">設備名</th>
            <th class="px-4 py-3 text-left">登録日</th>
            <th class="px-4 py-3 text-left">登録者</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${tablets.map(t => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="openDetailModal('tablet', '${t._id}')">
              <td class="px-4 py-3" onclick="event.stopPropagation()"><input type="checkbox" class="tabletCheckbox rounded" value="${t._id}" onchange="updateSelectedCount('tablet')"></td>
              <td class="px-4 py-3"><i class="ri-tablet-line text-blue-600 mr-2"></i>${t.tabletName || ""}</td>
              <td class="px-4 py-3">${t.tabletBrand || ""}</td>
              <td class="px-4 py-3">${t.factoryLocation || ""}</td>
              <td class="px-4 py-3">${t.設備名 || ""}</td>
              <td class="px-4 py-3">${t.registeredAt ? new Date(t.registeredAt).toLocaleDateString('ja-JP') : ""}</td>
              <td class="px-4 py-3">${t.registeredBy || ""}</td>
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
      <h3 class="text-xl font-semibold mb-4">タブレット登録</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">タブレット名 *</label>
          <input type="text" id="newTabletName" class="w-full px-3 py-2 border rounded-lg" placeholder="例: Tablet-001" oninput="checkTabletNameUnique()" />
          <p id="tabletNameError" class="text-red-600 text-sm mt-1 hidden">この名前は既に使用されています</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">ブランド *</label>
          <input type="text" id="newTabletBrand" class="w-full px-3 py-2 border rounded-lg" placeholder="例: iPad, Samsung" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">工場名 *</label>
          <select id="newFactoryLocation" class="w-full px-3 py-2 border rounded-lg bg-white" onchange="updateTabletEquipmentDropdown()">
            <option value="">-- 工場を選択 --</option>
            ${factoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">設備名 *</label>
          <select id="new設備名" class="w-full px-3 py-2 border rounded-lg bg-white" disabled>
            <option value="">-- まず工場を選択 --</option>
          </select>
        </div>
      </div>
      <div class="flex gap-3">
        <button id="submitTabletBtn" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" onclick="submitNewTablet()">
          <i class="ri-save-line mr-2"></i>登録
        </button>
        <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" onclick="loadTablets()">
          <i class="ri-close-line mr-2"></i>キャンセル
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
    equipmentSelect.innerHTML = '<option value="">-- まず工場を選択 --</option>';
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
  equipmentSelect.innerHTML = `<option value="">-- 設備を選択 --</option>${equipmentOptions}`;
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
    equipmentSelect.innerHTML = '<option value="">-- まず工場を選択 --</option>';
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
  equipmentSelect.innerHTML = `<option value="">-- 設備を選択 --</option>${equipmentOptions}`;
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

  if (!tabletData.tabletName || !tabletData.tabletBrand || !tabletData.factoryLocation || !tabletData.設備名) {
    return alert("すべての必須項目を入力してください");
  }
  
  // Check for duplicate tablet name
  const nameExists = allTablets.some(tablet => 
    tablet.tabletName && tablet.tabletName.toLowerCase() === tabletData.tabletName.toLowerCase()
  );
  
  if (nameExists) {
    return alert("このタブレット名は既に使用されています。別の名前を入力してください。");
  }

  try {
    const res = await fetch(BASE_URL + "createTablet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName, username, tabletData })
    });

    if (!res.ok) throw new Error("Failed");
    alert("タブレットを登録しました");
    loadTablets();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteTablet(tabletId) {
  if (!confirm("このタブレットを削除しますか？")) return;

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
    alert("タブレットを削除しました");
    loadTablets();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
