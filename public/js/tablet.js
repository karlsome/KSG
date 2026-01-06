// WebSocket connection to ksgServer
//const SERVER_URL = 'http://localhost:3000';
const SERVER_URL = 'http://192.168.24.39:3000';
const socket = io(SERVER_URL);

let currentCompany = 'KSG'; // Default company
let currentFactory = ''; // Will be set from URL parameter
let currentProductId = ''; // Will be set from URL parameter or selection
let currentProductName = ''; // Store product name from masterDB
let availableUsers = []; // Store available users
let kenyokiRHKanbanValue = null; // Store kenyokiRHKanban variable value
let seisanSuStartValue = null; // Starting value of seisanSu when work started
let currentSeisanSuValue = null; // Current seisanSu value
let hakoIresuValue = null; // Store hakoIresu variable value
let workTimerInterval = null; // Interval for updating work time
let workStartTime = null; // Timestamp when work started

// Restore seisanSuStartValue from localStorage on load
try {
  const saved = localStorage.getItem('seisanSuStartValue');
  if (saved !== null && saved !== 'null') {
    seisanSuStartValue = parseFloat(saved);
    console.log('📦 Restored seisanSuStartValue from localStorage:', seisanSuStartValue);
  }
} catch (e) {
  console.error('Failed to restore seisanSuStartValue:', e);
}

// ============================================================
// ⏱️ REAL-TIME WORK DURATION TRACKING
// ============================================================

// Start the work timer
function startWorkTimer(existingStartTime = null) {
  // Stop any existing timer
  stopWorkTimer();
  
  // Set work start time (use existing if provided, otherwise use current time)
  if (existingStartTime) {
    workStartTime = existingStartTime;
    console.log('⏱️ Work timer resumed from:', workStartTime.toLocaleTimeString());
  } else {
    workStartTime = new Date();
    console.log('⏱️ Work timer started at:', workStartTime.toLocaleTimeString());
  }
  
  // Update immediately
  updateWorkDuration();
  
  // Update every 10 seconds
  workTimerInterval = setInterval(updateWorkDuration, 10000);
}

// Stop the work timer
function stopWorkTimer() {
  if (workTimerInterval) {
    clearInterval(workTimerInterval);
    workTimerInterval = null;
    console.log('⏹️ Work timer stopped');
  }
}

// Update work duration fields (作業時間 and 工数)
function updateWorkDuration() {
  if (!workStartTime) {
    document.getElementById('workTime').value = '00:00';
    document.getElementById('manHours').value = '0';
    return;
  }
  
  const now = new Date();
  const elapsedMs = now - workStartTime;
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  
  // Calculate hours and minutes
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  
  // Format as HH:MM
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  document.getElementById('workTime').value = timeString;
  
  // Calculate decimal hours (e.g., 1:30 = 1.5)
  const decimalHours = (hours + minutes / 60).toFixed(2);
  document.getElementById('manHours').value = decimalHours;
  
  console.log(`⏱️ Work duration: ${timeString} (${decimalHours}h)`);
}

// ============================================================
// 🔹 LOCALSTORAGE PERSISTENCE
// ============================================================

// Save field value to localStorage
function saveFieldToLocalStorage(fieldId, value) {
  try {
    localStorage.setItem(`tablet_${fieldId}`, value);
  } catch (e) {
    console.error(`Failed to save ${fieldId}:`, e);
  }
}

// Restore all fields from localStorage
function restoreAllFields() {
  try {
    // Text inputs
    const textFields = ['startTime', 'stopTime', 'endTime', 'workTime', 'manHours', 'workCount', 'passCount', 'otherDetails'];
    textFields.forEach(fieldId => {
      const saved = localStorage.getItem(`tablet_${fieldId}`);
      if (saved !== null) {
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = saved;
          console.log(`📦 Restored ${fieldId}:`, saved);
        }
      }
    });
    
    // Dropdowns
    const dropdownFields = ['lhRh', 'poster1', 'poster2', 'poster3'];
    dropdownFields.forEach(fieldId => {
      const saved = localStorage.getItem(`tablet_${fieldId}`);
      if (saved !== null) {
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = saved;
          console.log(`📦 Restored ${fieldId}:`, saved);
        }
      }
    });
    
    // Defect counters
    const counterNumbers = document.querySelectorAll('.counter-number');
    counterNumbers.forEach((counter, index) => {
      const saved = localStorage.getItem(`tablet_defect_${index}`);
      if (saved !== null) {
        counter.textContent = saved;
      }
    });
    
    // Update calculated fields
    updateDefectSum();
    updateWorkCount();
    
    // Restart work timer if start time exists
    const savedStartTime = localStorage.getItem('tablet_startTime');
    const savedWorkStartTime = localStorage.getItem('workStartTime');
    if (savedStartTime && savedWorkStartTime) {
      try {
        const restoredTime = new Date(parseInt(savedWorkStartTime));
        startWorkTimer(restoredTime);
        console.log('⏱️ Restored work timer from:', savedStartTime);
      } catch (e) {
        console.error('Failed to restore work timer:', e);
      }
    }
    
    console.log('✅ All fields restored from localStorage');
  } catch (e) {
    console.error('Failed to restore fields:', e);
  }
}

// Clear all localStorage data
function clearAllLocalStorage() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('tablet_')) {
        localStorage.removeItem(key);
      }
    });
    localStorage.removeItem('seisanSuStartValue');
    console.log('🗑️ Cleared all tablet localStorage data');
  } catch (e) {
    console.error('Failed to clear localStorage:', e);
  }
}

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
  
  // Restore all fields from localStorage
  restoreAllFields();
  
  // Add event listener for poster1 dropdown changes
  const poster1Select = document.getElementById('poster1');
  if (poster1Select) {
    poster1Select.addEventListener('change', () => {
      console.log('👤 Poster1 changed to:', poster1Select.value);
      saveFieldToLocalStorage('poster1', poster1Select.value);
      checkStartButtonState();
    });
  }
  
  // Add change listeners for all dropdowns
  const dropdowns = ['lhRh', 'poster1', 'poster2', 'poster3'];
  dropdowns.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('change', () => {
        saveFieldToLocalStorage(fieldId, field.value);
      });
    }
  });
  
  // Add change listeners for text inputs
  const textInputs = ['workTime', 'manHours', 'otherDetails'];
  textInputs.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', () => {
        saveFieldToLocalStorage(fieldId, field.value);
      });
    }
  });
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
  const dropdownIds = ['poster1', 'poster2', 'poster3'];
  
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
  // Don't load from URL parameter anymore
  // Product will be loaded when kenyokiRHKanban value comes in
  console.log('👁️ Waiting for kenyokiRHKanban value to load product info...');
}

// Load product info by kanbanID (called when kenyokiRHKanban value updates)
async function loadProductByKanbanID(kanbanId) {
  if (!kanbanId || kanbanId === '') {
    console.warn('⚠️ No kanbanID provided');
    return;
  }
  
  try {
    console.log(`📦 Fetching product for kanbanID: ${kanbanId}`);
    const response = await fetch(`${SERVER_URL}/api/tablet/product-by-kanban/${encodeURIComponent(kanbanId)}`);
    const data = await response.json();
    
    if (data.success) {
      const product = data.product;
      console.log('✅ Loaded product info:', product);
      
      // Update current product ID and name
      currentProductId = product.品番;
      currentProductName = product['製品名'] || '';
      
      // Set product name and kanbanID in header title
      const productNameDisplay = document.getElementById('productNameDisplay');
      const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
      if (productNameDisplay && product['製品名']) {
        productNameDisplay.textContent = product['製品名'];
        console.log(`✅ Set product name in title to: ${product['製品名']}`);
      }
      if (kanbanIdDisplay && product.kanbanID) {
        kanbanIdDisplay.textContent = ', ' + product.kanbanID;
        console.log(`✅ Set kanbanID in title to: ${product.kanbanID}`);
      }
      
      // Set product name in remarks display
      const remarksDisplay = document.getElementById('remarks');
      if (remarksDisplay && product['製品名']) {
        remarksDisplay.textContent = product['製品名'];
        console.log(`✅ Set product name to: ${product['製品名']}`);
      }
      
      // Set LH/RH dropdown based on product data
      if (product['LH/RH']) {
        const lhRhDropdown = document.getElementById('lhRh');
        if (lhRhDropdown) {
          lhRhDropdown.value = product['LH/RH'];
          saveFieldToLocalStorage('lhRh', product['LH/RH']);
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

async function loadProductInfoOld() {
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
  // - poster1: visible if kensaMembers >= 1
  // - poster2: visible if kensaMembers >= 2
  // - poster3: visible if kensaMembers >= 3
  
  const elementsToControl = [
    { id: 'poster1', minMembers: 1, header: 'header-poster1', cell: 'cell-poster1' },
    { id: 'poster2', minMembers: 2, header: 'header-poster2', cell: 'cell-poster2' },
    { id: 'poster3', minMembers: 3, header: 'header-poster3', cell: 'cell-poster3' }
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

// Calculate and update work count display
function updateWorkCount() {
  const workCountInput = document.getElementById('workCount');
  if (!workCountInput) return;
  
  // Only calculate if we have a starting value and current value
  if (seisanSuStartValue !== null && currentSeisanSuValue !== null) {
    const workCount = currentSeisanSuValue - seisanSuStartValue;
    workCountInput.value = Math.max(0, workCount); // Don't allow negative values
    saveFieldToLocalStorage('workCount', workCountInput.value);
    console.log(`🔢 Work count: ${currentSeisanSuValue} - ${seisanSuStartValue} = ${workCount}`);
  } else {
    workCountInput.value = 0;
    saveFieldToLocalStorage('workCount', '0');
    console.log('🔢 Work count: 0 (no starting value set)');
  }
  
  // Update pass count whenever work count changes
  updatePassCount();
}

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
  
  // Check kenyokiRHKanban variable for start button validation AND product loading
  if (variables.kenyokiRHKanban !== undefined) {
    const value = variables.kenyokiRHKanban.value;
    const newKanbanValue = (value !== null && value !== undefined && value !== '') ? value : null;
    
    // Check if value changed
    if (newKanbanValue !== kenyokiRHKanbanValue) {
      kenyokiRHKanbanValue = newKanbanValue;
      console.log('📊 kenyokiRHKanban value updated:', kenyokiRHKanbanValue);
      
      // Load product info when kanban ID changes
      if (kenyokiRHKanbanValue) {
        loadProductByKanbanID(kenyokiRHKanbanValue);
      }
    }
    
    checkStartButtonState();
  } else {
    kenyokiRHKanbanValue = null;
    console.warn('⚠️ kenyokiRHKanban variable not found');
    checkStartButtonState();
  }
  
  // Track seisanSu variable for work count calculation
  if (variables.seisanSu !== undefined) {
    const value = variables.seisanSu.value;
    currentSeisanSuValue = (value !== null && value !== undefined) ? parseFloat(value) : null;
    console.log('📊 seisanSu value updated:', currentSeisanSuValue);
    updateWorkCount();
  } else {
    currentSeisanSuValue = null;
    console.warn('⚠️ seisanSu variable not found');
  }
  
  // Track hakoIresu variable for 合格数追加 display
  if (variables.hakoIresu !== undefined) {
    const value = variables.hakoIresu.value;
    hakoIresuValue = (value !== null && value !== undefined) ? parseFloat(value) : null;
    console.log('📊 hakoIresu value updated:', hakoIresuValue);
    
    // Update the display field
    const inspectionAddInput = document.getElementById('inspectionAddValue');
    if (inspectionAddInput) {
      inspectionAddInput.value = hakoIresuValue !== null ? hakoIresuValue : '';
    }
  } else {
    hakoIresuValue = null;
    console.warn('⚠️ hakoIresu variable not found');
  }
  
  // You can add more variable mappings here
  // Example: if (variables.otherVar) { document.getElementById('someField').value = variables.otherVar.value; }
}

// Reset functions for each card
function resetBasicSettings() {
  if (confirm('基本設定をリセットしますか？')) {
    document.getElementById('lhRh').value = 'LH';
    
    // Reset all user dropdowns to first option (placeholder)
    const dropdownIds = ['poster1', 'poster2', 'poster3'];
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
    
    // Stop work timer
    stopWorkTimer();
    workStartTime = null;
    localStorage.removeItem('workStartTime');
    document.getElementById('workTime').value = '00:00';
    document.getElementById('manHours').value = '0';
    console.log('⏹️ Work timer cleared');
    
    // Reset seisanSu starting value
    seisanSuStartValue = null;
    localStorage.removeItem('seisanSuStartValue');
    console.log('🔄 Reset seisanSu starting value');
    updateWorkCount(); // Update to show 0
    
    // Reset defect counters
    document.querySelectorAll('.counter-number').forEach(counter => {
      counter.textContent = '0';
    });
    document.getElementById('otherDetails').value = '';
    updateDefectSum(); // Update sum after reset
    console.log('🔄 Reset defect counters');
    
    // Clear all localStorage
    clearAllLocalStorage();
    
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
    updateDefectSum(); // Update sum after reset
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
  
  // Save start time to localStorage
  saveFieldToLocalStorage('startTime', timeString);
  
  // Start the work duration timer
  startWorkTimer();
  localStorage.setItem('workStartTime', workStartTime.getTime().toString());
  
  // Capture current seisanSu value as starting point
  if (currentSeisanSuValue !== null) {
    seisanSuStartValue = currentSeisanSuValue;
    localStorage.setItem('seisanSuStartValue', seisanSuStartValue);
    console.log('📍 Starting seisanSu value captured:', seisanSuStartValue);
    updateWorkCount(); // Initial update to show 0
  } else {
    console.warn('⚠️ No seisanSu value available to set as starting point');
  }
  
  // Grey out button after recording time
  checkStartButtonState();
}

// Placeholder functions for buttons
async function sendData() {
  console.log('📤 Send data clicked');
  
  try {
    // Gather all defect data with proper names
    const defectButtons = document.querySelectorAll('.counter-button');
    const defectNumbers = document.querySelectorAll('.counter-number');
    const defectData = {};
    
    defectButtons.forEach((button, index) => {
      const defectName = button.getAttribute('data-defect');
      const count = parseInt(defectNumbers[index].textContent) || 0;
      defectData[defectName] = count;
    });
    
    // Prepare submission data
    const submissionData = {
      品番: currentProductId || '',
      製品名: currentProductName || '',
      kanbanID: kenyokiRHKanbanValue || '',
      hakoIresu: hakoIresuValue || 0,
      'LH/RH': document.getElementById('lhRh')?.value || '',
      '技能員①': document.getElementById('poster1')?.value || '',
      '技能員②': document.getElementById('poster2')?.value || '',
      良品数: parseInt(document.getElementById('passCount')?.value) || 0,
      工数: parseFloat(document.getElementById('manHours')?.value) || 0,
      ...defectData,
      その他詳細: document.getElementById('otherDetails')?.value || '',
      開始時間: document.getElementById('startTime')?.value || '',
      終了時間: document.getElementById('endTime')?.value || '',
      休憩時間: '',
      備考: document.getElementById('remarks')?.textContent || '',
      '工数（除外工数）': 0
    };
    
    console.log('📊 Submitting data:', submissionData);
    
    // Submit to server
    const response = await fetch(`${SERVER_URL}/api/tablet/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(submissionData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Data submitted successfully:', result);
      alert('データが正常に送信されました！');
      
      // Clear all fields after successful submission
      clearAllFields();
    } else {
      throw new Error(result.error || 'Submission failed');
    }
    
  } catch (error) {
    console.error('❌ Error submitting data:', error);
    alert('データ送信エラー: ' + error.message);
  }
}

// Helper function to clear all fields after submission
function clearAllFields() {
  const startTimeInput = document.getElementById('startTime');
  if (startTimeInput) {
    startTimeInput.value = ''; // Clear start time
    
    // Stop work timer
    stopWorkTimer();
    workStartTime = null;
    localStorage.removeItem('workStartTime');
    document.getElementById('workTime').value = '00:00';
    document.getElementById('manHours').value = '0';
    console.log('⏹️ Work timer cleared');
    
    // Reset seisanSu starting value
    seisanSuStartValue = null;
    localStorage.removeItem('seisanSuStartValue');
    console.log('🔄 Reset seisanSu starting value');
    updateWorkCount(); // Update to show 0
    
    // Reset defect counters
    document.querySelectorAll('.counter-number').forEach(counter => {
      counter.textContent = '0';
    });
    document.getElementById('otherDetails').value = '';
    updateDefectSum(); // Update sum after reset
    console.log('🔄 Reset defect counters');
    
    // Clear all localStorage
    clearAllLocalStorage();
    
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

// Calculate total defects and update display
function updateDefectSum() {
  const counterNumbers = document.querySelectorAll('.counter-number');
  let total = 0;
  counterNumbers.forEach(counter => {
    total += parseInt(counter.textContent) || 0;
  });
  
  const defectSumDisplay = document.getElementById('defectSum');
  if (defectSumDisplay) {
    defectSumDisplay.textContent = total;
  }
  
  console.log('🔴 Total defects:', total);
  
  // Update pass count whenever defects change
  updatePassCount();
}

// Calculate and update pass count: workCount - defects
function updatePassCount() {
  const workCountInput = document.getElementById('workCount');
  const passCountInput = document.getElementById('passCount');
  const defectSumDisplay = document.getElementById('defectSum');
  
  if (!workCountInput || !passCountInput || !defectSumDisplay) return;
  
  const workCount = parseInt(workCountInput.value) || 0;
  const defects = parseInt(defectSumDisplay.textContent) || 0;
  const passCount = Math.max(0, workCount - defects); // Don't allow negative
  
  passCountInput.value = passCount;
  saveFieldToLocalStorage('passCount', passCount);
  console.log(`✅ Pass count: ${workCount} - ${defects} = ${passCount}`);
}

// Add click handlers for counter buttons (increment)
document.querySelectorAll('.counter-button').forEach((button, index) => {
  button.addEventListener('click', function() {
    const counterDisplay = this.previousElementSibling;
    const counterNumber = counterDisplay.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    counterNumber.textContent = currentCount + 1;
    saveFieldToLocalStorage(`defect_${index}`, currentCount + 1);
    updateDefectSum(); // Update sum after increment
  });
});

// Add click handlers for counter displays (decrement)
document.querySelectorAll('.counter-display').forEach((display, index) => {
  display.addEventListener('click', function() {
    const counterNumber = this.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    if (currentCount > 0) {
      counterNumber.textContent = currentCount - 1;
      saveFieldToLocalStorage(`defect_${index}`, currentCount - 1);
      updateDefectSum(); // Update sum after decrement
    }
  });
});
