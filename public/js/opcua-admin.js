// ==========================================
// OPC UA Admin UI - JavaScript
// ==========================================

const API_BASE = window.location.origin;
let currentUser = null;
let currentRaspberryFilter = null;
let currentEquipmentFilter = null;

// Store loaded data for editing
let equipmentData = [];
let datapointsData = [];

// Layout Editor state
let layouts = [];
let currentLayout = null;
let selectedComponent = null;
let isDragging = false;
let isResizing = false;
let dragStartX = 0;
let uploadedImages = []; // Store uploaded images for current layout
let selectedFiles = []; // Temporary storage for files to upload
let contextMenuTarget = null; // Component that was right-clicked
let imageModalMode = 'component'; // 'component' or 'background'
let dragStartY = 0;
let componentIdCounter = 0;

// ==========================================
// Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    currentUser = localStorage.getItem('opcua_username');
    if (!currentUser) {
        currentUser = prompt('Enter your username:');
        if (currentUser) {
            localStorage.setItem('opcua_username', currentUser);
        } else {
            alert('Authentication required');
            return;
        }
    }
    
    document.getElementById('username-display').textContent = currentUser;
    
    // Initialize event listeners
    initializeNavigation();
    initializeRaspberryTab();
    initializeEquipmentTab();
    initializeDatapointsTab();
    initializeLayoutsTab();
    initializeModals();
    
    // Load initial data
    loadRaspberries();
});

// ==========================================
// Navigation
// ==========================================

function initializeNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('opcua_username');
        location.reload();
    });
}

function switchTab(tabName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.toggle('active', tab.id === `tab-${tabName}`);
    });
    
    // Load tab data
    if (tabName === 'raspberries') {
        loadRaspberries();
    } else if (tabName === 'equipment') {
        loadRaspberryFilters();
    } else if (tabName === 'datapoints') {
        loadEquipmentFilters();
    } else if (tabName === 'layouts') {
        loadLayouts();
    }
}

// ==========================================
// Raspberry Pi Tab
// ==========================================

function initializeRaspberryTab() {
    document.getElementById('add-raspberry-btn').addEventListener('click', () => {
        openRaspberryModal();
    });
    
    document.getElementById('raspberry-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveRaspberry();
    });
}

async function loadRaspberries() {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/raspberries`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderRaspberries(data.raspberries);
        } else {
            showToast('Failed to load Raspberry Pis', 'error');
        }
    } catch (error) {
        console.error('Error loading raspberries:', error);
        showToast('Error loading data', 'error');
    }
}

function renderRaspberries(raspberries) {
    const container = document.getElementById('raspberry-list');
    
    if (raspberries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No Raspberry Pi devices configured yet.</p>
                <p>Click "Add Raspberry Pi" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = raspberries.map(rpi => `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">${rpi.raspberryName}</h3>
                <span class="card-status ${rpi.status}">${rpi.status}</span>
            </div>
            <div class="card-body">
                <div class="card-info">
                    <div class="card-info-item">
                        <span class="card-info-label">Unique ID:</span>
                        <span>${rpi.raspberryId}</span>
                    </div>
                    <div class="card-info-item">
                        <span class="card-info-label">OPC UA Server:</span>
                        <span>${rpi.opcua_server_ip}:${rpi.opcua_server_port}</span>
                    </div>
                    <div class="card-info-item">
                        <span class="card-info-label">Poll Interval:</span>
                        <span>${rpi.poll_interval}ms</span>
                    </div>
                    <div class="card-info-item">
                        <span class="card-info-label">Last Heartbeat:</span>
                        <span>${rpi.lastHeartbeat ? new Date(rpi.lastHeartbeat).toLocaleString() : 'Never'}</span>
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary" onclick="editRaspberry('${rpi.raspberryId}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteRaspberry('${rpi.raspberryId}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function openRaspberryModal(raspberryId = null) {
    const modal = document.getElementById('raspberry-modal');
    const form = document.getElementById('raspberry-form');
    form.reset();
    
    if (raspberryId) {
        // Load existing raspberry data
        document.getElementById('raspberry-modal-title').textContent = 'Edit Raspberry Pi';
        // TODO: Load and populate form
    } else {
        document.getElementById('raspberry-modal-title').textContent = 'Add Raspberry Pi';
    }
    
    modal.classList.add('show');
}

async function saveRaspberry() {
    const formData = {
        raspberryId: document.getElementById('raspberry-id').value,
        raspberryName: document.getElementById('raspberry-name').value,
        opcua_server_ip: document.getElementById('opcua-ip').value,
        opcua_server_port: parseInt(document.getElementById('opcua-port').value),
        poll_interval: parseInt(document.getElementById('poll-interval').value),
        enabled: document.getElementById('raspberry-enabled').checked
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/raspberry`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-User': currentUser
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Raspberry Pi saved successfully', 'success');
            closeModal('raspberry-modal');
            loadRaspberries();
        } else {
            showToast(data.error || 'Failed to save', 'error');
        }
    } catch (error) {
        console.error('Error saving raspberry:', error);
        showToast('Error saving data', 'error');
    }
}

function editRaspberry(raspberryId) {
    openRaspberryModal(raspberryId);
}

async function deleteRaspberry(raspberryId) {
    if (!confirm('Are you sure you want to delete this Raspberry Pi? All associated equipment and data will be removed.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/raspberry/${raspberryId}`, {
            method: 'DELETE',
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Raspberry Pi deleted', 'success');
            loadRaspberries();
        } else {
            showToast('Failed to delete', 'error');
        }
    } catch (error) {
        console.error('Error deleting raspberry:', error);
        showToast('Error deleting data', 'error');
    }
}

// ==========================================
// Equipment Tab
// ==========================================

function initializeEquipmentTab() {
    document.getElementById('equipment-raspberry-filter').addEventListener('change', (e) => {
        currentRaspberryFilter = e.target.value;
        if (currentRaspberryFilter) {
            document.getElementById('add-equipment-btn').disabled = false;
            loadEquipment(currentRaspberryFilter);
        } else {
            document.getElementById('add-equipment-btn').disabled = true;
            document.getElementById('equipment-list').innerHTML = `
                <div class="empty-state"><p>👆 Select a Raspberry Pi to manage equipment</p></div>
            `;
        }
    });
    
    document.getElementById('add-equipment-btn').addEventListener('click', () => {
        openEquipmentModal();
    });
    
    document.getElementById('equipment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveEquipment();
    });
}

async function loadRaspberryFilters() {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/raspberries`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('equipment-raspberry-filter');
            select.innerHTML = '<option value="">Select Raspberry Pi...</option>' +
                data.raspberries.map(rpi => 
                    `<option value="${rpi.raspberryId}">${rpi.raspberryName}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading raspberry filters:', error);
    }
}

async function loadEquipment(raspberryId) {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/equipment/${raspberryId}`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderEquipment(data.equipment);
        }
    } catch (error) {
        console.error('Error loading equipment:', error);
    }
}

function renderEquipment(equipment) {
    // Store equipment data for editing
    equipmentData = equipment;
    
    const container = document.getElementById('equipment-list');
    
    if (equipment.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No equipment configured for this Raspberry Pi.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = equipment.map(equip => `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">${equip.displayName}</h3>
            </div>
            <div class="card-body">
                <div class="card-info">
                    <div class="card-info-item">
                        <span class="card-info-label">Equipment ID:</span>
                        <span>${equip.equipmentId}</span>
                    </div>
                    ${equip.description ? `
                        <div class="card-info-item">
                            <span class="card-info-label">Description:</span>
                            <span>${equip.description}</span>
                        </div>
                    ` : ''}
                    ${equip.location ? `
                        <div class="card-info-item">
                            <span class="card-info-label">Location:</span>
                            <span>${equip.location}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary" onclick="editEquipment('${equip.equipmentId}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteEquipment('${equip.equipmentId}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function openEquipmentModal(equipmentId = null) {
    const modal = document.getElementById('equipment-modal');
    const form = document.getElementById('equipment-form');
    form.reset();
    
    document.getElementById('equipment-raspberry-id').value = currentRaspberryFilter;
    
    if (equipmentId) {
        document.getElementById('equipment-modal-title').textContent = 'Edit Equipment';
        
        // Find and populate existing equipment data
        const equipment = equipmentData.find(eq => eq.equipmentId === equipmentId);
        if (equipment) {
            document.getElementById('equipment-id').value = equipment.equipmentId || '';
            document.getElementById('equipment-name').value = equipment.displayName || '';
            document.getElementById('equipment-description').value = equipment.description || '';
            document.getElementById('equipment-category').value = equipment.category || '';
            document.getElementById('equipment-location').value = equipment.location || '';
            document.getElementById('equipment-sort-order').value = equipment.sortOrder || 0;
            document.getElementById('equipment-enabled').checked = equipment.enabled !== false;
        }
    } else {
        document.getElementById('equipment-modal-title').textContent = 'Add Equipment';
    }
    
    modal.classList.add('show');
}

async function saveEquipment() {
    const formData = {
        raspberryId: document.getElementById('equipment-raspberry-id').value,
        equipmentId: document.getElementById('equipment-id').value,
        displayName: document.getElementById('equipment-name').value,
        description: document.getElementById('equipment-description').value,
        category: document.getElementById('equipment-category').value,
        location: document.getElementById('equipment-location').value,
        sortOrder: parseInt(document.getElementById('equipment-sort-order').value),
        enabled: document.getElementById('equipment-enabled').checked
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/equipment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-User': currentUser
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Equipment saved successfully', 'success');
            closeModal('equipment-modal');
            loadEquipment(currentRaspberryFilter);
        } else {
            showToast(data.error || 'Failed to save', 'error');
        }
    } catch (error) {
        console.error('Error saving equipment:', error);
        showToast('Error saving data', 'error');
    }
}

function editEquipment(equipmentId) {
    openEquipmentModal(equipmentId);
}

async function deleteEquipment(equipmentId) {
    if (!confirm('Delete this equipment and all its data points?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/equipment/${equipmentId}`, {
            method: 'DELETE',
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Equipment deleted', 'success');
            loadEquipment(currentRaspberryFilter);
        }
    } catch (error) {
        console.error('Error deleting equipment:', error);
    }
}

// ==========================================
// Data Points Tab
// ==========================================

function initializeDatapointsTab() {
    document.getElementById('datapoints-equipment-filter').addEventListener('change', (e) => {
        currentEquipmentFilter = e.target.value;
        if (currentEquipmentFilter) {
            document.getElementById('add-datapoint-btn').disabled = false;
            document.getElementById('discover-nodes-btn').disabled = false;
            loadDatapoints(currentEquipmentFilter);
        } else {
            document.getElementById('add-datapoint-btn').disabled = true;
            document.getElementById('discover-nodes-btn').disabled = true;
        }
    });
    
    document.getElementById('add-datapoint-btn').addEventListener('click', () => {
        openDatapointModal();
    });
    
    document.getElementById('discover-nodes-btn').addEventListener('click', () => {
        openDiscoveryModal();
    });
    
    document.getElementById('node-config-form').addEventListener('submit', (e) => {
        e.preventDefault();
        addNodeToStaging();
    });
    
    document.getElementById('save-all-datapoints-btn').addEventListener('click', () => {
        saveAllDatapoints();
    });
    
    document.getElementById('node-search').addEventListener('input', (e) => {
        filterAvailableNodes(e.target.value);
    });
    
    document.getElementById('datapoint-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveDatapoint();
    });
    
    // Auto-construct node ID when namespace or variable name changes
    const namespaceInput = document.getElementById('datapoint-namespace');
    const variableNameInput = document.getElementById('datapoint-variable-name');
    const nodeIdInput = document.getElementById('datapoint-node-id');
    
    function updateNodeId() {
        const namespace = namespaceInput.value || '4';
        const variableName = variableNameInput.value.trim();
        
        if (variableName) {
            nodeIdInput.value = `ns=${namespace};s=${variableName}`;
        } else {
            nodeIdInput.value = '';
        }
    }
    
    namespaceInput.addEventListener('input', updateNodeId);
    variableNameInput.addEventListener('input', updateNodeId);
}

async function loadEquipmentFilters() {
    // Load all equipment from all raspberries
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/raspberries`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('datapoints-equipment-filter');
            let options = '<option value="">Select Equipment...</option>';
            
            for (const rpi of data.raspberries) {
                const equipResponse = await fetch(`${API_BASE}/api/opcua/admin/equipment/${rpi.raspberryId}`, {
                    headers: { 'X-Session-User': currentUser }
                });
                const equipData = await equipResponse.json();
                
                if (equipData.success && equipData.equipment.length > 0) {
                    options += `<optgroup label="${rpi.raspberryName}">`;
                    options += equipData.equipment.map(e => 
                        `<option value="${e.equipmentId}" data-raspberry="${rpi.raspberryId}">${e.displayName}</option>`
                    ).join('');
                    options += '</optgroup>';
                }
            }
            
            select.innerHTML = options;
        }
    } catch (error) {
        console.error('Error loading equipment filters:', error);
    }
}

async function loadDatapoints(equipmentId) {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/datapoints/${equipmentId}`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderDatapoints(data.datapoints);
        }
    } catch (error) {
        console.error('Error loading datapoints:', error);
    }
}

function renderDatapoints(datapoints) {
    // Store datapoints data for editing
    datapointsData = datapoints;
    
    const container = document.getElementById('datapoints-list');
    
    if (datapoints.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No data points configured for this equipment.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Label</th>
                    <th>OPC Node ID</th>
                    <th>Data Type</th>
                    <th>Unit</th>
                    <th>Enabled</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${datapoints.map(dp => `
                    <tr>
                        <td>${dp.label}</td>
                        <td><code>${dp.opcNodeId}</code></td>
                        <td>${dp.dataType}</td>
                        <td>${dp.unit || '-'}</td>
                        <td>
                            <input type="checkbox" ${dp.enabled ? 'checked' : ''} 
                                   onchange="toggleDatapoint('${dp._id}', this.checked)">
                        </td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-secondary" onclick="editDatapoint('${dp._id}')">Edit</button>
                                <button class="btn btn-danger" onclick="deleteDatapoint('${dp._id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function openDatapointModal(datapointId = null) {
    const modal = document.getElementById('datapoint-modal');
    const form = document.getElementById('datapoint-form');
    form.reset();
    
    const select = document.getElementById('datapoints-equipment-filter');
    const selectedOption = select.options[select.selectedIndex];
    
    document.getElementById('datapoint-equipment-id').value = currentEquipmentFilter;
    document.getElementById('datapoint-raspberry-id').value = selectedOption.dataset.raspberry;
    
    if (datapointId) {
        document.getElementById('datapoint-modal-title').textContent = 'Edit Data Point';
        
        // Find and populate existing datapoint data
        const datapoint = datapointsData.find(dp => dp._id === datapointId);
        if (datapoint) {
            // Parse opcNodeId to extract namespace and variable name
            // Format: ns=4;s=W312_2_Kadou1 or ns=4;i=1234
            let namespace = 4;
            let variableName = '';
            
            if (datapoint.opcNodeId) {
                const nodeIdMatch = datapoint.opcNodeId.match(/ns=(\d+);s=(.+)/);
                if (nodeIdMatch) {
                    namespace = parseInt(nodeIdMatch[1]);
                    variableName = nodeIdMatch[2];
                }
            }
            
            document.getElementById('datapoint-namespace').value = namespace;
            document.getElementById('datapoint-variable-name').value = variableName;
            document.getElementById('datapoint-node-id').value = datapoint.opcNodeId || '';
            document.getElementById('datapoint-label').value = datapoint.label || '';
            document.getElementById('datapoint-description').value = datapoint.description || '';
            document.getElementById('datapoint-data-type').value = datapoint.dataType || 'String';
            document.getElementById('datapoint-unit').value = datapoint.unit || '';
            document.getElementById('datapoint-display-format').value = datapoint.displayFormat || 'Number';
            document.getElementById('datapoint-sort-order').value = datapoint.sortOrder || 0;
            document.getElementById('datapoint-enabled').checked = datapoint.enabled !== false;
            
            // Store the datapoint ID for updating
            document.getElementById('datapoint-form').dataset.editingId = datapointId;
        }
    } else {
        document.getElementById('datapoint-modal-title').textContent = 'Add Data Point';
        delete document.getElementById('datapoint-form').dataset.editingId;
    }
    
    modal.classList.add('show');
}

async function saveDatapoint() {
    const formData = {
        raspberryId: document.getElementById('datapoint-raspberry-id').value,
        equipmentId: document.getElementById('datapoint-equipment-id').value,
        opcNodeId: document.getElementById('datapoint-node-id').value,
        label: document.getElementById('datapoint-label').value,
        description: document.getElementById('datapoint-description').value,
        dataType: document.getElementById('datapoint-data-type').value,
        unit: document.getElementById('datapoint-unit').value,
        displayFormat: document.getElementById('datapoint-display-format').value,
        sortOrder: parseInt(document.getElementById('datapoint-sort-order').value),
        enabled: document.getElementById('datapoint-enabled').checked
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/datapoints`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-User': currentUser
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Data point saved successfully', 'success');
            closeModal('datapoint-modal');
            loadDatapoints(currentEquipmentFilter);
        } else {
            showToast(data.error || 'Failed to save', 'error');
        }
    } catch (error) {
        console.error('Error saving datapoint:', error);
        showToast('Error saving data', 'error');
    }
}

async function toggleDatapoint(id, enabled) {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/datapoints/${id}/toggle`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-User': currentUser
            },
            body: JSON.stringify({ enabled })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`Data point ${enabled ? 'enabled' : 'disabled'}`, 'success');
        }
    } catch (error) {
        console.error('Error toggling datapoint:', error);
    }
}

function editDatapoint(datapointId) {
    openDatapointModal(datapointId);
}

async function deleteDatapoint(datapointId) {
    // TODO: Implement delete datapoint
    showToast('Delete datapoint - Coming soon', 'info');
}

// ==========================================
// Modals
// ==========================================

function initializeModals() {
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            closeModal(modal.id);
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// ==========================================
// Node Discovery Functions
// ==========================================

let discoveredNodes = [];
let stagingList = [];

async function openDiscoveryModal() {
    if (!currentEquipmentFilter) {
        showToast('Please select an equipment first', 'error');
        return;
    }
    
    // Get equipment info to find raspberry ID
    const equipmentOption = document.querySelector(`#datapoints-equipment-filter option[value="${currentEquipmentFilter}"]`);
    const raspberryId = equipmentOption?.dataset.raspberry;
    
    if (!raspberryId) {
        showToast('Could not determine Raspberry Pi', 'error');
        return;
    }
    
    document.getElementById('discovery-modal').classList.add('show');
    stagingList = [];
    await loadDiscoveredNodes(raspberryId);
}

async function loadDiscoveredNodes(raspberryId) {
    try {
        document.getElementById('available-nodes-list').innerHTML = '<div class="loading">Loading nodes...</div>';
        
        const response = await fetch(`${API_BASE}/api/opcua/discovered-nodes/${raspberryId}`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            discoveredNodes = data.nodes;
            renderAvailableNodes();
        } else {
            document.getElementById('available-nodes-list').innerHTML = 
                '<div class="empty-state">Failed to load nodes</div>';
        }
    } catch (error) {
        console.error('Error loading discovered nodes:', error);
        document.getElementById('available-nodes-list').innerHTML = 
            '<div class="empty-state">Error loading nodes</div>';
    }
}

function renderAvailableNodes(filter = '') {
    const container = document.getElementById('available-nodes-list');
    
    const filtered = discoveredNodes.filter(node => 
        filter === '' || 
        node.variableName.toLowerCase().includes(filter.toLowerCase()) ||
        node.browseName.toLowerCase().includes(filter.toLowerCase())
    );
    
    document.getElementById('available-count').textContent = filtered.length;
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No nodes found</div>';
        return;
    }
    
    container.innerHTML = filtered.map(node => `
        <div class="node-item" data-variable="${node.variableName}" data-namespace="${node.namespace}">
            <div style="font-weight: 500; color: #333;">${node.variableName}</div>
            <div style="font-size: 12px; color: #666; margin-top: 2px;">
                Type: ${node.dataType} | Value: ${node.currentValue || 'N/A'}
            </div>
            <div style="margin-top: 5px;">
                <button class="btn btn-sm btn-primary" onclick="openNodeConfig('${node.variableName}', ${node.namespace}, '${node.opcNodeId}', '${node.dataType}')">
                    Configure
                </button>
            </div>
        </div>
    `).join('');
}

function filterAvailableNodes(search) {
    renderAvailableNodes(search);
}

function openNodeConfig(variableName, namespace, nodeId, dataType) {
    document.getElementById('config-variable-name').value = variableName;
    document.getElementById('config-namespace').value = namespace;
    document.getElementById('config-node-id').value = nodeId;
    document.getElementById('config-display-variable').value = variableName;
    document.getElementById('config-data-type').value = dataType;
    document.getElementById('config-label').value = '';
    document.getElementById('config-description').value = '';
    document.getElementById('config-unit').value = '';
    
    document.getElementById('node-config-modal').classList.add('show');
}

function addNodeToStaging() {
    const variableName = document.getElementById('config-variable-name').value;
    const namespace = document.getElementById('config-namespace').value;
    const nodeId = document.getElementById('config-node-id').value;
    const label = document.getElementById('config-label').value;
    const description = document.getElementById('config-description').value;
    const dataType = document.getElementById('config-data-type').value;
    const unit = document.getElementById('config-unit').value;
    
    // Check if already in staging
    if (stagingList.find(item => item.nodeId === nodeId)) {
        showToast('This node is already in the list', 'warning');
        return;
    }
    
    stagingList.push({
        variableName,
        namespace,
        nodeId,
        label,
        description,
        dataType,
        unit
    });
    
    renderStagingArea();
    closeModal('node-config-modal');
    showToast(`Added ${variableName} to list`, 'success');
}

function renderStagingArea() {
    const container = document.getElementById('staging-area');
    document.getElementById('staging-count').textContent = stagingList.length;
    document.getElementById('save-all-datapoints-btn').disabled = stagingList.length === 0;
    
    if (stagingList.length === 0) {
        container.innerHTML = '<div class="empty-state">No nodes selected yet</div>';
        return;
    }
    
    container.innerHTML = stagingList.map((item, index) => `
        <div class="staging-item" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 4px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <div style="font-weight: 500; color: #1976d2;">${item.label}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">
                        ${item.variableName} | ${item.dataType}${item.unit ? ' | ' + item.unit : ''}
                    </div>
                    ${item.description ? `<div style="font-size: 12px; color: #999; margin-top: 2px;">${item.description}</div>` : ''}
                </div>
                <button class="btn btn-sm btn-danger" onclick="removeFromStaging(${index})" style="margin-left: 10px;">
                    Remove
                </button>
            </div>
        </div>
    `).join('');
}

function removeFromStaging(index) {
    stagingList.splice(index, 1);
    renderStagingArea();
}

async function saveAllDatapoints() {
    if (stagingList.length === 0) return;
    
    const equipmentOption = document.querySelector(`#datapoints-equipment-filter option[value="${currentEquipmentFilter}"]`);
    const raspberryId = equipmentOption?.dataset.raspberry;
    
    if (!raspberryId) {
        showToast('Could not determine Raspberry Pi', 'error');
        return;
    }
    
    try {
        document.getElementById('save-all-datapoints-btn').disabled = true;
        document.getElementById('save-all-datapoints-btn').textContent = 'Saving...';
        
        let successCount = 0;
        
        for (const item of stagingList) {
            const formData = {
                raspberryId,
                equipmentId: currentEquipmentFilter,
                opcNodeId: item.nodeId,
                label: item.label,
                description: item.description,
                dataType: item.dataType,
                unit: item.unit,
                displayFormat: 'number',
                sortOrder: 0,
                enabled: true
            };
            
            const response = await fetch(`${API_BASE}/api/opcua/admin/datapoints`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-User': currentUser
                },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            if (data.success) {
                successCount++;
            }
        }
        
        showToast(`Successfully saved ${successCount} datapoints`, 'success');
        stagingList = [];
        renderStagingArea();
        closeModal('discovery-modal');
        loadDatapoints(currentEquipmentFilter);
        
    } catch (error) {
        console.error('Error saving datapoints:', error);
        showToast('Error saving datapoints', 'error');
    } finally {
        document.getElementById('save-all-datapoints-btn').disabled = false;
        document.getElementById('save-all-datapoints-btn').textContent = 'Save All Datapoints';
    }
}

// ==========================================
// Layout Editor Tab
// ==========================================

function initializeLayoutsTab() {
    document.getElementById('add-layout-btn').addEventListener('click', () => {
        openLayoutModal();
    });
    
    document.getElementById('layout-form').addEventListener('submit', (e) => {
        e.preventDefault();
        openCanvasEditor();
    });
    
    document.getElementById('layout-size-preset').addEventListener('change', (e) => {
        const customInputs = document.getElementById('custom-size-inputs');
        if (e.target.value === 'custom') {
            customInputs.style.display = 'flex';
        } else {
            customInputs.style.display = 'none';
            const [width, height] = e.target.value.split('x');
            document.getElementById('layout-width').value = width;
            document.getElementById('layout-height').value = height;
        }
    });
    
    // Canvas editor controls
    document.getElementById('canvas-close-btn').addEventListener('click', closeCanvasEditor);
    document.getElementById('canvas-save-btn').addEventListener('click', saveLayout);
    document.getElementById('canvas-preview-btn').addEventListener('click', previewLayout);
    
    // Initialize image modal
    initializeImageModal();
    
    // Initialize context menu
    initializeContextMenu();
}

async function loadLayouts() {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            layouts = data.layouts;
            renderLayouts(data.layouts);
        }
    } catch (error) {
        console.error('Error loading layouts:', error);
    }
}

function renderLayouts(layouts) {
    const container = document.getElementById('layouts-list');
    
    if (layouts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No layouts created yet. Click "Create New Layout" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = layouts.map(layout => `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">${layout.layoutName}</h3>
            </div>
            <div class="card-body">
                <div class="card-info">
                    <div class="card-info-item">
                        <span class="card-info-label">Canvas Size:</span>
                        <span>${layout.canvasWidth} × ${layout.canvasHeight}px</span>
                    </div>
                    <div class="card-info-item">
                        <span class="card-info-label">Raspberry Pi:</span>
                        <span>${layout.raspberryId}</span>
                    </div>
                    <div class="card-info-item">
                        <span class="card-info-label">Components:</span>
                        <span>${layout.components?.length || 0}</span>
                    </div>
                    <div class="card-info-item">
                        <span class="card-info-label">Layout URL:</span>
                        <code style="font-size: 12px; background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">
                            /monitor/layout/${layout.layoutId}
                        </code>
                        <button class="btn btn-sm" onclick="copyLayoutURL('${layout.layoutId}')" style="margin-left: 10px;">
                            📋 Copy URL
                        </button>
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary" onclick="editLayout('${layout.layoutId}')">Edit</button>
                <button class="btn btn-secondary" onclick="duplicateLayout('${layout.layoutId}')">Duplicate</button>
                <button class="btn btn-danger" onclick="deleteLayout('${layout.layoutId}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function openLayoutModal(layoutId = null) {
    const modal = document.getElementById('layout-modal');
    const form = document.getElementById('layout-form');
    form.reset();
    
    // Load raspberry pi options
    const raspberrySelect = document.getElementById('layout-raspberry-id');
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/raspberries`, {
            headers: { 'X-Session-User': currentUser }
        });
        const data = await response.json();
        if (data.success) {
            raspberrySelect.innerHTML = '<option value="">Select Raspberry Pi...</option>' +
                data.raspberries.map(rpi => 
                    `<option value="${rpi.raspberryId}">${rpi.raspberryName}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading raspberry pis:', error);
    }
    
    if (layoutId) {
        const layout = layouts.find(l => l.layoutId === layoutId);
        if (layout) {
            document.getElementById('layout-modal-title').textContent = 'Edit Layout';
            document.getElementById('layout-id').value = layout.layoutId;
            document.getElementById('layout-name').value = layout.layoutName;
            document.getElementById('layout-raspberry-id').value = layout.raspberryId;
            document.getElementById('layout-width').value = layout.canvasWidth;
            document.getElementById('layout-height').value = layout.canvasHeight;
            
            // Set preset or custom
            const preset = `${layout.canvasWidth}x${layout.canvasHeight}`;
            const presetSelect = document.getElementById('layout-size-preset');
            if (['1280x800', '800x1280', '1920x1080', '3840x2160'].includes(preset)) {
                presetSelect.value = preset;
            } else {
                presetSelect.value = 'custom';
                document.getElementById('custom-size-inputs').style.display = 'flex';
            }
        }
    } else {
        document.getElementById('layout-modal-title').textContent = 'Create New Layout';
        document.getElementById('layout-size-preset').value = '1280x800';
        document.getElementById('layout-width').value = 1280;
        document.getElementById('layout-height').value = 800;
    }
    
    modal.classList.add('show');
}

async function openCanvasEditor() {
    const layoutId = document.getElementById('layout-id').value;
    const layoutName = document.getElementById('layout-name').value;
    const raspberryId = document.getElementById('layout-raspberry-id').value;
    const width = parseInt(document.getElementById('layout-width').value);
    const height = parseInt(document.getElementById('layout-height').value);
    
    if (!layoutName || !raspberryId) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    // Initialize or load layout
    if (layoutId) {
        // Load existing layout
        currentLayout = layouts.find(l => l.layoutId === layoutId);
        if (!currentLayout) {
            showToast('Layout not found', 'error');
            return;
        }
        // Ensure all required properties exist
        if (!currentLayout.components) currentLayout.components = [];
        if (!currentLayout.backgroundColor) currentLayout.backgroundColor = '#ffffff';
    } else {
        // Create new layout
        currentLayout = {
            layoutId: 'layout-' + Date.now(),
            layoutName,
            raspberryId,
            canvasWidth: width,
            canvasHeight: height,
            components: [],
            backgroundColor: '#ffffff',
            backgroundImage: null
        };
    }
    
    // Close layout modal
    closeModal('layout-modal');
    
    // Open canvas editor
    const editorModal = document.getElementById('canvas-editor-modal');
    editorModal.style.display = 'block';
    
    // Setup canvas
    const canvas = document.getElementById('layout-canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    // Apply canvas background
    if (currentLayout.backgroundColor) {
        canvas.style.backgroundColor = currentLayout.backgroundColor;
    } else {
        canvas.style.backgroundColor = '#ffffff';
    }
    if (currentLayout.backgroundImage) {
        canvas.style.backgroundImage = `url('${currentLayout.backgroundImage}')`;
        canvas.style.backgroundSize = 'cover';
        canvas.style.backgroundPosition = 'center';
    } else {
        canvas.style.backgroundImage = 'none';
    }
    
    document.getElementById('canvas-editor-title').textContent = `Editing: ${layoutName}`;
    document.getElementById('canvas-editor-dimensions').textContent = `${width} × ${height}px`;
    
    // Load datapoints for the selected raspberry
    await loadCanvasDatapoints(raspberryId);
    
    // Load images for this layout
    await loadLayoutImages();
    
    // Render existing components
    renderCanvasComponents();
    
    // Initialize drag and drop
    initializeCanvasDragDrop();
    
    // Show canvas properties initially
    showCanvasProperties();
}

function closeCanvasEditor() {
    if (confirm('Close editor? Unsaved changes will be lost.')) {
        document.getElementById('canvas-editor-modal').style.display = 'none';
        currentLayout = null;
        selectedComponent = null;
        document.getElementById('layout-canvas').innerHTML = '';
        
        // Remove keyboard listener
        document.removeEventListener('keydown', handleCanvasKeydown);
    }
}

async function loadCanvasDatapoints(raspberryId) {
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/datapoints-by-raspberry/${raspberryId}`, {
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById('available-datapoints');
            if (data.datapoints.length === 0) {
                container.innerHTML = '<div class="empty-state">No datapoints configured</div>';
                return;
            }
            
            container.innerHTML = data.datapoints.map(dp => `
                <div class="datapoint-item" draggable="true" data-datapoint='${JSON.stringify(dp)}'>
                    <strong>${dp.label}</strong>
                    <small>${dp.opcNodeId}</small>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading datapoints:', error);
    }
}

function renderCanvasComponents() {
    const canvas = document.getElementById('layout-canvas');
    canvas.innerHTML = '';
    
    if (!currentLayout || !currentLayout.components) return;
    
    currentLayout.components.forEach(comp => {
        const el = createComponentElement(comp);
        canvas.appendChild(el);
        
        // Apply auto-scale if enabled
        if (comp.styles?.autoScale) {
            applyAutoScale(comp, el);
        }
    });
}

function createComponentElement(comp) {
    const el = document.createElement('div');
    el.className = 'canvas-component component-' + comp.type;
    el.dataset.id = comp.id;
    el.style.left = comp.x + 'px';
    el.style.top = comp.y + 'px';
    el.style.width = comp.width + 'px';
    el.style.height = comp.height + 'px';
    
    if (comp.styles) {
        if (comp.styles.fontSize) el.style.fontSize = comp.styles.fontSize + 'px';
        if (comp.styles.color) el.style.color = comp.styles.color;
        if (comp.styles.backgroundColor) el.style.backgroundColor = comp.styles.backgroundColor;
        if (comp.styles.fontWeight) el.style.fontWeight = comp.styles.fontWeight;
        if (comp.styles.textAlign) el.style.textAlign = comp.styles.textAlign;
        if (comp.styles.whiteSpace) el.style.whiteSpace = comp.styles.whiteSpace;
        if (comp.styles.overflow) el.style.overflow = comp.styles.overflow;
        if (comp.styles.lineHeight) el.style.lineHeight = comp.styles.lineHeight;
    }
    
    // Apply z-index and locked state
    el.style.zIndex = comp.zIndex || 0;
    if (comp.locked) {
        el.classList.add('locked');
        el.style.cursor = 'default';
    }
    
    if (comp.type === 'text') {
        el.textContent = comp.content || 'Text Label';
    } else if (comp.type === 'datapoint') {
        const baseFontSize = comp.styles?.fontSize || 16;
        el.innerHTML = `
            <div class="datapoint-label" style="font-size: ${baseFontSize * 0.7}px; opacity: 0.7; pointer-events: none;">${comp.label || 'Label'}</div>
            <div class="datapoint-value" style="font-size: ${baseFontSize}px; font-weight: bold; pointer-events: none;">${comp.datapointId ? '[Live Value]' : '---'}</div>
            <div class="datapoint-unit" style="font-size: ${baseFontSize * 0.6}px; opacity: 0.5; pointer-events: none;">${comp.unit || ''}</div>
        `;
    } else if (comp.type === 'image') {
        el.classList.add('component-image');
        el.style.backgroundImage = `url('${comp.imageUrl}')`;
        el.style.backgroundSize = comp.styles?.objectFit || 'contain';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.opacity = (comp.styles?.opacity || 100) / 100;
        
        if (comp.locked) {
            el.innerHTML = '<div style="position: absolute; top: 5px; left: 5px; font-size: 16px; opacity: 0.7;">🔒</div>';
        }
    }
    
    // Add resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `component-resize-handle ${pos}`;
        handle.dataset.handle = pos;
        el.appendChild(handle);
    });
    
    // Click to select
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        selectComponent(comp.id);
    }, true); // Use capture phase
    
    // Right-click for context menu
    el.addEventListener('contextmenu', (e) => {
        e.stopPropagation();
        e.preventDefault();
        selectComponent(comp.id);
        showContextMenu(e, comp);
    }, true); // Use capture phase
    
    return el;
}

function initializeCanvasDragDrop() {
    const canvas = document.getElementById('layout-canvas');
    const componentLibrary = document.querySelectorAll('.component-item');
    const datapointItems = document.getElementById('available-datapoints');
    
    // Drag from component library
    componentLibrary.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('componentType', e.target.dataset.type);
        });
    });
    
    // Drag from datapoints list  
    datapointItems.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('datapoint-item')) {
            e.dataTransfer.setData('datapoint', e.target.dataset.datapoint);
        }
    });
    
    // Canvas drop zone
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const componentType = e.dataTransfer.getData('componentType');
        const datapointData = e.dataTransfer.getData('datapoint');
        const imageData = e.dataTransfer.getData('text/plain');
        
        if (componentType) {
            addComponent(componentType, x, y);
        } else if (datapointData) {
            const dp = JSON.parse(datapointData);
            addDatapointComponent(dp, x, y);
        } else if (imageData) {
            try {
                const img = JSON.parse(imageData);
                addImageComponent(img, x, y);
                closeImageUploadModal();
            } catch (err) {
                console.error('Error parsing image data:', err);
            }
        }
    });
    
    // Canvas click to show canvas properties
    canvas.addEventListener('click', () => {
        selectComponent(null);
        showCanvasProperties();
    });
    
    // Component dragging
    canvas.addEventListener('mousedown', handleComponentMouseDown);
    document.addEventListener('mousemove', handleComponentMouseMove);
    document.addEventListener('mouseup', handleComponentMouseUp);
    
    // Keyboard listener for Delete/Backspace
    document.addEventListener('keydown', handleCanvasKeydown);
}

function handleCanvasKeydown(e) {
    // Only handle if canvas editor is open and a component is selected
    const editorModal = document.getElementById('canvas-editor-modal');
    if (editorModal.style.display !== 'block' || !selectedComponent) {
        return;
    }
    
    // Check if user is typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // Delete or Backspace key
    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteComponent();
    }
}

function addComponent(type, x, y) {
    if (!currentLayout) {
        showToast('Please create or open a layout first', 'error');
        return;
    }
    
    const comp = {
        id: 'comp-' + (++componentIdCounter),
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        width: 200,
        height: 60,
        zIndex: currentLayout.components.length,
        locked: false,
        styles: {
            fontSize: 16,
            color: '#333333',
            backgroundColor: type === 'text' ? '#ffffff' : '#f0f4ff',
            fontWeight: 'normal'
        }
    };
    
    if (type === 'text') {
        comp.content = 'Text Label';
    }
    
    currentLayout.components.push(comp);
    
    const el = createComponentElement(comp);
    document.getElementById('layout-canvas').appendChild(el);
    
    selectComponent(comp.id);
}

function addDatapointComponent(datapoint, x, y) {
    if (!currentLayout) {
        showToast('Please create or open a layout first', 'error');
        return;
    }
    
    const comp = {
        id: 'comp-' + (++componentIdCounter),
        type: 'datapoint',
        x: Math.round(x),
        y: Math.round(y),
        width: 200,
        height: 80,
        zIndex: currentLayout.components.length,
        locked: false,
        datapointId: datapoint._id,
        opcNodeId: datapoint.opcNodeId,
        label: datapoint.label,
        unit: datapoint.unit || '',
        styles: {
            fontSize: 16,
            baseFontSize: 16,
            color: '#1e40af',
            backgroundColor: '#f0f4ff',
            fontWeight: 'normal',
            autoScale: true  // Enable auto-scale by default for datapoints
        }
    };
    
    currentLayout.components.push(comp);
    
    const el = createComponentElement(comp);
    document.getElementById('layout-canvas').appendChild(el);
    
    // Apply auto-scale immediately
    if (comp.styles.autoScale) {
        applyAutoScale(comp, el);
    }
    
    selectComponent(comp.id);
}

function addImageComponent(image, x, y) {
    if (!currentLayout) {
        showToast('Please create or open a layout first', 'error');
        return;
    }
    
    const comp = {
        id: 'comp-' + (++componentIdCounter),
        type: 'image',
        x: Math.round(x),
        y: Math.round(y),
        width: 200,
        height: 200,
        zIndex: currentLayout.components.length,
        locked: false,
        imageUrl: image.url,
        imageName: image.name,
        imagePath: image.path,
        styles: {
            opacity: 100,
            objectFit: 'contain'
        }
    };
    
    currentLayout.components.push(comp);
    
    const el = createComponentElement(comp);
    document.getElementById('layout-canvas').appendChild(el);
    
    selectComponent(comp.id);
    
    // Auto-save after adding component
    autoSaveLayout();
}

function selectComponent(componentId) {
    // Remove previous selection
    document.querySelectorAll('.canvas-component').forEach(el => {
        el.classList.remove('selected');
    });
    
    selectedComponent = null;
    
    if (componentId) {
        const el = document.querySelector(`[data-id="${componentId}"]`);
        if (el) {
            el.classList.add('selected');
            selectedComponent = currentLayout.components.find(c => c.id === componentId);
            showComponentProperties(selectedComponent);
        }
    } else {
        hideComponentProperties();
    }
}

function showComponentProperties(comp) {
    const panel = document.getElementById('properties-panel');
    
    // Special case: if comp is null, show canvas properties
    if (!comp || comp === 'canvas') {
        showCanvasProperties();
        return;
    }
    
    panel.innerHTML = `
        <div class="property-group">
            <label>Position & Size</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                    <label style="font-size: 11px;">X:</label>
                    <input type="number" id="prop-x" value="${comp.x}" min="0">
                </div>
                <div>
                    <label style="font-size: 11px;">Y:</label>
                    <input type="number" id="prop-y" value="${comp.y}" min="0">
                </div>
                <div>
                    <label style="font-size: 11px;">Width:</label>
                    <input type="number" id="prop-width" value="${comp.width}" min="50">
                </div>
                <div>
                    <label style="font-size: 11px;">Height:</label>
                    <input type="number" id="prop-height" value="${comp.height}" min="30">
                </div>
            </div>
        </div>
        
        ${comp.type === 'text' ? `
            <div class="property-group">
                <label>Content</label>
                <textarea id="prop-content">${comp.content || ''}</textarea>
            </div>
        ` : ''}
        
        ${comp.type === 'datapoint' ? `
            <div class="property-group">
                <label>Label</label>
                <input type="text" id="prop-label" value="${comp.label || ''}">
            </div>
            <div class="property-group">
                <label>Unit</label>
                <input type="text" id="prop-unit" value="${comp.unit || ''}">
            </div>
            <div class="property-group">
                <label>OPC Node ID</label>
                <input type="text" value="${comp.opcNodeId || ''}" readonly style="background: #f5f5f5; font-size: 11px;">
            </div>
        ` : ''}
        
        ${comp.type === 'image' ? `
            <div class="property-group">
                <label>Image</label>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">${comp.imageName}</div>
                <button class="btn btn-secondary" onclick="openImageUploadModal()" style="width: 100%;">Change Image</button>
            </div>
            
            <div class="property-group">
                <label>Opacity (%)</label>
                <input type="number" id="prop-opacity" value="${comp.styles?.opacity || 100}" min="0" max="100">
            </div>
            
            <div class="property-group">
                <label>Fit Mode</label>
                <select id="prop-objectfit">
                    <option value="contain" ${comp.styles?.objectFit === 'contain' ? 'selected' : ''}>Contain</option>
                    <option value="cover" ${comp.styles?.objectFit === 'cover' ? 'selected' : ''}>Cover</option>
                    <option value="fill" ${comp.styles?.objectFit === 'fill' ? 'selected' : ''}>Fill</option>
                    <option value="scale-down" ${comp.styles?.objectFit === 'scale-down' ? 'selected' : ''}>Scale Down</option>
                </select>
            </div>
        ` : ''}
        
        ${comp.type !== 'image' ? `
            <div class="property-group">
                <label>Font Size</label>
                <input type="number" id="prop-fontsize" value="${comp.styles?.fontSize || 16}" min="8" max="100">
            </div>
            
            <div class="property-group">
                <label>Text Color</label>
                <div class="color-picker-group">
                    <input type="color" id="prop-color" value="${comp.styles?.color || '#333333'}">
                    <input type="text" id="prop-color-text" value="${comp.styles?.color || '#333333'}">
                </div>
            </div>
            
            <div class="property-group">
                <label>Background Color</label>
                <div class="color-picker-group">
                    <input type="color" id="prop-bgcolor" value="${comp.styles?.backgroundColor || '#ffffff'}">
                    <input type="text" id="prop-bgcolor-text" value="${comp.styles?.backgroundColor || '#ffffff'}">
                </div>
            </div>
            
            <div class="property-group">
                <label>Font Weight</label>
                <select id="prop-fontweight">
                    <option value="normal" ${comp.styles?.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="bold" ${comp.styles?.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
                </select>
            </div>
            
            <div class="property-group">
                <label>Text Alignment</label>
                <select id="prop-textalign">
                    <option value="left" ${comp.styles?.textAlign === 'left' ? 'selected' : ''}>Left</option>
                    <option value="center" ${comp.styles?.textAlign === 'center' ? 'selected' : ''}>Center</option>
                    <option value="right" ${comp.styles?.textAlign === 'right' ? 'selected' : ''}>Right</option>
                    <option value="justify" ${comp.styles?.textAlign === 'justify' ? 'selected' : ''}>Justify</option>
                </select>
            </div>
            
            <div class="property-group">
                <label>Word Wrap</label>
                <select id="prop-wordwrap">
                    <option value="normal" ${!comp.styles?.whiteSpace || comp.styles?.whiteSpace === 'normal' ? 'selected' : ''}>Wrap Text</option>
                    <option value="nowrap" ${comp.styles?.whiteSpace === 'nowrap' ? 'selected' : ''}>No Wrap</option>
                </select>
            </div>
            
            <div class="property-group">
                <label>Text Overflow</label>
                <select id="prop-overflow">
                    <option value="visible" ${!comp.styles?.overflow || comp.styles?.overflow === 'visible' ? 'selected' : ''}>Visible</option>
                    <option value="hidden" ${comp.styles?.overflow === 'hidden' ? 'selected' : ''}>Hidden</option>
                    <option value="scroll" ${comp.styles?.overflow === 'scroll' ? 'selected' : ''}>Scroll</option>
                    <option value="auto" ${comp.styles?.overflow === 'auto' ? 'selected' : ''}>Auto</option>
                </select>
            </div>
            
            <div class="property-group">
                <label>Line Height</label>
                <input type="number" id="prop-lineheight" value="${comp.styles?.lineHeight || 1.5}" min="0.5" max="3" step="0.1">
            </div>
            
            <div class="property-group">
                <label>Auto Scale Text</label>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; font-weight: normal; font-size: 13px;">
                        <input type="checkbox" id="prop-autoscale" ${comp.styles?.autoScale ? 'checked' : ''} style="margin-right: 8px;">
                        Auto scale text to fit
                    </label>
                    <small style="color: #666; font-size: 11px; margin-top: -4px;">Text size adjusts when box is resized</small>
                </div>
            </div>
        ` : ''}
        
        <div class="property-actions">
            <button type="button" class="btn btn-danger" onclick="deleteComponent()">Delete</button>
        </div>
    `;
    
    // Add real-time event listeners to all property inputs
    attachPropertyListeners();
}

function showCanvasProperties() {
    if (!currentLayout) return;
    
    const panel = document.getElementById('properties-panel');
    
    panel.innerHTML = `
        <h4 style="margin-bottom: 15px;">Canvas Properties</h4>
        
        <div class="property-group">
            <label>Background Color</label>
            <div class="color-picker-group">
                <input type="color" id="canvas-bgcolor" value="${currentLayout.backgroundColor || '#ffffff'}">
                <input type="text" id="canvas-bgcolor-text" value="${currentLayout.backgroundColor || '#ffffff'}">
            </div>
        </div>
        
        <div class="property-group">
            <label>Background Image</label>
            ${currentLayout.backgroundImage ? `
                <div style="margin-bottom: 10px;">
                    <img src="${currentLayout.backgroundImage}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;">
                    <button class="btn btn-danger" onclick="removeCanvasBackground()" style="width: 100%;">Remove Background</button>
                </div>
            ` : `
                <button class="btn btn-secondary" onclick="openImageUploadModal('background')" style="width: 100%;">Set Background Image</button>
            `}
        </div>
    `;
    
    // Add canvas property listeners
    const bgcolorEl = document.getElementById('canvas-bgcolor');
    const bgcolorTextEl = document.getElementById('canvas-bgcolor-text');
    
    if (bgcolorEl && bgcolorTextEl) {
        bgcolorEl.addEventListener('input', (e) => {
            bgcolorTextEl.value = e.target.value;
            applyCanvasBackground();
        });
        bgcolorTextEl.addEventListener('input', (e) => {
            bgcolorEl.value = e.target.value;
            applyCanvasBackground();
        });
    }
}

function applyCanvasBackground() {
    const bgcolor = document.getElementById('canvas-bgcolor')?.value;
    
    if (bgcolor) {
        currentLayout.backgroundColor = bgcolor;
        const canvas = document.getElementById('layout-canvas');
        canvas.style.backgroundColor = bgcolor;
    }
}

function setCanvasBackgroundImage(imageUrl) {
    currentLayout.backgroundImage = imageUrl;
    const canvas = document.getElementById('layout-canvas');
    canvas.style.backgroundImage = `url('${imageUrl}')`;
    canvas.style.backgroundSize = 'cover';
    canvas.style.backgroundPosition = 'center';
    canvas.style.backgroundRepeat = 'no-repeat';
    
    closeImageUploadModal();
    showCanvasProperties();
    showToast('Background image set', 'success');
}

function removeCanvasBackground() {
    currentLayout.backgroundImage = null;
    const canvas = document.getElementById('layout-canvas');
    canvas.style.backgroundImage = 'none';
    showCanvasProperties();
}

function attachPropertyListeners() {
    // Position & Size
    ['prop-x', 'prop-y', 'prop-width', 'prop-height'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', applyComponentProperties);
    });
    
    // Content
    const contentEl = document.getElementById('prop-content');
    if (contentEl) contentEl.addEventListener('input', applyComponentProperties);
    
    // Datapoint fields
    const labelEl = document.getElementById('prop-label');
    if (labelEl) labelEl.addEventListener('input', applyComponentProperties);
    
    const unitEl = document.getElementById('prop-unit');
    if (unitEl) unitEl.addEventListener('input', applyComponentProperties);
    
    // Font Size
    const fontsizeEl = document.getElementById('prop-fontsize');
    if (fontsizeEl) fontsizeEl.addEventListener('input', applyComponentProperties);
    
    // Colors with sync
    const colorEl = document.getElementById('prop-color');
    const colorTextEl = document.getElementById('prop-color-text');
    if (colorEl && colorTextEl) {
        colorEl.addEventListener('input', (e) => {
            colorTextEl.value = e.target.value;
            applyComponentProperties();
        });
        colorTextEl.addEventListener('input', (e) => {
            colorEl.value = e.target.value;
            applyComponentProperties();
        });
    }
    
    const bgcolorEl = document.getElementById('prop-bgcolor');
    const bgcolorTextEl = document.getElementById('prop-bgcolor-text');
    if (bgcolorEl && bgcolorTextEl) {
        bgcolorEl.addEventListener('input', (e) => {
            bgcolorTextEl.value = e.target.value;
            applyComponentProperties();
        });
        bgcolorTextEl.addEventListener('input', (e) => {
            bgcolorEl.value = e.target.value;
            applyComponentProperties();
        });
    }
    
    // Dropdowns
    ['prop-fontweight', 'prop-textalign', 'prop-wordwrap', 'prop-overflow'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyComponentProperties);
    });
    
    // Line Height
    const lineheightEl = document.getElementById('prop-lineheight');
    if (lineheightEl) lineheightEl.addEventListener('input', applyComponentProperties);
    
    // Auto scale checkbox
    const autoscaleEl = document.getElementById('prop-autoscale');
    if (autoscaleEl) autoscaleEl.addEventListener('change', applyComponentProperties);
    
    // Image specific properties
    const opacityEl = document.getElementById('prop-opacity');
    if (opacityEl) opacityEl.addEventListener('input', applyComponentProperties);
    
    const objectfitEl = document.getElementById('prop-objectfit');
    if (objectfitEl) objectfitEl.addEventListener('change', applyComponentProperties);
}

function hideComponentProperties() {
    const panel = document.getElementById('properties-panel');
    panel.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #999;">Select a component to edit properties</div>';
}

function applyComponentProperties() {
    if (!selectedComponent) return;
    
    // Update component data
    selectedComponent.x = parseInt(document.getElementById('prop-x').value);
    selectedComponent.y = parseInt(document.getElementById('prop-y').value);
    selectedComponent.width = parseInt(document.getElementById('prop-width').value);
    selectedComponent.height = parseInt(document.getElementById('prop-height').value);
    
    if (selectedComponent.type === 'text') {
        selectedComponent.content = document.getElementById('prop-content').value;
    }
    
    if (selectedComponent.type === 'datapoint') {
        selectedComponent.label = document.getElementById('prop-label')?.value;
        selectedComponent.unit = document.getElementById('prop-unit')?.value;
    }
    
    let shouldAutoScale = false;
    
    if (selectedComponent.type === 'image') {
        selectedComponent.styles = {
            opacity: parseInt(document.getElementById('prop-opacity')?.value || 100),
            objectFit: document.getElementById('prop-objectfit')?.value || 'contain'
        };
    } else {
        const baseFontSize = parseInt(document.getElementById('prop-fontsize')?.value || 16);
        const autoScale = document.getElementById('prop-autoscale')?.checked || false;
        
        selectedComponent.styles = {
            fontSize: baseFontSize,
            baseFontSize: baseFontSize, // Store original font size
            color: document.getElementById('prop-color')?.value,
            backgroundColor: document.getElementById('prop-bgcolor')?.value,
            fontWeight: document.getElementById('prop-fontweight')?.value,
            textAlign: document.getElementById('prop-textalign')?.value,
            whiteSpace: document.getElementById('prop-wordwrap')?.value,
            overflow: document.getElementById('prop-overflow')?.value,
            lineHeight: parseFloat(document.getElementById('prop-lineheight')?.value || 1.5),
            autoScale: autoScale
        };
        
        shouldAutoScale = autoScale;
    }
    
    // Re-render component
    const el = document.querySelector(`[data-id="${selectedComponent.id}"]`);
    if (el) {
        const parent = el.parentNode;
        const newEl = createComponentElement(selectedComponent);
        parent.replaceChild(newEl, el);
        newEl.classList.add('selected');
        
        // If auto-scale is enabled, calculate and apply scaled font size
        if (shouldAutoScale) {
            applyAutoScale(selectedComponent, newEl);
        }
    }
}

function applyAutoScale(comp, element) {
    if (!comp.styles?.autoScale) return;
    
    const baseFontSize = comp.styles.baseFontSize || comp.styles.fontSize || 16;
    const containerWidth = comp.width;
    const containerHeight = comp.height;
    const padding = 20; // Padding on all sides
    
    // Get text content
    let textContent = '';
    if (comp.type === 'text') {
        textContent = comp.content || '';
    } else if (comp.type === 'datapoint') {
        // For datapoints, measure the longest possible text (simulate actual value like "999.99")
        textContent = (comp.label || 'Label') + '\n[Live Value]\n' + (comp.unit || '');
    }
    
    if (!textContent.trim()) return;
    
    // Create temporary element to measure text
    const tempEl = document.createElement('div');
    tempEl.style.position = 'absolute';
    tempEl.style.visibility = 'hidden';
    tempEl.style.left = '-9999px';
    tempEl.style.display = 'flex';
    tempEl.style.alignItems = 'center';
    tempEl.style.justifyContent = 'center';
    tempEl.style.textAlign = comp.styles.textAlign || 'center';
    tempEl.style.fontWeight = comp.styles.fontWeight || 'normal';
    tempEl.style.lineHeight = comp.styles.lineHeight || '1.5';
    tempEl.style.whiteSpace = comp.styles.whiteSpace || 'pre-wrap';
    tempEl.style.wordWrap = 'break-word';
    tempEl.style.padding = padding + 'px';
    tempEl.textContent = textContent;
    
    document.body.appendChild(tempEl);
    
    // Binary search for optimal font size
    let minSize = 8;
    let maxSize = Math.max(200, baseFontSize * 3); // Allow scaling up
    let optimalSize = baseFontSize;
    let iterations = 0;
    const maxIterations = 20;
    
    while (maxSize - minSize > 1 && iterations < maxIterations) {
        iterations++;
        const testSize = Math.floor((minSize + maxSize) / 2);
        tempEl.style.fontSize = testSize + 'px';
        tempEl.style.width = containerWidth + 'px';
        tempEl.style.height = containerHeight + 'px';
        
        // Check if text fits without overflow
        const isOverflowing = tempEl.scrollHeight > containerHeight || tempEl.scrollWidth > containerWidth;
        
        if (!isOverflowing) {
            optimalSize = testSize;
            minSize = testSize;
        } else {
            maxSize = testSize;
        }
    }
    
    document.body.removeChild(tempEl);
    
    // Apply the optimal font size
    comp.styles.fontSize = optimalSize;
    element.style.fontSize = optimalSize + 'px';
    
    // For datapoints, also update the child elements' font sizes
    if (comp.type === 'datapoint') {
        const labelEl = element.querySelector('.datapoint-label');
        const valueEl = element.querySelector('.datapoint-value');
        const unitEl = element.querySelector('.datapoint-unit');
        
        if (labelEl) labelEl.style.fontSize = (optimalSize * 0.7) + 'px';
        if (valueEl) valueEl.style.fontSize = optimalSize + 'px';
        if (unitEl) unitEl.style.fontSize = (optimalSize * 0.6) + 'px';
    }
}

function deleteComponent() {
    if (!selectedComponent) return;
    
    if (confirm('Delete this component?')) {
        // Remove from data
        currentLayout.components = currentLayout.components.filter(c => c.id !== selectedComponent.id);
        
        // Remove from DOM
        const el = document.querySelector(`[data-id="${selectedComponent.id}"]`);
        if (el) el.remove();
        
        selectedComponent = null;
        hideComponentProperties();
        
        showToast('Component deleted', 'success');
        
        // Auto-save after deletion
        autoSaveLayout();
    }
}

let draggedElement = null;
let offsetX = 0, offsetY = 0;

function handleComponentMouseDown(e) {
    // First check if it's a resize handle
    const handle = e.target.closest('.component-resize-handle');
    const component = e.target.closest('.canvas-component');
    
    if (!component) return;
    
    // Check if component is locked
    const compId = component.dataset.id;
    const comp = currentLayout.components.find(c => c.id === compId);
    if (comp && comp.locked) {
        return; // Don't allow dragging or resizing locked components
    }
    
    if (handle) {
        isResizing = true;
        resizingHandle = handle.dataset.handle;
        resizingComponent = component;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        originalWidth = parseInt(component.style.width);
        originalHeight = parseInt(component.style.height);
        originalX = parseInt(component.style.left);
        originalY = parseInt(component.style.top);
        e.preventDefault();
    } else {
        isDragging = true;
        draggedElement = component;
        const rect = component.getBoundingClientRect();
        const canvas = document.getElementById('layout-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
    }
}

let resizingHandle = null;
let resizingComponent = null;
let originalWidth = 0, originalHeight = 0, originalX = 0, originalY = 0;

function handleComponentMouseMove(e) {
    if (isDragging && draggedElement) {
        const canvas = document.getElementById('layout-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        let newX = e.clientX - canvasRect.left - offsetX;
        let newY = e.clientY - canvasRect.top - offsetY;
        
        // Constrain to canvas
        newX = Math.max(0, Math.min(newX, currentLayout.canvasWidth - parseInt(draggedElement.style.width)));
        newY = Math.max(0, Math.min(newY, currentLayout.canvasHeight - parseInt(draggedElement.style.height)));
        
        draggedElement.style.left = newX + 'px';
        draggedElement.style.top = newY + 'px';
        
        draggedElement.classList.add('dragging');
    } else if (isResizing && resizingComponent) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        let newWidth = originalWidth;
        let newHeight = originalHeight;
        let newX = originalX;
        let newY = originalY;
        
        switch(resizingHandle) {
            case 'se':
                newWidth = Math.max(50, originalWidth + deltaX);
                newHeight = Math.max(30, originalHeight + deltaY);
                break;
            case 'sw':
                newWidth = Math.max(50, originalWidth - deltaX);
                newHeight = Math.max(30, originalHeight + deltaY);
                newX = originalX + (originalWidth - newWidth);
                break;
            case 'ne':
                newWidth = Math.max(50, originalWidth + deltaX);
                newHeight = Math.max(30, originalHeight - deltaY);
                newY = originalY + (originalHeight - newHeight);
                break;
            case 'nw':
                newWidth = Math.max(50, originalWidth - deltaX);
                newHeight = Math.max(30, originalHeight - deltaY);
                newX = originalX + (originalWidth - newWidth);
                newY = originalY + (originalHeight - newHeight);
                break;
        }
        
        resizingComponent.style.width = newWidth + 'px';
        resizingComponent.style.height = newHeight + 'px';
        resizingComponent.style.left = newX + 'px';
        resizingComponent.style.top = newY + 'px';
    }
}

function handleComponentMouseUp(e) {
    let needsAutoSave = false;
    
    if (isDragging && draggedElement) {
        draggedElement.classList.remove('dragging');
        
        // Update component data
        const compId = draggedElement.dataset.id;
        const comp = currentLayout.components.find(c => c.id === compId);
        if (comp) {
            comp.x = parseInt(draggedElement.style.left);
            comp.y = parseInt(draggedElement.style.top);
            
            // Update properties panel if selected
            if (selectedComponent && selectedComponent.id === compId) {
                document.getElementById('prop-x').value = comp.x;
                document.getElementById('prop-y').value = comp.y;
            }
            needsAutoSave = true;
        }
        
        draggedElement = null;
        isDragging = false;
    } else if (isResizing && resizingComponent) {
        // Update component data
        const compId = resizingComponent.dataset.id;
        const comp = currentLayout.components.find(c => c.id === compId);
        if (comp) {
            comp.x = parseInt(resizingComponent.style.left);
            comp.y = parseInt(resizingComponent.style.top);
            comp.width = parseInt(resizingComponent.style.width);
            comp.height = parseInt(resizingComponent.style.height);
            
            // Update properties panel if selected
            if (selectedComponent && selectedComponent.id === compId) {
                document.getElementById('prop-x').value = comp.x;
                document.getElementById('prop-y').value = comp.y;
                document.getElementById('prop-width').value = comp.width;
                document.getElementById('prop-height').value = comp.height;
            }
            
            // If auto-scale is enabled, recalculate font size
            if (comp.styles?.autoScale) {
                applyAutoScale(comp, resizingComponent);
            }
            needsAutoSave = true;
        }
        
        resizingComponent = null;
        isResizing = false;
        resizingHandle = null;
    }
    
    // Auto-save after drag or resize
    if (needsAutoSave) {
        autoSaveLayout();
    }
}

async function saveLayout() {
    if (!currentLayout) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-User': currentUser
            },
            body: JSON.stringify(currentLayout)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Layout saved successfully!', 'success');
            // Reload layouts list
            await loadLayouts();
        } else {
            showToast(data.error || 'Failed to save layout', 'error');
        }
    } catch (error) {
        console.error('Error saving layout:', error);
        showToast('Error saving layout', 'error');
    }
}

// Auto-save with debouncing
let autoSaveTimeout = null;
async function autoSaveLayout() {
    if (!currentLayout) return;
    
    // Clear existing timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    // Debounce: wait 500ms after last change before saving
    autoSaveTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/opcua/admin/layouts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-User': currentUser
                },
                body: JSON.stringify(currentLayout)
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Layout auto-saved');
                // Show subtle indicator
                const saveBtn = document.getElementById('canvas-save-btn');
                if (saveBtn) {
                    const originalText = saveBtn.textContent;
                    saveBtn.textContent = '✓ Saved';
                    setTimeout(() => {
                        saveBtn.textContent = originalText;
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('Auto-save error:', error);
        }
    }, 500);
}

function previewLayout() {
    if (!currentLayout) return;
    
    const url = `${API_BASE}/monitor/layout/${currentLayout.layoutId}`;
    window.open(url, '_blank');
}

async function editLayout(layoutId) {
    await openLayoutModal(layoutId);
}

async function deleteLayout(layoutId) {
    if (!confirm('Delete this layout? This cannot be undone.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts/${layoutId}`, {
            method: 'DELETE',
            headers: { 'X-Session-User': currentUser }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Layout deleted', 'success');
            loadLayouts();
        }
    } catch (error) {
        console.error('Error deleting layout:', error);
    }
}

async function duplicateLayout(layoutId) {
    const layout = layouts.find(l => l.layoutId === layoutId);
    if (!layout) return;
    
    const newLayout = {
        ...layout,
        layoutId: 'layout-' + Date.now(),
        layoutName: layout.layoutName + ' (Copy)',
        components: JSON.parse(JSON.stringify(layout.components)) // Deep clone
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-User': currentUser
            },
            body: JSON.stringify(newLayout)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Layout duplicated', 'success');
            loadLayouts();
        }
    } catch (error) {
        console.error('Error duplicating layout:', error);
    }
}

function copyLayoutURL(layoutId) {
    const url = `${window.location.origin}/monitor/layout/${layoutId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('URL copied to clipboard!', 'success');
    });
}

// ==========================================
// Image Upload Functions
// ==========================================

async function openImageUploadModal(mode = 'component') {
    if (!currentLayout) {
        showToast('Please create or open a layout first', 'error');
        return;
    }
    
    imageModalMode = mode;
    document.getElementById('image-upload-modal').style.display = 'flex';
    
    // Update modal title based on mode
    const modalTitle = document.querySelector('#image-upload-modal .modal-header h3');
    if (modalTitle) {
        modalTitle.textContent = mode === 'background' ? 'Set Canvas Background' : 'Manage Images';
    }
    
    // Load existing images for this layout
    await loadLayoutImages();
    
    // Switch to gallery tab
    switchImageTab('gallery');
}

function closeImageUploadModal() {
    document.getElementById('image-upload-modal').style.display = 'none';
    selectedFiles = [];
    imageModalMode = 'component';
    document.getElementById('image-preview-area').style.display = 'none';
    document.getElementById('upload-images-btn').style.display = 'none';
    
    // Reset modal title
    const modalTitle = document.querySelector('#image-upload-modal .modal-header h3');
    if (modalTitle) {
        modalTitle.textContent = 'Manage Images';
    }
}

function switchImageTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.image-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.image-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}

// Initialize image modal interactions
function initializeImageModal() {
    const fileInput = document.getElementById('image-file-input');
    const uploadArea = document.getElementById('upload-area');
    const uploadBtn = document.getElementById('upload-images-btn');
    
    // Tab switching
    document.querySelectorAll('.image-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchImageTab(btn.dataset.tab));
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files);
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFileSelect(e.dataTransfer.files);
    });
    
    // Upload button
    uploadBtn.addEventListener('click', uploadSelectedImages);
}

function handleFileSelect(files) {
    selectedFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (selectedFiles.length === 0) {
        showToast('Please select image files', 'error');
        return;
    }
    
    // Show previews
    const previewArea = document.getElementById('image-preview-area');
    previewArea.innerHTML = '';
    previewArea.style.display = 'grid';
    
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.createElement('div');
            preview.className = 'image-preview-item';
            preview.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}">
                <button class="remove-preview" onclick="removePreview(${index})">&times;</button>
            `;
            previewArea.appendChild(preview);
        };
        reader.readAsDataURL(file);
    });
    
    document.getElementById('upload-images-btn').style.display = 'block';
}

function removePreview(index) {
    selectedFiles.splice(index, 1);
    
    if (selectedFiles.length === 0) {
        document.getElementById('image-preview-area').style.display = 'none';
        document.getElementById('upload-images-btn').style.display = 'none';
    } else {
        handleFileSelect(selectedFiles);
    }
}

async function uploadSelectedImages() {
    if (!currentLayout || selectedFiles.length === 0) return;
    
    const uploadBtn = document.getElementById('upload-images-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    try {
        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('images', file);
        });
        
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts/${currentLayout.layoutId}/images`, {
            method: 'POST',
            headers: {
                'X-Session-User': currentUser
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`Uploaded ${data.images.length} image(s)`, 'success');
            uploadedImages = [...uploadedImages, ...data.images];
            selectedFiles = [];
            
            // Clear preview
            document.getElementById('image-preview-area').style.display = 'none';
            document.getElementById('upload-images-btn').style.display = 'none';
            document.getElementById('image-file-input').value = '';
            
            // Switch to gallery and refresh
            switchImageTab('gallery');
            await loadLayoutImages();
        } else {
            showToast('Failed to upload images', 'error');
        }
    } catch (error) {
        console.error('Error uploading images:', error);
        showToast('Error uploading images', 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload All';
    }
}

async function loadLayoutImages() {
    if (!currentLayout) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts/${currentLayout.layoutId}/images`, {
            headers: {
                'X-Session-User': currentUser
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            uploadedImages = data.images;
            renderImageGallery();
        }
    } catch (error) {
        console.error('Error loading images:', error);
    }
}

function renderImageGallery() {
    const gallery = document.getElementById('image-gallery');
    
    if (uploadedImages.length === 0) {
        gallery.innerHTML = '<div class="empty-state">No images uploaded yet</div>';
        return;
    }
    
    // Add help text based on mode
    const helpText = imageModalMode === 'background' 
        ? '<div style="padding: 10px; background: #e3f2fd; border-radius: 4px; margin-bottom: 10px; text-align: center; color: #1976d2;">Click an image to set it as canvas background</div>'
        : '<div style="padding: 10px; background: #e8f5e9; border-radius: 4px; margin-bottom: 10px; text-align: center; color: #388e3c;">Click an image to add it to the canvas</div>';
    
    gallery.innerHTML = helpText + uploadedImages.map(img => `
        <div class="gallery-item" data-image='${JSON.stringify(img)}'>
            <img src="${img.url}" alt="${img.name}">
            <div class="image-name">${img.name}</div>
            <button class="delete-image" onclick="deleteImage('${img.path}')">&times;</button>
        </div>
    `).join('');
    
    // Add click handlers to gallery items
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't trigger if clicking delete button
            if (e.target.classList.contains('delete-image')) return;
            
            const imgData = JSON.parse(item.dataset.image);
            
            if (imageModalMode === 'background') {
                // Set as canvas background
                setCanvasBackgroundImage(imgData.url);
            } else {
                // Add as image component to center of canvas
                const canvas = document.getElementById('layout-canvas');
                const rect = canvas.getBoundingClientRect();
                const centerX = rect.width / 2 - 100; // Center with 200px default width
                const centerY = rect.height / 2 - 100; // Center with 200px default height
                addImageComponent(imgData, centerX, centerY);
                closeImageUploadModal();
                showToast('Image added to canvas', 'success');
            }
        });
        item.style.cursor = 'pointer';
    });
}

function handleGalleryDragStart(e) {
    e.target.classList.add('dragging');
    const imageData = e.target.dataset.image;
    e.dataTransfer.setData('text/plain', imageData);
    e.dataTransfer.effectAllowed = 'copy';
}

function handleGalleryDragEnd(e) {
    e.target.classList.remove('dragging');
}

async function deleteImage(imagePath) {
    if (!confirm('Delete this image? This cannot be undone.')) return;
    
    try {
        const fileName = imagePath.split('/').pop();
        const response = await fetch(`${API_BASE}/api/opcua/admin/layouts/${currentLayout.layoutId}/images/${fileName}`, {
            method: 'DELETE',
            headers: {
                'X-Session-User': currentUser
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Image deleted', 'success');
            await loadLayoutImages();
        } else {
            showToast('Failed to delete image', 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showToast('Error deleting image', 'error');
    }
}

// ==========================================
// Context Menu Functions
// ==========================================

function initializeContextMenu() {
    const contextMenu = document.getElementById('component-context-menu');
    
    // Close context menu on click outside
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });
    
    // Context menu item actions
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.dataset.action;
            handleContextMenuAction(action);
            contextMenu.style.display = 'none';
        });
    });
}

function showContextMenu(e, component) {
    e.preventDefault();
    e.stopPropagation();
    
    contextMenuTarget = component;
    const contextMenu = document.getElementById('component-context-menu');
    
    // Update lock menu text
    document.getElementById('lock-menu-text').textContent = 
        component.locked ? 'Unlock Position' : 'Lock Position';
    
    // Position the menu
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
}

function handleContextMenuAction(action) {
    if (!contextMenuTarget) return;
    
    switch (action) {
        case 'move-front':
            moveComponentToFront(contextMenuTarget);
            break;
        case 'move-forward':
            moveComponentForward(contextMenuTarget);
            break;
        case 'move-backward':
            moveComponentBackward(contextMenuTarget);
            break;
        case 'move-back':
            moveComponentToBack(contextMenuTarget);
            break;
        case 'lock':
            toggleComponentLock(contextMenuTarget);
            break;
        case 'duplicate':
            duplicateComponent(contextMenuTarget);
            break;
        case 'delete':
            deleteComponent();
            break;
    }
}

function moveComponentToFront(comp) {
    const maxZ = Math.max(...currentLayout.components.map(c => c.zIndex || 0));
    comp.zIndex = maxZ + 1;
    updateComponentZIndex(comp);
    autoSaveLayout();
}

function moveComponentForward(comp) {
    const currentZ = comp.zIndex || 0;
    comp.zIndex = currentZ + 1;
    updateComponentZIndex(comp);
    autoSaveLayout();
}

function moveComponentBackward(comp) {
    const currentZ = comp.zIndex || 0;
    comp.zIndex = Math.max(0, currentZ - 1);
    updateComponentZIndex(comp);
    autoSaveLayout();
}

function moveComponentToBack(comp) {
    comp.zIndex = 0;
    // Shift other components up
    currentLayout.components.forEach(c => {
        if (c.id !== comp.id && c.zIndex > 0) {
            c.zIndex++;
        }
    });
    updateComponentZIndex(comp);
    autoSaveLayout();
}

function updateComponentZIndex(comp) {
    const el = document.querySelector(`[data-id="${comp.id}"]`);
    if (el) {
        el.style.zIndex = comp.zIndex || 0;
    }
}

function toggleComponentLock(comp) {
    comp.locked = !comp.locked;
    const el = document.querySelector(`[data-id="${comp.id}"]`);
    if (el) {
        if (comp.locked) {
            el.classList.add('locked');
            el.style.cursor = 'default';
        } else {
            el.classList.remove('locked');
            el.style.cursor = 'move';
        }
    }
    showToast(comp.locked ? 'Component locked' : 'Component unlocked', 'success');
    autoSaveLayout();
}

function duplicateComponent(comp) {
    const newComp = {
        ...comp,
        id: 'comp-' + Date.now(),
        x: comp.x + 20,
        y: comp.y + 20
    };
    
    currentLayout.components.push(newComp);
    const el = createComponentElement(newComp);
    document.getElementById('layout-canvas').appendChild(el);
    selectComponent(newComp.id);
    showToast('Component duplicated', 'success');
    
    // Auto-save after duplication
    autoSaveLayout();
}

// ==========================================
// Utilities
// ==========================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
