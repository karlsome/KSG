# MasterDB.js Implementation Guide

##  Current Status
The HTML structure for modals, checkboxes, and sub-tabs is complete in `masterDB.html`.  
The JavaScript file `masterDB.js` needs comprehensive updates to support:
1. Checkbox selection with bulk delete
2. Clickable rows that open detail modals
3. Modal edit mode with save/cancel
4. Activity logs display
5. Change history display in modal

## Collections Structure
All under database name: **KSG**

- **Master** tab → `masterDB` collection
- **工場** tab → `factory` collection  
- **設備** tab → `equipment` collection
- **Role** tab → `roles` collection

## Required Backend Routes (To Be Added)

### Activity Logs Routes
```javascript
// GET activity logs for a collection
app.post("/getActivityLogs", async (req, res) => {
  const { dbName, collection } = req.body;
  const db = mongoClient.db(dbName);
  const activityLogs = db.collection("activityLogs");
  
  const logs = await activityLogs.find({ collection })
    .sort({ timestamp: -1 })
    .limit(100)
    .toArray();
  
  res.json(logs);
});

// CREATE activity log entry
app.post("/createActivityLog", async (req, res) => {
  const { dbName, collection, action, performedBy, recordsAffected, recordIds } = req.body;
  const db = mongoClient.db(dbName);
  const activityLogs = db.collection("activityLogs");
  
  await activityLogs.insertOne({
    collection,
    action, // 'create' or 'delete'
    performedBy,
    recordsAffected,
    recordIds,
    timestamp: new Date(),
    ip: req.ip
  });
  
  res.json({ success: true });
});

// Bulk delete routes (one for each tab)
app.post("/deleteMultipleMasterRecords", async (req, res) => {
  const { ids, dbName, username } = req.body;
  const db = mongoClient.db(dbName);
  const collection = db.collection("masterDB");
  
  const result = await collection.deleteMany({ 
    _id: { $in: ids.map(id => new ObjectId(id)) }
  });
  
  // Log to activity logs
  await db.collection("activityLogs").insertOne({
    collection: 'masterDB',
    action: 'delete',
    performedBy: username,
    recordsAffected: result.deletedCount,
    recordIds: ids,
    timestamp: new Date()
  });
  
  res.json({ success: true, deletedCount: result.deletedCount });
});

// Similar for deleteMultipleFactories, deleteMultipleEquipment, deleteMultipleRoles
```

## Key JavaScript Functions Needed

### 1. Checkbox Selection System
```javascript
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
  const deleteBtn = document.getElementById(`delete${capitalizeFirst(type)}Btn`);
  
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
```

### 2. Modal System
```javascript
async function openDetailModal(type, id) {
  currentModalType = type;
  let data = null;
  
  // Find the data from appropriate array
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
    'roles': 'ロール詳細'
  };
  document.getElementById('modalTitle').textContent = titleMap[type];
  
  // Render details
  renderModalDetails(type, data);
  
  // Show modal
  document.getElementById('detailModal').classList.remove('hidden');
  
  // Reset to details tab
  switchModalTab('details');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  currentModalData = null;
  currentModalType = null;
  isEditMode = false;
}

function toggleEditMode() {
  isEditMode = true;
  
  // Enable all inputs
  document.querySelectorAll('#modalDetailsBody input, #modalDetailsBody textarea').forEach(el => {
    el.disabled = false;
    el.classList.add('bg-white');
  });
  
  // Show image upload
  const imageUpload = document.getElementById('modalImageUpload');
  if (imageUpload) imageUpload.classList.remove('hidden');
  
  // Toggle buttons
  document.getElementById('modalEditBtn').classList.add('hidden');
  document.getElementById('modalSaveBtn').classList.remove('hidden');
  document.getElementById('modalCancelBtn').classList.remove('hidden');
}

async function saveModalChanges() {
  // Collect updated data from inputs
  const updateData = {};
  document.querySelectorAll('#modalDetailsBody input[data-field], #modalDetailsBody textarea[data-field]').forEach(el => {
    updateData[el.dataset.field] = el.value;
  });
  
  // Handle image upload if present
  const imageFile = document.getElementById('modalImageUpload');
  if (imageFile && imageFile.files.length > 0) {
    const base64 = await fileToBase64(imageFile.files[0]);
    updateData.imageBase64 = base64;
  }
  
  // Call appropriate update endpoint
  // Then reload data and close modal
}
```

### 3. Delete Confirmation System
```javascript
function showDeleteConfirmation(type) {
  const checkboxes = document.querySelectorAll(`.${type}Checkbox:checked`);
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedIds.length === 0) {
    alert("No items selected");
    return;
  }
  
  // Get item details for display
  let items = [];
  switch(type) {
    case 'master':
      items = allMasterData.filter(item => selectedIds.includes(item._id));
      break;
    // ... similar for other types
  }
  
  const itemsListHTML = items.map(item => {
    const displayName = item.品番 || item.name || item.設備名 || item.roleName || item._id;
    return `<div class="py-1">• ${displayName}</div>`;
  }).join('');
  
  document.getElementById('deleteItemsList').innerHTML = itemsListHTML;
  document.getElementById('deleteConfirmModal').classList.remove('hidden');
  
  // Store for later
  window.pendingDelete = { type, ids: selectedIds };
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
      'roles': 'deleteMultipleRoles'
    };
    
    const res = await fetch(BASE_URL + endpoints[type], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, dbName, username })
    });
    
    if (!res.ok) throw new Error("Delete failed");
    
    alert(`${ids.length} item(s) deleted successfully`);
    closeDeleteConfirmModal();
    loadTabData(type);
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}
```

## Next Steps

1. **Add backend routes** in `ksgServer.js`:
   - `getActivityLogs` 
   - `createActivityLog`
   - Bulk delete routes for all 4 tabs

2. **Update `masterDB.js`** with:
   - New table rendering with checkboxes and onclick handlers
   - Modal system functions
   - Delete confirmation system
   - Activity logs display

3. **Test each tab** systematically:
   - Master → Factory → Equipment → Roles
   - Verify checkbox selection
   - Verify modal opens and displays data
   - Verify edit mode works
   - Verify delete confirmation shows correctly

4. **Integrate activity logging**:
   - Log all create operations
   - Log all delete operations  
   - Display in "作成・削除履歴" sub-tab

## File Locations
- HTML: `/Users/karlsome/Documents/GitHub/KSG/public/masterDB.html` ✅ Complete
- JavaScript: `/Users/karlsome/Documents/GitHub/KSG/public/js/masterDB.js` ⚠️ In Progress
- Backend: `/Users/karlsome/Documents/GitHub/KSG/ksgServer.js` ⚠️ Needs activity log routes
