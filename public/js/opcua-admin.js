// ==========================================
// OPC UA Admin UI - JavaScript
// ==========================================

const API_BASE = window.location.origin;
let currentUser = null;
let currentRaspberryFilter = null;
let currentEquipmentFilter = null;

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
        document.getElementById('discovery-modal').classList.add('show');
    });
    
    document.getElementById('datapoint-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveDatapoint();
    });
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
