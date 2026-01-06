// WebSocket connection to ksgServer
//const SERVER_URL = 'http://localhost:3000';
const SERVER_URL = 'http://192.168.24.39:3000';
const socket = io(SERVER_URL);

let currentCompany = 'KSG'; // Default company
let currentFactory = ''; // Will be set from URL parameter
let currentProductId = ''; // Will be set from URL parameter or selection
let availableUsers = []; // Store available users

// ============================================================
// 🔹 INITIALIZATION - Parse URL Parameters & Load Data
// ============================================================

// Parse URL parameters
function getURLParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Get factory from URL parameter
  currentFactory = getURLParameter('factory') || 'KSG加工';
  console.log('🏭 Factory from URL:', currentFactory);
  
  // Get product ID from URL (optional)
  currentProductId = getURLParameter('product') || 'aaa'; // Default to 'aaa' for testing
  console.log('📦 Product ID:', currentProductId);
  
  // Load users for this factory
  await loadUsers();
  
  // Load product info to determine kensaMembers
  await loadProductInfo();
});

// ============================================================
// 🔹 FETCH USERS FROM API
// ============================================================

async function loadUsers() {
  try {
    const response = await fetch(`${SERVER_URL}/api/tablet/users/${encodeURIComponent(currentFactory)}`);
    const data = await response.json();
    
    if (data.success) {
      availableUsers = data.users;
      console.log(`✅ Loaded ${data.count} users for factory: ${currentFactory}`, availableUsers);
      
      // Populate dropdowns
      populateUserDropdowns();
    } else {
      console.error('❌ Failed to load users:', data.error);
    }
  } catch (error) {
    console.error('❌ Error loading users:', error);
  }
}

// Populate all user dropdowns with fetched users
function populateUserDropdowns() {
  const dropdownIds = ['inspector', 'poster1', 'poster2', 'poster3'];
  
  dropdownIds.forEach(id => {
    const dropdown = document.getElementById(id);
    if (dropdown) {
      // Clear existing options except the first placeholder
      dropdown.innerHTML = '<option value="">選択してください</option>';
      
      // Add users as options
      availableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.username;
        // Display format: "lastName firstName" or username if names not available
        option.textContent = user.fullName || user.username;
        dropdown.appendChild(option);
      });
      
      console.log(`✅ Populated ${id} with ${availableUsers.length} users`);
    }
  });
}

// ============================================================
// 🔹 FETCH PRODUCT INFO & SET KENSA MEMBERS
// ============================================================

async function loadProductInfo() {
  if (!currentProductId) {
    console.warn('⚠️ No product ID specified');
    return;
  }
  
  try {
    const response = await fetch(`${SERVER_URL}/api/tablet/product/${encodeURIComponent(currentProductId)}`);
    const data = await response.json();
    
    if (data.success) {
      const product = data.product;
      console.log('✅ Loaded product info:', product);
      
      // Set product name in header
      if (product['製品名']) {
        const productNameDisplay = document.getElementById('productNameDisplay');
        if (productNameDisplay) {
          productNameDisplay.textContent = product['製品名'];
          console.log(`✅ Set product name to: ${product['製品名']}`);
        }
      }
      
      // Set LH/RH dropdown based on product data
      if (product['LH/RH']) {
        const lhRhDropdown = document.getElementById('lhRh');
        if (lhRhDropdown) {
          lhRhDropdown.value = product['LH/RH'];
          console.log(`✅ Set LH/RH to: ${product['LH/RH']}`);
        }
      }
      
      // Set kensaMembers (default to 2 if not specified)
      const kensaMembers = product.kensaMembers || 2;
      console.log(`👥 KensaMembers: ${kensaMembers}`);
      
      // Show/hide columns based on kensaMembers
      updateKensaMembersDisplay(kensaMembers);
    } else {
      console.error('❌ Failed to load product:', data.error);
      // Default to 2 members if product not found
      updateKensaMembersDisplay(2);
    }
  } catch (error) {
    console.error('❌ Error loading product info:', error);
    // Default to 2 members on error
    updateKensaMembersDisplay(2);
  }
}

// Show/hide columns based on kensaMembers count
function updateKensaMembersDisplay(kensaMembers) {
  // Elements to control:
  // - inspector: always visible
  // - poster1: visible if kensaMembers >= 2
  // - poster2: visible if kensaMembers >= 3
  // - poster3: visible if kensaMembers >= 4
  
  const elementsToControl = [
    { id: 'inspector', minMembers: 1, header: 'header-inspector', cell: 'cell-inspector' },
    { id: 'poster1', minMembers: 2, header: 'header-poster1', cell: 'cell-poster1' },
    { id: 'poster2', minMembers: 3, header: 'header-poster2', cell: 'cell-poster2' },
    { id: 'poster3', minMembers: 4, header: 'header-poster3', cell: 'cell-poster3' }
  ];
  
  elementsToControl.forEach(element => {
    const headerEl = document.getElementById(element.header);
    const cellEl = document.getElementById(element.cell);
    
    if (headerEl && cellEl) {
      if (kensaMembers >= element.minMembers) {
        headerEl.style.display = '';
        cellEl.style.display = '';
        console.log(`✅ Showing ${element.id} (kensaMembers: ${kensaMembers} >= ${element.minMembers})`);
      } else {
        headerEl.style.display = 'none';
        cellEl.style.display = 'none';
        console.log(`❌ Hiding ${element.id} (kensaMembers: ${kensaMembers} < ${element.minMembers})`);
      }
    }
  });
}

// ============================================================
// 🔹 CONNECTION STATUS & WEBSOCKET
// ============================================================

// Update connection status indicator
function updateConnectionStatus(status) {
  const statusElement = document.getElementById('connectionStatus');
  statusElement.className = 'connection-status ' + status;
}

// Connection status
socket.on('connect', () => {
  console.log('✅ Connected to ksgServer');
  updateConnectionStatus('connected');
  // Subscribe to real-time variable updates for this company
  socket.emit('subscribe_variables', { company: currentCompany });
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from ksgServer');
  updateConnectionStatus('disconnected');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  updateConnectionStatus('disconnected');
});

// Listen for real-time variable updates (pushed from server when data changes)
socket.on('opcua_variables_update', (data) => {
  console.log('📊 Received real-time variable updates:', data);
  console.log('🔍 Available variables:', Object.keys(data.variables));
  console.log('🔍 tesgt variable details:', data.variables.tesgt);
  updateUIWithVariables(data.variables);
});

// Listen for immediate variable configuration updates
socket.on('variable-updated', (data) => {
  console.log('🔄 Variable configuration updated:', data);
  console.log('🔄 Requesting fresh variable data...');
  // Request fresh variable data immediately
  socket.emit('requestVariables', { company: 'KSG' });
});

// Update UI with variable data
function updateUIWithVariables(variables) {
  console.log('🎯 Updating UI with variables:', variables);
  
  // Update 作業開始時間 with "tesgt" variable
  if (variables.tesgt !== undefined) {
    const workStartTimeInput = document.getElementById('workStartTimeValue');
    if (workStartTimeInput) {
      const value = variables.tesgt.value !== null ? variables.tesgt.value : 'No Data';
      workStartTimeInput.value = value;
      console.log('✨ Real-time update - 作業開始時間 with tesgt:', value, 'Quality:', variables.tesgt.quality, 'Stale:', variables.tesgt.isStale);
    } else {
      console.warn('❌ workStartTimeValue input not found in DOM');
    }
  } else {
    console.warn('❌ tesgt variable not found in response');
  }
  
  // You can add more variable mappings here
  // Example: if (variables.otherVar) { document.getElementById('someField').value = variables.otherVar.value; }
}

// Reset functions for each card
function resetBasicSettings() {
  if (confirm('基本設定をリセットしますか？')) {
    document.getElementById('lhRh').value = 'LH';
    
    // Reset all user dropdowns to first option (placeholder)
    const dropdownIds = ['inspector', 'poster1', 'poster2', 'poster3'];
    dropdownIds.forEach(id => {
      const dropdown = document.getElementById(id);
      if (dropdown) {
        dropdown.selectedIndex = 0;
      }
    });
    
    document.getElementById('workTime').value = '00:00';
    document.getElementById('manHours').value = '';
    document.getElementById('startTime').value = '';
    document.getElementById('stopTime').value = '00:00';
    document.getElementById('endTime').value = '';
    document.getElementById('inspectionCount').value = '0';
    console.log('Basic settings reset');
  }
}

function resetButtonData() {
  if (confirm('ボタンデータをリセットしますか？')) {
    // Reset any button-related data if needed
    console.log('Button data reset');
  }
}

function resetDefectCounters() {
  if (confirm('不良カウンターをリセットしますか？')) {
    document.querySelectorAll('.counter-number').forEach(counter => {
      counter.textContent = '0';
    });
    document.getElementById('otherDetails').value = '';
    console.log('Defect counters reset');
  }
}

// Placeholder functions for buttons
function sendData() {
  console.log('Send data clicked');
}

function setWorkStartTime() {
  console.log('Work start time clicked');
}

function pauseWork() {
  console.log('Pause work clicked');
}

function setWorkStopTime() {
  console.log('Work stop time clicked');
}

function setWorkEndTime() {
  console.log('Work end time clicked');
}

function addInspectionCount() {
  console.log('Add inspection count clicked');
}

function completeInspection() {
  console.log('Complete inspection clicked');
}

function sendInspectionData() {
  console.log('Send inspection data clicked');
}

function editRemarks() {
  console.log('Edit remarks clicked');
}

function viewInspectionList() {
  console.log('View inspection list clicked');
}

// Add click handlers for counter buttons (increment)
document.querySelectorAll('.counter-button').forEach((button, index) => {
  button.addEventListener('click', function() {
    const counterDisplay = this.previousElementSibling;
    const counterNumber = counterDisplay.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    counterNumber.textContent = currentCount + 1;
  });
});

// Add click handlers for counter displays (decrement)
document.querySelectorAll('.counter-display').forEach((display, index) => {
  display.addEventListener('click', function() {
    const counterNumber = this.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    if (currentCount > 0) {
      counterNumber.textContent = currentCount - 1;
    }
  });
});
