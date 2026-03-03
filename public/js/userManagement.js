// userManagement.js for KSG

//const BASE_URL = 'http://localhost:3000/';
// const BASE_URL = 'https://ksg-server-url.com/'; // Update when deployed

let allUsers = [];
let availableRoles = ["admin", "member", "operator", "viewer"]; // Default roles
let availableFactories = []; // Factories from 工場 tab
let availableEquipment = []; // Equipment from 設備 tab
let availableDepartments = []; // Departments from 所属部署 tab
let availableSections = []; // Sections from 所属係 tab
let selectedUserFactories = []; // For create/edit factory tags
let selectedUserEquipment = []; // For create/edit equipment tags
let userReferenceDataLoaded = false;
let userQueryState = {
  page: 1,
  limit: 25,
  search: '',
  filterRole: '',
  filterDivision: '',
  filterSection: '',
  filterEnable: '',
  filterFactory: '',
  filterEquipment: '',
  sortField: 'userID',
  sortOrder: 'asc',
  totalCount: 0,
  totalPages: 1,
  hasPrevPage: false,
  hasNextPage: false
};

// Listen for language changes
window.addEventListener('languageChanged', () => {
  // Re-render current user table with translated labels
  renderUserTable(allUsers, userQueryState);
  // Update page title if it exists
  const titleEl = document.getElementById('userManagementTitle');
  if (titleEl) {
    titleEl.textContent = t('userManagement.title');
  }
});

// Load roles from the database
async function loadAvailableRoles() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getRoles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    if (res.ok) {
      const roles = await res.json();
      if (roles.length > 0) {
        availableRoles = roles.map(r => r.roleName);
      }
    }
  } catch (err) {
    console.log("Using default roles, couldn't fetch from database:", err);
  }
}

// Load factories from the database
async function loadAvailableFactories() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getFactories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    if (res.ok) {
      const factories = await res.json();
      if (factories.length > 0) {
        availableFactories = factories.map(f => f.name);
      }
    }
  } catch (err) {
    console.log("Couldn't fetch factories from database:", err);
    availableFactories = [];
  }
}

// Load equipment from the database
async function loadAvailableEquipment() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getEquipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    if (res.ok) {
      const equipment = await res.json();
      if (equipment.length > 0) {
        availableEquipment = equipment.map(e => e.設備名);
      }
    }
  } catch (err) {
    console.log("Couldn't fetch equipment from database:", err);
    availableEquipment = [];
  }
}

// Load departments from the database
async function loadAvailableDepartments() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getDepartments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    if (res.ok) {
      const result = await res.json();
      const departments = result.departments || result;
      if (departments.length > 0) {
        availableDepartments = departments.map(d => d.name);
      }
    }
  } catch (err) {
    console.log("Couldn't fetch departments from database:", err);
    availableDepartments = [];
  }
}

// Load sections from the database
async function loadAvailableSections() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "getSections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName })
    });

    if (res.ok) {
      const result = await res.json();
      const sections = result.sections || result;
      if (sections.length > 0) {
        availableSections = sections.map(s => s.name);
      }
    }
  } catch (err) {
    console.log("Couldn't fetch sections from database:", err);
    availableSections = [];
  }
}

async function ensureUserReferenceData(forceReload = false) {
  if (userReferenceDataLoaded && !forceReload) {
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";

  try {
    const res = await fetch(BASE_URL + "customerUserReferenceData", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName, forceRefresh: forceReload })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    availableRoles = Array.isArray(payload.roles) && payload.roles.length > 0
      ? payload.roles
      : availableRoles;
    availableFactories = Array.isArray(payload.factories) ? payload.factories : [];
    availableEquipment = Array.isArray(payload.equipment) ? payload.equipment : [];
    availableDepartments = Array.isArray(payload.departments) ? payload.departments : [];
    availableSections = Array.isArray(payload.sections) ? payload.sections : [];
  } catch (err) {
    console.log("Combined reference-data endpoint failed, falling back to legacy loaders:", err);

    await Promise.all([
      loadAvailableRoles(),
      loadAvailableFactories(),
      loadAvailableEquipment(),
      loadAvailableDepartments(),
      loadAvailableSections()
    ]);
  }

  userReferenceDataLoaded = true;
}

function _readValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function syncUserQueryStateFromUI() {
  userQueryState.search = _readValue('userSearchInput');
  userQueryState.filterRole = _readValue('userFilterRole');
  userQueryState.filterDivision = _readValue('userFilterDivision');
  userQueryState.filterSection = _readValue('userFilterSection');
  userQueryState.filterEnable = _readValue('userFilterEnable');
  userQueryState.filterFactory = _readValue('userFilterFactory');
  userQueryState.filterEquipment = _readValue('userFilterEquipment');
}

async function loadUsers(options = {}) {
  // Get current user info (should be set when user logs in)
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const role = currentUser.role || "admin";

  if (typeof options.page === 'number') {
    userQueryState.page = options.page;
  }
  if (typeof options.limit === 'number') {
    userQueryState.limit = options.limit;
  }
  if (options.resetPage === true) {
    userQueryState.page = 1;
  }

  await ensureUserReferenceData(options.forceReferenceReload === true);
  syncUserQueryStateFromUI();

  const requestPayload = {
    dbName,
    role,
    page: userQueryState.page,
    limit: userQueryState.limit,
    search: userQueryState.search,
    filterRole: userQueryState.filterRole,
    filterDivision: userQueryState.filterDivision,
    filterSection: userQueryState.filterSection,
    filterEnable: userQueryState.filterEnable,
    filterFactory: userQueryState.filterFactory,
    filterEquipment: userQueryState.filterEquipment,
    sortField: userQueryState.sortField,
    sortOrder: userQueryState.sortOrder
  };

  try {
    const res = await fetch(BASE_URL + "customerGetUsers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    const users = Array.isArray(payload) ? payload : (payload.users || []);
    const pagination = payload.pagination || {
      page: 1,
      limit: users.length || userQueryState.limit,
      totalCount: users.length,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
      sortField: null,
      sortOrder: null
    };

    userQueryState = {
      ...userQueryState,
      page: pagination.page,
      limit: pagination.limit,
      totalCount: pagination.totalCount,
      totalPages: pagination.totalPages,
      hasPrevPage: pagination.hasPrevPage,
      hasNextPage: pagination.hasNextPage,
      sortField: pagination.sortField || userQueryState.sortField,
      sortOrder: pagination.sortOrder || userQueryState.sortOrder
    };

    // If current page becomes out-of-range after data updates, move to last available page
    if (users.length === 0 && userQueryState.totalCount > 0 && userQueryState.page > userQueryState.totalPages) {
      await loadUsers({ page: userQueryState.totalPages });
      return;
    }

    allUsers = users;
    renderUserTable(users, userQueryState);
  } catch (err) {
    console.error("Failed to load users:", err);
    document.getElementById("userTableContainer").innerHTML =
      `<p class="text-red-600">${t('userManagement.failedToLoad')}: ${err.message}</p>`;
  }
}

function applyUserFilters() {
  loadUsers({ page: 1, resetPage: true });
}

function resetUserFilters() {
  userQueryState.search = '';
  userQueryState.filterRole = '';
  userQueryState.filterDivision = '';
  userQueryState.filterSection = '';
  userQueryState.filterEnable = '';
  userQueryState.filterFactory = '';
  userQueryState.filterEquipment = '';
  userQueryState.page = 1;

  const ids = [
    'userSearchInput',
    'userFilterRole',
    'userFilterDivision',
    'userFilterSection',
    'userFilterEnable',
    'userFilterFactory',
    'userFilterEquipment'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  loadUsers({ page: 1 });
}

function goToUserPage(page) {
  if (page < 1 || page > userQueryState.totalPages) return;
  loadUsers({ page });
}

function changeUserPageSize(limit) {
  const parsedLimit = parseInt(limit, 10);
  if (!parsedLimit || parsedLimit < 1) return;
  loadUsers({ page: 1, limit: parsedLimit });
}

function sortUsersBy(field) {
  if (!field) return;

  if (userQueryState.sortField === field) {
    userQueryState.sortOrder = userQueryState.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    userQueryState.sortField = field;
    userQueryState.sortOrder = 'asc';
  }

  loadUsers({ page: 1 });
}

function getSortIndicator(field) {
  if (userQueryState.sortField !== field) return '';
  return userQueryState.sortOrder === 'asc' ? ' ↑' : ' ↓';
}

function showCreateUserForm() {
  const container = document.getElementById("userTableContainer");

  const formHTML = `
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-user-add-line text-lg text-blue-600"></i>
        <h3 class="text-xl font-semibold text-gray-900">${t('userManagement.createNewUser')}</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.firstName')}</label>
          <input type="text" id="newFirstName" placeholder="${t('userManagement.firstName')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.lastName')}</label>
          <input type="text" id="newLastName" placeholder="${t('userManagement.lastName')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.email')}</label>
          <input type="email" id="newEmail" placeholder="${t('userManagement.email')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.username')}</label>
          <input type="text" id="newUsername" placeholder="${t('userManagement.username')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.password')}</label>
          <input type="password" id="newPassword" placeholder="${t('userManagement.password')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.role')}</label>
          <select id="newRole" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors">
            <option value="">${t('userManagement.selectRole')}</option>
            ${availableRoles.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.division')}</label>
          <select id="newDivision" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableDepartments.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableDepartments.length > 0 ? t('userManagement.selectDepartment') : t('userManagement.noDepartmentData')}</option>
            ${availableDepartments.map(d => `<option value="${d}">${d}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.section')}</label>
          <select id="newSection" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableSections.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableSections.length > 0 ? t('userManagement.selectSection') : t('userManagement.noSectionData')}</option>
            ${availableSections.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.enable')}</label>
          <select id="newEnable" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors">
            <option value="enabled">${t('userManagement.enabled')}</option>
            <option value="disabled">${t('userManagement.disabled')}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.factory')} ${t('userManagement.factoryMultiSelect')}</label>
          <div id="userFactoryTags" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white min-h-[42px] mb-2"></div>
          <select id="newFactory" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableFactories.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableFactories.length > 0 ? t('userManagement.addFactory') : t('userManagement.noFactoryData')}</option>
            ${availableFactories.map(f => `<option value="${f}">${f}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.equipment')} ${t('userManagement.equipmentMultiSelect')}</label>
          <div id="userEquipmentTags" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white min-h-[42px] mb-2"></div>
          <select id="newEquipment" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableEquipment.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableEquipment.length > 0 ? t('userManagement.addEquipment') : t('userManagement.noEquipmentData')}</option>
            ${availableEquipment.map(e => `<option value="${e}">${e}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${t('userManagement.userID')}</label>
          <input type="text" id="newUserID" placeholder="${t('userManagement.userID')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors" onclick="submitNewUser()">
          <i class="ri-check-line mr-2"></i>
          ${t('userManagement.save')}
        </button>
        <button class="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors" onclick="loadUsers()">
          <i class="ri-close-line mr-2"></i>
          ${t('userManagement.cancel')}
        </button>
      </div>
    </div>
  `;

  container.innerHTML = formHTML + container.innerHTML;
  
  // Initialize factory tagging system
  selectedUserFactories = [];
  renderUserFactoryTags();
  
  const factorySelect = document.getElementById('newFactory');
  if (factorySelect) {
    factorySelect.onchange = (e) => {
      if (e.target.value && !selectedUserFactories.includes(e.target.value)) {
        selectedUserFactories.push(e.target.value);
        renderUserFactoryTags();
      }
      e.target.value = '';
    };
  }
  
  // Initialize equipment tagging system
  selectedUserEquipment = [];
  renderUserEquipmentTags();
  
  const equipmentSelect = document.getElementById('newEquipment');
  if (equipmentSelect) {
    equipmentSelect.onchange = (e) => {
      if (e.target.value && !selectedUserEquipment.includes(e.target.value)) {
        selectedUserEquipment.push(e.target.value);
        renderUserEquipmentTags();
      }
      e.target.value = '';
    };
  }
}

function startEditingUser(userId) {
  // Get user data
  const user = allUsers.find(u => u._id === userId);
  if (!user) return;
  
  // Enable all input fields except factory and equipment
  document.querySelectorAll(`[user-id='${userId}']`).forEach(el => {
    if (el.dataset.field !== 'factory' && el.dataset.field !== 'equipment') {
      el.disabled = false;
    }
  });
  
  // Replace factory display div with tagging system
  const factoryCell = document.querySelector(`#userRow-${userId} td:nth-child(9)`);
  if (factoryCell) {
    // Initialize selected factories from user data (handle both array and CSV string formats)
    selectedUserFactories = user.factory 
      ? (Array.isArray(user.factory) ? user.factory.filter(f => f) : user.factory.split(',').map(f => f.trim()).filter(f => f))
      : [];
    
    factoryCell.innerHTML = `
      <div>
        <div id="editUserFactoryTags-${userId}" class="flex gap-1 flex-wrap mb-2 min-h-[32px] p-1 border rounded"></div>
        <select id="editUserFactorySelect-${userId}" class="w-full p-1 border rounded text-xs" data-field="factory" user-id="${userId}">
          <option value="">+ Add Factory</option>
          ${availableFactories.map(f => `<option value="${f}">${f}</option>`).join("")}
        </select>
      </div>
    `;
    
    // Render initial tags
    renderEditUserFactoryTags(userId);
    
    // Setup select handler
    const factorySelect = document.getElementById(`editUserFactorySelect-${userId}`);
    if (factorySelect) {
      factorySelect.onchange = (e) => {
        if (e.target.value && !selectedUserFactories.includes(e.target.value)) {
          selectedUserFactories.push(e.target.value);
          renderEditUserFactoryTags(userId);
        }
        e.target.value = '';
      };
    }
  }
  
  // Replace equipment display div with tagging system
  const equipmentCell = document.querySelector(`#userRow-${userId} td:nth-child(10)`);
  if (equipmentCell) {
    // Initialize selected equipment from user data (handle both array and CSV string formats)
    selectedUserEquipment = user.equipment 
      ? (Array.isArray(user.equipment) ? user.equipment.filter(e => e) : user.equipment.split(',').map(e => e.trim()).filter(e => e))
      : [];
    
    equipmentCell.innerHTML = `
      <div>
        <div id="editUserEquipmentTags-${userId}" class="flex gap-1 flex-wrap mb-2 min-h-[32px] p-1 border rounded"></div>
        <select id="editUserEquipmentSelect-${userId}" class="w-full p-1 border rounded text-xs" data-field="equipment" user-id="${userId}">
          <option value="">+ Add Equipment</option>
          ${availableEquipment.map(e => `<option value="${e}">${e}</option>`).join("")}
        </select>
      </div>
    `;
    
    // Render initial tags
    renderEditUserEquipmentTags(userId);
    
    // Setup select handler
    const equipmentSelect = document.getElementById(`editUserEquipmentSelect-${userId}`);
    if (equipmentSelect) {
      equipmentSelect.onchange = (e) => {
        if (e.target.value && !selectedUserEquipment.includes(e.target.value)) {
          selectedUserEquipment.push(e.target.value);
          renderEditUserEquipmentTags(userId);
        }
        e.target.value = '';
      };
    }
  }
  
  const actions = document.getElementById(`actions-${userId}`);
  actions.innerHTML = `
    <button class="text-green-600 hover:underline text-sm" onclick="saveUser('${userId}')">${t('userManagement.save')}</button>
    <button class="ml-2 text-gray-600 hover:underline text-sm" onclick="cancelEditUser('${userId}')">${t('userManagement.cancel')}</button>
  `;
}

function renderEditUserFactoryTags(userId) {
  const tagsDiv = document.getElementById(`editUserFactoryTags-${userId}`);
  if (!tagsDiv) return;
  
  tagsDiv.innerHTML = selectedUserFactories.length > 0 ? 
    selectedUserFactories.map(f => `
      <span class="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
        ${f}
        <button type="button" onclick="removeEditUserFactoryTag('${f}', '${userId}')" class="ml-1 text-blue-600 hover:text-blue-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-xs">${t('userManagement.noFactoriesSelected')}</span>`;
}

function removeEditUserFactoryTag(factory, userId) {
  selectedUserFactories = selectedUserFactories.filter(f => f !== factory);
  renderEditUserFactoryTags(userId);
}

function renderEditUserEquipmentTags(userId) {
  const tagsDiv = document.getElementById(`editUserEquipmentTags-${userId}`);
  if (!tagsDiv) return;
  
  tagsDiv.innerHTML = selectedUserEquipment.length > 0 ? 
    selectedUserEquipment.map(e => `
      <span class="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
        ${e}
        <button type="button" onclick="removeEditUserEquipmentTag('${e}', '${userId}')" class="ml-1 text-green-600 hover:text-green-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-xs">${t('userManagement.noEquipmentSelected')}</span>`;
}

function removeEditUserEquipmentTag(equipment, userId) {
  selectedUserEquipment = selectedUserEquipment.filter(e => e !== equipment);
  renderEditUserEquipmentTags(userId);
}

function cancelEditUser(userId) {
  loadUsers();
}

async function saveUser(userId) {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";
  const role = currentUser.role || "admin";

  const updated = {};
  document.querySelectorAll(`[user-id='${userId}']`).forEach(el => {
    if (el.dataset.field && el.dataset.field !== 'factory' && el.dataset.field !== 'equipment') {
      updated[el.dataset.field] = el.value;
    }
    if (el.hasAttribute('data-role')) {
      updated.role = el.value;
    }
  });
  
  // Add factory and equipment from selected arrays
  updated.factory = selectedUserFactories.join(',');
  updated.equipment = selectedUserEquipment.join(',');

  try {
    const res = await fetch(BASE_URL + "customerUpdateRecord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: userId,
        updateData: updated,
        dbName,
        collectionName: "users",
        role,
        username
      })
    });

    const result = await res.json();
    if (!res.ok || !result.modifiedCount) throw new Error(t('userManagement.updateFailed'));

    alert(t('userManagement.userUpdatedSuccess'));
    loadUsers();
  } catch (err) {
    console.error("Update error:", err);
    alert(`${t('userManagement.updateFailed')}: ${err.message}`);
  }
}

async function deleteUser(userId) {
  if (!confirm(t('userManagement.confirmDelete'))) return;
  
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const username = currentUser.username || "admin";
  const role = currentUser.role || "admin";

  try {
    const res = await fetch(BASE_URL + "customerDeleteUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: userId,
        dbName,
        role,
        username
      })
    });

    const result = await res.json();
    if (!res.ok || !result.deletedCount) throw new Error(t('userManagement.deleteFailed'));

    alert(t('userManagement.userDeletedSuccess'));
    loadUsers();
  } catch (err) {
    console.error("Delete error:", err);
    alert(`${t('userManagement.deleteFailed')}: ${err.message}`);
  }
}

function renderUserTable(users, paginationState = userQueryState) {
  const headers = ["firstName", "lastName", "email", "username", "role", "division", "section", "enable", "factory", "equipment", "userID"];
  
  // Create header translations map
  const headerTranslations = {
    firstName: t('userManagement.firstName'),
    lastName: t('userManagement.lastName'),
    email: t('userManagement.email'),
    username: t('userManagement.username'),
    role: t('userManagement.role'),
    division: t('userManagement.division'),
    section: t('userManagement.section'),
    enable: t('userManagement.enable'),
    factory: t('userManagement.factory'),
    equipment: t('userManagement.equipment'),
    userID: t('userManagement.userID')
  };

  const currentPage = paginationState.page || 1;
  const pageSize = paginationState.limit || 25;
  const totalCount = paginationState.totalCount || 0;
  const totalPages = paginationState.totalPages || 1;
  const startIndex = totalCount === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(currentPage * pageSize, totalCount);

  const roleFilterOptions = availableRoles.map(r => `<option value="${r}" ${userQueryState.filterRole === r ? 'selected' : ''}>${r}</option>`).join('');
  const divisionFilterOptions = availableDepartments.map(d => `<option value="${d}" ${userQueryState.filterDivision === d ? 'selected' : ''}>${d}</option>`).join('');
  const sectionFilterOptions = availableSections.map(s => `<option value="${s}" ${userQueryState.filterSection === s ? 'selected' : ''}>${s}</option>`).join('');
  const factoryFilterOptions = availableFactories.map(f => `<option value="${f}" ${userQueryState.filterFactory === f ? 'selected' : ''}>${f}</option>`).join('');
  const equipmentFilterOptions = availableEquipment.map(e => `<option value="${e}" ${userQueryState.filterEquipment === e ? 'selected' : ''}>${e}</option>`).join('');
  
  const tableHTML = `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <button class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" onclick="showCreateUserForm()">
        <i class="ri-user-add-line mr-2"></i>
        ${t('userManagement.createNewUser')}
      </button>
      <span class="text-sm text-gray-600">${totalCount} users</span>
    </div>

    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('common.search')}</label>
          <input id="userSearchInput" type="text" value="${userQueryState.search || ''}" placeholder="${t('common.search')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('userManagement.role')}</label>
          <select id="userFilterRole" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="">All</option>
            ${roleFilterOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('userManagement.division')}</label>
          <select id="userFilterDivision" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="">All</option>
            ${divisionFilterOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('userManagement.section')}</label>
          <select id="userFilterSection" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="">All</option>
            ${sectionFilterOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('userManagement.enable')}</label>
          <select id="userFilterEnable" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="">All</option>
            <option value="enabled" ${userQueryState.filterEnable === 'enabled' ? 'selected' : ''}>${t('userManagement.enabled')}</option>
            <option value="disabled" ${userQueryState.filterEnable === 'disabled' ? 'selected' : ''}>${t('userManagement.disabled')}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('userManagement.factory')}</label>
          <select id="userFilterFactory" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="">All</option>
            ${factoryFilterOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">${t('userManagement.equipment')}</label>
          <select id="userFilterEquipment" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="">All</option>
            ${equipmentFilterOptions}
          </select>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-3">
        <button class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm" onclick="applyUserFilters()">Apply</button>
        <button class="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm" onclick="resetUserFilters()">Reset</button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead class="bg-gray-100">
          <tr>
            ${headers.map(h => `
              <th class="px-4 py-3 text-left font-semibold text-gray-700">
                <button class="inline-flex items-center gap-1 hover:text-blue-700" onclick="sortUsersBy('${h}')">
                  <span>${headerTranslations[h]}</span><span>${getSortIndicator(h)}</span>
                </button>
              </th>
            `).join("")}
            <th class="px-4 py-3 text-left font-semibold text-gray-700">${t('userManagement.actions')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${users.length === 0 ? `
            <tr>
              <td class="px-4 py-6 text-center text-gray-500" colspan="12">No users found</td>
            </tr>
          ` : users.map(u => `
            <tr class="hover:bg-gray-50" id="userRow-${u._id}">
              ${headers.map(h => `
                <td class="px-4 py-3">
                  ${
                    h === "role"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-role user-id="${u._id}">
                          ${availableRoles.map(r => `
                            <option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>
                          `).join("")}
                        </select>`
                      : h === "division"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-field="${h}" user-id="${u._id}">
                          <option value="">${t('userManagement.selectDepartment')}</option>
                          ${availableDepartments.map(d => `
                            <option value="${d}" ${u[h] === d ? "selected" : ""}>${d}</option>
                          `).join("")}
                        </select>`
                      : h === "section"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-field="${h}" user-id="${u._id}">
                          <option value="">${t('userManagement.selectSection')}</option>
                          ${availableSections.map(s => `
                            <option value="${s}" ${u[h] === s ? "selected" : ""}>${s}</option>
                          `).join("")}
                        </select>`
                      : h === "enable"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-field="${h}" user-id="${u._id}">
                          <option value="enabled" ${(u[h] || "enabled") === "enabled" ? "selected" : ""}>${t('userManagement.enabled')}</option>
                          <option value="disabled" ${u[h] === "disabled" ? "selected" : ""}>${t('userManagement.disabled')}</option>
                        </select>`
                      : h === "factory"
                      ? `<div class="flex gap-1 flex-wrap">
                          ${(() => {
                            let factoryList = [];
                            if (u[h]) {
                              if (Array.isArray(u[h])) {
                                factoryList = u[h].filter(f => f);
                              } else if (typeof u[h] === 'string') {
                                factoryList = u[h].split(',').map(f => f.trim()).filter(f => f);
                              }
                            }
                            return factoryList.length > 0 
                              ? factoryList.map(f => `<span class="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">${f}</span>`).join('')
                              : '<span class="text-gray-400">-</span>';
                          })()}
                        </div>`
                      : h === "equipment"
                      ? `<div class="flex gap-1 flex-wrap">
                          ${(() => {
                            let equipmentList = [];
                            if (u[h]) {
                              if (Array.isArray(u[h])) {
                                equipmentList = u[h].filter(e => e);
                              } else if (typeof u[h] === 'string') {
                                equipmentList = u[h].split(',').map(e => e.trim()).filter(e => e);
                              }
                            }
                            return equipmentList.length > 0
                              ? equipmentList.map(e => `<span class="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs">${e}</span>`).join('')
                              : '<span class="text-gray-400">-</span>';
                          })()}
                        </div>`
                      : `<input class="border border-gray-300 p-1 rounded w-full" value="${u[h] || ""}" disabled data-field="${h}" user-id="${u._id}" />`
                  }
                </td>
              `).join("")}
              <td class="px-4 py-3" id="actions-${u._id}">
                <button class="text-blue-600 hover:underline text-sm" onclick="startEditingUser('${u._id}')">${t('userManagement.edit')}</button>
                  <button class="ml-2 text-orange-600 hover:underline text-sm" onclick="showResetPasswordModal('${u._id}', '${u.username}')">${t('userManagement.resetPassword')}</button>
                <button class="ml-2 text-red-600 hover:underline text-sm" onclick="deleteUser('${u._id}')">${t('userManagement.delete')}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div class="text-sm text-gray-600">Showing ${startIndex}-${endIndex} of ${totalCount}</div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2 mr-2">
          <label for="userPageSize" class="text-sm text-gray-600">Rows</label>
          <select id="userPageSize" class="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm" onchange="changeUserPageSize(this.value)">
            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
            <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
          </select>
        </div>
        <button class="px-3 py-1.5 border rounded ${currentPage <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}" ${currentPage <= 1 ? 'disabled' : ''} onclick="goToUserPage(${currentPage - 1})">Prev</button>
        <span class="text-sm text-gray-700">Page ${currentPage} / ${totalPages}</span>
        <button class="px-3 py-1.5 border rounded ${currentPage >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}" ${currentPage >= totalPages ? 'disabled' : ''} onclick="goToUserPage(${currentPage + 1})">Next</button>
      </div>
    </div>
  `;

  document.getElementById("userTableContainer").innerHTML = tableHTML;

  const searchInput = document.getElementById('userSearchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        applyUserFilters();
      }
    });
  }
}

async function submitNewUser() {
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const creatorRole = currentUser.role || "admin";

  const data = {
    firstName: document.getElementById("newFirstName").value.trim(),
    lastName: document.getElementById("newLastName").value.trim(),
    email: document.getElementById("newEmail").value.trim(),
    username: document.getElementById("newUsername").value.trim(),
    password: document.getElementById("newPassword").value.trim(),
    role: document.getElementById("newRole").value.trim(),
    division: document.getElementById("newDivision").value.trim(),
    section: document.getElementById("newSection").value.trim(),
    enable: document.getElementById("newEnable").value.trim(),
    factory: selectedUserFactories.join(','),
    equipment: selectedUserEquipment.join(','),
    userID: document.getElementById("newUserID").value.trim(),
    dbName,
    creatorRole
  };

  if (!data.firstName || !data.lastName || !data.email || !data.username || !data.password || !data.role) {
    return alert(t('userManagement.fillRequiredFields'));
  }

  if (data.password.length < 6) {
    return alert(t('userManagement.passwordMinLength'));
  }

  try {
    const res = await fetch(BASE_URL + "customerCreateUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) {
      let errorMessage = result.error || t('userManagement.createFailed');
      
      if (errorMessage.includes("Username already exists in this customer database")) {
        errorMessage = t('userManagement.usernameExistsKSG');
      } else if (errorMessage.includes("Username already exists in a master account")) {
        errorMessage = t('userManagement.usernameExistsMaster');
      } else if (errorMessage.includes("Username already exists in another customer company")) {
        errorMessage = t('userManagement.usernameExistsOther');
      } else if (errorMessage.includes("Missing required fields")) {
        errorMessage = t('userManagement.fillRequiredFields');
      } else if (errorMessage.includes("Access denied")) {
        errorMessage = t('userManagement.accessDenied');
      }
      
      throw new Error(errorMessage);
    }

    alert(t('userManagement.userCreatedSuccess'));
    loadUsers();
  } catch (err) {
    console.error("Create error:", err);
    alert(`${t('userManagement.createFailed')}: ${err.message}`);
  }
}

function renderUserFactoryTags() {
  const tagsDiv = document.getElementById('userFactoryTags');
  if (!tagsDiv) return;
  
  tagsDiv.innerHTML = selectedUserFactories.length > 0 ? 
    selectedUserFactories.map(f => `
      <span class="inline-flex items-center px-2 py-1 mr-2 mb-2 bg-blue-100 text-blue-800 rounded">
        ${f}
        <button type="button" onclick="removeUserFactoryTag('${f}')" class="ml-2 text-blue-600 hover:text-blue-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-sm">${t('userManagement.selectFactory')}</span>`;
}

function removeUserFactoryTag(factory) {
  selectedUserFactories = selectedUserFactories.filter(f => f !== factory);
  renderUserFactoryTags();
}

function renderUserEquipmentTags() {
  const tagsDiv = document.getElementById('userEquipmentTags');
  if (!tagsDiv) return;
  
  tagsDiv.innerHTML = selectedUserEquipment.length > 0 ? 
    selectedUserEquipment.map(e => `
      <span class="inline-flex items-center px-2 py-1 mr-2 mb-2 bg-green-100 text-green-800 rounded">
        ${e}
        <button type="button" onclick="removeUserEquipmentTag('${e}')" class="ml-2 text-green-600 hover:text-green-800 font-bold">
          ×
        </button>
      </span>
    `).join('') : `<span class="text-gray-400 text-sm">${t('userManagement.selectEquipment')}</span>`;
}

function removeUserEquipmentTag(equipment) {
  selectedUserEquipment = selectedUserEquipment.filter(e => e !== equipment);
  renderUserEquipmentTags();
}

  // Password Reset Functions
  function showResetPasswordModal(userId, username) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('resetPasswordModal');
    if (!modal) {
      const modalHTML = `
        <div id="resetPasswordModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="display: none;">
          <div class="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div class="p-6">
              <div class="flex items-center gap-2 mb-4">
                <i class="ri-lock-password-line text-2xl text-orange-600"></i>
                <h3 class="text-xl font-semibold text-gray-900">${t('userManagement.resetPasswordTitle')}</h3>
              </div>
              <div class="mb-4">
                <p class="text-gray-600 text-sm mb-1">${t('userManagement.username')}:</p>
                <p class="font-medium text-gray-900" id="resetPasswordUsername"></p>
              </div>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">${t('userManagement.newPassword')}</label>
                  <input type="password" id="resetPasswordNew" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" placeholder="${t('userManagement.newPassword')}" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">${t('userManagement.confirmPassword')}</label>
                  <input type="password" id="resetPasswordConfirm" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" placeholder="${t('userManagement.confirmPassword')}" />
                </div>
              </div>
              <div class="flex gap-3 mt-6">
                <button class="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors" onclick="submitResetPassword()">
                  <i class="ri-check-line mr-2"></i>
                  ${t('userManagement.resetPassword')}
                </button>
                <button class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors" onclick="closeResetPasswordModal()">
                  <i class="ri-close-line mr-2"></i>
                  ${t('userManagement.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      modal = document.getElementById('resetPasswordModal');
    }
  
    // Set user info and show modal
    document.getElementById('resetPasswordUsername').textContent = username;
    modal.dataset.userId = userId;
    document.getElementById('resetPasswordNew').value = '';
    document.getElementById('resetPasswordConfirm').value = '';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  async function submitResetPassword() {
    const modal = document.getElementById('resetPasswordModal');
    const userId = modal.dataset.userId;
    const newPassword = document.getElementById('resetPasswordNew').value.trim();
    const confirmPassword = document.getElementById('resetPasswordConfirm').value.trim();
  
    if (!newPassword || !confirmPassword) {
      alert(t('userManagement.fillRequiredFields'));
      return;
    }
  
    if (newPassword.length < 6) {
      alert(t('userManagement.passwordMinLength'));
      return;
    }
  
    if (newPassword !== confirmPassword) {
      alert(t('userManagement.passwordsDoNotMatch'));
      return;
    }
  
    const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
    const dbName = currentUser.dbName || "KSG";
    const username = currentUser.username || "admin";
    const role = currentUser.role || "admin";
  
    try {
      const res = await fetch(BASE_URL + "customerResetUserPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          newPassword,
          dbName,
          role,
          username
        })
      });
    
      const result = await res.json();
    
      if (res.ok) {
        alert(t('userManagement.passwordResetSuccess'));
        closeResetPasswordModal();
      } else {
        alert(t('userManagement.passwordResetFailed') + ": " + (result.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Error resetting password:", err);
      alert(t('userManagement.passwordResetFailed'));
    }
  }

// Initialize when page loads
if (typeof window !== 'undefined') {
  window.loadUsers = loadUsers;
  window.showCreateUserForm = showCreateUserForm;
  window.startEditingUser = startEditingUser;
  window.cancelEditUser = cancelEditUser;
  window.saveUser = saveUser;
  window.deleteUser = deleteUser;
  window.submitNewUser = submitNewUser;
  window.renderUserFactoryTags = renderUserFactoryTags;
  window.removeUserFactoryTag = removeUserFactoryTag;
  window.renderUserEquipmentTags = renderUserEquipmentTags;
  window.removeUserEquipmentTag = removeUserEquipmentTag;
  window.renderEditUserFactoryTags = renderEditUserFactoryTags;
  window.removeEditUserFactoryTag = removeEditUserFactoryTag;
  window.renderEditUserEquipmentTags = renderEditUserEquipmentTags;
  window.removeEditUserEquipmentTag = removeEditUserEquipmentTag;
  window.applyUserFilters = applyUserFilters;
  window.resetUserFilters = resetUserFilters;
  window.goToUserPage = goToUserPage;
  window.changeUserPageSize = changeUserPageSize;
  window.sortUsersBy = sortUsersBy;
    window.showResetPasswordModal = showResetPasswordModal;
    window.closeResetPasswordModal = closeResetPasswordModal;
    window.submitResetPassword = submitResetPassword;
}
