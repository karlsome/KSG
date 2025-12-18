// masterDB.js for KSG


let currentTab = 'master';
let allMasterData = [];
let allFactories = [];
let allEquipment = [];
let allRoles = [];

// ====================
// Tab Switching
// ====================
function switchMainTab(tabName) {
  // Hide all content
  document.getElementById('contentMaster').classList.add('hidden');
  document.getElementById('contentFactory').classList.add('hidden');
  document.getElementById('contentDivision').classList.add('hidden');
  document.getElementById('contentEquipment').classList.add('hidden');
  document.getElementById('contentRoles').classList.add('hidden');

  // Remove active class from all tabs
  document.getElementById('tabMaster').classList.remove('tab-active');
  document.getElementById('tabFactory').classList.remove('tab-active');
  document.getElementById('tabDivision').classList.remove('tab-active');
  document.getElementById('tabEquipment').classList.remove('tab-active');
  document.getElementById('tabRoles').classList.remove('tab-active');

  // Show selected content and activate tab
  currentTab = tabName;
  document.getElementById(`content${capitalizeFirst(tabName)}`).classList.remove('hidden');
  document.getElementById(`tab${capitalizeFirst(tabName)}`).classList.add('tab-active');

  // Load data for the tab
  switch(tabName) {
    case 'master':
      loadMasterData();
      break;
    case 'factory':
      loadFactories();
      break;
    case 'division':
      loadFactoriesForDivisionDropdown();
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

  const headers = ["品番", "製品名", "LH/RH", "kanbanID", "設備", "工場", "cycleTime"];

  const tableHTML = `
    ${canEdit ? `
      <div class="mb-4">
        <button class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" onclick="showCreateMasterForm()">
          <i class="ri-add-line mr-2"></i>
          Create New Master Record
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead class="bg-gray-100">
          <tr>
            ${headers.map(h => `<th class="px-4 py-3 text-left font-semibold text-gray-700">${h}</th>`).join("")}
            <th class="px-4 py-3 text-left font-semibold text-gray-700">Image</th>
            ${canEdit ? `<th class="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>` : ""}
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${data.map(record => `
            <tr class="hover:bg-gray-50">
              ${headers.map(h => `
                <td class="px-4 py-3">${record[h] || ""}</td>
              `).join("")}
              <td class="px-4 py-3">
                ${record.imageURL ? `<img src="${record.imageURL}" alt="Product" class="h-12 w-12 object-cover rounded" />` : `<span class="text-gray-400">No image</span>`}
              </td>
              ${canEdit ? `
                <td class="px-4 py-3">
                  <button class="text-blue-600 hover:underline text-sm mr-2" onclick="editMasterRecord('${record._id}')">Edit</button>
                  <button class="text-red-600 hover:underline text-sm" onclick="deleteMasterRecord('${record._id}')">Delete</button>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("masterTableContainer").innerHTML = tableHTML;
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
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  const tableHTML = `
    ${canEdit ? `
      <div class="mb-4">
        <button class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onclick="showCreateFactoryForm()">
          <i class="ri-add-line mr-2"></i>Create New Factory
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left font-semibold">Factory Name</th>
            <th class="px-4 py-3 text-left font-semibold">Address</th>
            <th class="px-4 py-3 text-left font-semibold">Phone</th>
            ${canEdit ? `<th class="px-4 py-3 text-left font-semibold">Actions</th>` : ""}
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${factories.map(f => `
            <tr class="hover:bg-gray-50" id="factoryRow-${f._id}">
              <td class="px-4 py-3">
                <input class="border border-gray-300 p-1 rounded w-full" value="${f.name || ""}" disabled data-field="name" factory-id="${f._id}" />
              </td>
              <td class="px-4 py-3">
                <input class="border border-gray-300 p-1 rounded w-full" value="${f.address || ""}" disabled data-field="address" factory-id="${f._id}" />
              </td>
              <td class="px-4 py-3">
                <input class="border border-gray-300 p-1 rounded w-full" value="${f.phone || ""}" disabled data-field="phone" factory-id="${f._id}" />
              </td>
              ${canEdit ? `
                <td class="px-4 py-3" id="factoryActions-${f._id}">
                  <button class="text-blue-600 hover:underline text-sm mr-2" onclick="startEditingFactory('${f._id}')">Edit</button>
                  <button class="text-red-600 hover:underline text-sm" onclick="deleteFactory('${f._id}')">Delete</button>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("factoryTableContainer").innerHTML = tableHTML;
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
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  const tableHTML = `
    ${canEdit ? `
      <div class="mb-4">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg" onclick="showCreateEquipmentForm()">
          <i class="ri-add-line mr-2"></i>Create Equipment
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left">設備名</th>
            <th class="px-4 py-3 text-left">工場 (Factories)</th>
            <th class="px-4 py-3 text-left">Description</th>
            ${canEdit ? `<th class="px-4 py-3 text-left">Actions</th>` : ""}
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${equipment.map(eq => `
            <tr>
              <td class="px-4 py-3">${eq.設備名 || ""}</td>
              <td class="px-4 py-3">
                ${(eq.工場 || []).map(f => `<span class="tag">${f}</span>`).join(" ")}
              </td>
              <td class="px-4 py-3">${eq.description || ""}</td>
              ${canEdit ? `
                <td class="px-4 py-3">
                  <button class="text-blue-600 hover:underline text-sm mr-2" onclick="editEquipment('${eq._id}')">Edit</button>
                  <button class="text-red-600 hover:underline text-sm" onclick="deleteEquipment('${eq._id}')">Delete</button>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("equipmentTableContainer").innerHTML = tableHTML;
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
  const canEdit = ["admin", "班長", "係長", "課長", "部長"].includes(role);

  const tableHTML = `
    ${canEdit ? `
      <div class="mb-4">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg" onclick="showCreateRoleForm()">
          <i class="ri-add-line mr-2"></i>Create Role
        </button>
      </div>
    ` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-lg">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-left">Role Name</th>
            <th class="px-4 py-3 text-left">Description</th>
            ${canEdit ? `<th class="px-4 py-3 text-left">Actions</th>` : ""}
          </tr>
        </thead>
        <tbody class="bg-white divide-y">
          ${roles.map(r => `
            <tr>
              <td class="px-4 py-3">${r.roleName || ""}</td>
              <td class="px-4 py-3">${r.description || ""}</td>
              ${canEdit ? `
                <td class="px-4 py-3">
                  <button class="text-red-600 hover:underline text-sm" onclick="deleteRole('${r._id}')">Delete</button>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("rolesTableContainer").innerHTML = tableHTML;
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
