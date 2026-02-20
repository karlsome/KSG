// ============================================================
// 🔐 AUTHENTICATION CHECK
// ============================================================

// Check if user is authenticated
(function checkAuthentication() {
  const authData = localStorage.getItem('tabletAuth');
  
  if (!authData) {
    // Not authenticated, redirect to login
    const urlParams = new URLSearchParams(window.location.search);
    const tabletName = urlParams.get('tabletName');
    
    if (tabletName) {
      window.location.href = `tablet-login.html?tabletName=${tabletName}`;
    } else {
      alert('タブレット名が指定されていません / Tablet name not specified');
    }
    return;
  }

  try {
    const auth = JSON.parse(authData);
    
    // Check if token is expired (12 hours)
    const loginTime = new Date(auth.loginTime);
    const now = new Date();
    const hoursSinceLogin = (now - loginTime) / (1000 * 60 * 60);
    
    if (hoursSinceLogin > 12) {
      // Token expired, clear and redirect
      localStorage.removeItem('tabletAuth');
      const tabletName = auth.tabletName || auth.tablet?.tabletName;
      if (tabletName) {
        window.location.href = `tablet-login.html?tabletName=${tabletName}`;
      } else {
        window.location.href = 'tablet-login.html';
      }
      return;
    }
    
    // Authentication valid, update UI with user info
    console.log('✅ Authenticated as:', auth.user.username);
    console.log('📱 Tablet:', auth.tablet.tabletName);
    
  } catch (err) {
    console.error('Error checking authentication:', err);
    localStorage.removeItem('tabletAuth');
    window.location.href = 'tablet-login.html';
  }
})();

// Logout function
function logoutTablet() {
  if (confirm('ログアウトしますか？ / Logout?')) {
    const authData = localStorage.getItem('tabletAuth');
    let tabletName = null;
    if (authData) {
      const auth = JSON.parse(authData);
      tabletName = auth.tabletName || auth.tablet?.tabletName;
    }
    localStorage.removeItem('tabletAuth');
    
    if (tabletName) {
      window.location.href = `tablet-login.html?tabletName=${tabletName}`;
    } else {
      window.location.href = 'tablet-login.html';
    }
  }
}

// ============================================================
// 🌐 WEBSOCKET CONNECTION
// ============================================================

// WebSocket connection to ksgServer
// SERVER_URL is now loaded from config.js as API_URL
const socket = io(API_URL);

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
let breakTimerInterval = null; // Interval for break timer
let breakStartTime = null; // Timestamp when break started
let troubleTimerInterval = null; // Interval for machine trouble timer
let troubleStartTime = null; // Timestamp when machine trouble started

// 🆕 Equipment-specific OPC variable mappings (loaded dynamically)
let variableMappings = {
  kanban: 'kenyokiRHKanban',           // Default: For product title/lookup
  productionCount: 'seisanSu',          // Default: For 作業数 calculation
  boxQuantity: 'hakoIresu'              // Default: For 合格数追加 display
};

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
// ⏸️ BREAK TIMER FUNCTIONALITY
// ============================================================

// Start break timer and show modal
function startBreakTimer() {
  // Stop any existing break timer
  stopBreakTimer();
  
  // Set break start time
  breakStartTime = new Date();
  localStorage.setItem('breakStartTime', breakStartTime.getTime().toString());
  console.log('⏸️ Break timer started at:', breakStartTime.toLocaleTimeString());
  
  // Show modal
  const modalOverlay = document.getElementById('breakModalOverlay');
  if (modalOverlay) {
    modalOverlay.classList.add('active');
  }
  
  // Update immediately
  updateBreakTimer();
  
  // Update every second
  breakTimerInterval = setInterval(updateBreakTimer, 1000);
}

// Stop break timer
function stopBreakTimer() {
  if (breakTimerInterval) {
    clearInterval(breakTimerInterval);
    breakTimerInterval = null;
    console.log('⏹️ Break timer stopped');
  }
}

// Update break timer display
function updateBreakTimer() {
  if (!breakStartTime) {
    const timerDisplay = document.getElementById('breakTimer');
    if (timerDisplay) {
      timerDisplay.textContent = '00:00';
    }
    return;
  }
  
  const now = new Date();
  const elapsedMs = now - breakStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  
  // Calculate minutes and seconds
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  
  // Format as MM:SS
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const timerDisplay = document.getElementById('breakTimer');
  if (timerDisplay) {
    timerDisplay.textContent = timeString;
  }
}

// Complete break - close modal and update stopTime
function completeBreak() {
  if (!breakStartTime) {
    console.warn('⚠️ No break start time found');
    return;
  }
  
  // Calculate elapsed time
  const now = new Date();
  const elapsedMs = now - breakStartTime;
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
  
  // Calculate decimal hours (more precise with seconds)
  const decimalHours = ((elapsedMinutes * 60 + elapsedSeconds) / 3600).toFixed(2);
  
  console.log(`⏸️ Break completed: ${elapsedMinutes}m ${elapsedSeconds}s = ${decimalHours}h`);
  
  // Get current stopTime value and add new break time
  const stopTimeInput = document.getElementById('stopTime');
  if (stopTimeInput) {
    const currentStopTime = parseFloat(stopTimeInput.value) || 0;
    const newStopTime = (currentStopTime + parseFloat(decimalHours)).toFixed(2);
    stopTimeInput.value = newStopTime;
    saveFieldToLocalStorage('stopTime', newStopTime);
    console.log(`✅ Updated stopTime: ${currentStopTime} + ${decimalHours} = ${newStopTime}h`);
  }
  
  // Stop timer and close modal
  stopBreakTimer();
  breakStartTime = null;
  localStorage.removeItem('breakStartTime');
  
  const modalOverlay = document.getElementById('breakModalOverlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
  }
  
  // Reset timer display
  const timerDisplay = document.getElementById('breakTimer');
  if (timerDisplay) {
    timerDisplay.textContent = '00:00';
  }
  
  console.log('✅ Break modal closed');
}

// ============================================================
// � MACHINE TROUBLE TIMER FUNCTIONALITY
// ============================================================

// Start machine trouble timer and show modal
function startTroubleTimer() {
  // Stop any existing trouble timer
  stopTroubleTimer();
  
  // Set trouble start time
  troubleStartTime = new Date();
  localStorage.setItem('troubleStartTime', troubleStartTime.getTime().toString());
  console.log('🔧 Machine trouble timer started at:', troubleStartTime.toLocaleTimeString());
  
  // Show modal
  const modalOverlay = document.getElementById('troubleModalOverlay');
  if (modalOverlay) {
    modalOverlay.classList.add('active');
  }
  
  // Update immediately
  updateTroubleTimer();
  
  // Update every second
  troubleTimerInterval = setInterval(updateTroubleTimer, 1000);
}

// Stop machine trouble timer
function stopTroubleTimer() {
  if (troubleTimerInterval) {
    clearInterval(troubleTimerInterval);
    troubleTimerInterval = null;
    console.log('⏹️ Machine trouble timer stopped');
  }
}

// Update machine trouble timer display
function updateTroubleTimer() {
  if (!troubleStartTime) {
    const timerDisplay = document.getElementById('troubleTimer');
    if (timerDisplay) {
      timerDisplay.textContent = '00:00';
    }
    return;
  }
  
  const now = new Date();
  const elapsedMs = now - troubleStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  
  // Calculate minutes and seconds
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  
  // Format as MM:SS
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const timerDisplay = document.getElementById('troubleTimer');
  if (timerDisplay) {
    timerDisplay.textContent = timeString;
  }
}

// Complete machine trouble - close modal and update stopTime
function completeTrouble() {
  if (!troubleStartTime) {
    console.warn('⚠️ No machine trouble start time found');
    return;
  }
  
  // Calculate elapsed time
  const now = new Date();
  const elapsedMs = now - troubleStartTime;
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
  
  // Calculate decimal hours (more precise with seconds)
  const decimalHours = ((elapsedMinutes * 60 + elapsedSeconds) / 3600).toFixed(2);
  
  console.log(`🔧 Machine trouble completed: ${elapsedMinutes}m ${elapsedSeconds}s = ${decimalHours}h`);
  
  // Get current stopTime value and add new trouble time
  const stopTimeInput = document.getElementById('stopTime');
  if (stopTimeInput) {
    const currentStopTime = parseFloat(stopTimeInput.value) || 0;
    const newStopTime = (currentStopTime + parseFloat(decimalHours)).toFixed(2);
    stopTimeInput.value = newStopTime;
    saveFieldToLocalStorage('stopTime', newStopTime);
    console.log(`✅ Updated stopTime: ${currentStopTime} + ${decimalHours} = ${newStopTime}h`);
  }
  
  // Stop timer and close modal
  stopTroubleTimer();
  troubleStartTime = null;
  localStorage.removeItem('troubleStartTime');
  
  const modalOverlay = document.getElementById('troubleModalOverlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
  }
  
  // Reset timer display
  const timerDisplay = document.getElementById('troubleTimer');
  if (timerDisplay) {
    timerDisplay.textContent = '00:00';
  }
  
  console.log('✅ Machine trouble modal closed');
}

// ============================================================
// �🔹 LOCALSTORAGE PERSISTENCE
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
    const textFields = ['startTime', 'stopTime', 'endTime', 'workTime', 'manHours', 'workCount', 'passCount'];
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
    
    // Text content fields (using textContent instead of value)
    const textContentFields = ['otherDetails', 'remarks'];
    textContentFields.forEach(fieldId => {
      const saved = localStorage.getItem(`tablet_${fieldId}`);
      if (saved !== null) {
        const field = document.getElementById(fieldId);
        if (field) {
          field.textContent = saved;
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
    
    // Restore product name and kanban ID for inline info
    const savedProductName = localStorage.getItem('tablet_currentProductName');
    if (savedProductName !== null) {
      currentProductName = savedProductName;
      const productNameDisplay = document.getElementById('productNameDisplay');
      if (productNameDisplay && savedProductName) {
        productNameDisplay.textContent = savedProductName;
      }
      console.log(`📦 Restored currentProductName:`, savedProductName);
    }
    
    const savedKanbanID = localStorage.getItem('tablet_kanbanID');
    if (savedKanbanID) {
      const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
      if (kanbanIdDisplay) {
        kanbanIdDisplay.textContent = ', ' + savedKanbanID;
      }
      console.log(`📦 Restored kanbanID:`, savedKanbanID);
    }
    
    // Restore kensaMembers to show/hide poster cells correctly
    const savedKensaMembers = localStorage.getItem('tablet_kensaMembers');
    if (savedKensaMembers) {
      const kensaMembers = parseInt(savedKensaMembers, 10);
      updateKensaMembersDisplay(kensaMembers);
      console.log(`📦 Restored kensaMembers:`, kensaMembers);
    }
    
    // Update calculated fields
    updateDefectSum();
    updateWorkCount();
    
    // Update inline values from restored fields (in case OPC data not yet available)
    const workCountInput = document.getElementById('workCount');
    const passCountInput = document.getElementById('passCount');
    const inlineWorkCount = document.getElementById('inlineWorkCount');
    const inlinePassCount = document.getElementById('inlinePassCount');
    if (inlineWorkCount && workCountInput) {
      inlineWorkCount.textContent = workCountInput.value || '0';
    }
    if (inlinePassCount && passCountInput) {
      inlinePassCount.textContent = passCountInput.value || '0';
    }
    
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
    
    // Restart break timer if active break exists
    const savedBreakStartTime = localStorage.getItem('breakStartTime');
    if (savedBreakStartTime) {
      try {
        breakStartTime = new Date(parseInt(savedBreakStartTime));
        console.log('⏸️ Restoring active break from:', breakStartTime.toLocaleTimeString());
        
        // Show modal
        const modalOverlay = document.getElementById('breakModalOverlay');
        if (modalOverlay) {
          modalOverlay.classList.add('active');
        }
        
        // Update immediately
        updateBreakTimer();
        
        // Update every second
        breakTimerInterval = setInterval(updateBreakTimer, 1000);
        
        console.log('✅ Break timer restored and modal reopened');
      } catch (e) {
        console.error('Failed to restore break timer:', e);
        localStorage.removeItem('breakStartTime');
      }
    }
    
    // Restart machine trouble timer if active trouble exists
    const savedTroubleStartTime = localStorage.getItem('troubleStartTime');
    if (savedTroubleStartTime) {
      try {
        troubleStartTime = new Date(parseInt(savedTroubleStartTime));
        console.log('🔧 Restoring active machine trouble from:', troubleStartTime.toLocaleTimeString());
        
        // Show modal
        const modalOverlay = document.getElementById('troubleModalOverlay');
        if (modalOverlay) {
          modalOverlay.classList.add('active');
        }
        
        // Update immediately
        updateTroubleTimer();
        
        // Update every second
        troubleTimerInterval = setInterval(updateTroubleTimer, 1000);
        
        console.log('✅ Machine trouble timer restored and modal reopened');
      } catch (e) {
        console.error('Failed to restore machine trouble timer:', e);
        localStorage.removeItem('troubleStartTime');
      }
    }
    
    console.log('✅ All fields restored from localStorage');
  } catch (e) {
    console.error('Failed to restore fields:', e);
  }
  
  // Restore collapsed state of basic settings card
  restoreBasicSettingsState();
}

// ============================================================
// 📋 BASIC SETTINGS COLLAPSE/EXPAND
// ============================================================

// Toggle basic settings card collapse/expand
function toggleBasicSettings() {
  const card = document.getElementById('basicSettingsCard');
  if (!card) return;
  
  const isCollapsed = card.classList.contains('collapsed');
  
  if (isCollapsed) {
    // Expand
    card.classList.remove('collapsed');
    card.classList.remove('needs-attention');
    removeWaveAnimation(); // Stop wave animation when expanded
    localStorage.setItem('basicSettingsCollapsed', 'false');
    console.log('📋 Basic settings expanded');
  } else {
    // Collapse
    card.classList.add('collapsed');
    localStorage.setItem('basicSettingsCollapsed', 'true');
    console.log('📋 Basic settings collapsed');
    
    // Check if attention is needed
    checkBasicSettingsAttention();
  }
}

// Check if basic settings needs attention (missing poster1 or startTime)
function checkBasicSettingsAttention() {
  const card = document.getElementById('basicSettingsCard');
  if (!card) return;
  
  // Only check if card is collapsed
  if (!card.classList.contains('collapsed')) {
    card.classList.remove('needs-attention');
    removeWaveAnimation();
    return;
  }
  
  const poster1 = document.getElementById('poster1');
  const startTime = document.getElementById('startTime');
  
  const poster1Empty = !poster1 || poster1.value === '';
  const startTimeEmpty = !startTime || startTime.value === '';
  
  if (poster1Empty || startTimeEmpty) {
    card.classList.add('needs-attention');
    addWaveAnimation();
    console.log('⚠️ Basic settings needs attention:', { poster1Empty, startTimeEmpty });
  } else {
    card.classList.remove('needs-attention');
    removeWaveAnimation();
    console.log('✅ Basic settings complete');
  }
}

// Add wave animation to button and defect cards
function addWaveAnimation() {
  const buttonCard = document.getElementById('buttonCard');
  const defectCard = document.getElementById('defectCard');
  
  if (buttonCard) {
    buttonCard.classList.add('attention-wave', 'wave-delay');
  }
  if (defectCard) {
    defectCard.classList.add('attention-wave');
  }
  
  console.log('🌊 Wave animation added to cards');
}

// Remove wave animation from button and defect cards
function removeWaveAnimation() {
  const buttonCard = document.getElementById('buttonCard');
  const defectCard = document.getElementById('defectCard');
  
  if (buttonCard) {
    buttonCard.classList.remove('attention-wave', 'wave-delay');
  }
  if (defectCard) {
    defectCard.classList.remove('attention-wave');
  }
  
  console.log('🌊 Wave animation removed from cards');
}

// Restore collapsed state from localStorage
function restoreBasicSettingsState() {
  const card = document.getElementById('basicSettingsCard');
  if (!card) return;
  
  const isCollapsed = localStorage.getItem('basicSettingsCollapsed') === 'true';
  
  if (isCollapsed) {
    card.classList.add('collapsed');
    console.log('📋 Restored basic settings as collapsed');
    checkBasicSettingsAttention();
  } else {
    card.classList.remove('collapsed');
    console.log('📋 Restored basic settings as expanded');
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
    localStorage.removeItem('breakStartTime');
    localStorage.removeItem('troubleStartTime');
    localStorage.removeItem('basicSettingsCollapsed');
    console.log('🗑️ Cleared all tablet localStorage data');
  } catch (e) {
    console.error('Failed to clear localStorage:', e);
  }
}

// ============================================================
// � TOKEN VALIDATION
// ============================================================

let tokenValidationInterval = null;

// Start periodic token validation
function startTokenValidation() {
  // Validate immediately
  validateToken();
  
  // Then validate every 5 minutes
  tokenValidationInterval = setInterval(validateToken, 5 * 60 * 1000);
  console.log('🔐 Started periodic token validation (every 5 minutes)');
}

// Stop token validation interval
function stopTokenValidation() {
  if (tokenValidationInterval) {
    clearInterval(tokenValidationInterval);
    tokenValidationInterval = null;
  }
}

// Validate token with server
async function validateToken() {
  try {
    const authData = localStorage.getItem('tabletAuth');
    if (!authData) {
      console.log('⚠️ No auth data found');
      return;
    }
    
    const auth = JSON.parse(authData);
    const token = auth.token;
    
    const response = await fetch(`${API_URL}/validateToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Token validation failed:', error);
      
      if (error.forceLogout || response.status === 401 || response.status === 403) {
        alert('セッションが無効です。再ログインしてください / Session invalid. Please log in again.');
        stopTokenValidation();
        logoutTablet();
      }
      return;
    }
    
    console.log('✅ Token validated successfully');
  } catch (error) {
    console.error('❌ Token validation error:', error);
  }
}

// ============================================================
// �🔹 INITIALIZATION - Parse URL Parameters & Load Data
// ============================================================

// Parse URL parameters
function getURLParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Display current user info
  try {
    const authData = localStorage.getItem('tabletAuth');
    if (authData) {
      const auth = JSON.parse(authData);
      const usernameDisplay = document.getElementById('currentUsername');
      if (usernameDisplay) {
        usernameDisplay.textContent = `${auth.user.firstName || ''} ${auth.user.lastName || ''}`.trim() || auth.user.username;
      }
    }
  } catch (err) {
    console.error('Error displaying user info:', err);
  }
  
  // Get factory from URL parameter
  currentFactory = getURLParameter('factory') || 'KSG加工';
  console.log('🏭 Factory from URL:', currentFactory);
  
  // Get product ID from URL (optional)
  currentProductId = getURLParameter('product') || 'aaa'; // Default to 'aaa' for testing
  console.log('📦 Product ID:', currentProductId);
  
  // 🆕 Load equipment configuration FIRST (to get variable mappings)
  await loadEquipmentConfig();
  
  // Load users for this factory
  await loadUsers();
  
  // Load product info to determine kensaMembers
  await loadProductInfo();
  
  // Restore all fields from localStorage
  restoreAllFields();
  
  // Update inline info after restoring fields
  updateInlineInfo();
  
  // If work has already started (startTime has value), show inline info and collapse basic settings
  const startTimeInput = document.getElementById('startTime');
  if (startTimeInput && startTimeInput.value) {
    const inlineInfo = document.querySelector('.inline-info');
    if (inlineInfo) {
      inlineInfo.classList.add('visible');
      console.log('📋 Work already started, showing inline info');
    }
    const basicSettingsCard = document.getElementById('basicSettingsCard');
    if (basicSettingsCard) {
      basicSettingsCard.classList.add('collapsed');
      console.log('📋 Work already started, collapsing basic settings card');
    }
  }
  
  // Add event listener for poster1 dropdown changes
  const poster1Select = document.getElementById('poster1');
  if (poster1Select) {
    poster1Select.addEventListener('change', () => {
      console.log('👤 Poster1 changed to:', poster1Select.value);
      saveFieldToLocalStorage('poster1', poster1Select.value);
      checkStartButtonState();
      checkBasicSettingsAttention(); // Check attention state
    });
  }
  
  // Start periodic token validation (every 5 minutes)
  startTokenValidation();
  
  // Add change listeners for all dropdowns
  const dropdowns = ['lhRh', 'poster1', 'poster2', 'poster3'];
  dropdowns.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('change', () => {
        saveFieldToLocalStorage(fieldId, field.value);
        if (fieldId === 'poster1') {
          checkBasicSettingsAttention(); // Check attention state when poster1 changes
        }
        // Update inline info when any dropdown changes
        updateInlineInfo();
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
    const response = await fetch(`${API_URL}/api/tablet/users/${encodeURIComponent(currentFactory)}`);
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

// Load equipment configuration (including OPC variable mappings)
async function loadEquipmentConfig() {
  const authData = localStorage.getItem('tabletAuth');
  if (!authData) {
    console.error('❌ No tablet auth data found');
    return;
  }
  
  try {
    const auth = JSON.parse(authData);
    const tabletName = auth.tablet?.tabletName || auth.tabletName;
    
    if (!tabletName) {
      console.error('❌ No tablet name found in auth data');
      return;
    }
    
    console.log(`📡 Loading equipment config for tablet: ${tabletName}...`);
    const response = await fetch(`${API_URL}/api/tablet/equipment-config/${encodeURIComponent(tabletName)}`);
    const data = await response.json();
    
    if (data.success) {
      const equipment = data.equipment;
      console.log('✅ Equipment config loaded:', equipment);
      
      // Update variable mappings with equipment-specific values
      if (equipment.opcVariables) {
        variableMappings = {
          kanban: equipment.opcVariables.kanbanVariable || 'kenyokiRHKanban',
          productionCount: equipment.opcVariables.productionCountVariable || 'seisanSu',
          boxQuantity: equipment.opcVariables.boxQuantityVariable || 'hakoIresu'
        };
        
        console.log('');
        console.log('📋 OPC VARIABLE MAPPINGS FOR THIS TABLET');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`設備名 (Equipment): ${equipment.設備名 || 'N/A'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 製品看板変数 (Kanban Variable): ${variableMappings.kanban}`);
        console.log(`📈 生産数変数 (Production Count Variable): ${variableMappings.productionCount}`);
        console.log(`📦 箱入数変数 (Box Quantity Variable): ${variableMappings.boxQuantity}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
      }
    } else {
      console.warn('⚠️ Failed to load equipment config:', data.error);
      console.log('ℹ️ Using default variable mappings');
    }
    
  } catch (error) {
    console.error('❌ Error loading equipment config:', error);
    console.log('ℹ️ Using default variable mappings');
  }
}

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
    const response = await fetch(`${API_URL}/api/tablet/product-by-kanban/${encodeURIComponent(kanbanId)}`);
    const data = await response.json();
    
    if (data.success) {
      const product = data.product;
      console.log('✅ Loaded product info:', product);
      
      // Update current product ID and name
      currentProductId = product.品番;
      currentProductName = product['製品名'] || '';
      
      // Save to localStorage for persistence across page reloads
      localStorage.setItem('tablet_currentProductName', currentProductName);
      localStorage.setItem('tablet_kanbanID', product.kanbanID || '');
      
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
      
      // Set product name in remarks display (only if never set before)
      const remarksDisplay = document.getElementById('remarks');
      if (remarksDisplay && product['製品名']) {
        // Check if user has ever interacted with this field (localStorage exists)
        const hasRemarksInStorage = localStorage.getItem('tablet_remarks') !== null;
        
        if (!hasRemarksInStorage) {
          // First time loading - set product name
          remarksDisplay.textContent = product['製品名'];
          console.log(`✅ Set product name to: ${product['製品名']}`);
        } else {
          // User has interacted with field before - respect their saved value (even if empty)
          console.log(`ℹ️ Remarks field has been set by user, not overwriting`);
        }
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
      
      // Save kensaMembers to localStorage for persistence
      localStorage.setItem('tablet_kensaMembers', kensaMembers.toString());
      
      // Show/hide columns based on kensaMembers
      updateKensaMembersDisplay(kensaMembers);
    } else {
      console.error('❌ Failed to load product:', data.error);
      // Clear product info if not found
      currentProductId = '';
      currentProductName = '';
      const productNameDisplay = document.getElementById('productNameDisplay');
      const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
      if (productNameDisplay) {
        productNameDisplay.textContent = '看板なし';
      }
      if (kanbanIdDisplay) {
        kanbanIdDisplay.textContent = '';
      }
      // Default to 2 members if product not found
      updateKensaMembersDisplay(2);
      updateInlineInfo();
    }
  } catch (error) {
    console.error('❌ Error loading product info:', error);
    // Clear product info on error
    currentProductId = '';
    currentProductName = '';
    const productNameDisplay = document.getElementById('productNameDisplay');
    const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
    if (productNameDisplay) {
      productNameDisplay.textContent = '看板なし';
    }
    if (kanbanIdDisplay) {
      kanbanIdDisplay.textContent = '';
    }
    // Default to 2 members on error
    updateKensaMembersDisplay(2);
    updateInlineInfo();
  }
}

async function loadProductInfoOld() {
  if (!currentProductId) {
    console.warn('⚠️ No product ID specified');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/tablet/product/${encodeURIComponent(currentProductId)}`);
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
      
      // Save kensaMembers to localStorage for persistence
      localStorage.setItem('tablet_kensaMembers', kensaMembers.toString());
      
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
// 🔹 UPDATE INLINE INFO (ボタン card header)
// ============================================================
function updateInlineInfo() {
  // Update product name
  const inlineProductName = document.getElementById('inlineProductName');
  if (inlineProductName) {
    inlineProductName.textContent = currentProductName || '-';
  }
  
  // Update LH/RH
  const inlineLhRh = document.getElementById('inlineLhRh');
  const lhRhSelect = document.getElementById('lhRh');
  if (inlineLhRh && lhRhSelect) {
    inlineLhRh.textContent = lhRhSelect.value || '-';
  }
  
  // Update Kanban ID
  const inlineKanbanId = document.getElementById('inlineKanbanId');
  const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
  if (inlineKanbanId) {
    // Get kanban value from the display (remove comma prefix if present)
    let kanbanValue = kanbanIdDisplay ? kanbanIdDisplay.textContent.replace(/^,\s*/, '') : '';
    inlineKanbanId.textContent = kanbanValue || '-';
  }
  
  // Update Posters (dynamic - show only those with values)
  const inlinePosters = document.getElementById('inlinePosters');
  if (inlinePosters) {
    const poster1 = document.getElementById('poster1');
    const poster2 = document.getElementById('poster2');
    const poster3 = document.getElementById('poster3');
    
    const posters = [];
    if (poster1 && poster1.value && poster1.selectedIndex > 0) {
      posters.push(poster1.options[poster1.selectedIndex].text);
    }
    if (poster2 && poster2.value && poster2.selectedIndex > 0 && poster2.closest('.info-cell')?.style.display !== 'none') {
      posters.push(poster2.options[poster2.selectedIndex].text);
    }
    if (poster3 && poster3.value && poster3.selectedIndex > 0 && poster3.closest('.info-cell')?.style.display !== 'none') {
      posters.push(poster3.options[poster3.selectedIndex].text);
    }
    
    inlinePosters.textContent = posters.length > 0 ? posters.join(', ') : '-';
  }
  
  console.log('📋 Updated inline info in ボタン card header');
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
  // Subscribe to real-time variable updates for this company with token
  const authData = localStorage.getItem('tabletAuth');
  const token = authData ? JSON.parse(authData).token : null;
  socket.emit('subscribe_variables', { company: currentCompany, token });
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from ksgServer');
  updateConnectionStatus('disconnected');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  updateConnectionStatus('disconnected');
});

// Listen for authentication errors from server
socket.on('auth_error', (data) => {
  console.error('🚫 Authentication error:', data.error);
  if (data.forceLogout) {
    alert('アカウントが無効化されました / Account has been disabled');
    logoutTablet();
  }
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
  
  // Update inline work count in defect card header
  const inlineWorkCount = document.getElementById('inlineWorkCount');
  if (inlineWorkCount) {
    inlineWorkCount.textContent = workCountInput.value;
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
  
  // 🆕 Use dynamic variable names from equipment config
  const kanbanVarName = variableMappings.kanban;
  const productionVarName = variableMappings.productionCount;
  const boxQtyVarName = variableMappings.boxQuantity;
  
  // Check kanban variable for start button validation AND product loading
  if (variables[kanbanVarName] !== undefined) {
    const value = variables[kanbanVarName].value;
    // Treat null bytes, empty strings, null, and undefined as "no value"
    const isBlankValue = !value || value === '' || value === '\x00' || value.match(/^[\x00]+$/);
    const newKanbanValue = isBlankValue ? null : value;
    
    // Check if value changed
    if (newKanbanValue !== kenyokiRHKanbanValue) {
      kenyokiRHKanbanValue = newKanbanValue;
      console.log(`📊 ${kanbanVarName} value updated:`, kenyokiRHKanbanValue);
      
      // Load product info when kanban ID changes (and has a value)
      if (kenyokiRHKanbanValue) {
        loadProductByKanbanID(kenyokiRHKanbanValue);
      } else {
        // Clear product info when kanban becomes blank
        console.log('🧹 Clearing product info (kanban is blank)');
        currentProductId = '';
        currentProductName = '';
        const productNameDisplay = document.getElementById('productNameDisplay');
        const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
        if (productNameDisplay) {
          productNameDisplay.textContent = '看板なし';
        }
        if (kanbanIdDisplay) {
          kanbanIdDisplay.textContent = '';
        }
      }
    }
    
    checkStartButtonState();
  } else {
    kenyokiRHKanbanValue = null;
    console.warn(`⚠️ ${kanbanVarName} variable not found`);
    checkStartButtonState();
  }
  
  // Track production count variable for work count calculation
  if (variables[productionVarName] !== undefined) {
    const value = variables[productionVarName].value;
    currentSeisanSuValue = (value !== null && value !== undefined) ? parseFloat(value) : null;
    console.log(`📊 ${productionVarName} value updated:`, currentSeisanSuValue);
    updateWorkCount();
  } else {
    currentSeisanSuValue = null;
    console.warn(`⚠️ ${productionVarName} variable not found`);
  }
  
  // Track box quantity variable for 合格数追加 display
  if (variables[boxQtyVarName] !== undefined) {
    const value = variables[boxQtyVarName].value;
    hakoIresuValue = (value !== null && value !== undefined) ? parseFloat(value) : null;
    console.log(`📊 ${boxQtyVarName} value updated:`, hakoIresuValue);
    
    // Update the display field
    const inspectionAddInput = document.getElementById('inspectionAddValue');
    if (inspectionAddInput) {
      inspectionAddInput.value = hakoIresuValue !== null ? hakoIresuValue : '';
    }
  } else {
    hakoIresuValue = null;
    console.warn(`⚠️ ${boxQtyVarName} variable not found`);
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
    
    // Check basic settings attention state after reset
    checkBasicSettingsAttention();
    
    // Hide inline info in ボタン card
    const inlineInfo = document.querySelector('.inline-info');
    if (inlineInfo) {
      inlineInfo.classList.remove('visible');
    }
    
    // Expand basic settings card if collapsed
    const basicSettingsCard = document.getElementById('basicSettingsCard');
    if (basicSettingsCard && basicSettingsCard.classList.contains('collapsed')) {
      basicSettingsCard.classList.remove('collapsed');
    }
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
    
    // Clear both text fields
    const otherDetails = document.getElementById('otherDetails');
    const remarks = document.getElementById('remarks');
    if (otherDetails) {
      otherDetails.textContent = '';
      localStorage.setItem('tablet_otherDetails', '');
    }
    if (remarks) {
      remarks.textContent = '';
      localStorage.setItem('tablet_remarks', '');
    }
    
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
    // Unlock scroll when button is enabled (user can now press start)
    document.body.classList.remove('scroll-locked');
    console.log('✅ Start button ENABLED, scroll unlocked');
  } else {
    // Disable button
    startButton.classList.add('disabled');
    // Lock scroll when button is disabled
    if (startTimeEmpty) {
      // Work not started yet - lock at top
      document.body.classList.add('scroll-locked');
      window.scrollTo(0, 0);
      console.log('🔒 Start button DISABLED, scroll locked at TOP');
    } else {
      // Work already started - lock at bottom
      document.body.classList.add('scroll-locked');
      window.scrollTo(0, document.body.scrollHeight);
      console.log('🔒 Start button DISABLED (work started), scroll locked at BOTTOM');
    }
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
  
  // Collapse/hide the basic settings card
  const basicSettingsCard = document.getElementById('basicSettingsCard');
  if (basicSettingsCard) {
    basicSettingsCard.classList.add('collapsed');
    console.log('📋 Basic settings card collapsed');
  }
  
  // Show inline info in button card header
  const inlineInfo = document.querySelector('.inline-info');
  if (inlineInfo) {
    updateInlineInfo();
    inlineInfo.classList.add('visible');
    console.log('📋 Inline info now visible');
  }
  
  // Scroll to bottom then lock
  setTimeout(() => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
    // Lock scroll at bottom after scrolling completes
    setTimeout(() => {
      document.body.classList.add('scroll-locked');
      console.log('📜 Auto-scrolled to bottom and locked');
    }, 500);
  }, 100);
  
  // Check basic settings attention state (startTime is now filled)
  checkBasicSettingsAttention();
}

// Placeholder functions for buttons
async function sendData() {
  console.log('📤 Send data clicked');
  
  try {
    // ✅ VALIDATION: Check required fields
    const startTimeInput = document.getElementById('startTime');
    const poster1Select = document.getElementById('poster1');
    
    const startTimeValue = startTimeInput?.value || '';
    const poster1Value = poster1Select?.value || '';
    
    const missingFields = [];
    
    // Check 開始時間 (Start Time)
    if (!startTimeValue) {
      missingFields.push('開始時間 / Start Time');
      if (startTimeInput) {
        startTimeInput.style.border = '3px solid red';
        startTimeInput.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
      }
    } else {
      // Remove red border if value exists
      if (startTimeInput) {
        startTimeInput.style.border = '';
        startTimeInput.style.boxShadow = '';
      }
    }
    
    // Check 技能員① (Poster 1)
    if (!poster1Value) {
      missingFields.push('技能員① / Inspector 1');
      if (poster1Select) {
        poster1Select.style.border = '3px solid red';
        poster1Select.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
      }
    } else {
      // Remove red border if value exists
      if (poster1Select) {
        poster1Select.style.border = '';
        poster1Select.style.boxShadow = '';
      }
    }

    // if (missingFields.length > 0) {
    //   console.warn('⚠️ Validation failed - missing required fields:', missingFields);
    // } else {
    //   console.log('✅ Validation passed - all required fields are filled');
    // }
    
    // If there are missing fields, show alert and stop submission
    if (missingFields.length > 0) {
      const message = `以下の項目を入力してください:\n\nPlease fill in the following fields:\n\n${missingFields.map(f => `• ${f}`).join('\n')}`;
      alert(message);
      console.warn('⚠️ Validation failed - missing required fields:', missingFields);
      return; // Stop submission
    }
    
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
      '技能員①': poster1Value,
      '技能員②': document.getElementById('poster2')?.value || '',
      良品数: parseInt(document.getElementById('passCount')?.value) || 0,
      工数: parseFloat(document.getElementById('manHours')?.value) || 0,
      ...defectData,
      その他詳細: document.getElementById('otherDetails')?.value || '',
      開始時間: startTimeValue,
      終了時間: document.getElementById('endTime')?.value || '',
      休憩時間: '',
      備考: document.getElementById('remarks')?.textContent || '',
      '工数（除外工数）': 0
    };
    
    console.log('📊 Submitting data:', submissionData);
    
    // Show uploading modal
    const uploadingModal = document.getElementById('uploadingModalOverlay');
    if (uploadingModal) {
      uploadingModal.classList.add('active');
    }
    
    // Get auth token
    const authData = localStorage.getItem('tabletAuth');
    if (!authData) {
      alert('認証エラー / Authentication error');
      logoutTablet();
      return;
    }
    const auth = JSON.parse(authData);
    const token = auth.token;
    
    // Submit to server with Authorization header
    const response = await fetch(`${API_URL}/api/tablet/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(submissionData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      // Handle authentication errors
      if (result.forceLogout || response.status === 401 || response.status === 403) {
        alert('セッションが無効です。再ログインしてください / Session invalid. Please log in again.');
        logoutTablet();
        return;
      }
      throw new Error(result.error || 'Submission failed');
    }
    
    if (result.success) {
      // Hide uploading modal
      if (uploadingModal) {
        uploadingModal.classList.remove('active');
      }
      
      console.log('✅ Data submitted successfully:', result);
      alert('データが正常に送信されました！');
      
      // Clear all fields after successful submission
      clearAllFields();
    } else {
      throw new Error(result.error || 'Submission failed');
    }
    
  } catch (error) {
    // Hide uploading modal
    const uploadingModal = document.getElementById('uploadingModalOverlay');
    if (uploadingModal) {
      uploadingModal.classList.remove('active');
    }
    
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
    
    // Clear both text fields
    const otherDetails = document.getElementById('otherDetails');
    const remarks = document.getElementById('remarks');
    if (otherDetails) {
      otherDetails.textContent = '';
      localStorage.setItem('tablet_otherDetails', '');
    }
    if (remarks) {
      remarks.textContent = '';
      localStorage.setItem('tablet_remarks', '');
    }
    
    updateDefectSum(); // Update sum after reset
    console.log('🔄 Reset defect counters');
    
    // Clear all localStorage
    clearAllLocalStorage();
    
    checkStartButtonState(); // Re-check button state
    checkBasicSettingsAttention(); // Check attention state after clearing
  }
}

function setWorkStartTime() {
  console.log('Work start time clicked');
}

function pauseWork() {
  console.log('⏸️ Pause work clicked - starting break timer');
  startBreakTimer();
}

function setWorkStopTime() {
  console.log('Work stop time clicked');
}

function setWorkEndTime() {
  console.log('🔧 Machine trouble clicked - starting trouble timer');
  startTroubleTimer();
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
  const remarksDisplay = document.getElementById('remarks');
  const otherDetails = document.getElementById('otherDetails');
  
  if (!remarksDisplay || !otherDetails) return;
  
  // Toggle contentEditable for both fields
  if (remarksDisplay.contentEditable === 'true') {
    // Currently editing - save and disable edit mode
    remarksDisplay.contentEditable = 'false';
    remarksDisplay.style.background = '#f9f9f9';
    remarksDisplay.style.cursor = 'default';
    
    otherDetails.contentEditable = 'false';
    otherDetails.style.background = '#f9f9f9';
    otherDetails.style.cursor = 'default';
    
    // Save to localStorage
    localStorage.setItem('tablet_remarks', remarksDisplay.textContent);
    localStorage.setItem('tablet_otherDetails', otherDetails.textContent);
    
    console.log('✅ Remarks saved:', {
      remarks: remarksDisplay.textContent,
      otherDetails: otherDetails.textContent
    });
  } else {
    // Enable edit mode for both fields
    remarksDisplay.contentEditable = 'true';
    remarksDisplay.style.background = '#fff';
    remarksDisplay.style.cursor = 'text';
    
    otherDetails.contentEditable = 'true';
    otherDetails.style.background = '#fff';
    otherDetails.style.cursor = 'text';
    
    otherDetails.focus();
    console.log('✏️ Remarks edit mode enabled');
  }
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
  
  // Update inline pass count in defect card header
  const inlinePassCount = document.getElementById('inlinePassCount');
  if (inlinePassCount) {
    inlinePassCount.textContent = passCount;
  }
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
