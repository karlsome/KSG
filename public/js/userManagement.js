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

async function loadUsers() {
  // Get current user info (should be set when user logs in)
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const role = currentUser.role || "admin";

  // Load available roles, factories, and equipment first
  await loadAvailableRoles();
  await loadAvailableFactories();
  await loadAvailableEquipment();
  await loadAvailableDepartments();
  await loadAvailableSections();

  try {
    const res = await fetch(BASE_URL + "customerGetUsers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName, role })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const users = await res.json();
    allUsers = users;
    renderUserTable(users);
  } catch (err) {
    console.error("Failed to load users:", err);
    document.getElementById("userTableContainer").innerHTML =
      `<p class="text-red-600">Failed to load users: ${err.message}</p>`;
  }
}

function showCreateUserForm() {
  const container = document.getElementById("userTableContainer");

  const formHTML = `
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-user-add-line text-lg text-blue-600"></i>
        <h3 class="text-xl font-semibold text-gray-900">Create New User</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">First Name</label>
          <input type="text" id="newFirstName" placeholder="First Name" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Last Name</label>
          <input type="text" id="newLastName" placeholder="Last Name" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" id="newEmail" placeholder="Email" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Username</label>
          <input type="text" id="newUsername" placeholder="Username" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Password</label>
          <input type="password" id="newPassword" placeholder="Password" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Role</label>
          <select id="newRole" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors">
            <option value="">Select Role</option>
            ${availableRoles.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">所属部署</label>
          <select id="newDivision" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableDepartments.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableDepartments.length > 0 ? '選択してください' : '⚠️ 部署データがありません'}</option>
            ${availableDepartments.map(d => `<option value="${d}">${d}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">所属係</label>
          <select id="newSection" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableSections.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableSections.length > 0 ? '選択してください' : '⚠️ 係データがありません'}</option>
            ${availableSections.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Enable</label>
          <select id="newEnable" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors">
            <option value="enabled">enabled</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">工場 (複数選択可能)</label>
          <div id="userFactoryTags" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white min-h-[42px] mb-2"></div>
          <select id="newFactory" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableFactories.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableFactories.length > 0 ? '+ 工場を追加' : '⚠️ 工場データがありません'}</option>
            ${availableFactories.map(f => `<option value="${f}">${f}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">設備 (複数選択可能)</label>
          <div id="userEquipmentTags" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white min-h-[42px] mb-2"></div>
          <select id="newEquipment" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors ${availableEquipment.length === 0 ? 'border-red-500' : ''}">
            <option value="">${availableEquipment.length > 0 ? '+ 設備を追加' : '⚠️ 設備データがありません'}</option>
            ${availableEquipment.map(e => `<option value="${e}">${e}</option>`).join("")}
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">User ID</label>
          <input type="text" id="newUserID" placeholder="User ID" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
      </div>
      <div class="flex gap-3">
        <button class="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors" onclick="submitNewUser()">
          <i class="ri-check-line mr-2"></i>
          Save
        </button>
        <button class="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors" onclick="loadUsers()">
          <i class="ri-close-line mr-2"></i>
          Cancel
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
    <button class="text-green-600 hover:underline text-sm" onclick="saveUser('${userId}')">Save</button>
    <button class="ml-2 text-gray-600 hover:underline text-sm" onclick="cancelEditUser('${userId}')">Cancel</button>
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
    `).join('') : '<span class="text-gray-400 text-xs">No factories selected</span>';
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
    `).join('') : '<span class="text-gray-400 text-xs">No equipment selected</span>';
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
    if (!res.ok || !result.modifiedCount) throw new Error("Update failed");

    alert("User updated successfully");
    loadUsers();
  } catch (err) {
    console.error("Update error:", err);
    alert("Update failed: " + err.message);
  }
}

async function deleteUser(userId) {
  if (!confirm("Are you sure you want to delete this user?")) return;
  
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
    if (!res.ok || !result.deletedCount) throw new Error("Delete failed");

    alert("User deleted successfully");
    loadUsers();
  } catch (err) {
    console.error("Delete error:", err);
    alert("Delete failed: " + err.message);
  }
}

function renderUserTable(users) {
  const headers = ["firstName", "lastName", "email", "username", "role", "division", "section", "enable", "factory", "equipment", "userID"];
  
  const tableHTML = `
    <div class="mb-4">
      <button class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" onclick="showCreateUserForm()">
        <i class="ri-user-add-line mr-2"></i>
        Create New User
      </button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead class="bg-gray-100">
          <tr>
            ${headers.map(h => `<th class="px-4 py-3 text-left font-semibold text-gray-700">${h}</th>`).join("")}
            <th class="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${users.map(u => `
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
                          <option value="">選択してください</option>
                          ${availableDepartments.map(d => `
                            <option value="${d}" ${u[h] === d ? "selected" : ""}>${d}</option>
                          `).join("")}
                        </select>`
                      : h === "section"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-field="${h}" user-id="${u._id}">
                          <option value="">選択してください</option>
                          ${availableSections.map(s => `
                            <option value="${s}" ${u[h] === s ? "selected" : ""}>${s}</option>
                          `).join("")}
                        </select>`
                      : h === "enable"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-field="${h}" user-id="${u._id}">
                          <option value="enabled" ${(u[h] || "enabled") === "enabled" ? "selected" : ""}>enabled</option>
                          <option value="disabled" ${u[h] === "disabled" ? "selected" : ""}>disabled</option>
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
                <button class="text-blue-600 hover:underline text-sm" onclick="startEditingUser('${u._id}')">Edit</button>
                <button class="ml-2 text-red-600 hover:underline text-sm" onclick="deleteUser('${u._id}')">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("userTableContainer").innerHTML = tableHTML;
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
    return alert("Please fill in all required fields");
  }

  if (data.password.length < 6) {
    return alert("Password must be at least 6 characters long");
  }

  try {
    const res = await fetch(BASE_URL + "customerCreateUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) {
      let errorMessage = result.error || "Failed to create user";
      
      if (errorMessage.includes("Username already exists in this customer database")) {
        errorMessage = "This username already exists in KSG database";
      } else if (errorMessage.includes("Username already exists in a master account")) {
        errorMessage = "This username already exists in a master account";
      } else if (errorMessage.includes("Username already exists in another customer company")) {
        errorMessage = "This username already exists in another company";
      } else if (errorMessage.includes("Missing required fields")) {
        errorMessage = "Please fill in all required fields";
      } else if (errorMessage.includes("Access denied")) {
        errorMessage = "Access denied";
      }
      
      throw new Error(errorMessage);
    }

    alert("User created successfully");
    loadUsers();
  } catch (err) {
    console.error("Create error:", err);
    alert("Create failed: " + err.message);
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
    `).join('') : '<span class="text-gray-400 text-sm">工場を選択してください</span>';
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
    `).join('') : '<span class="text-gray-400 text-sm">設備を選択してください</span>';
}

function removeUserEquipmentTag(equipment) {
  selectedUserEquipment = selectedUserEquipment.filter(e => e !== equipment);
  renderUserEquipmentTags();
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
}
