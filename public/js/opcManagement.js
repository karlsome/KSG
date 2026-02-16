// OPC Management JavaScript
// Handles real-time data display, variable creation, and data conversion

// Language change listener - reload UI when language changes
window.addEventListener('languageChanged', () => {
    // Update page title
    const titleEl = document.getElementById('opcManagementTitle');
    if (titleEl) titleEl.textContent = t('opcManagement.title');
    
    // Reload data displays if they exist
    if (window.opcManagementState && window.opcManagementState.rawDataCache && Object.keys(window.opcManagementState.rawDataCache).length > 0) {
        renderRealTimeData(window.opcManagementState.rawDataCache);
    }
    
    // Reload variables display
    if (window.opcManagementState && window.opcManagementState.variablesCache && window.opcManagementState.variablesCache.length > 0) {
        renderVariables(window.opcManagementState.variablesCache);
    }
    
    // Update connection status
    if (window.opcSocket && window.opcSocket.connected) {
        updateConnectionStatus(true);
    } else {
        updateConnectionStatus(false);
    }
});

// Use window scope to avoid redeclaration errors on page reload
if (typeof window.opcManagementState === 'undefined') {
    window.opcManagementState = {
        currentRaspberryId: null,
        rawDataCache: {},
        allDevicesDataCache: {}, // Stores data from all devices for variable updates
        variablesCache: [],
        selectedVariablesForCombine: [],
        currentConversionData: null
    };
}

// Shorthand references for cleaner code
let currentRaspberryId, rawDataCache, allDevicesDataCache, variablesCache, selectedVariablesForCombine, currentConversionData;

function initOpcState() {
    currentRaspberryId = window.opcManagementState.currentRaspberryId;
    rawDataCache = window.opcManagementState.rawDataCache;
    allDevicesDataCache = window.opcManagementState.allDevicesDataCache;
    variablesCache = window.opcManagementState.variablesCache;
    selectedVariablesForCombine = window.opcManagementState.selectedVariablesForCombine;
    currentConversionData = window.opcManagementState.currentConversionData;
}

// Get company from localStorage
//const COMPANY = localStorage.getItem('company') || 'sasaki';
//const API_URL = 'http://localhost:3000';

// Note: initializeOPCManagement() is called directly from index.html after script load

async function initializeOPCManagement() {
    try {
        // Initialize state references
        initOpcState();
        
        // Load Raspberry Pis
        await loadRaspberryPis();
        
        // Load existing variables
        await loadVariables();
        
        // Load data from all devices for variable updates
        await loadAllDevicesData();
        
        // Check if there's a previously selected device and auto-select it
        const lastSelectedDevice = localStorage.getItem('opcLastSelectedDevice');
        if (lastSelectedDevice) {
            const select = document.getElementById('opc-raspberry-filter');
            if (select) {
                select.value = lastSelectedDevice;
                // Trigger change to load data
                await handleRaspberryChange({ target: select });
            }
        }
        
        // Initialize WebSocket
        initializeWebSocket();
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Failed to initialize OPC Management:', error);
        showNotification(t('opcManagement.failedToInitialize'), 'error');
    }
}

// Load Raspberry Pis into dropdown
async function loadRaspberryPis() {
    try {
        const response = await fetch(`${API_URL}/api/deviceInfo?company=${COMPANY}`);
        const data = await response.json();
        
        const select = document.getElementById('opc-raspberry-filter');
        if (!select) {
            console.error('Raspberry Pi filter select element not found');
            return;
        }
        
        select.innerHTML = `<option value="">${t('opcManagement.selectRaspberryPi')}</option>`;
        
        if (data.success && data.devices) {
            data.devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.device_id;
                option.textContent = device.device_name || device.device_id;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading Raspberry Pis:', error);
    }
}

// Load data from all devices for variable updates
async function loadAllDevicesData() {
    try {
        const response = await fetch(`${API_URL}/api/deviceInfo?company=${COMPANY}`);
        const data = await response.json();
        
        if (data.success && data.devices) {
            // Load data for each device
            for (const device of data.devices) {
                try {
                    const dataResponse = await fetch(`${API_URL}/api/deviceInfo/${device.device_id}/opcua-data?company=${COMPANY}`);
                    const deviceData = await dataResponse.json();
                    
                    if (deviceData.success) {
                        window.opcManagementState.allDevicesDataCache[device.device_id] = deviceData;
                        allDevicesDataCache[device.device_id] = deviceData;
                    }
                } catch (error) {
                    console.error(`Error loading data for device ${device.device_id}:`, error);
                }
            }
            
            // Update variable values after loading all device data
            updateVariableValues();
        }
    } catch (error) {
        console.error('Error loading all devices data:', error);
    }
}

// Initialize WebSocket connection
function initializeWebSocket() {
    // Reuse existing socket if available, otherwise create new one
    if (typeof window.opcSocket === 'undefined' || !window.opcSocket || !window.opcSocket.connected) {
        window.opcSocket = io(API_URL);
        
        window.opcSocket.on('connect', () => {
            console.log('WebSocket connected');
            updateConnectionStatus(true);
            
            // Join company room
            window.opcSocket.emit('join', { room: `opcua_${COMPANY}` });
        });
        
        window.opcSocket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus(false);
        });
        
        // Listen for real-time OPC UA data updates
        window.opcSocket.on('opcua_data_update', (data) => {
            console.log('📡 Received real-time data update:', data);
            handleRealtimeData(data);
        });
        
        // Listen for discovered nodes updates (for admin page conversions)
        window.opcSocket.on('opcua_discovered_nodes_update', (data) => {
            console.log('🔍 Received discovered nodes update:', data);
            handleDiscoveredNodesUpdate(data);
        });
    } else {
        // Socket already exists and is connected
        updateConnectionStatus(window.opcSocket.connected);
        // Re-join company room
        window.opcSocket.emit('join', { room: `opcua_${COMPANY}` });
    }
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('opc-connection-status');
    if (!statusEl) return; // Element not yet in DOM
    
    if (connected) {
        statusEl.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-sm font-medium text-green-700">${t('opcManagement.connected')}</span>
        `;
        statusEl.className = 'flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50';
    } else {
        statusEl.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-red-500"></span>
            <span class="text-sm font-medium text-red-700">${t('opcManagement.disconnected')}</span>
        `;
        statusEl.className = 'flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Raspberry Pi selection
    const filterSelect = document.getElementById('opc-raspberry-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', handleRaspberryChange);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (currentRaspberryId) {
                loadRealTimeData(currentRaspberryId);
            }
        });
    }
    
    // Conversion form
    const conversionForm = document.getElementById('opc-conversion-form');
    if (conversionForm) {
        conversionForm.addEventListener('submit', handleConversionSubmit);
    }
    
    // Combine form
    const combineForm = document.getElementById('opc-combine-form');
    if (combineForm) {
        combineForm.addEventListener('submit', handleCombineSubmit);
    }
    
    // Edit variable form
    const editForm = document.getElementById('opc-edit-variable-form');
    if (editForm) {
        editForm.addEventListener('submit', handleEditVariableSubmit);
    }
}

// Handle Raspberry Pi selection change
async function handleRaspberryChange(e) {
    currentRaspberryId = e.target.value;
    window.opcManagementState.currentRaspberryId = currentRaspberryId;
    
    if (currentRaspberryId) {
        // Save to localStorage for persistence across page reloads
        localStorage.setItem('opcLastSelectedDevice', currentRaspberryId);
        await loadRealTimeData(currentRaspberryId);
    } else {
        localStorage.removeItem('opcLastSelectedDevice');
        clearDataDisplay();
    }
}

// Load real-time data for selected Raspberry Pi
async function loadRealTimeData(deviceId) {
    try {
        const response = await fetch(`${API_URL}/api/deviceInfo/${deviceId}/opcua-data?company=${COMPANY}`);
        const data = await response.json();
        
        if (data.success) {
            window.opcManagementState.rawDataCache = data;
            rawDataCache = data;
            renderRealTimeData(data);
        } else {
            showNotification(t('opcManagement.failedToLoadData') + ': ' + (data.error || t('opcManagement.unknown')), 'error');
        }
        
    } catch (error) {
        console.error('Error loading real-time data:', error);
        showNotification(t('opcManagement.failedToLoadData'), 'error');
    }
}

// Handle real-time WebSocket data
function handleRealtimeData(data) {
    const deviceId = data.device_id || data.raspberryId;
    
    // Update allDevicesDataCache for this device (for variable updates)
    if (deviceId && window.opcManagementState.allDevicesDataCache[deviceId]) {
        const deviceCache = window.opcManagementState.allDevicesDataCache[deviceId];
        if (deviceCache.datapoints && data.data && Array.isArray(data.data)) {
            data.data.forEach(update => {
                const dpIndex = deviceCache.datapoints.findIndex(dp => 
                    dp._id.toString() === update.datapointId || dp.opcNodeId === update.opcNodeId
                );
                if (dpIndex !== -1) {
                    deviceCache.datapoints[dpIndex].value = update.value;
                    deviceCache.datapoints[dpIndex].quality = update.quality;
                    deviceCache.datapoints[dpIndex].timestamp = update.timestamp;
                }
            });
        }
    }
    
    // Update rawDataCache if this is the currently selected device (for Real-Time Data table)
    if (deviceId === currentRaspberryId) {
        if (window.opcManagementState.rawDataCache && window.opcManagementState.rawDataCache.datapoints) {
            const updatedData = window.opcManagementState.rawDataCache;
            if (data.data && Array.isArray(data.data)) {
                data.data.forEach(update => {
                    const dpIndex = updatedData.datapoints.findIndex(dp => 
                        dp._id.toString() === update.datapointId || dp.opcNodeId === update.opcNodeId
                    );
                    if (dpIndex !== -1) {
                        updatedData.datapoints[dpIndex].value = update.value;
                        updatedData.datapoints[dpIndex].quality = update.quality;
                        updatedData.datapoints[dpIndex].timestamp = update.timestamp;
                    }
                });
            }
            renderRealTimeData(updatedData);
        }
    }
    
    // Update variable values regardless of selected device
    updateVariableValues();
}

// Handle discovered nodes updates from WebSocket
function handleDiscoveredNodesUpdate(data) {
    const raspberryId = data.raspberryId;
    const updates = data.nodes || data.updates; // Support both field names
    
    console.log(`🔄 Updating discovered nodes for device ${raspberryId}:`, updates);
    
    if (!updates || !Array.isArray(updates)) {
        console.warn('⚠️  No updates received');
        return;
    }
    
    // Update allDevicesDataCache with discovered node values
    if (raspberryId && window.opcManagementState.allDevicesDataCache[raspberryId]) {
        const deviceCache = window.opcManagementState.allDevicesDataCache[raspberryId];
        
        // Update datapoints cache (HTTP response stores data under 'datapoints')
        if (deviceCache.datapoints && Array.isArray(updates)) {
            updates.forEach(update => {
                const dpIndex = deviceCache.datapoints.findIndex(dp => 
                    dp.opcNodeId === update.opcNodeId
                );
                if (dpIndex !== -1) {
                    deviceCache.datapoints[dpIndex].value = update.value;
                    deviceCache.datapoints[dpIndex].timestamp = update.updatedAt || new Date().toISOString();
                    console.log(`  ✅ Updated datapoint ${update.opcNodeId}:`, update.value);
                } else {
                    console.warn(`  ⚠️  Node not found in cache: ${update.opcNodeId}`);
                }
            });
        } else {
            console.warn('⚠️  No datapoints cache found for device', raspberryId);
        }
    } else {
        console.warn('⚠️  Device cache not found for', raspberryId);
    }
    
    // Also update rawDataCache if this is the currently selected device (for Real-Time Data table)
    if (raspberryId === window.opcManagementState.currentRaspberryId) {
        if (window.opcManagementState.rawDataCache && window.opcManagementState.rawDataCache.datapoints) {
            updates.forEach(update => {
                const dpIndex = window.opcManagementState.rawDataCache.datapoints.findIndex(dp => 
                    dp.opcNodeId === update.opcNodeId
                );
                if (dpIndex !== -1) {
                    window.opcManagementState.rawDataCache.datapoints[dpIndex].value = update.value;
                    window.opcManagementState.rawDataCache.datapoints[dpIndex].timestamp = update.updatedAt || new Date().toISOString();
                }
            });
            // Re-render the Real-Time Data table
            renderRealTimeData(window.opcManagementState.rawDataCache);
        }
    }
    
    // Recalculate all variable conversions with the new values
    updateVariableValues();
    
    console.log('✅ Discovered nodes updated, variables recalculated');
}


// Render real-time data in the left panel
function renderRealTimeData(data) {
    const container = document.getElementById('opc-raw-data-container');
    
    if (!data.datapoints || data.datapoints.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="ri-inbox-line text-5xl mb-4"></i>
                <p class="text-lg">${t('opcManagement.selectDeviceToView')}</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.variableName')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.opcNodeId')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.type')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.currentValue')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.quality')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.lastUpdated')}</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    const now = new Date();
    
    data.datapoints.forEach(dp => {
        const isArray = Array.isArray(dp.value);
        const displayValue = isArray ? `[${dp.value.length} ${t('common.items')}]` : dp.value;
        const dpDataStr = JSON.stringify(dp).replace(/"/g, '&quot;');
        
        // Parse timestamp correctly from UTC and display in local timezone
        let timestampStr = 'N/A';
        let ageSeconds = 0;
        let isStale = false;
        let ageDisplay = '';
        
        if (dp.timestamp) {
            // Parse the UTC timestamp
            const timestamp = new Date(dp.timestamp);
            // Display in user's local timezone
            timestampStr = timestamp.toLocaleString();
            
            // Calculate age based on UTC time
            ageSeconds = Math.floor((now - timestamp) / 1000);
            isStale = ageSeconds > 60; // Stale if older than 60 seconds
            
            if (isStale) {
                const ageMinutes = Math.floor(ageSeconds / 60);
                if (ageMinutes < 60) {
                    ageDisplay = ` <span class="text-orange-600 text-xs font-medium">⚠️ ${ageMinutes}m ago</span>`;
                } else {
                    const ageHours = Math.floor(ageMinutes / 60);
                    ageDisplay = ` <span class="text-red-600 text-xs font-medium">⚠️ ${ageHours}h ago</span>`;
                }
            }
        }
        
        // Quality badge
        const quality = dp.quality || t('opcManagement.unknown');
        let qualityBadge = '';
        if (quality === 'Good' || quality === t('opcManagement.good')) {
            qualityBadge = `<span class="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">${t('opcManagement.good')}</span>`;
        } else if (quality === 'Bad' || quality === t('opcManagement.bad')) {
            qualityBadge = `<span class="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700">${t('opcManagement.bad')}</span>`;
        } else if (quality === 'Uncertain') {
            qualityBadge = '<span class="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-700">Uncertain</span>';
        } else {
            qualityBadge = `<span class="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-700">${t('opcManagement.unknown')}</span>`;
        }
        
        // Apply styling for bad quality or stale data
        let valueClass = 'font-mono text-sm font-semibold';
        if (quality === 'Bad') {
            valueClass += ' text-red-600';
        } else if (quality === 'Uncertain') {
            valueClass += ' text-yellow-700';
        } else if (isStale) {
            valueClass += ' text-orange-600';
        } else {
            valueClass += ' text-gray-900';
        }
        
        html += `
            <tr onclick='showDataDetailModal(${dpDataStr})' 
                class="hover:bg-blue-50 cursor-pointer transition-colors">
                <td class="px-4 py-3">
                    <div class="font-medium text-gray-900">${dp.name || dp.opcNodeId}</div>
                </td>
                <td class="px-4 py-3">
                    <code class="text-xs text-gray-600">${dp.opcNodeId}</code>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs rounded ${isArray ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}">
                        ${isArray ? 'Array' : 'Single'}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <span class="${valueClass}">${displayValue}</span>
                </td>
                <td class="px-4 py-3">${qualityBadge}</td>
                <td class="px-4 py-3">
                    <span class="text-xs text-gray-500">${timestampStr}${ageDisplay}</span>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

// Global variable to track last viewed datapoint for modal flow
let lastViewedDatapoint = null;

// Show data detail modal
function showDataDetailModal(datapoint) {
    lastViewedDatapoint = datapoint;
    
    const isArray = Array.isArray(datapoint.value);
    const timestamp = new Date(datapoint.timestamp || Date.now()).toLocaleString();
    
    // Format value display
    let valueDisplay = '';
    if (isArray) {
        valueDisplay = `
            <div class="max-h-60 overflow-y-auto bg-gray-50 p-3 rounded">
                <div class="font-mono text-sm space-y-1">
                    ${datapoint.value.map((val, idx) => `
                        <div class="flex items-center justify-between p-2 hover:bg-blue-100 rounded cursor-pointer transition-colors"
                             onclick="createVariableFromArrayItem(${idx}, ${JSON.stringify(val).replace(/"/g, '&quot;')})">
                            <span><strong>[${idx}]:</strong> ${val}</span>
                            <button class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                                <i class="ri-add-line"></i> Create
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        valueDisplay = `<div class="font-mono text-lg font-semibold text-gray-900">${datapoint.value}</div>`;
    }
    
    const modalHtml = `
        <div id="dataDetailModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between p-6 border-b">
                    <h2 class="text-2xl font-semibold flex items-center">
                        <i class="ri-database-2-line mr-3"></i>
                        Data Details
                    </h2>
                    <button onclick="closeDataDetailModal()" class="text-gray-500 hover:text-gray-700 transition-colors">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
                
                <div class="p-6 space-y-6">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Variable Name</label>
                            <div class="font-semibold text-gray-900">${datapoint.name || datapoint.opcNodeId}</div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Raspberry Pi ID</label>
                            <div class="font-mono text-sm">${datapoint.raspberryId || currentRaspberryId}</div>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase mb-1">OPC Node ID</label>
                        <code class="block bg-gray-100 px-3 py-2 rounded font-mono text-sm">${datapoint.opcNodeId}</code>
                    </div>
                    
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Data Type</label>
                            <span class="inline-block px-2 py-1 text-sm rounded bg-blue-100 text-blue-700">${datapoint.dataType || 'unknown'}</span>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Namespace</label>
                            <div class="font-mono text-sm">${datapoint.namespace || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Type</label>
                            <span class="inline-block px-2 py-1 text-sm rounded ${isArray ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}">
                                ${isArray ? `Array [${datapoint.value.length}]` : 'Single'}
                            </span>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase mb-2">Current Value</label>
                        ${valueDisplay}
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Last Updated</label>
                            <div class="text-sm text-gray-700">${timestamp}</div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 uppercase mb-1">Discovered At</label>
                            <div class="text-sm text-gray-700">${datapoint.discoveredAt ? new Date(datapoint.discoveredAt).toLocaleString() : 'N/A'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end gap-3 p-6 border-t bg-gray-50">
                    <button onclick="closeDataDetailModal()" 
                        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                        Close
                    </button>
                    ${isArray ? 
                        `<button disabled 
                            class="px-6 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed flex items-center opacity-60">
                            <i class="ri-add-circle-line mr-2"></i>
                            Create Variable (Use array items below)
                        </button>` 
                        : 
                        `<button onclick="createVariableFromDetail()" 
                            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
                            <i class="ri-add-circle-line mr-2"></i>
                            Create Variable
                        </button>`
                    }
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeDataDetailModal() {
    const modal = document.getElementById('dataDetailModal');
    if (modal) modal.remove();
}

function createVariableFromArrayItem(arrayIndex, value) {
    console.log('createVariableFromArrayItem called with index:', arrayIndex, 'value:', value);
    
    if (!lastViewedDatapoint) {
        console.error('No lastViewedDatapoint available');
        return;
    }
    
    const dp = lastViewedDatapoint;
    
    // Close detail modal
    closeDataDetailModal();
    
    // Open conversion modal with array index
    setTimeout(() => {
        console.log('Opening conversion modal for array item:', {
            id: dp._id,
            arrayIndex: arrayIndex,
            value: value,
            name: `${dp.name || dp.opcNodeId}[${arrayIndex}]`
        });
        openConversionModal(dp._id, arrayIndex, value, `${dp.name || dp.opcNodeId}[${arrayIndex}]`, dp.opcNodeId);
    }, 100);
}

function createVariableFromArrayItem(arrayIndex, value) {
    console.log('createVariableFromArrayItem called with index:', arrayIndex, 'value:', value);
    
    if (!lastViewedDatapoint) {
        console.error('No lastViewedDatapoint available');
        return;
    }
    
    const dp = lastViewedDatapoint;
    
    // Close detail modal
    closeDataDetailModal();
    
    // Open conversion modal with array index
    setTimeout(() => {
        console.log('Opening conversion modal for array item:', {
            id: dp._id,
            arrayIndex: arrayIndex,
            value: value,
            name: `${dp.name || dp.opcNodeId}[${arrayIndex}]`
        });
        openConversionModal(dp._id, arrayIndex, value, `${dp.name || dp.opcNodeId}[${arrayIndex}]`, dp.opcNodeId);
    }, 100);
}

function createVariableFromDetail() {
    console.log('createVariableFromDetail called');
    console.log('lastViewedDatapoint:', lastViewedDatapoint);
    
    if (!lastViewedDatapoint) {
        console.log('No lastViewedDatapoint, returning');
        return;
    }
    
    const dp = lastViewedDatapoint;
    console.log('Datapoint data:', dp);
    
    // Close detail modal first
    console.log('Closing detail modal');
    closeDataDetailModal();
    
    // Wait a moment for DOM to update, then open conversion modal
    setTimeout(() => {
        console.log('Opening conversion modal with:', {
            id: dp._id,
            value: dp.value,
            name: dp.name || dp.opcNodeId
        });
        openConversionModal(dp._id, null, dp.value, dp.name || dp.opcNodeId, dp.opcNodeId);
    }, 100);
}

// Open conversion modal
function openConversionModal(datapointId, arrayIndex, rawValue, datapointName, opcNodeId) {
    console.log('openConversionModal called with:', { datapointId, arrayIndex, rawValue, datapointName, opcNodeId });
    
    currentConversionData = {
        datapointId,
        arrayIndex,
        rawValue,
        datapointName,
        opcNodeId
    };
    
    console.log('currentConversionData set:', currentConversionData);
    
    // Set modal content
    const convDatapointName = document.getElementById('conv-datapoint-name');
    const convRawValue = document.getElementById('conv-raw-value');
    const convArrayIndexRow = document.getElementById('conv-array-index-row');
    const convArrayIndex = document.getElementById('conv-array-index');
    const convForm = document.getElementById('opc-conversion-form');
    const convPreview = document.getElementById('conv-preview');
    const convModal = document.getElementById('opc-conversion-modal');
    
    console.log('Modal elements found:', {
        convDatapointName: !!convDatapointName,
        convRawValue: !!convRawValue,
        convArrayIndexRow: !!convArrayIndexRow,
        convArrayIndex: !!convArrayIndex,
        convForm: !!convForm,
        convPreview: !!convPreview,
        convModal: !!convModal
    });
    
    if (convDatapointName) convDatapointName.textContent = datapointName;
    if (convRawValue) convRawValue.textContent = Array.isArray(rawValue) ? JSON.stringify(rawValue) : rawValue;
    
    if (arrayIndex !== null) {
        if (convArrayIndexRow) convArrayIndexRow.style.display = 'flex';
        if (convArrayIndex) convArrayIndex.textContent = `[${arrayIndex}]`;
    } else {
        if (convArrayIndexRow) convArrayIndexRow.style.display = 'none';
    }
    
    // Reset form
    if (convForm) convForm.reset();
    if (convPreview) convPreview.style.display = 'none';
    
    // Show modal
    if (convModal) {
        console.log('Showing conversion modal');
        convModal.classList.remove('hidden');
    } else {
        console.error('Conversion modal element not found!');
    }
}

// Update conversion preview
function updateConversionPreview() {
    const convFromType = document.getElementById('conv-from-type').value;
    const convToType = document.getElementById('conv-to-type').value;
    
    if (!convFromType || !convToType || !currentConversionData) return;
    
    const rawValue = currentConversionData.rawValue;
    const converted = applyConversion(rawValue, convFromType, convToType);
    
    document.getElementById('conv-preview-value').textContent = converted;
    document.getElementById('conv-preview').style.display = 'block';
}

// Update edit conversion preview
function updateEditConversionPreview() {
    const convFromType = document.getElementById('edit-conv-from-type').value;
    const convToType = document.getElementById('edit-conv-to-type').value;
    
    console.log('🔄 Updating edit conversion preview:', { convFromType, convToType });
    
    if (!convFromType || !convToType) {
        document.getElementById('edit-conv-preview').style.display = 'none';
        return;
    }
    
    // Get the variable being edited
    const variableId = document.getElementById('edit-variable-id').value;
    const variable = variablesCache.find(v => v._id === variableId);
    
    if (!variable) {
        document.getElementById('edit-conv-preview').style.display = 'none';
        return;
    }
    
    // Get the raw value from the source information display
    const rawValueElement = document.getElementById('edit-source-raw-value');
    const rawValue = rawValueElement ? rawValueElement.textContent : null;
    
    console.log('📊 Raw value for preview:', rawValue);
    
    if (!rawValue || rawValue === '-' || rawValue === 'No data available' || rawValue === 'Error getting value') {
        document.getElementById('edit-conv-preview-value').textContent = 'No data available';
        document.getElementById('edit-conv-preview').style.display = 'block';
        return;
    }
    
    try {
        // Apply conversion to the raw value
        const convertedValue = applyConversion(rawValue, convFromType, convToType);
        document.getElementById('edit-conv-preview-value').textContent = convertedValue;
        document.getElementById('edit-conv-preview').style.display = 'block';
        
        console.log('✅ Conversion preview updated:', { rawValue, convertedValue });
    } catch (error) {
        console.error('❌ Error in conversion preview:', error);
        document.getElementById('edit-conv-preview-value').textContent = 'Conversion error';
        document.getElementById('edit-conv-preview').style.display = 'block';
    }
}


// Apply conversion to a value
function applyConversion(value, fromType, toType) {
    // Step 1: Parse value based on fromType
    let numValue;
    
    switch (fromType) {
        case 'uint16':
        case 'uint8':
        case 'uint32':
        case 'int16':
        case 'int8':
        case 'int32':
            numValue = parseInt(value);
            break;
        case 'hex16':
        case 'hex8':
            numValue = parseInt(value, 16);
            break;
        case 'binary16':
        case 'binary8':
        case 'binary4':
            numValue = parseInt(value, 2);
            break;
        case 'float32':
        case 'double64':
            numValue = parseFloat(value);
            break;
        default:
            numValue = parseInt(value);
    }
    
    // Step 2: Convert to target format
    switch (toType) {
        case 'uint16':
            return (numValue & 0xFFFF).toString();
        case 'uint8':
            return (numValue & 0xFF).toString();
        case 'uint32':
            return (numValue >>> 0).toString();
        case 'int16':
            return (numValue << 16 >> 16).toString();
        case 'int8':
            return (numValue << 24 >> 24).toString();
        case 'int32':
            return (numValue | 0).toString();
        case 'hex16':
            return '0x' + (numValue & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
        case 'hex8':
            return '0x' + (numValue & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        case 'binary16':
            return (numValue & 0xFFFF).toString(2).padStart(16, '0');
        case 'binary8':
            return (numValue & 0xFF).toString(2).padStart(8, '0');
        case 'binary4':
            return (numValue & 0xF).toString(2).padStart(4, '0');
        case 'ascii2':
            const high = (numValue >> 8) & 0xFF;
            const low = numValue & 0xFF;
            return String.fromCharCode(high) + String.fromCharCode(low);
        case 'ascii1':
            return String.fromCharCode(numValue & 0xFF);
        case 'float32':
            return parseFloat(numValue).toFixed(6);
        case 'double64':
            return parseFloat(numValue).toFixed(12);
        case 'string':
            return numValue.toString();
        case 'none':
        default:
            return value.toString();
    }
}

// Handle conversion form submission
async function handleConversionSubmit(e) {
    e.preventDefault();
    
    const variableName = document.getElementById('conv-variable-name').value;
    const convFromType = document.getElementById('conv-from-type').value;
    const convToType = document.getElementById('conv-to-type').value;
    
    const payload = {
        company: COMPANY,
        variableName,
        sourceType: currentConversionData.arrayIndex !== null ? 'array' : 'single',
        datapointId: currentConversionData.datapointId,
        opcNodeId: currentConversionData.opcNodeId, // Store for stable matching
        raspberryId: currentRaspberryId, // Remember source device
        arrayIndex: currentConversionData.arrayIndex,
        conversionFromType: convFromType,
        conversionToType: convToType,
        conversionType: convToType, // For backward compatibility
        createdBy: localStorage.getItem('username') || 'admin'
    };
    
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(t('opcManagement.variableCreatedSuccess'), 'success');
            closeOPCModal('opc-conversion-modal');
            await loadVariables();
            
            // Reopen detail modal if it was opened from there
            if (lastViewedDatapoint) {
                setTimeout(() => showDataDetailModal(lastViewedDatapoint), 100);
            }
        } else {
            showNotification(data.message || t('opcManagement.variableCreatedFail'), 'error');
        }
    } catch (error) {
        console.error('Error creating variable:', error);
        showNotification(t('opcManagement.variableCreatedFail'), 'error');
    }
}

// Load all variables
async function loadVariables() {
    try {
        console.log('🔄 Loading variables from server...');
        const response = await fetch(`${API_URL}/api/opcua/conversions?company=${COMPANY}`);
        const data = await response.json();
        
        variablesCache = data.conversions || [];
        
        console.log('📊 Loaded variables count:', variablesCache.length);
        
        // Debug specific combined variables
        const combinedVars = variablesCache.filter(v => v.sourceType === 'combined');
        console.log('🔗 Combined variables loaded:', combinedVars.map(v => ({
            name: v.variableName,
            sourceVariables: v.sourceVariables,
            operation: v.operation
        })));
        
        renderVariables();
        updateVariableValues();
        
    } catch (error) {
        console.error('Error loading variables:', error);
    }
}

// Render variables in right panel
function renderVariables() {
    const container = document.getElementById('opc-variables-container');
    
    if (variablesCache.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="ri-price-tag-3-line text-5xl mb-4"></i>
                <p class="text-lg">${t('opcManagement.noVariablesCreated')}</p>
                <p class="text-sm mt-2">${t('opcManagement.clickDataToCreate')}</p>
            </div>
        `;
        return;
    }
    
    const now = new Date();
    
    let html = `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.variableName')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.currentValue')}</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t('opcManagement.status')}</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">${t('opcManagement.actions')}</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    variablesCache.forEach(variable => {
        const value = variable.currentValue !== undefined ? variable.currentValue : '-';
        
        // Get device name and variable name from allDevicesDataCache
        let deviceDisplay = '';
        let sourceVariableName = variable.datapointName || variable.opcNodeId || variable.datapointId;
        let quality = variable.quality || t('opcManagement.unknown');
        let dataTimestamp = variable.timestamp || null;
        
        if (variable.raspberryId && allDevicesDataCache[variable.raspberryId]) {
            const deviceCache = allDevicesDataCache[variable.raspberryId];
            const deviceInfo = deviceCache.device;
            deviceDisplay = deviceInfo ? (deviceInfo.device_name || variable.raspberryId) : variable.raspberryId;
            
            // Find the actual variable name from datapoints
            // Try to match by opcNodeId first (stable), then fall back to datapointId
            if (deviceCache.datapoints) {
                let datapoint = null;
                
                // Try opcNodeId first (stable across restarts)
                if (variable.opcNodeId) {
                    datapoint = deviceCache.datapoints.find(dp => 
                        dp.opcNodeId === variable.opcNodeId
                    );
                }
                
                // Fall back to datapointId
                if (!datapoint && variable.datapointId) {
                    datapoint = deviceCache.datapoints.find(dp => 
                        dp._id && dp._id.toString() === variable.datapointId.toString()
                    );
                }
                
                if (datapoint) {
                    // Use the actual variable name (e.g., "example5"), not the OPC Node ID
                    sourceVariableName = datapoint.name || datapoint.opcNodeId;
                    quality = datapoint.quality || quality;
                    dataTimestamp = datapoint.timestamp || dataTimestamp;
                }
            }
        } else if (variable.raspberryId) {
            deviceDisplay = variable.raspberryId;
        }
        
        // Build full source path with device name
        let fullSourcePath = '';
        if (variable.sourceType === 'combined') {
            fullSourcePath = t('opcManagement.combinedVariable');
        } else {
            fullSourcePath = deviceDisplay ? `${deviceDisplay}.${sourceVariableName}` : sourceVariableName;
            if (variable.arrayIndex !== null) {
                fullSourcePath += `[${variable.arrayIndex}]`;
            }
        }
        
        // Quality badge
        let qualityBadge = '';
        if (quality === 'Good' || quality === t('opcManagement.good')) {
            qualityBadge = `<span class="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">✔ ${t('opcManagement.good')}</span>`;
        } else if (quality === 'Bad' || quality === t('opcManagement.bad')) {
            qualityBadge = `<span class="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700">❌ ${t('opcManagement.bad')}</span>`;
        } else if (quality === 'Uncertain') {
            qualityBadge = '<span class="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-700">⚠️ Uncertain</span>';
        } else {
            qualityBadge = `<span class="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-700">${t('opcManagement.unknown')}</span>`;
        }
        
        // Calculate staleness
        let ageWarning = '';
        if (dataTimestamp) {
            // Parse UTC timestamp and calculate age
            const timestamp = new Date(dataTimestamp);
            const ageSeconds = Math.floor((now - timestamp) / 1000);
            if (ageSeconds > 60) {
                const ageMinutes = Math.floor(ageSeconds / 60);
                if (ageMinutes < 60) {
                    ageWarning = `<div class="text-xs text-orange-600 mt-1">⚠️ ${t('opcManagement.stale')} (${ageMinutes}m ${t('opcManagement.ago')})</div>`;
                } else {
                    const ageHours = Math.floor(ageMinutes / 60);
                    ageWarning = `<div class="text-xs text-red-600 mt-1">⚠️ ${t('opcManagement.stale')} (${ageHours}h ${t('opcManagement.ago')})</div>`;
                }
            }
        }
        
        // Value styling based on quality
        let valueClass = 'font-mono text-lg font-bold';
        if (quality === 'Bad') {
            valueClass += ' text-red-600';
        } else if (quality === 'Uncertain') {
            valueClass += ' text-yellow-700';
        } else if (ageWarning) {
            valueClass += ' text-orange-600';
        } else {
            valueClass += ' text-gray-900';
        }
        
        html += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-800">${variable.variableName}</div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${fullSourcePath}
                    </div>
                </td>
                <td class="px-4 py-3">
                    <div class="${valueClass}">${value}</div>
                </td>
                <td class="px-4 py-3">
                    ${qualityBadge}
                    ${ageWarning}
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="editVariable('${variable._id}')" 
                            class="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition-colors">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button onclick="deleteVariable('${variable._id}')" 
                            class="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition-colors">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

// Update variable values based on all devices data
function updateVariableValues() {
    variablesCache.forEach(variable => {
        if (variable.sourceType === 'combined') {
            // Handle combined variables
            variable.currentValue = calculateCombinedValue(variable);
        } else {
            // Handle single conversion variables
            // Get data from the variable's source device
            const deviceData = allDevicesDataCache[variable.raspberryId];
            
            if (!deviceData || !deviceData.datapoints) {
                return; // Skip if device data not loaded yet
            }
            
            // First try to match by _id
            let datapoint = deviceData.datapoints.find(dp => 
                dp._id && variable.datapointId && 
                dp._id.toString() === variable.datapointId.toString()
            );
            
            // If not found by _id, try to match by opcNodeId as fallback (more stable identifier)
            if (!datapoint && variable.opcNodeId) {
                datapoint = deviceData.datapoints.find(dp => 
                    dp.opcNodeId === variable.opcNodeId
                );
            }
            
            if (datapoint) {
                const rawValue = variable.arrayIndex !== null 
                    ? (Array.isArray(datapoint.value) ? datapoint.value[variable.arrayIndex] : null)
                    : datapoint.value;
                
                if (rawValue !== null && rawValue !== undefined) {
                    const fromType = variable.conversionFromType || 'uint16'; // Default fallback
                    const toType = variable.conversionToType || variable.conversionType || 'none';
                    variable.currentValue = applyConversion(rawValue, fromType, toType);
                }
            }
        }
    });
    
    renderVariables();
}

// State for combined variable modal
let selectedSourceVariables = [];

// State for editing combined variables 
let editingSourceVariables = [];

// Open combined variable modal
function openCombinedVariableModal() {
    selectedSourceVariables = [];
    
    const modalHtml = `
        <div id="combinedVariableModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="flex items-center justify-between p-6 border-b bg-gradient-to-r from-purple-600 to-purple-700 text-white">
                    <h2 class="text-2xl font-semibold flex items-center">
                        <i class="ri-links-line mr-3"></i>
                        ${t('opcManagement.createCombinedVariable')}
                    </h2>
                    <button onclick="closeCombinedVariableModal()" class="text-white hover:text-gray-200 transition-colors">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6">
                    <div class="grid grid-cols-3 gap-6">
                        <!-- Column 1: Available Variables -->
                        <div class="border-2 border-gray-200 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="ri-list-check mr-2 text-blue-600"></i>
                                ${t('opcManagement.availableVariables')}
                            </h3>
                            <div id="availableVariablesList" class="space-y-2 max-h-96 overflow-y-auto">
                                <!-- Will be populated dynamically -->
                            </div>
                        </div>
                        
                        <!-- Column 2: Selected Variables -->
                        <div class="border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
                            <h3 class="font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="ri-checkbox-multiple-line mr-2 text-purple-600"></i>
                                ${t('opcManagement.selectedVariables')}
                            </h3>
                            <div id="selectedVariablesList" class="space-y-2 min-h-[300px]">
                                <div class="text-center text-gray-400 py-12">
                                    <i class="ri-hand-coin-line text-4xl mb-2"></i>
                                    <p class="text-sm">${t('opcManagement.clickVariablesToAdd')}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Column 3: Combined Variable Settings -->
                        <div class="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                            <h3 class="font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="ri-settings-3-line mr-2 text-green-600"></i>
                                ${t('opcManagement.variableSettings')}
                            </h3>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">${t('opcManagement.variableNameLabel')} *</label>
                                    <input type="text" id="combinedVariableName" 
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="${t('opcManagement.enterVariableNamePlaceholder')}">
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">${t('opcManagement.operation')} *</label>
                                    <select id="combinedOperation" onchange="updateCombinedPreview()"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                                        <option value="">${t('opcManagement.selectOperationPlaceholder')}</option>
                                        <option value="concatenate">${t('opcManagement.concatenateJoin')}</option>
                                        <option value="add">${t('opcManagement.add')}</option>
                                        <option value="subtract">${t('opcManagement.subtract')}</option>
                                        <option value="multiply">${t('opcManagement.multiply')}</option>
                                        <option value="divide">${t('opcManagement.divide')}</option>
                                        <option value="average">${t('opcManagement.average')}</option>
                                    </select>
                                </div>
                                
                                <div class="bg-white border border-gray-200 rounded p-3 mt-4">
                                    <div class="text-xs text-gray-500 mb-1">${t('opcManagement.preview')}</div>
                                    <div id="combinedPreview" class="font-mono text-lg font-semibold text-gray-900">-</div>
                                </div>
                                
                                <button onclick="saveCombinedVariable()" 
                                    class="w-full mt-6 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center font-semibold">
                                    <i class="ri-save-line mr-2"></i>
                                    ${t('opcManagement.saveCombinedVariable')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    renderAvailableVariables();
}

function closeCombinedVariableModal() {
    const modal = document.getElementById('combinedVariableModal');
    if (modal) modal.remove();
    selectedSourceVariables = [];
}

function renderAvailableVariables() {
    const container = document.getElementById('availableVariablesList');
    
    if (variablesCache.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-8">
                <i class="ri-inbox-line text-3xl mb-2"></i>
                <p class="text-sm">${t('opcManagement.noVariablesAvailable')}</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    variablesCache.forEach(variable => {
        const isSelected = selectedSourceVariables.includes(variable.variableName);
        html += `
            <div onclick="toggleSourceVariable('${variable.variableName}')" 
                class="p-3 border rounded cursor-pointer transition-all ${
                    isSelected 
                        ? 'bg-purple-100 border-purple-400' 
                        : 'bg-white border-gray-200 hover:border-blue-300'
                }">
                <div class="font-medium text-sm">${variable.variableName}</div>
                <div class="text-xs text-gray-500 mt-1">
                    ${t('opcManagement.value')}: <span class="font-mono">${variable.currentValue || '-'}</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function toggleSourceVariable(variableName) {
    const index = selectedSourceVariables.indexOf(variableName);
    
    if (index > -1) {
        // Remove from selection
        selectedSourceVariables.splice(index, 1);
    } else {
        // Add to selection
        selectedSourceVariables.push(variableName);
    }
    
    renderAvailableVariables();
    renderSelectedVariables();
    updateCombinedPreview();
}

function renderSelectedVariables() {
    const container = document.getElementById('selectedVariablesList');
    
    if (selectedSourceVariables.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-12">
                <i class="ri-hand-coin-line text-4xl mb-2"></i>
                <p class="text-sm">${t('opcManagement.clickVariablesToAdd')}</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    selectedSourceVariables.forEach((varName, index) => {
        const variable = variablesCache.find(v => v.variableName === varName);
        html += `
            <div class="p-3 bg-white border-2 border-purple-300 rounded flex items-center justify-between">
                <div class="flex-1">
                    <div class="font-medium text-sm">${varName}</div>
                    <div class="text-xs text-gray-500 mt-1">
                        <span class="font-mono">${variable ? variable.currentValue : '-'}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-purple-600">#${index + 1}</span>
                    <button onclick="event.stopPropagation(); toggleSourceVariable('${varName}')" 
                        class="text-red-500 hover:text-red-700 p-1">
                        <i class="ri-close-circle-line"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function updateCombinedPreview() {
    const operation = document.getElementById('combinedOperation').value;
    const preview = document.getElementById('combinedPreview');
    
    if (selectedSourceVariables.length < 2 || !operation) {
        preview.textContent = '-';
        return;
    }
    
    const values = selectedSourceVariables.map(varName => {
        const variable = variablesCache.find(v => v.variableName === varName);
        return variable ? variable.currentValue : null;
    }).filter(v => v !== null && v !== undefined && v !== '-');
    
    if (values.length === 0) {
        preview.textContent = '-';
        return;
    }
    
    let result;
    switch (operation) {
        case 'concatenate':
            result = values.join('');
            break;
        case 'add':
            result = values.reduce((sum, val) => sum + parseFloat(val), 0);
            break;
        case 'subtract':
            result = values.reduce((diff, val) => diff - parseFloat(val));
            break;
        case 'multiply':
            result = values.reduce((prod, val) => prod * parseFloat(val), 1);
            break;
        case 'divide':
            result = values.reduce((quot, val) => quot / parseFloat(val));
            break;
        case 'average':
            result = values.reduce((sum, val) => sum + parseFloat(val), 0) / values.length;
            break;
        default:
            result = '-';
    }
    
    preview.textContent = result;
}

async function saveCombinedVariable() {
    const variableName = document.getElementById('combinedVariableName').value.trim();
    const operation = document.getElementById('combinedOperation').value;
    
    if (!variableName) {
        showNotification(t('opcManagement.enterVariableName'), 'error');
        return;
    }
    
    if (selectedSourceVariables.length < 2) {
        showNotification(t('opcManagement.selectAtLeast2Variables'), 'error');
        return;
    }
    
    if (!operation) {
        showNotification(t('opcManagement.selectOperation'), 'error');
        return;
    }
    
    const payload = {
        company: COMPANY,
        variableName,
        sourceType: 'combined',
        sourceVariables: selectedSourceVariables,
        operation,
        createdBy: localStorage.getItem('username') || 'admin'
    };
    
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(t('opcManagement.combinedVariableCreatedSuccess'), 'success');
            await loadVariables();
            
            // Reset column 2 for next combination
            selectedSourceVariables = [];
            document.getElementById('combinedVariableName').value = '';
            document.getElementById('combinedOperation').value = '';
            renderAvailableVariables();
            renderSelectedVariables();
            updateCombinedPreview();
            
            // Keep modal open for creating more combinations
            // User can close manually or continue creating
        } else {
            showNotification(data.message || t('opcManagement.combinedVariableCreatedFail'), 'error');
        }
    } catch (error) {
        console.error('Error creating combined variable:', error);
        showNotification(t('opcManagement.combinedVariableCreatedFail'), 'error');
    }
}

// Calculate combined variable value
function calculateCombinedValue(combinedVar) {
    if (!combinedVar.sourceVariables || combinedVar.sourceVariables.length === 0) {
        return '-';
    }
    
    const sourceValues = combinedVar.sourceVariables.map(varName => {
        const sourceVar = variablesCache.find(v => v.variableName === varName);
        return sourceVar ? sourceVar.currentValue : null;
    }).filter(v => v !== null && v !== undefined && v !== '-');
    
    if (sourceValues.length === 0) return '-';
    
    switch (combinedVar.operation) {
        case 'concatenate':
            return sourceValues.join('');
        case 'add':
            return sourceValues.reduce((sum, val) => sum + parseFloat(val), 0).toString();
        case 'subtract':
            return sourceValues.reduce((diff, val) => diff - parseFloat(val)).toString();
        case 'multiply':
            return sourceValues.reduce((prod, val) => prod * parseFloat(val), 1).toString();
        case 'divide':
            return sourceValues.reduce((quot, val) => quot / parseFloat(val)).toString();
        case 'average':
            const sum = sourceValues.reduce((s, val) => s + parseFloat(val), 0);
            return (sum / sourceValues.length).toFixed(2);
        default:
            return '-';
    }
}

// Show combine variable modal
function showCombineVariableModal() {
    selectedVariablesForCombine = [];
    
    // Populate variable dropdown
    const select = document.getElementById('combine-variable-select');
    select.innerHTML = '<option value="">+ Add variable...</option>';
    
    variablesCache.forEach(v => {
        if (v.sourceType !== 'combined') {
            const option = document.createElement('option');
            option.value = v.variableName;
            option.textContent = v.variableName;
            select.appendChild(option);
        }
    });
    
    // Reset form
    document.getElementById('opc-combine-form').reset();
    document.getElementById('combine-selected-vars').innerHTML = '<span class="text-gray-400 text-sm">No variables selected</span>';
    document.getElementById('combine-preview').style.display = 'none';
    
    // Show modal
    document.getElementById('opc-combine-modal').classList.remove('hidden');
}

// Add variable to combine list
function addVariableToCombine() {
    const select = document.getElementById('combine-variable-select');
    const varName = select.value;
    
    if (!varName || selectedVariablesForCombine.includes(varName)) {
        select.value = '';
        return;
    }
    
    selectedVariablesForCombine.push(varName);
    renderSelectedVariablesForCombine();
    updateCombinePreview();
    
    select.value = '';
}

// Render selected variables as tags
function renderSelectedVariablesForCombine() {
    const container = document.getElementById('combine-selected-vars');
    
    if (selectedVariablesForCombine.length === 0) {
        container.innerHTML = '<span class="text-gray-400 text-sm">No variables selected</span>';
        return;
    }
    
    container.innerHTML = selectedVariablesForCombine.map(varName => `
        <span class="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
            ${varName}
            <button onclick="removeVariableFromCombine('${varName}')" 
                class="hover:text-blue-900">
                <i class="ri-close-line"></i>
            </button>
        </span>
    `).join('');
}

// Remove variable from combine list
function removeVariableFromCombine(varName) {
    selectedVariablesForCombine = selectedVariablesForCombine.filter(v => v !== varName);
    renderSelectedVariablesForCombine();
    updateCombinePreview();
}

// Update combine preview
function updateCombinePreview() {
    if (selectedVariablesForCombine.length < 2) {
        document.getElementById('combine-preview').style.display = 'none';
        return;
    }
    
    const operation = document.getElementById('combine-operation').value;
    const tempVar = {
        sourceVariables: selectedVariablesForCombine,
        operation: operation
    };
    
    const previewValue = calculateCombinedValue(tempVar);
    document.getElementById('combine-preview-value').textContent = previewValue;
    document.getElementById('combine-preview').style.display = 'block';
}

// Handle combine form submission
async function handleCombineSubmit(e) {
    e.preventDefault();
    
    if (selectedVariablesForCombine.length < 2) {
        showNotification(t('opcManagement.selectAtLeast2Variables'), 'error');
        return;
    }
    
    const variableName = document.getElementById('combine-variable-name').value;
    const operation = document.getElementById('combine-operation').value;
    
    const payload = {
        company: COMPANY,
        variableName,
        sourceType: 'combined',
        sourceVariables: selectedVariablesForCombine,
        operation,
        createdBy: localStorage.getItem('username') || 'admin'
    };
    
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(t('opcManagement.combinedVariableCreatedSuccess'), 'success');
            closeOPCModal('opc-combine-modal');
            await loadVariables();
        } else {
            showNotification(data.message || t('opcManagement.combinedVariableCreatedFail'), 'error');
        }
    } catch (error) {
        console.error('Error creating combined variable:', error);
        showNotification(t('opcManagement.combinedVariableCreatedFail'), 'error');
    }
}

// Edit variable
async function editVariable(variableId) {
    const variable = variablesCache.find(v => v._id === variableId);
    if (!variable) return;
    
    // Populate edit form
    document.getElementById('edit-variable-id').value = variableId;
    document.getElementById('edit-variable-name').value = variable.variableName;
    
    // Check if this is a combined variable
    const isCombined = variable.sourceType === 'combined';
    const operationField = document.getElementById('edit-operation-field');
    const conversionFields = document.getElementById('edit-conversion-fields');
    
    if (isCombined) {
        // Show operation field, hide conversion fields
        operationField.style.display = 'block';
        conversionFields.style.display = 'none';
        
        // Populate source variables and operation
        editingSourceVariables = [...(variable.sourceVariables || [])];
        document.getElementById('edit-operation').value = variable.operation || '';
        
        // Populate available variables dropdown
        populateEditVariableSelect();
        
        // Render source variables
        renderEditSourceVariables();
        
        // Update preview
        updateEditCombinedPreview();
        
        // Remove required from conversion fields
        document.getElementById('edit-conv-from-type').removeAttribute('required');
        document.getElementById('edit-conv-to-type').removeAttribute('required');
        // Add required to operation
        document.getElementById('edit-operation').setAttribute('required', 'required');
    } else {
        // Show conversion fields, hide operation field
        operationField.style.display = 'none';
        conversionFields.style.display = 'block';
        document.getElementById('edit-conv-from-type').value = variable.conversionFromType || '';
        document.getElementById('edit-conv-to-type').value = variable.conversionToType || 'none';
        
        // Add required to conversion fields
        document.getElementById('edit-conv-from-type').setAttribute('required', 'required');
        document.getElementById('edit-conv-to-type').setAttribute('required', 'required');
        // Remove required from operation
        document.getElementById('edit-operation').removeAttribute('required');
        
        // Populate source information for normal variables
        populateSourceInformation(variable);
    }
    
    // Show modal
    document.getElementById('opc-edit-variable-modal').classList.remove('hidden');
    
    // Update preview with current variable's real-time value (only for non-combined)
    if (!isCombined) {
        updateEditConversionPreview();
    }
}

// Populate source information for normal variables
function populateSourceInformation(variable) {
    console.log('📋 Populating source info for variable:', variable);
    
    document.getElementById('edit-source-node-id').textContent = variable.opcNodeId || variable.nodeId || '-';
    document.getElementById('edit-source-type').textContent = variable.sourceType || '-';
    document.getElementById('edit-array-index').textContent = variable.arrayIndex !== undefined ? variable.arrayIndex : 'N/A';
    
    // Get the current raw value from the data cache
    const rawValue = getCurrentRawValue(variable);
    document.getElementById('edit-source-raw-value').textContent = rawValue;
    console.log('📊 Current raw value:', rawValue);
}

// Get current raw value for a variable
function getCurrentRawValue(variable) {
    try {
        if (!variable.opcNodeId && !variable.nodeId) {
            return 'No node ID';
        }
        
        const nodeId = variable.opcNodeId || variable.nodeId;
        
        // Search through all devices data for this node
        if (window.allDevicesData) {
            for (const deviceData of Object.values(window.allDevicesData)) {
                if (deviceData.data) {
                    // Check direct match
                    if (deviceData.data[nodeId] !== undefined) {
                        const value = deviceData.data[nodeId];
                        if (variable.arrayIndex !== undefined && Array.isArray(value)) {
                            return value[variable.arrayIndex] !== undefined ? value[variable.arrayIndex] : 'Array index not found';
                        }
                        return value;
                    }
                    
                    // Check in arrays
                    for (const [key, value] of Object.entries(deviceData.data)) {
                        if (Array.isArray(value) && key.includes(nodeId.split('.')[0])) {
                            if (variable.arrayIndex !== undefined) {
                                return value[variable.arrayIndex] !== undefined ? value[variable.arrayIndex] : 'Array index not found';
                            }
                        }
                    }
                }
            }
        }
        
        return 'No data available';
    } catch (error) {
        console.error('Error getting raw value:', error);
        return 'Error getting value';
    }
}

// Handle edit variable form submission
async function handleEditVariableSubmit(e) {
    e.preventDefault();
    
    const variableId = document.getElementById('edit-variable-id').value;
    const variableName = document.getElementById('edit-variable-name').value;
    
    console.log('🔧 Editing variable:', { variableId, variableName });
    
    // Find the variable to check if it's combined
    const variable = variablesCache.find(v => v._id === variableId);
    const isCombined = variable && variable.sourceType === 'combined';
    
    console.log('📊 Variable details:', { variable, isCombined });
    
    let payload = {
        variableName
    };
    
    if (isCombined) {
        // For combined variables, update operation and source variables
        const operation = document.getElementById('edit-operation').value;
        if (!operation) {
            showNotification(t('opcManagement.selectOperation'), 'error');
            return;
        }
        if (editingSourceVariables.length < 2) {
            showNotification(t('opcManagement.selectAtLeast2SourceVariables'), 'error');
            return;
        }
        payload.operation = operation;
        payload.sourceVariables = editingSourceVariables;
        
        console.log('🔗 Combined variable payload:', payload);
        console.log('📝 Source variables order:', editingSourceVariables);
    } else {
        // For single/array variables, update conversion types
        const convFromType = document.getElementById('edit-conv-from-type').value;
        const convToType = document.getElementById('edit-conv-to-type').value;
        
        if (!convFromType || !convToType) {
            showNotification(t('opcManagement.selectBothConversionTypes'), 'error');
            return;
        }
        
        payload.conversionFromType = convFromType;
        payload.conversionToType = convToType;
        
        console.log('🔄 Normal variable payload:', payload);
    }
    
    try {
        console.log('📤 Sending PUT request to:', `${API_URL}/api/opcua/conversions/${variableId}?company=${COMPANY}`);
        console.log('📤 Payload:', JSON.stringify(payload, null, 2));
        
        const response = await fetch(`${API_URL}/api/opcua/conversions/${variableId}?company=${COMPANY}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        console.log('📥 Server response:', { status: response.status, data });
        console.log('📥 Updated variable data:', JSON.stringify(data, null, 2));
        
        if (response.ok) {
            // Check if server actually updated the sourceVariables correctly
            if (isCombined && data.sourceVariables) {
                console.log('🔍 Server returned sourceVariables:', data.sourceVariables);
                console.log('🔍 Expected sourceVariables:', editingSourceVariables);
                console.log('🔍 Do they match?', JSON.stringify(data.sourceVariables) === JSON.stringify(editingSourceVariables));
            }
            
            showNotification(t('opcManagement.variableUpdatedSuccess'), 'success');
            closeOPCModal('opc-edit-variable-modal');
            await loadVariables();
            
            // Double-check what was actually saved by fetching the specific variable
            if (isCombined) {
                setTimeout(async () => {
                    try {
                        console.log('🔍 Double-checking saved variable...');
                        const checkResponse = await fetch(`${API_URL}/api/opcua/conversions/${variableId}?company=${COMPANY}`);
                        const checkData = await checkResponse.json();
                        console.log('🔍 Variable after save:', {
                            name: checkData.variableName,
                            sourceVariables: checkData.sourceVariables,
                            expectedOrder: editingSourceVariables
                        });
                    } catch (err) {
                        console.error('Failed to double-check variable:', err);
                    }
                }, 1000);
            }
        } else {
            console.error('❌ Update failed:', data);
            showNotification(data.message || t('opcManagement.variableUpdatedFail'), 'error');
        }
    } catch (error) {
        console.error('💥 Error updating variable:', error);
        showNotification(t('opcManagement.variableUpdatedFail'), 'error');
    }
}

// Delete variable
async function deleteVariable(variableId) {
    if (!confirm('Are you sure you want to delete this variable?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions/${variableId}?company=${COMPANY}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Variable deleted successfully', 'success');
            await loadVariables();
        } else if (response.status === 400 && data.usedIn) {
            // Variable is used in combined variables - show modal
            showDeleteDependenciesModal(variableId, data.usedIn);
        } else {
            showNotification(data.message || data.error || 'Failed to delete variable', 'error');
        }
    } catch (error) {
        console.error('Error deleting variable:', error);
        showNotification('Failed to delete variable', 'error');
    }
}

// Show modal for deleting variables with dependencies
function showDeleteDependenciesModal(variableId, usedInVariables) {
    const modalHtml = `
        <div id="deleteDependenciesModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full">
                <div class="flex items-center justify-between p-6 border-b bg-yellow-50">
                    <div class="flex items-center">
                        <i class="ri-alert-line text-3xl text-yellow-600 mr-3"></i>
                        <h2 class="text-xl font-semibold text-gray-800">Variable In Use</h2>
                    </div>
                    <button onclick="closeDeleteDependenciesModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <p class="text-gray-700 mb-4">
                        This variable is currently used in the following combined variables:
                    </p>
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <ul class="list-disc list-inside space-y-2">
                            ${usedInVariables.map(name => `<li class="text-red-700 font-medium">${name}</li>`).join('')}
                        </ul>
                    </div>
                    <p class="text-gray-600 text-sm">
                        Would you like to delete this variable along with all combined variables that use it?
                    </p>
                </div>
                
                <div class="flex justify-end gap-3 p-6 border-t bg-gray-50">
                    <button onclick="closeDeleteDependenciesModal()" 
                        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                        <i class="ri-close-line mr-2"></i>Cancel
                    </button>
                    <button onclick="deleteVariableWithDependencies('${variableId}', ${JSON.stringify(usedInVariables).replace(/"/g, '&quot;')})" 
                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                        <i class="ri-delete-bin-line mr-2"></i>Delete All
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeDeleteDependenciesModal() {
    const modal = document.getElementById('deleteDependenciesModal');
    if (modal) {
        modal.remove();
    }
}

// Delete variable and all combined variables that depend on it
async function deleteVariableWithDependencies(variableId, usedInVariableNames) {
    try {
        // First, find and delete all combined variables that use this variable
        const combinedVarIds = [];
        for (const name of usedInVariableNames) {
            const combinedVar = variablesCache.find(v => v.variableName === name);
            if (combinedVar) {
                combinedVarIds.push(combinedVar._id);
            }
        }
        
        // Delete combined variables first
        for (const id of combinedVarIds) {
            const response = await fetch(`${API_URL}/api/opcua/conversions/${id}?company=${COMPANY}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                console.error(`Failed to delete combined variable: ${id}`);
            }
        }
        
        // Now delete the original variable
        const response = await fetch(`${API_URL}/api/opcua/conversions/${variableId}?company=${COMPANY}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification(`Successfully deleted variable and ${combinedVarIds.length} dependent combined variable(s)`, 'success');
            closeDeleteDependenciesModal();
            await loadVariables();
        } else {
            const data = await response.json();
            showNotification(data.message || data.error || 'Failed to delete variable', 'error');
        }
    } catch (error) {
        console.error('Error deleting variables:', error);
        showNotification('Failed to delete variables', 'error');
    }
}

// Helper functions for editing combined variables
function populateEditVariableSelect() {
    const select = document.getElementById('edit-add-variable-select');
    select.innerHTML = '<option value="">+ Add variable...</option>';
    
    variablesCache.forEach(v => {
        if (v.sourceType !== 'combined' && !editingSourceVariables.includes(v.variableName)) {
            const option = document.createElement('option');
            option.value = v.variableName;
            option.textContent = v.variableName;
            select.appendChild(option);
        }
    });
}

function addVariableToEdit() {
    const select = document.getElementById('edit-add-variable-select');
    const varName = select.value;
    
    if (!varName || editingSourceVariables.includes(varName)) {
        select.value = '';
        return;
    }
    
    editingSourceVariables.push(varName);
    renderEditSourceVariables();
    populateEditVariableSelect();
    updateEditCombinedPreview();
    
    select.value = '';
}

function removeVariableFromEdit(varName) {
    editingSourceVariables = editingSourceVariables.filter(v => v !== varName);
    renderEditSourceVariables();
    populateEditVariableSelect();
    updateEditCombinedPreview();
}

function renderEditSourceVariables() {
    const container = document.getElementById('edit-source-variables');
    
    console.log('🎨 Rendering edit source variables:', editingSourceVariables);
    
    if (editingSourceVariables.length === 0) {
        container.innerHTML = '<span class="text-gray-400 text-sm">No variables selected</span>';
        return;
    }
    
    container.innerHTML = editingSourceVariables.map((varName, index) => `
        <div class="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm mr-2 mb-2">
            <button onclick="moveVariableInEdit(${index}, -1)" class="hover:text-blue-900 ${index === 0 ? 'opacity-50 cursor-not-allowed' : ''}" ${index === 0 ? 'disabled' : ''}>
                <i class="ri-arrow-left-s-line"></i>
            </button>
            <span class="font-medium">${varName}</span>
            <button onclick="moveVariableInEdit(${index}, 1)" class="hover:text-blue-900 ${index === editingSourceVariables.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${index === editingSourceVariables.length - 1 ? 'disabled' : ''}>
                <i class="ri-arrow-right-s-line"></i>
            </button>
            <button onclick="removeVariableFromEdit('${varName}')" class="hover:text-blue-900">
                <i class="ri-close-line"></i>
            </button>
        </div>
    `).join('');
}

function moveVariableInEdit(fromIndex, direction) {
    const toIndex = fromIndex + direction;
    
    if (toIndex < 0 || toIndex >= editingSourceVariables.length) {
        return;
    }
    
    // Swap variables
    const temp = editingSourceVariables[fromIndex];
    editingSourceVariables[fromIndex] = editingSourceVariables[toIndex];
    editingSourceVariables[toIndex] = temp;
    
    renderEditSourceVariables();
    updateEditCombinedPreview();
}

function updateEditCombinedPreview() {
    if (editingSourceVariables.length < 2) {
        document.getElementById('edit-combined-preview').style.display = 'none';
        return;
    }
    
    const operation = document.getElementById('edit-operation').value;
    if (!operation) {
        document.getElementById('edit-combined-preview').style.display = 'none';
        return;
    }
    
    const tempVar = {
        sourceVariables: editingSourceVariables,
        operation: operation
    };
    
    const previewValue = calculateCombinedValue(tempVar);
    document.getElementById('edit-combined-preview-value').textContent = previewValue;
    document.getElementById('edit-combined-preview').style.display = 'block';
}

// Close modal
function closeOPCModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Clear data display
function clearDataDisplay() {
    document.getElementById('opc-raw-data-container').innerHTML = `
        <div class="text-center py-12 text-gray-500">
            <i class="ri-inbox-line text-5xl mb-4"></i>
            <p class="text-lg">Select a Raspberry Pi to view data</p>
        </div>
    `;
}

// Show notification
function showNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
