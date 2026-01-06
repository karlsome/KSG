// WebSocket connection to ksgServer
//const SERVER_URL = 'http://localhost:3000';
const SERVER_URL = 'http://192.168.24.39:3000';
const socket = io(SERVER_URL);

let currentCompany = 'KSG'; // Default company
let currentFactory = ''; // Will be set from URL parameter
let currentProductId = ''; // Will be set from URL parameter or selection
let availableUsers = []; // Store available users
let kenyokiRHKanbanValue = null; // Store kenyokiRHKanban variable value

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
  
  // Add event listener for poster1 dropdown changes
  const poster1Select = document.getElementById('poster1');
  if (poster1Select) {
    poster1Select.addEventListener('change', () => {
      console.log('👤 Poster1 changed to:', poster1Select.value);
      checkStartButtonState();
    });
  }
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
  
  // Check kenyokiRHKanban variable for start button validation
  if (variables.kenyokiRHKanban !== undefined) {
    const value = variables.kenyokiRHKanban.value;
    kenyokiRHKanbanValue = (value !== null && value !== undefined && value !== '') ? value : null;
    console.log('📊 kenyokiRHKanban value updated:', kenyokiRHKanbanValue);
    checkStartButtonState();
  } else {
    kenyokiRHKanbanValue = null;
    console.warn('⚠️ kenyokiRHKanban variable not found');
    checkStartButtonState();
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
    document.getElementById('passCount').value = '0';
    console.log('Basic settings reset');
    
    // Re-check start button state after reset
    checkStartButtonState();
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

// Check if start button should be enabled
function checkStartButtonState() {
  const startButton = document.getElementById('startWorkButton');
  const poster1Select = document.getElementById('poster1');
  const startTimeInput = document.getElementById('startTime');
  
  if (!startButton || !poster1Select || !startTimeInput) {
    return;
  }
  
  // Helper function to check if value is valid (not null, empty, or only null bytes)
  function isValidValue(value) {
    if (!value || value === null || value === '') return false;
    
    // Check if value only contains null bytes (\x00)
    const stringValue = String(value);
    const hasOnlyNullBytes = /^[\x00]+$/.test(stringValue);
    if (hasOnlyNullBytes) return false;
    
    // Check if trimmed value is empty
    if (stringValue.trim() === '') return false;
    
    return true;
  }
  
  // Button is enabled ONLY when:
  // 1. kenyokiRHKanban has a valid value (not null, empty, or null bytes)
  // 2. poster1 is selected
  // 3. startTime is empty (no value yet)
  const hasKanbanValue = isValidValue(kenyokiRHKanbanValue);
  const hasPoster1 = poster1Select.value !== '';
  const startTimeEmpty = startTimeInput.value === '';
  
  console.log('🔍 Start button conditions:', {
    hasKanbanValue,
    hasPoster1,
    startTimeEmpty,
    kanbanValue: kenyokiRHKanbanValue,
    poster1Value: poster1Select.value
  });
  
  if (hasKanbanValue && hasPoster1 && startTimeEmpty) {
    // Enable button
    startButton.classList.remove('disabled');
    console.log('✅ Start button ENABLED');
  } else {
    // Disable button
    startButton.classList.add('disabled');
    console.log('🔒 Start button DISABLED');
  }
}

// Start work button clicked
function startWork() {
  const startTimeInput = document.getElementById('startTime');
  const startButton = document.getElementById('startWorkButton');
  
  // Double check conditions
  if (startButton.classList.contains('disabled')) {
    console.warn('⚠️ Start button is disabled');
    return;
  }
  
  // Record current time in HH:mm format
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeString = `${hours}:${minutes}`;
  
  startTimeInput.value = timeString;
  console.log('⏰ Work started at:', timeString);
  
  // Grey out button after recording time
  checkStartButtonState();
}

// Placeholder functions for buttons
function sendData() {
  console.log('Send data clicked');
  // After sending data, check if we should re-enable start button
  const startTimeInput = document.getElementById('startTime');
  if (startTimeInput) {
    startTimeInput.value = ''; // Clear start time
    checkStartButtonState(); // Re-check button state
  }
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
