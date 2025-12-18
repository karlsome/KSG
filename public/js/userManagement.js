// userManagement.js for KSG

const BASE_URL = 'http://localhost:3000/';
// const BASE_URL = 'https://ksg-server-url.com/'; // Update when deployed

let allUsers = [];

async function loadUsers() {
  // Get current user info (should be set when user logs in)
  const currentUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  const dbName = currentUser.dbName || "KSG";
  const role = currentUser.role || "admin";

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
            <option value="admin">admin</option>
            <option value="member">member</option>
            <option value="operator">operator</option>
            <option value="viewer">viewer</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Division</label>
          <input type="text" id="newDivision" placeholder="Division" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Enable</label>
          <select id="newEnable" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors">
            <option value="enabled">enabled</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">工場</label>
          <input type="text" id="newFactory" placeholder="工場" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
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
}

function startEditingUser(userId) {
  document.querySelectorAll(`[user-id='${userId}']`).forEach(el => el.disabled = false);
  const actions = document.getElementById(`actions-${userId}`);
  actions.innerHTML = `
    <button class="text-green-600 hover:underline text-sm" onclick="saveUser('${userId}')">Save</button>
    <button class="ml-2 text-gray-600 hover:underline text-sm" onclick="cancelEditUser('${userId}')">Cancel</button>
  `;
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
    if (el.dataset.field) {
      updated[el.dataset.field] = el.value;
    }
    if (el.hasAttribute('data-role')) {
      updated.role = el.value;
    }
  });

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
  const headers = ["firstName", "lastName", "email", "username", "role", "division", "enable", "factory", "userID"];
  
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
                          ${["admin", "member", "operator", "viewer"].map(r => `
                            <option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>
                          `).join("")}
                        </select>`
                      : h === "enable"
                      ? `<select class="border border-gray-300 p-1 rounded" disabled data-field="${h}" user-id="${u._id}">
                          <option value="enabled" ${(u[h] || "enabled") === "enabled" ? "selected" : ""}>enabled</option>
                          <option value="disabled" ${u[h] === "disabled" ? "selected" : ""}>disabled</option>
                        </select>`
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
    enable: document.getElementById("newEnable").value.trim(),
    factory: document.getElementById("newFactory").value.trim(),
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

// Initialize when page loads
if (typeof window !== 'undefined') {
  window.loadUsers = loadUsers;
  window.showCreateUserForm = showCreateUserForm;
  window.startEditingUser = startEditingUser;
  window.cancelEditUser = cancelEditUser;
  window.saveUser = saveUser;
  window.deleteUser = deleteUser;
  window.submitNewUser = submitNewUser;
}
