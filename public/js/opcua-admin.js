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
