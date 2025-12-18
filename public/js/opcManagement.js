// OPC Management JavaScript
// Handles real-time data display, variable creation, and data conversion

// Use window scope to avoid redeclaration errors on page reload
if (typeof window.opcManagementState === 'undefined') {
    window.opcManagementState = {
        currentRaspberryId: null,
        rawDataCache: {},
        variablesCache: [],
        selectedVariablesForCombine: [],
        currentConversionData: null
    };
}

// Shorthand references for cleaner code
let currentRaspberryId, rawDataCache, variablesCache, selectedVariablesForCombine, currentConversionData;

function initOpcState() {
    currentRaspberryId = window.opcManagementState.currentRaspberryId;
    rawDataCache = window.opcManagementState.rawDataCache;
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
        
        // Initialize WebSocket
        initializeWebSocket();
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Failed to initialize OPC Management:', error);
        showNotification('Failed to initialize', 'error');
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
        
        select.innerHTML = '<option value="">Select Raspberry Pi...</option>';
        
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
        
        // Listen for real-time OPC UA data
        window.opcSocket.on('opcua_data', (data) => {
            handleRealtimeData(data);
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
            <span class="text-sm font-medium text-green-700">Connected</span>
        `;
        statusEl.className = 'flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50';
    } else {
        statusEl.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-red-500"></span>
            <span class="text-sm font-medium text-red-700">Disconnected</span>
        `;
        statusEl.className = 'flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Raspberry Pi selection
    const filterSelect = document.getElementById('opc-raspberry-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentRaspberryId = e.target.value;
            if (currentRaspberryId) {
                loadRealTimeData(currentRaspberryId);
            } else {
                clearDataDisplay();
            }
        });
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
            showNotification('Failed to load data: ' + (data.error || 'Unknown error'), 'error');
        }
        
    } catch (error) {
        console.error('Error loading real-time data:', error);
        showNotification('Failed to load data', 'error');
    }
}

// Handle real-time WebSocket data
function handleRealtimeData(data) {
    // Check if this update is for the currently selected device
    if (data.device_id === currentRaspberryId || data.raspberryId === currentRaspberryId) {
        // Update the cached data with new values
        if (window.opcManagementState.rawDataCache && window.opcManagementState.rawDataCache.datapoints) {
            // Update existing datapoints with new values
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
            
            // Recalculate variable values
            updateVariableValues();
        }
    }
}

// Render real-time data in the left panel
function renderRealTimeData(data) {
    const container = document.getElementById('opc-raw-data-container');
    
    if (!data.datapoints || data.datapoints.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="ri-inbox-line text-5xl mb-4"></i>
                <p class="text-lg">No datapoints configured</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variable Name</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OPC Node ID</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Value</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    data.datapoints.forEach(dp => {
        const isArray = Array.isArray(dp.value);
        const timestamp = new Date(dp.timestamp || Date.now()).toLocaleString('ja-JP');
        const displayValue = isArray ? `[${dp.value.length} items]` : dp.value;
        const dpDataStr = JSON.stringify(dp).replace(/"/g, '&quot;');
        
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
                    <span class="font-mono text-sm font-semibold text-gray-900">${displayValue}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-xs text-gray-500">${timestamp}</span>
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
    const timestamp = new Date(datapoint.timestamp || Date.now()).toLocaleString('ja-JP');
    
    // Format value display
    let valueDisplay = '';
    if (isArray) {
        valueDisplay = `
            <div class="max-h-60 overflow-y-auto bg-gray-50 p-3 rounded">
                <div class="font-mono text-sm space-y-1">
                    ${datapoint.value.map((val, idx) => `<div>[${idx}]: ${val}</div>`).join('')}
                </div>
            </div>
        `;
    } else {
        valueDisplay = `<div class="font-mono text-lg font-semibold text-gray-900">${datapoint.value}</div>`;
    }
    
    const modalHtml = `
        <div id="dataDetailModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                    <h2 class="text-2xl font-semibold flex items-center">
                        <i class="ri-database-2-line mr-3"></i>
                        Data Details
                    </h2>
                    <button onclick="closeDataDetailModal()" class="text-white hover:text-gray-200 transition-colors">
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
                            <div class="text-sm text-gray-700">${datapoint.discoveredAt ? new Date(datapoint.discoveredAt).toLocaleString('ja-JP') : 'N/A'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end gap-3 p-6 border-t bg-gray-50">
                    <button onclick="closeDataDetailModal()" 
                        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                        Close
                    </button>
                    <button onclick="createVariableFromDetail()" 
                        class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
                        <i class="ri-add-circle-line mr-2"></i>
                        Create Variable
                    </button>
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

function createVariableFromDetail() {
    if (!lastViewedDatapoint) return;
    
    closeDataDetailModal();
    
    // Open conversion modal
    const dp = lastViewedDatapoint;
    openConversionModal(dp._id, null, dp.value, dp.name || dp.opcNodeId);
}

// Open conversion modal
function openConversionModal(datapointId, arrayIndex, rawValue, datapointName) {
    currentConversionData = {
        datapointId,
        arrayIndex,
        rawValue,
        datapointName
    };
    
    // Set modal content
    document.getElementById('conv-datapoint-name').textContent = datapointName;
    document.getElementById('conv-raw-value').textContent = rawValue;
    
    if (arrayIndex !== null) {
        document.getElementById('conv-array-index-row').style.display = 'flex';
        document.getElementById('conv-array-index').textContent = `[${arrayIndex}]`;
    } else {
        document.getElementById('conv-array-index-row').style.display = 'none';
    }
    
    // Reset form
    document.getElementById('opc-conversion-form').reset();
    document.getElementById('conv-preview').style.display = 'none';
    
    // Show modal
    document.getElementById('opc-conversion-modal').classList.remove('hidden');
}

// Update conversion preview
function updateConversionPreview() {
    const convType = document.getElementById('conv-type').value;
    if (!convType || !currentConversionData) return;
    
    const rawValue = currentConversionData.rawValue;
    const converted = applyConversion(rawValue, convType);
    
    document.getElementById('conv-preview-value').textContent = converted;
    document.getElementById('conv-preview').style.display = 'block';
}

// Apply conversion to a value
function applyConversion(value, convType) {
    const num = parseInt(value);
    
    switch (convType) {
        case 'uint16':
            return (num & 0xFFFF).toString();
        case 'uint8':
            return (num & 0xFF).toString();
        case 'uint32':
            return (num >>> 0).toString();
        case 'int16':
            return (num << 16 >> 16).toString();
        case 'int8':
            return (num << 24 >> 24).toString();
        case 'int32':
            return (num | 0).toString();
        case 'hex16':
            return '0x' + (num & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
        case 'hex8':
            return '0x' + (num & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        case 'binary16':
            return (num & 0xFFFF).toString(2).padStart(16, '0');
        case 'binary8':
            return (num & 0xFF).toString(2).padStart(8, '0');
        case 'ascii2':
            const high = (num >> 8) & 0xFF;
            const low = num & 0xFF;
            return String.fromCharCode(high) + String.fromCharCode(low);
        case 'ascii1':
            return String.fromCharCode(num & 0xFF);
        case 'none':
        default:
            return value.toString();
    }
}

// Handle conversion form submission
async function handleConversionSubmit(e) {
    e.preventDefault();
    
    const variableName = document.getElementById('conv-variable-name').value;
    const convType = document.getElementById('conv-type').value;
    
    const payload = {
        company: COMPANY,
        variableName,
        sourceType: currentConversionData.arrayIndex !== null ? 'array' : 'single',
        datapointId: currentConversionData.datapointId,
        arrayIndex: currentConversionData.arrayIndex,
        conversionType: convType,
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
            showNotification('Variable created successfully', 'success');
            closeOPCModal('opc-conversion-modal');
            await loadVariables();
            
            // Reopen detail modal if it was opened from there
            if (lastViewedDatapoint) {
                setTimeout(() => showDataDetailModal(lastViewedDatapoint), 100);
            }
        } else {
            showNotification(data.message || 'Failed to create variable', 'error');
        }
    } catch (error) {
        console.error('Error creating variable:', error);
        showNotification('Failed to create variable', 'error');
    }
}

// Load all variables
async function loadVariables() {
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions?company=${COMPANY}`);
        const data = await response.json();
        
        variablesCache = data.conversions || [];
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
                <p class="text-lg">No variables created yet</p>
                <p class="text-sm mt-2">Click on data values to create variables</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="space-y-3">';
    
    variablesCache.forEach(variable => {
        const value = variable.currentValue !== undefined ? variable.currentValue : '-';
        
        html += `
            <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800 text-lg">${variable.variableName}</h4>
                        <p class="text-xs text-gray-500 mt-1">
                            ${variable.sourceType === 'combined' ? 'Combined Variable' : `${variable.datapointName || variable.datapointId}${variable.arrayIndex !== null ? `[${variable.arrayIndex}]` : ''}`}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editVariable('${variable._id}')" 
                            class="text-blue-600 hover:text-blue-800 p-2">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button onclick="deleteVariable('${variable._id}')" 
                            class="text-red-600 hover:text-red-800 p-2">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3 mb-2">
                    <div class="text-xs text-gray-500 mb-1">Current Value</div>
                    <div class="font-mono text-2xl font-bold text-gray-900">${value}</div>
                </div>
                <div class="flex gap-2 text-xs">
                    <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        ${variable.conversionType || variable.operation || 'none'}
                    </span>
                    ${variable.sourceType === 'combined' ? 
                        `<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            ${variable.sourceVariables ? variable.sourceVariables.length : 0} sources
                        </span>` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Update variable values based on current raw data
function updateVariableValues() {
    if (!rawDataCache.datapoints) return;
    
    variablesCache.forEach(variable => {
        if (variable.sourceType === 'combined') {
            // Handle combined variables
            variable.currentValue = calculateCombinedValue(variable);
        } else {
            // Handle single conversion variables
            const datapoint = rawDataCache.datapoints.find(dp => dp._id === variable.datapointId);
            if (datapoint) {
                const rawValue = variable.arrayIndex !== null 
                    ? (Array.isArray(datapoint.value) ? datapoint.value[variable.arrayIndex] : null)
                    : datapoint.value;
                
                if (rawValue !== null && rawValue !== undefined) {
                    variable.currentValue = applyConversion(rawValue, variable.conversionType);
                }
            }
        }
    });
    
    renderVariables();
}

// State for combined variable modal
let selectedSourceVariables = [];

// Open combined variable modal
function openCombinedVariableModal() {
    selectedSourceVariables = [];
    
    const modalHtml = `
        <div id="combinedVariableModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="flex items-center justify-between p-6 border-b bg-gradient-to-r from-purple-600 to-purple-700 text-white">
                    <h2 class="text-2xl font-semibold flex items-center">
                        <i class="ri-links-line mr-3"></i>
                        Create Combined Variable
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
                                Available Variables
                            </h3>
                            <div id="availableVariablesList" class="space-y-2 max-h-96 overflow-y-auto">
                                <!-- Will be populated dynamically -->
                            </div>
                        </div>
                        
                        <!-- Column 2: Selected Variables -->
                        <div class="border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
                            <h3 class="font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="ri-checkbox-multiple-line mr-2 text-purple-600"></i>
                                Selected Variables
                            </h3>
                            <div id="selectedVariablesList" class="space-y-2 min-h-[300px]">
                                <div class="text-center text-gray-400 py-12">
                                    <i class="ri-hand-coin-line text-4xl mb-2"></i>
                                    <p class="text-sm">Click variables to add</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Column 3: Combined Variable Settings -->
                        <div class="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                            <h3 class="font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="ri-settings-3-line mr-2 text-green-600"></i>
                                Variable Settings
                            </h3>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Variable Name *</label>
                                    <input type="text" id="combinedVariableName" 
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="Enter variable name">
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Operation *</label>
                                    <select id="combinedOperation" onchange="updateCombinedPreview()"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                                        <option value="">Select operation...</option>
                                        <option value="concatenate">Concatenate (Join values)</option>
                                        <option value="add">Add (+)</option>
                                        <option value="subtract">Subtract (-)</option>
                                        <option value="multiply">Multiply (×)</option>
                                        <option value="divide">Divide (÷)</option>
                                        <option value="average">Average</option>
                                    </select>
                                </div>
                                
                                <div class="bg-white border border-gray-200 rounded p-3 mt-4">
                                    <div class="text-xs text-gray-500 mb-1">Preview</div>
                                    <div id="combinedPreview" class="font-mono text-lg font-semibold text-gray-900">-</div>
                                </div>
                                
                                <button onclick="saveCombinedVariable()" 
                                    class="w-full mt-6 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center font-semibold">
                                    <i class="ri-save-line mr-2"></i>
                                    Save Combined Variable
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
                <p class="text-sm">No variables available</p>
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
                    Value: <span class="font-mono">${variable.currentValue || '-'}</span>
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
                <p class="text-sm">Click variables to add</p>
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
        showNotification('Please enter a variable name', 'error');
        return;
    }
    
    if (selectedSourceVariables.length < 2) {
        showNotification('Please select at least 2 variables', 'error');
        return;
    }
    
    if (!operation) {
        showNotification('Please select an operation', 'error');
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
            showNotification('Combined variable created successfully', 'success');
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
            showNotification(data.message || 'Failed to create combined variable', 'error');
        }
    } catch (error) {
        console.error('Error creating combined variable:', error);
        showNotification('Failed to create combined variable', 'error');
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
        showNotification('Please select at least 2 variables', 'error');
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
            showNotification('Combined variable created successfully', 'success');
            closeOPCModal('opc-combine-modal');
            await loadVariables();
        } else {
            showNotification(data.message || 'Failed to create combined variable', 'error');
        }
    } catch (error) {
        console.error('Error creating combined variable:', error);
        showNotification('Failed to create combined variable', 'error');
    }
}

// Edit variable
async function editVariable(variableId) {
    const variable = variablesCache.find(v => v._id === variableId);
    if (!variable) return;
    
    // Populate edit form
    document.getElementById('edit-variable-id').value = variableId;
    document.getElementById('edit-variable-name').value = variable.variableName;
    document.getElementById('edit-conv-type').value = variable.conversionType || 'none';
    
    // Show modal
    document.getElementById('opc-edit-variable-modal').classList.remove('hidden');
}

// Handle edit variable form submission
async function handleEditVariableSubmit(e) {
    e.preventDefault();
    
    const variableId = document.getElementById('edit-variable-id').value;
    const variableName = document.getElementById('edit-variable-name').value;
    const convType = document.getElementById('edit-conv-type').value;
    
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions/${variableId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variableName,
                conversionType: convType
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Variable updated successfully', 'success');
            closeOPCModal('opc-edit-variable-modal');
            await loadVariables();
        } else {
            showNotification(data.message || 'Failed to update variable', 'error');
        }
    } catch (error) {
        console.error('Error updating variable:', error);
        showNotification('Failed to update variable', 'error');
    }
}

// Delete variable
async function deleteVariable(variableId) {
    if (!confirm('Are you sure you want to delete this variable?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/opcua/conversions/${variableId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Variable deleted successfully', 'success');
            await loadVariables();
        } else {
            showNotification('Failed to delete variable', 'error');
        }
    } catch (error) {
        console.error('Error deleting variable:', error);
        showNotification('Failed to delete variable', 'error');
    }
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
