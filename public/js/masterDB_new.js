// masterDB.js for KSG - Enhanced with modals, checkboxes, and activity logging

const BASE_URL = 'http://localhost:3000/';
let currentTab = 'master';
let currentSubTab = 'data';
let allMasterData = [];
let allFactories = [];
let allEquipment = [];
let allRoles = [];
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

  // Remove active class from all tabs
  document.getElementById('tabMaster').classList.remove('tab-active');
  document.getElementById('tabFactory').classList.remove('tab-active');
  document.getElementById('tabEquipment').classList.remove('tab-active');
  document.getElementById('tabRoles').classList.remove('tab-active');

  // Show selected content and activate tab
  currentTab = tabName;
  currentSubTab = 'data'; // Reset to data tab
  document.getElementById(`content${capitalizeFirst(tabName)}`).classList.remove('hidden');
  document.getElementById(`tab${capitalizeFirst(tabName)}`).classList.add('tab-active');

  // Reset sub-tab buttons
  switchSubTab(tabName, 'data');

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
    'roles': 'roles'
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
      '<p class="text-red-600">Failed to load history</p>';
  }
}

function renderActivityHistory(tabName, logs) {
  const historyHTML = logs.length > 0 ? `
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
  ` : '<p class="text-gray-500">No history found</p>';
  
  document.getElementById(`${tabName}HistoryContainer`).innerHTML = historyHTML;
}

