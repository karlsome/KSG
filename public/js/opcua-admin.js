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
    } else {
        // Create new layout
        currentLayout = {
            layoutId: 'layout-' + Date.now(),
            layoutName,
            raspberryId,
            canvasWidth: width,
            canvasHeight: height,
            components: []
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
    
    document.getElementById('canvas-editor-title').textContent = `Editing: ${layoutName}`;
    document.getElementById('canvas-editor-dimensions').textContent = `${width} × ${height}px`;
    
    // Load datapoints for the selected raspberry
    await loadCanvasDatapoints(raspberryId);
    
    // Render existing components
    renderCanvasComponents();
    
    // Initialize drag and drop
    initializeCanvasDragDrop();
}

function closeCanvasEditor() {
    if (confirm('Close editor? Unsaved changes will be lost.')) {
        document.getElementById('canvas-editor-modal').style.display = 'none';
        currentLayout = null;
        selectedComponent = null;
        document.getElementById('layout-canvas').innerHTML = '';
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
    }
    
    if (comp.type === 'text') {
        el.textContent = comp.content || 'Text Label';
    } else if (comp.type === 'datapoint') {
        el.innerHTML = `
            <div style="font-size: 0.8em; opacity: 0.7;">${comp.label || 'Label'}</div>
            <div style="font-size: 1.2em; font-weight: bold;">${comp.datapointId ? '[Live Value]' : '---'}</div>
            <div style="font-size: 0.7em; opacity: 0.5;">${comp.unit || ''}</div>
        `;
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
        selectComponent(comp.id);
    });
    
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
        
        if (componentType) {
            addComponent(componentType, x, y);
        } else if (datapointData) {
            const dp = JSON.parse(datapointData);
            addDatapointComponent(dp, x, y);
        }
    });
    
    // Canvas click to deselect
    canvas.addEventListener('click', () => {
        selectComponent(null);
    });
    
    // Component dragging
    canvas.addEventListener('mousedown', handleComponentMouseDown);
    document.addEventListener('mousemove', handleComponentMouseMove);
    document.addEventListener('mouseup', handleComponentMouseUp);
}

function addComponent(type, x, y) {
    const comp = {
        id: 'comp-' + (++componentIdCounter),
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        width: 200,
        height: 60,
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
    const comp = {
        id: 'comp-' + (++componentIdCounter),
        type: 'datapoint',
        x: Math.round(x),
        y: Math.round(y),
        width: 200,
        height: 80,
        datapointId: datapoint._id,
        opcNodeId: datapoint.opcNodeId,
        label: datapoint.label,
        unit: datapoint.unit || '',
        styles: {
            fontSize: 16,
            color: '#1e40af',
            backgroundColor: '#f0f4ff',
            fontWeight: 'normal'
        }
    };
    
    currentLayout.components.push(comp);
    
    const el = createComponentElement(comp);
    document.getElementById('layout-canvas').appendChild(el);
    
    selectComponent(comp.id);
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
        
        <div class="property-actions">
            <button type="button" class="btn btn-primary" onclick="applyComponentProperties()">Apply</button>
            <button type="button" class="btn btn-danger" onclick="deleteComponent()">Delete</button>
        </div>
    `;
    
    // Sync color inputs
    document.getElementById('prop-color').addEventListener('input', (e) => {
        document.getElementById('prop-color-text').value = e.target.value;
    });
    document.getElementById('prop-color-text').addEventListener('input', (e) => {
        document.getElementById('prop-color').value = e.target.value;
    });
    document.getElementById('prop-bgcolor').addEventListener('input', (e) => {
        document.getElementById('prop-bgcolor-text').value = e.target.value;
    });
    document.getElementById('prop-bgcolor-text').addEventListener('input', (e) => {
        document.getElementById('prop-bgcolor').value = e.target.value;
    });
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
        selectedComponent.label = document.getElementById('prop-label').value;
        selectedComponent.unit = document.getElementById('prop-unit').value;
    }
    
    selectedComponent.styles = {
        fontSize: parseInt(document.getElementById('prop-fontsize').value),
        color: document.getElementById('prop-color').value,
        backgroundColor: document.getElementById('prop-bgcolor').value,
        fontWeight: document.getElementById('prop-fontweight').value
    };
    
    // Re-render component
    const el = document.querySelector(`[data-id="${selectedComponent.id}"]`);
    if (el) {
        const parent = el.parentNode;
        const newEl = createComponentElement(selectedComponent);
        parent.replaceChild(newEl, el);
        newEl.classList.add('selected');
    }
    
    showToast('Properties applied', 'success');
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
    }
}

let draggedElement = null;
let offsetX = 0, offsetY = 0;

function handleComponentMouseDown(e) {
    const component = e.target.closest('.canvas-component');
    if (!component) return;
    
    const handle = e.target.closest('.component-resize-handle');
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
        }
        
        resizingComponent = null;
        isResizing = false;
        resizingHandle = null;
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
