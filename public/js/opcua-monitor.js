// ==========================================
// OPC UA Monitor UI - JavaScript
// ==========================================

const API_BASE = window.location.origin;
let socket = null;
let currentCompany = null;
let refreshInterval = null;

// ==========================================
// Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeCompanySelector();
    initializeWebSocket();
});

// ==========================================
// Company Selection
// ==========================================

function initializeCompanySelector() {
    const select = document.getElementById('company-select');
    
    // Check if company is stored
    const storedCompany = localStorage.getItem('opcua_monitor_company');
    if (storedCompany) {
        select.value = storedCompany;
        currentCompany = storedCompany;
        loadDashboard();
    }
    
    select.addEventListener('change', (e) => {
        currentCompany = e.target.value;
        if (currentCompany) {
            localStorage.setItem('opcua_monitor_company', currentCompany);
            loadDashboard();
            subscribeToUpdates();
        }
    });
}

// ==========================================
// Dashboard Data Loading
// ==========================================

async function loadDashboard() {
    if (!currentCompany) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/opcua/monitor/dashboard?company=${currentCompany}`);
        const data = await response.json();
        
        if (data.success) {
            renderDashboard(data.dashboard);
            updateStatus(true);
        } else {
            showError('Failed to load dashboard');
            updateStatus(false);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Error connecting to server');
        updateStatus(false);
    }
}

function renderDashboard(equipment) {
    const grid = document.getElementById('equipment-grid');
    
    if (equipment.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <p>設備が登録されていません</p>
                <p>管理画面で設備を追加してください</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = equipment.map(equip => {
        const isRunning = equip.status === 'online';
        
        return `
            <div class="equipment-card ${isRunning ? 'running' : 'stopped'}" data-equipment="${equip.equipmentId}">
                <div class="equipment-header">
                    <div class="equipment-name">${equip.displayName}</div>
                    <div class="equipment-location">${equip.location || equip.raspberryName}</div>
                </div>
                <div class="equipment-data">
                    ${equip.datapoints.map(dp => {
                        const quality = dp.quality === 'Good' ? 'good' : 'bad';
                        const value = dp.value !== null ? dp.value : '--';
                        
                        return `
                            <div class="data-item" data-datapoint="${dp.label}">
                                <div class="data-label">${dp.label}</div>
                                <div class="data-value ${quality}">
                                    ${value}
                                    ${dp.unit ? `<span class="data-unit">${dp.unit}</span>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
    
    updateLastUpdate();
}

// ==========================================
// WebSocket Real-time Updates
// ==========================================

function initializeWebSocket() {
    socket = io(`${API_BASE}/opcua`);
    
    socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        updateStatus(true);
        subscribeToUpdates();
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 WebSocket disconnected');
        updateStatus(false);
    });
    
    socket.on('opcua_data_update', (data) => {
        console.log('📡 Data update received:', data);
        updateDatapoints(data);
    });
}

function subscribeToUpdates() {
    if (socket && currentCompany) {
        socket.emit('subscribe', { company: currentCompany });
        console.log(`📡 Subscribed to updates for: ${currentCompany}`);
    }
}

function updateDatapoints(update) {
    const { raspberryId, data } = update;
    
    data.forEach(item => {
        // Find the equipment card
        const card = document.querySelector(`[data-equipment="${item.equipmentId}"]`);
        if (!card) return;
        
        // Find the data item by datapoint ID or label
        const dataItems = card.querySelectorAll('.data-item');
        dataItems.forEach(dataItem => {
            // Update if this is the matching datapoint
            const valueEl = dataItem.querySelector('.data-value');
            if (valueEl) {
                const quality = item.quality === 'Good' ? 'good' : 'bad';
                const currentClass = valueEl.className;
                valueEl.className = `data-value ${quality}`;
                
                // Update value
                const unit = valueEl.querySelector('.data-unit');
                const unitHtml = unit ? unit.outerHTML : '';
                valueEl.innerHTML = `${item.value}${unitHtml}`;
                
                // Add pulse animation
                valueEl.style.animation = 'none';
                setTimeout(() => {
                    valueEl.style.animation = 'pulse 0.3s';
                }, 10);
            }
        });
    });
    
    updateLastUpdate();
}

// ==========================================
// UI Updates
// ==========================================

function updateStatus(online) {
    const indicator = document.getElementById('connection-status');
    indicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
}

function updateLastUpdate() {
    const el = document.getElementById('last-update');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP');
    el.textContent = `最終更新: ${timeStr}`;
}

function showError(message) {
    const grid = document.getElementById('equipment-grid');
    grid.innerHTML = `
        <div class="empty-state">
            <p>❌ ${message}</p>
        </div>
    `;
}

// ==========================================
// Auto-refresh
// ==========================================

// Refresh dashboard every 30 seconds as fallback
setInterval(() => {
    if (currentCompany) {
        loadDashboard();
    }
}, 30000);

// Add CSS animation for pulse effect
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);
