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
    const authenticatedTablet = auth.tabletName || auth.tablet?.tabletName;
    
    // Get the tablet name from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlTabletName = urlParams.get('tabletName');
    
    // 🔒 CRITICAL: Validate that URL tablet matches authenticated tablet
    // This prevents loading old auth data from localStorage when visiting a different tablet
    if (urlTabletName && authenticatedTablet && urlTabletName !== authenticatedTablet) {
      console.warn(`⚠️ Tablet mismatch! URL has "${urlTabletName}" but auth is for "${authenticatedTablet}"`);
      console.log('🔄 Clearing old auth and redirecting to login...');
      localStorage.removeItem('tabletAuth');
      window.location.href = `tablet-login.html?tabletName=${urlTabletName}`;
      return;
    }
    
    // Check if token is expired (12 hours)
    const loginTime = new Date(auth.loginTime);
    const now = new Date();
    const hoursSinceLogin = (now - loginTime) / (1000 * 60 * 60);
    
    if (hoursSinceLogin > 12) {
      // Token expired, clear and redirect
      localStorage.removeItem('tabletAuth');
      if (authenticatedTablet) {
        window.location.href = `tablet-login.html?tabletName=${authenticatedTablet}`;
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
let currentEquipment = ''; // Will be set from tabletAuth data
let currentProductId = ''; // Will be set from URL parameter or selection
let currentProductName = ''; // Store product name from masterDB
let availableUsers = []; // Store available users
let kenyokiRHKanbanValue = null; // Store kenyokiRHKanban variable value
let currentNGGroup = null; // Store currently active NG group for this product
let seisanSuStartValue = null; // Starting value of seisanSu when work started
let currentSeisanSuValue = null; // Current seisanSu value
let hakoIresuValue = null; // Store hakoIresu variable value
let workTimerInterval = null; // Interval for updating work time
let workStartTime = null; // Timestamp when work started
let breakTimerInterval = null; // Interval for break timer
let breakStartTime = null; // Timestamp when break started
let troubleTimerInterval = null; // Interval for machine trouble timer
let troubleStartTime = null; // Timestamp when machine trouble started
let totalBreakHours = 0; // Total accumulated break time in hours
let totalTroubleHours = 0; // Total accumulated machine trouble time in hours

// 🆕 Equipment-specific OPC variable mappings (loaded dynamically)
let variableMappings = {
  kanban: 'kenyokiRHKanban',           // Default: For product title/lookup
  productionCount: 'seisanSu',          // Default: For 作業数 calculation
  boxQuantity: 'hakoIresu'              // Default: For 合格数追加 display
};
let isEquipmentConfigLoaded = false; // Flag to track if config loaded
const IGNORED_KANBAN_NOISE_VALUES = new Set(['9999']);
const kanbanProductCache = new Map();
const invalidKanbanCache = new Set();
let latestObservedKanbanValue = null;
let latestKanbanValidationRequestId = 0;
let tabletSessionSyncTimeout = null;
let tabletSessionSyncPromise = null;
let tabletSessionSyncQueuedOptions = null;

function normalizeKanbanValue(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const stringValue = String(rawValue).replace(/\x00/g, '').trim();
  return stringValue ? stringValue : null;
}

function isIgnoredKanbanNoise(kanbanId) {
  const normalizedKanban = normalizeKanbanValue(kanbanId);
  return !!normalizedKanban && IGNORED_KANBAN_NOISE_VALUES.has(normalizedKanban);
}

function isUsableKanbanValue(kanbanId) {
  const normalizedKanban = normalizeKanbanValue(kanbanId);
  return !!normalizedKanban && !isIgnoredKanbanNoise(normalizedKanban);
}

function isProductNotFoundError(error) {
  return !!error && (error.isNotFound || error.status === 404);
}

function persistLastKnownKanban(kanbanId) {
  const normalizedKanban = normalizeKanbanValue(kanbanId);
  if (!isUsableKanbanValue(normalizedKanban)) {
    return null;
  }

  localStorage.setItem('tablet_lastKnownKanbanID', normalizedKanban);
  localStorage.setItem('tablet_kanbanID', normalizedKanban);
  return normalizedKanban;
}

function getLastKnownKanban() {
  const cachedKanban = normalizeKanbanValue(
    localStorage.getItem('tablet_lastKnownKanbanID') || localStorage.getItem('tablet_kanbanID')
  );

  return isUsableKanbanValue(cachedKanban) ? cachedKanban : null;
}

function getTabletSessionAuthContext() {
  try {
    const authData = localStorage.getItem('tabletAuth');
    if (!authData) return null;

    const auth = JSON.parse(authData);
    const token = auth?.token || '';
    const tabletName = auth?.tablet?.tabletName || auth?.tabletName || '';

    if (!token || !tabletName) {
      return null;
    }

    return { token, tabletName };
  } catch (error) {
    console.error('Failed to parse tablet auth context for session sync:', error);
    return null;
  }
}

function getTabletSelectedOperators() {
  const dropdownIds = ['poster1', 'poster2', 'poster3', 'poster4'];

  return dropdownIds
    .map(id => document.getElementById(id))
    .filter(select => select && select.value && select.selectedIndex > 0 && select.closest('.info-cell')?.style.display !== 'none')
    .map(select => select.value)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4);
}

function hasActiveTabletSession() {
  const startTimeValue = document.getElementById('startTime')?.value || '';
  return Boolean(workStartTime || startTimeValue);
}

function buildTabletSessionPayload() {
  if (!hasActiveTabletSession()) {
    return null;
  }

  const startTimeValue = document.getElementById('startTime')?.value || '';
  const workCountValue = parseInt(document.getElementById('workCount')?.value, 10) || 0;
  const passCountValue = parseInt(document.getElementById('passCount')?.value, 10) || 0;
  const stopTimeValue = parseFloat(document.getElementById('stopTime')?.value) || 0;
  const manHoursValue = parseFloat(document.getElementById('manHours')?.value) || 0;
  const productNameDisplay = document.getElementById('productNameDisplay');
  const currentKanban = getLastKnownKanban()
    || normalizeKanbanValue(latestObservedKanbanValue)
    || normalizeKanbanValue(kenyokiRHKanbanValue);

  return {
    isStarted: Boolean(workStartTime && startTimeValue),
    startTime: startTimeValue,
    workStartTime: workStartTime ? workStartTime.toISOString() : null,
    breakActive: Boolean(breakStartTime),
    breakStartTime: breakStartTime ? breakStartTime.toISOString() : null,
    troubleActive: Boolean(troubleStartTime),
    troubleStartTime: troubleStartTime ? troubleStartTime.toISOString() : null,
    totalBreakHours,
    totalTroubleHours,
    stopTimeHours: stopTimeValue,
    manHours: manHoursValue,
    currentCount: workCountValue,
    goodCount: passCountValue,
    seisanSuStartValue,
    currentSeisanSuValue,
    operators: getTabletSelectedOperators(),
    kanbanId: currentKanban || '',
    productId: currentProductId || '',
    productName: currentProductName || productNameDisplay?.textContent || '',
    lhRh: document.getElementById('lhRh')?.value || '',
    hakoIresu: hakoIresuValue || 0,
    remarks: document.getElementById('remarks')?.textContent || '',
    otherDetails: document.getElementById('otherDetails')?.textContent || ''
  };
}

async function syncTabletSession(options = {}) {
  const authContext = getTabletSessionAuthContext();
  if (!authContext) {
    return;
  }

  const syncOptions = {
    clear: Boolean(options.clear)
  };

  if (tabletSessionSyncPromise) {
    tabletSessionSyncQueuedOptions = {
      clear: syncOptions.clear || tabletSessionSyncQueuedOptions?.clear || false
    };
    return tabletSessionSyncPromise;
  }

  const payload = syncOptions.clear ? { clear: true } : buildTabletSessionPayload();
  if (!payload) {
    return;
  }

  tabletSessionSyncPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/tablet/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authContext.token}`,
          'X-Tablet-Name': encodeURIComponent(authContext.tabletName)
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Tablet session sync failed');
      }
    } catch (error) {
      console.error('❌ Failed to sync tablet session:', error);
    } finally {
      tabletSessionSyncPromise = null;
      if (tabletSessionSyncQueuedOptions) {
        const queuedOptions = tabletSessionSyncQueuedOptions;
        tabletSessionSyncQueuedOptions = null;
        scheduleTabletSessionSync({
          clear: queuedOptions.clear,
          immediate: true
        });
      }
    }
  })();

  return tabletSessionSyncPromise;
}

function scheduleTabletSessionSync(options = {}) {
  const syncOptions = {
    clear: Boolean(options.clear),
    immediate: Boolean(options.immediate)
  };

  if (!syncOptions.clear && !hasActiveTabletSession()) {
    return;
  }

  if (tabletSessionSyncTimeout) {
    clearTimeout(tabletSessionSyncTimeout);
  }

  const delay = syncOptions.immediate ? 0 : 800;
  tabletSessionSyncTimeout = setTimeout(() => {
    tabletSessionSyncTimeout = null;
    syncTabletSession(syncOptions);
  }, delay);
}

async function fetchProductByKanbanID(kanbanId) {
  const normalizedKanban = normalizeKanbanValue(kanbanId);
  if (!normalizedKanban) {
    return null;
  }

  const response = await fetch(`${API_URL}/api/tablet/product-by-kanban/${encodeURIComponent(normalizedKanban)}`);
  const data = await response.json();

  if (!response.ok || !data.success || !data.product) {
    const error = new Error(data.error || `Failed to load product for kanban ${normalizedKanban}`);
    error.status = response.status;
    error.kanbanId = normalizedKanban;
    error.isNotFound = response.status === 404 || data.error === 'Product not found';
    throw error;
  }

  return data.product;
}

async function fetchValidatedProductByKanban(kanbanId) {
  const normalizedKanban = normalizeKanbanValue(kanbanId);
  if (!normalizedKanban) {
    return null;
  }

  if (kanbanProductCache.has(normalizedKanban)) {
    return kanbanProductCache.get(normalizedKanban);
  }

  if (isIgnoredKanbanNoise(normalizedKanban) || invalidKanbanCache.has(normalizedKanban)) {
    const error = new Error(`Product not found for kanban ${normalizedKanban}`);
    error.status = 404;
    error.kanbanId = normalizedKanban;
    error.isNotFound = true;
    throw error;
  }

  try {
    const product = await fetchProductByKanbanID(normalizedKanban);
    kanbanProductCache.set(normalizedKanban, product);
    invalidKanbanCache.delete(normalizedKanban);
    return product;
  } catch (error) {
    if (isProductNotFoundError(error)) {
      invalidKanbanCache.add(normalizedKanban);
    }
    throw error;
  }
}

function applyProductContext(product, options = {}) {
  if (!product) {
    return;
  }

  const acceptedKanban = normalizeKanbanValue(options.kanbanId || product.kanbanID);
  currentProductId = product.品番 || '';
  currentProductName = product['製品名'] || '';

  if (acceptedKanban) {
    kenyokiRHKanbanValue = acceptedKanban;
    persistLastKnownKanban(acceptedKanban);
  }

  if (currentProductName) {
    localStorage.setItem('tablet_currentProductName', currentProductName);
  } else {
    localStorage.removeItem('tablet_currentProductName');
  }

  const productNameDisplay = document.getElementById('productNameDisplay');
  const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
  if (productNameDisplay) {
    productNameDisplay.textContent = options.preserveMissingTitle ? '看板なし' : (currentProductName || '看板なし');
  }
  if (kanbanIdDisplay) {
    kanbanIdDisplay.textContent = options.preserveMissingTitle ? '' : (acceptedKanban ? ', ' + acceptedKanban : '');
  }

  // Remarks are user-only; do not auto-fill from product data.

  if (product['LH/RH']) {
    const lhRhDropdown = document.getElementById('lhRh');
    if (lhRhDropdown) {
      lhRhDropdown.value = product['LH/RH'];
      saveFieldToLocalStorage('lhRh', product['LH/RH']);
      console.log(`✅ Set LH/RH to: ${product['LH/RH']}`);
    }
  }

  const kensaMembers = product.kensaMembers || 2;
  console.log(`👥 KensaMembers: ${kensaMembers}`);
  localStorage.setItem('tablet_kensaMembers', kensaMembers.toString());
  updateKensaMembersDisplay(kensaMembers);
  renderNGButtons(product.ngGroup || null);
  updateInlineInfo();
}

function clearCurrentProductContext() {
  currentProductId = '';
  currentProductName = '';
  kenyokiRHKanbanValue = null;
  localStorage.removeItem('tablet_currentProductName');
  localStorage.removeItem('tablet_kanbanID');

  const productNameDisplay = document.getElementById('productNameDisplay');
  const kanbanIdDisplay = document.getElementById('kanbanIdDisplay');
  if (productNameDisplay) {
    productNameDisplay.textContent = '看板なし';
  }
  if (kanbanIdDisplay) {
    kanbanIdDisplay.textContent = '';
  }

  updateKensaMembersDisplay(2);
  renderNGButtons(null);
  updateInlineInfo();
}

async function resolveProductContextForSubmit() {
  const observedKanban = normalizeKanbanValue(latestObservedKanbanValue);

  if (observedKanban) {
    if (isIgnoredKanbanNoise(observedKanban)) {
      console.warn(`⚠️ Submit ignoring noisy kanban value "${observedKanban}"`);
    } else {
      try {
        const product = await fetchValidatedProductByKanban(observedKanban);
        return {
          kanbanId: normalizeKanbanValue(product.kanbanID) || observedKanban,
          product
        };
      } catch (error) {
        if (isProductNotFoundError(error)) {
          console.warn(`⚠️ Submit ignoring kanban "${observedKanban}" because it does not exist in masterDB`);
        } else {
          console.error(`❌ Failed to validate kanban "${observedKanban}" before submit:`, error);
        }
      }
    }
  }

  const fallbackKanban = getLastKnownKanban() || (isUsableKanbanValue(kenyokiRHKanbanValue) ? normalizeKanbanValue(kenyokiRHKanbanValue) : null);
  if (!fallbackKanban) {
    return { kanbanId: null, product: null };
  }

  try {
    const product = await fetchValidatedProductByKanban(fallbackKanban);
    return {
      kanbanId: normalizeKanbanValue(product.kanbanID) || fallbackKanban,
      product
    };
  } catch (error) {
    console.error(`❌ Failed to resolve fallback kanban "${fallbackKanban}" before submit:`, error);
    return { kanbanId: fallbackKanban, product: null };
  }
}

async function hydrateInProgressProductContextFromFallback(options = {}) {
  const { preserveMissingTitle = false } = options;
  const workInProgress = !!document.getElementById('startTime')?.value;
  const fallbackKanban = getLastKnownKanban();

  if (!workInProgress || !fallbackKanban) {
    return false;
  }

  try {
    const product = await fetchValidatedProductByKanban(fallbackKanban);
    applyProductContext(product, {
      kanbanId: normalizeKanbanValue(product.kanbanID) || fallbackKanban,
      preserveMissingTitle
    });
    console.log('♻️ Restored in-progress product context from fallback kanban:', fallbackKanban);
    return true;
  } catch (error) {
    console.error('❌ Failed to restore in-progress product context from fallback kanban:', error);
    return false;
  }
}

async function handleObservedKanbanValue(rawKanbanValue) {
  const requestId = ++latestKanbanValidationRequestId;
  const normalizedKanban = normalizeKanbanValue(rawKanbanValue);
  const workInProgress = !!document.getElementById('startTime')?.value;

  if (!normalizedKanban) {
    if (workInProgress) {
      console.warn('⚠️ Blank kanban signal during active work ignored; keeping last valid product context');
      if (!kenyokiRHKanbanValue) {
        await hydrateInProgressProductContextFromFallback();
      }
    } else {
      console.log('🧹 Clearing product info and NG buttons (kanban blank, not in progress)');
      clearCurrentProductContext();
    }

    if (requestId === latestKanbanValidationRequestId) {
      checkStartButtonState();
    }
    return;
  }

  if (isIgnoredKanbanNoise(normalizedKanban)) {
    if (workInProgress) {
      console.warn(`⚠️ Ignoring noisy kanban value "${normalizedKanban}" during active work; keeping current valid kanban`);
      if (!kenyokiRHKanbanValue) {
        await hydrateInProgressProductContextFromFallback();
      }
    } else {
      console.warn(`⚠️ Ignoring noisy kanban value "${normalizedKanban}" while idle`);
      clearCurrentProductContext();
    }

    if (requestId === latestKanbanValidationRequestId) {
      checkStartButtonState();
    }
    return;
  }

  try {
    const product = await fetchValidatedProductByKanban(normalizedKanban);
    if (requestId !== latestKanbanValidationRequestId) {
      return;
    }

    console.log(`✅ Kanban accepted from masterDB: ${normalizedKanban}`);
    applyProductContext(product, {
      kanbanId: normalizeKanbanValue(product.kanbanID) || normalizedKanban
    });
  } catch (error) {
    if (requestId !== latestKanbanValidationRequestId) {
      return;
    }

    if (isProductNotFoundError(error)) {
      if (workInProgress) {
        console.warn(`⚠️ Ignoring kanban "${normalizedKanban}" because it does not exist in masterDB; keeping current valid kanban`);
        if (!kenyokiRHKanbanValue) {
          await hydrateInProgressProductContextFromFallback();
        }
      } else {
        console.warn(`⚠️ Kanban "${normalizedKanban}" does not exist in masterDB; treating it as noise`);
        clearCurrentProductContext();
      }
    } else {
      console.error(`❌ Failed to validate kanban "${normalizedKanban}" against masterDB:`, error);
    }
  } finally {
    if (requestId === latestKanbanValidationRequestId) {
      checkStartButtonState();
    }
  }
}

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

// Restore break/trouble hour accumulators from localStorage
try {
  const savedBreakHours = localStorage.getItem('tablet_totalBreakHours');
  if (savedBreakHours !== null) totalBreakHours = parseFloat(savedBreakHours) || 0;
  const savedTroubleHours = localStorage.getItem('tablet_totalTroubleHours');
  if (savedTroubleHours !== null) totalTroubleHours = parseFloat(savedTroubleHours) || 0;
} catch (e) {
  console.error('Failed to restore break/trouble hours:', e);
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
  
  // Calculate gross hours and minutes (for workTime display)
  const grossHours = Math.floor(elapsedMinutes / 60);
  const grossMinutes = elapsedMinutes % 60;
  
  // Format gross elapsed as HH:MM (for display)
  const timeString = `${String(grossHours).padStart(2, '0')}:${String(grossMinutes).padStart(2, '0')}`;
  document.getElementById('workTime').value = timeString;
  
  // Net man_hours = gross elapsed - break - trouble
  const grossDecimalHours = grossHours + grossMinutes / 60;
  const netDecimalHours = Math.max(0, grossDecimalHours - totalBreakHours - totalTroubleHours);
  document.getElementById('manHours').value = netDecimalHours.toFixed(2);
  
  console.log(`⏱️ Work duration: ${timeString} gross, net=${netDecimalHours.toFixed(2)}h (break=${totalBreakHours}h, trouble=${totalTroubleHours}h)`);
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
  scheduleTabletSessionSync({ immediate: true });
  
  // Show modal
  const modalOverlay = document.getElementById('breakModalOverlay');
  if (modalOverlay) {
    modalOverlay.classList.add('active');
  }
  
  // Update immediately
  updateBreakTimer();
  
  // Update every second
  breakTimerInterval = setInterval(updateBreakTimer, 1000);

  // Lock defect counters while break is active
  updateDefectCounterState();
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
  
  // Track break hours separately
  totalBreakHours = parseFloat((totalBreakHours + parseFloat(decimalHours)).toFixed(2));
  localStorage.setItem('tablet_totalBreakHours', totalBreakHours.toString());
  console.log(`⏸️ totalBreakHours: ${totalBreakHours}h`);
  
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

  // Re-evaluate defect counter lock state
  updateDefectCounterState();
  scheduleTabletSessionSync({ immediate: true });
  
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
  scheduleTabletSessionSync({ immediate: true });
  
  // Show modal
  const modalOverlay = document.getElementById('troubleModalOverlay');
  if (modalOverlay) {
    modalOverlay.classList.add('active');
  }
  
  // Update immediately
  updateTroubleTimer();
  
  // Update every second
  troubleTimerInterval = setInterval(updateTroubleTimer, 1000);

  // Lock defect counters while trouble is active
  updateDefectCounterState();
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
  
  // Track trouble hours separately
  totalTroubleHours = parseFloat((totalTroubleHours + parseFloat(decimalHours)).toFixed(2));
  localStorage.setItem('tablet_totalTroubleHours', totalTroubleHours.toString());
  console.log(`🔧 totalTroubleHours: ${totalTroubleHours}h`);
  
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

  // Re-evaluate defect counter lock state
  updateDefectCounterState();
  scheduleTabletSessionSync({ immediate: true });
  
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
    
    const savedKanbanID = getLastKnownKanban();
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

  // Restore defect counter lock state
  updateDefectCounterState();
  
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
  
  // Get factory and equipment from URL parameter, or fall back to the stored tablet auth data
  const _storedAuth = localStorage.getItem('tabletAuth');
  const _storedTablet = _storedAuth ? JSON.parse(_storedAuth)?.tablet : null;
  currentFactory = getURLParameter('factory') || _storedTablet?.factoryLocation || 'KSG加工';
  currentEquipment = getURLParameter('equipment') || _storedTablet?.設備名 || '';
  console.log('🏭 Factory:', currentFactory, '| ⚙️ Equipment:', currentEquipment);
  
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

  // If work was already in progress before refresh, rebuild product/NG context from fallback kanban
  const restoredStartTimeInput = document.getElementById('startTime');
  if (restoredStartTimeInput && restoredStartTimeInput.value) {
    await hydrateInProgressProductContextFromFallback();
  }
  
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
      if (hasActiveTabletSession()) {
        scheduleTabletSessionSync();
      }
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
        if (hasActiveTabletSession()) {
          scheduleTabletSessionSync();
        }
      });
    }
  });
  
  // Add change listeners for regular text inputs (input elements)
  const textInputs = ['workTime', 'manHours'];
  textInputs.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', () => {
        saveFieldToLocalStorage(fieldId, field.value);
        if (hasActiveTabletSession()) {
          scheduleTabletSessionSync();
        }
      });
    }
  });
  
  // Add change listeners for contentEditable fields (use textContent, not value)
  const contentEditableFields = ['otherDetails', 'remarks'];
  contentEditableFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', () => {
        saveFieldToLocalStorage(fieldId, field.textContent);
        if (hasActiveTabletSession()) {
          scheduleTabletSessionSync();
        }
      });
    }
  });

  if (hasActiveTabletSession()) {
    scheduleTabletSessionSync({ immediate: true });
  }
});

// ============================================================
// 🔹 FETCH USERS FROM API
// ============================================================

async function loadUsers() {
  try {
    const params = new URLSearchParams({ factory: currentFactory });
    if (currentEquipment) params.set('equipment', currentEquipment);
    const response = await fetch(`${API_URL}/api/tablet/users?${params.toString()}`);
    const data = await response.json();
    
    if (data.success) {
      availableUsers = data.users;
      console.log(`✅ Loaded ${data.count} users for factory: ${currentFactory}, equipment: ${currentEquipment}`, availableUsers);
      
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
        option.value = user.fullName || user.username;
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
  } finally {
    // ✅ NOW subscribe to OPC variables with correct mappings loaded
    isEquipmentConfigLoaded = true;
    if (socket.connected) {
      console.log('📡 Subscribing to OPC variables with equipment-specific mappings...');
      const authData = localStorage.getItem('tabletAuth');
      const token = authData ? JSON.parse(authData).token : null;
      socket.emit('subscribe_variables', { company: currentCompany, token });
    }
  }
}

async function loadProductInfo() {
  // Don't load from URL parameter anymore
  // Product will be loaded when kenyokiRHKanban value comes in
  console.log('👁️ Waiting for kenyokiRHKanban value to load product info...');
}

// Load product info by kanbanID (called when kenyokiRHKanban value updates)
async function loadProductByKanbanID(kanbanId) {
  const normalizedKanban = normalizeKanbanValue(kanbanId);
  if (!normalizedKanban) {
    console.warn('⚠️ No kanbanID provided');
    return;
  }
  
  try {
    console.log(`📦 Fetching product for kanbanID: ${normalizedKanban}`);
    const product = await fetchValidatedProductByKanban(normalizedKanban);
    console.log('✅ Loaded product info:', product);
    applyProductContext(product, {
      kanbanId: normalizeKanbanValue(product.kanbanID) || normalizedKanban
    });
  } catch (error) {
    console.error('❌ Error loading product info:', error);
    clearCurrentProductContext();
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
  // Subscribe to OPC variables only if equipment config is already loaded
  // Otherwise, loadEquipmentConfig() will subscribe after loading
  if (isEquipmentConfigLoaded) {
    console.log('🔄 Reconnected - subscribing to OPC variables');
    const authData = localStorage.getItem('tabletAuth');
    const token = authData ? JSON.parse(authData).token : null;
    socket.emit('subscribe_variables', { company: currentCompany, token });
  }
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
  const observedKanbanValue = variables[kanbanVarName] !== undefined
    ? normalizeKanbanValue(variables[kanbanVarName].value)
    : null;

  if (observedKanbanValue !== latestObservedKanbanValue) {
    latestObservedKanbanValue = observedKanbanValue;
    console.log(`📊 ${kanbanVarName} raw value updated:`, observedKanbanValue);
    void handleObservedKanbanValue(observedKanbanValue);
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
    scheduleTabletSessionSync({ clear: true, immediate: true });
    
    // Re-check start button state after reset
    checkStartButtonState();
    
    // Expand basic settings card if collapsed (must happen BEFORE attention check)
    const basicSettingsCard = document.getElementById('basicSettingsCard');
    if (basicSettingsCard && basicSettingsCard.classList.contains('collapsed')) {
      basicSettingsCard.classList.remove('collapsed');
    }
    
    // Check basic settings attention state after reset (card is now expanded, so no wave)
    checkBasicSettingsAttention();
    
    // Hide inline info in ボタン card
    const inlineInfo = document.querySelector('.inline-info');
    if (inlineInfo) {
      inlineInfo.classList.remove('visible');
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
  if (document.getElementById('defectCard')?.classList.contains('defect-locked')) return;
  if (confirm('不良カウンターをリセットしますか？')) {
    document.querySelectorAll('.counter-number').forEach(counter => {
      counter.textContent = '0';
    });
    // Clear NG counter localStorage entries
    Object.keys(localStorage).filter(k => k.startsWith('tablet_ng_')).forEach(k => localStorage.removeItem(k));
    
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
  const sendButton = document.getElementById('sendDataButton');
  const poster1Select = document.getElementById('poster1');
  const startTimeInput = document.getElementById('startTime');
  
  if (!startButton || !poster1Select || !startTimeInput) {
    return;
  }

  if (sendButton) {
    if (startTimeInput.value !== '') {
      sendButton.classList.add('submit-ready');
    } else {
      sendButton.classList.remove('submit-ready');
    }
  }
  
  // Button is enabled ONLY when:
  // 1. kenyokiRHKanban has a valid value (not null, empty, null bytes, or known scanner noise)
  // 2. poster1 is selected
  // 3. startTime is empty (no value yet)
  const hasKanbanValue = isUsableKanbanValue(kenyokiRHKanbanValue);
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
    startButton.classList.add('start-ready');
    // Unlock scroll when button is enabled (user can now press start)
    document.body.classList.remove('scroll-locked');
    console.log('✅ Start button ENABLED, scroll unlocked');
  } else {
    // Disable button
    startButton.classList.add('disabled');
    startButton.classList.remove('start-ready');

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

  // Update defect counter lock state whenever kanban/poster1 changes
  updateDefectCounterState();
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
  scheduleTabletSessionSync({ immediate: true });
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

    // Check 作業数 (Work Count) — must be > 0
    const workCountInput = document.getElementById('workCount');
    const workCountValue = parseInt(workCountInput?.value) || 0;
    if (workCountValue === 0) {
      alert('作業数が 0 です。送信できません。\n\nWork count is 0. Cannot submit.\n\n作業開始後、OPC データが反映されてから送信してください。\nPlease wait for OPC data to update after starting work.');
      console.warn('⚠️ Validation failed - workCount is 0');
      return;
    }
    
    // Auto-set end time to current time
    const endTimeInput = document.getElementById('endTime');
    if (endTimeInput && !endTimeInput.value) {
      const nowEnd = new Date();
      const endHH = String(nowEnd.getHours()).padStart(2, '0');
      const endMM = String(nowEnd.getMinutes()).padStart(2, '0');
      endTimeInput.value = `${endHH}:${endMM}`;
      saveFieldToLocalStorage('endTime', endTimeInput.value);
      console.log('⏰ End time auto-set:', endTimeInput.value);
    }
    
    // Force recalculate work duration so manHours is up to date
    updateWorkDuration();

    const { kanbanId: resolvedKanbanID, product: resolvedProduct } = await resolveProductContextForSubmit();
    let resolvedProductId = resolvedProduct?.品番 || currentProductId || '';
    let resolvedProductName = resolvedProduct?.['製品名'] || currentProductName || '';

    if (resolvedProduct) {
      currentProductId = resolvedProductId;
      currentProductName = resolvedProductName;
      if (resolvedProductName) {
        localStorage.setItem('tablet_currentProductName', resolvedProductName);
      }
      persistLastKnownKanban(resolvedProduct.kanbanID || resolvedKanbanID);
      console.log('✅ Resolved product data from master before submit:', {
        kanbanID: resolvedProduct.kanbanID || resolvedKanbanID,
        品番: resolvedProductId,
        製品名: resolvedProductName
      });
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
      品番: resolvedProductId,
      製品名: resolvedProductName,
      kanbanID: resolvedKanbanID || '',
      hakoIresu: hakoIresuValue || 0,
      'LH/RH': document.getElementById('lhRh')?.value || '',
      '技能員①': poster1Value,
      '技能員②': document.getElementById('poster2')?.value || '',
      良品数: parseInt(document.getElementById('passCount')?.value) || 0,
      工数: parseFloat(document.getElementById('manHours')?.value) || 0,
      ...defectData,
      その他詳細: document.getElementById('otherDetails')?.textContent || '',
      開始時間: startTimeValue,
      終了時間: endTimeInput?.value || '',
      休憩時間: totalBreakHours || 0,
      機械トラブル時間: totalTroubleHours || 0,
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
    const tabletName = auth.tablet?.tabletName || auth.tabletName || '';
    
    // Submit to server with Authorization header
    const response = await fetch(`${API_URL}/api/tablet/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tablet-Name': encodeURIComponent(tabletName)
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
      
      // Clear all fields after successful submission, then fully reload to avoid stale UI state
      clearAllFields();
      window.location.reload();
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
    
    // Reset stopTime, endTime, poster1, poster2
    const stopTimeEl = document.getElementById('stopTime');
    if (stopTimeEl) { stopTimeEl.value = ''; }
    const endTimeEl = document.getElementById('endTime');
    if (endTimeEl) { endTimeEl.value = ''; }
    const poster1El = document.getElementById('poster1');
    if (poster1El) { poster1El.value = ''; }
    const poster2El = document.getElementById('poster2');
    if (poster2El) { poster2El.value = ''; }
    console.log('🔄 Reset stopTime, endTime, poster1, poster2');
    
    // Reset break/trouble hour accumulators
    totalBreakHours = 0;
    totalTroubleHours = 0;
    localStorage.removeItem('tablet_totalBreakHours');
    localStorage.removeItem('tablet_totalTroubleHours');
    console.log('🔄 Reset break/trouble time accumulators');
    
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
  const counterItems = document.querySelectorAll('.counter-item');
  let total = 0;
  counterItems.forEach(item => {
    const button = item.querySelector('.counter-button');
    const counterNumber = item.querySelector('.counter-number');
    if (!counterNumber) return;
    // Only add to total if countUp is not explicitly set to 'false'
    const countUp = !button || button.getAttribute('data-count-up') !== 'false';
    if (countUp) {
      total += parseInt(counterNumber.textContent) || 0;
    }
  });
  
  const defectSumDisplay = document.getElementById('defectSum');
  if (defectSumDisplay) {
    defectSumDisplay.textContent = total;
  }
  
  console.log('🔴 Total defects (countUp only):', total);
  
  // Update counter colors based on values
  updateDefectCounterColors();
  
  // Update pass count whenever defects change
  updatePassCount();
}

// Update counter display colors: black if 0, red if > 0
function updateDefectCounterColors() {
  const counterDisplays = document.querySelectorAll('.counter-display');
  counterDisplays.forEach(display => {
    const counterNumber = display.querySelector('.counter-number');
    if (counterNumber) {
      const value = parseInt(counterNumber.textContent) || 0;
      display.style.color = value > 0 ? '#c62828' : '#424242';
    }
  });
}

// Lock/unlock defect counters based on conditions
function updateDefectCounterState() {
  const defectCard = document.getElementById('defectCard');
  if (!defectCard) return;

  const poster1 = document.getElementById('poster1');
  const poster1Empty = !poster1 || poster1.value === '';

  const noKanban = !isUsableKanbanValue(kenyokiRHKanbanValue);
  const breakActive = breakStartTime !== null;
  const troubleActive = troubleStartTime !== null;

  if (noKanban || poster1Empty || breakActive || troubleActive) {
    defectCard.classList.add('defect-locked');
    console.log('🔒 Defect counters locked:', { noKanban, poster1Empty, breakActive, troubleActive });
  } else {
    defectCard.classList.remove('defect-locked');
    console.log('🔓 Defect counters unlocked');
  }
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

  if (hasActiveTabletSession()) {
    scheduleTabletSessionSync();
  }
}

// ============================================================
// 🔹 DYNAMIC NG BUTTONS
// ============================================================

// Color helper utilities
function _hexToRgb(hex) {
  const h = (hex || '#f44336').replace('#', '');
  if (h.length !== 6) return { r: 244, g: 67, b: 54 };
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}
function _mixWithWhite(hex, ratio) {
  const { r, g, b } = _hexToRgb(hex);
  return `rgb(${Math.round(r * ratio + 255 * (1 - ratio))},${Math.round(g * ratio + 255 * (1 - ratio))},${Math.round(b * ratio + 255 * (1 - ratio))})`;
}
function _darkenColor(hex, ratio) {
  const { r, g, b } = _hexToRgb(hex);
  return `rgb(${Math.round(r * ratio)},${Math.round(g * ratio)},${Math.round(b * ratio)})`;
}

// Render NG buttons dynamically from the product's assigned NG group
function renderNGButtons(ngGroup) {
  currentNGGroup = ngGroup;
  const container = document.getElementById('ngButtonsContainer');
  if (!container) return;

  if (!ngGroup || !ngGroup.items || ngGroup.items.length === 0) {
    container.innerHTML = '<p style="color:#bdbdbd;font-size:13px;padding:8px;grid-column:1/-1;">不良グループが割り当てられていません</p>';
    updateDefectSum();
    return;
  }

  container.innerHTML = ngGroup.items.map((item, index) => {
    const color = item.color || '#f44336';
    const countUp = item.countUp !== false;
    const defectName = item.name || `NG_${index}`;
    const savedCount = localStorage.getItem(`tablet_ng_${defectName}`) || '0';

    const bgColor  = _mixWithWhite(color, 0.18);
    const bdColor  = _mixWithWhite(color, 0.50);
    const txtColor = _darkenColor(color, 0.65);

    return `
      <div class="counter-item">
        <div class="counter-display">
          <span class="counter-number">${savedCount}</span>
        </div>
        <div class="counter-button"
             data-defect="${defectName.replace(/"/g, '&quot;')}"
             data-count-up="${countUp}"
             style="background:${bgColor};border-color:${bdColor};color:${txtColor};">
          ${defectName}
        </div>
      </div>
    `;
  }).join('');

  attachNGButtonListeners();
  updateDefectSum();
  console.log(`🔴 Rendered ${ngGroup.items.length} NG buttons (group: ${ngGroup.groupName})`);
}

// Attach click handlers to dynamically rendered NG buttons
function attachNGButtonListeners() {
  const container = document.getElementById('ngButtonsContainer');
  if (!container) return;

  container.querySelectorAll('.counter-button').forEach(button => {
    // Compute hover background (slightly more saturated than normal)
    const normalBg = button.style.background;
    const hoverBg  = button.style.borderColor || normalBg;

    button.addEventListener('mouseenter', () => { button.style.background = hoverBg; });
    button.addEventListener('mouseleave', () => { button.style.background = normalBg; });
    button.addEventListener('mousedown',  () => { button.style.background = hoverBg; });

    button.addEventListener('click', function () {
      if (document.getElementById('defectCard')?.classList.contains('defect-locked')) return;
      const counterDisplay = this.previousElementSibling;
      const counterNumber = counterDisplay.querySelector('.counter-number');
      const currentCount = parseInt(counterNumber.textContent);
      counterNumber.textContent = currentCount + 1;
      const defectName = this.getAttribute('data-defect');
      localStorage.setItem(`tablet_ng_${defectName}`, currentCount + 1);
      updateDefectSum();
    });
  });

  container.querySelectorAll('.counter-display').forEach(display => {
    display.addEventListener('click', function () {
      if (document.getElementById('defectCard')?.classList.contains('defect-locked')) return;
      const counterNumber = this.querySelector('.counter-number');
      const currentCount = parseInt(counterNumber.textContent);
      if (currentCount > 0) {
        counterNumber.textContent = currentCount - 1;
        const button = this.nextElementSibling;
        const defectName = button?.getAttribute('data-defect');
        if (defectName) localStorage.setItem(`tablet_ng_${defectName}`, currentCount - 1);
        updateDefectSum();
      }
    });
  });
}
