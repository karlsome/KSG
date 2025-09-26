// KSG Production System Login & Device Discovery
// Base configuration
// NOTE: Change this to your render.com server URL when deploying
// For local testing: http://192.168.0.64:3000/
// For production: https://your-app.render.com/
const BASE_URL = 'http://192.168.0.64:3000/';
//const BASE_URL = 'https://ksg-lu47.onrender.com/';

// DOM elements
let loginPage, devicePage, loginForm, loginError, deviceList, deviceLoading, deviceError, noDevices;
let usernameInput, passwordInput, loginBtn, loginBtnText, loginLoading, currentUserElement, logoutBtn;

// Application state
let userData = null;
let availableDevices = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    checkExistingSession();
    setupEventListeners();
});

function initializeElements() {
    // Login page elements
    loginPage = document.getElementById('loginPage');
    devicePage = document.getElementById('devicePage');
    loginForm = document.getElementById('loginForm');
    loginError = document.getElementById('loginError');
    
    // Form inputs
    usernameInput = document.getElementById('username');
    passwordInput = document.getElementById('password');
    loginBtn = document.getElementById('loginBtn');
    loginBtnText = document.getElementById('loginBtnText');
    loginLoading = document.getElementById('loginLoading');
    
    // Device page elements
    deviceList = document.getElementById('deviceList');
    deviceLoading = document.getElementById('deviceLoading');
    deviceError = document.getElementById('deviceError');
    noDevices = document.getElementById('noDevices');
    currentUserElement = document.getElementById('currentUser');
    logoutBtn = document.getElementById('logoutBtn');
}

function checkExistingSession() {
    const storedUser = localStorage.getItem('ksgAuthUser');
    if (storedUser) {
        try {
            userData = JSON.parse(storedUser);
            showDevicePage();
        } catch (e) {
            console.error('Invalid stored user data:', e);
            localStorage.removeItem('ksgAuthUser');
        }
    }
}

function setupEventListeners() {
    // Login form submission
    loginForm.addEventListener('submit', handleLogin);
    
    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh devices button
    const refreshBtn = document.getElementById('refreshDevices');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => fetchAvailableDevices());
    }
    
    // Enter key support for login
    [usernameInput, passwordInput].forEach(input => {
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin(e);
                }
            });
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        showError('ユーザー名とパスワードを入力してください');
        return;
    }
    
    setLoginLoading(true);
    hideError();
    
    try {
        const response = await fetch(BASE_URL + 'loginCustomer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store user data with additional metadata
            userData = {
                ...data,
                loginTime: new Date().toISOString(),
                sessionId: generateSessionId()
            };
            
            localStorage.setItem('ksgAuthUser', JSON.stringify(userData));
            console.log('Login successful:', userData);
            
            // Transition to device page
            showDevicePage();
            
        } else {
            showError(data.error || 'ログインに失敗しました');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showError('ネットワークエラーが発生しました');
    } finally {
        setLoginLoading(false);
    }
}

function handleLogout() {
    localStorage.removeItem('ksgAuthUser');
    userData = null;
    availableDevices = [];
    
    // Reset form
    loginForm.reset();
    hideError();
    
    // Show login page
    showLoginPage();
}

function showLoginPage() {
    loginPage.classList.remove('hidden');
    devicePage.classList.add('hidden');
    usernameInput.focus();
}

function showDevicePage() {
    loginPage.classList.add('hidden');
    devicePage.classList.remove('hidden');
    
    // Update user info
    if (currentUserElement && userData) {
        currentUserElement.textContent = userData.username;
    }
    
    // Fetch available devices
    fetchAvailableDevices();
}

async function fetchAvailableDevices() {
    if (!userData || !userData.dbName) {
        showError('セッション情報が無効です。再ログインしてください。');
        handleLogout();
        return;
    }
    
    setDeviceLoading(true);
    hideDeviceError();
    
    try {
        const response = await fetch(`${BASE_URL}api/company-devices/${userData.dbName}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Include session info if needed for authentication
                'X-Session-User': userData.username,
                'X-Session-Role': userData.role
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            availableDevices = filterOnlineDevices(data.devices || []);
            renderDeviceList();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'デバイス情報の取得に失敗しました');
        }
        
    } catch (error) {
        console.error('Device fetch error:', error);
        showDeviceError(error.message);
    } finally {
        setDeviceLoading(false);
    }
}

function filterOnlineDevices(devices) {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - (2 * 60 * 1000));
    
    // Return all devices but mark their online status
    return devices.map(device => {
        if (!device.last_seen) {
            device.isOnline = false;
            console.log(`Device ${device.device_id}: No last_seen, Status: OFFLINE`);
            return device;
        }
        
        const lastSeen = new Date(device.last_seen);
        const isOnline = lastSeen > twoMinutesAgo;
        device.isOnline = isOnline;
        
        console.log(`Device ${device.device_id}: Last seen ${lastSeen.toISOString()}, Status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        
        return device;
    });
}

function renderDeviceList() {
    if (availableDevices.length === 0) {
        showNoDevices();
        return;
    }
    
    hideNoDevices();
    
    const deviceCards = availableDevices.map(device => createDeviceCard(device)).join('');
    deviceList.innerHTML = deviceCards;
    deviceList.classList.remove('hidden');
    
    // Add click listeners to device cards
    deviceList.querySelectorAll('.device-card').forEach(card => {
        card.addEventListener('click', function() {
            const deviceId = this.dataset.deviceId;
            const selectedDevice = availableDevices.find(d => d.device_id === deviceId);
            if (selectedDevice) {
                connectToDevice(selectedDevice);
            }
        });
    });
}

function createDeviceCard(device) {
    const lastSeen = device.last_seen ? new Date(device.last_seen) : null;
    const timeAgo = lastSeen ? getTimeAgo(lastSeen) : 'Never';
    const statusClass = device.isOnline ? 'status-online' : 'status-offline';
    const statusText = device.isOnline ? 'オンライン' : 'オフライン';
    const statusColor = device.isOnline ? 'text-green-600' : 'text-red-600';
    
    return `
        <div class="device-card bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-lg transition-shadow ${!device.isOnline ? 'opacity-75' : ''}" data-device-id="${device.device_id}">
            <!-- Header with device name and status -->
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center space-x-2 flex-1 min-w-0">
                    <div class="${statusClass} w-3 h-3 rounded-full flex-shrink-0"></div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-base text-gray-900 truncate">${device.device_name}</h3>
                        <p class="text-xs text-gray-500 truncate">${device.device_type || 'Unknown Type'}</p>
                    </div>
                </div>
                <div class="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                    <span class="text-xs ${statusColor} font-medium whitespace-nowrap">${statusText}</span>
                    <span class="text-xs text-gray-400 whitespace-nowrap">${timeAgo}</span>
                </div>
            </div>
            
            <!-- Connection info -->
            <div class="mb-3">
                <p class="text-sm font-mono text-gray-700 truncate">${device.local_ip}:${device.local_port}</p>
            </div>
            
            <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">所有者:</span>
                    <span class="font-medium">${device.owner}</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">デバイスタイプ:</span>
                    <span class="font-medium">${device.device_brand}</span>
                </div>
                ${device.capabilities ? `
                <div class="mt-3">
                    <div class="flex flex-wrap gap-1">
                        ${device.capabilities.slice(0, 3).map(cap => 
                            `<span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">${cap}</span>`
                        ).join('')}
                        ${device.capabilities.length > 3 ? 
                            `<span class="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">+${device.capabilities.length - 3}</span>` 
                            : ''
                        }
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div class="mt-4 pt-4 border-t border-gray-100">
                <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                    デバイスに接続
                </button>
            </div>
        </div>
    `;
}

function connectToDevice(device) {
    console.log('Connecting to device:', device);
    
    // Check if device is offline and warn user
    if (!device.isOnline) {
        const confirmConnect = confirm(
            `デバイス "${device.device_name}" はオフラインです。\n` +
            `最後に確認されたのは2分以上前です。\n\n` +
            `接続を続行しますか？デバイスが応答しない可能性があります。`
        );
        
        if (!confirmConnect) {
            console.log('User cancelled connection to offline device');
            return;
        }
    }
    
    // Store selected device info
    const deviceInfo = {
        device_id: device.device_id,
        device_name: device.device_name,
        ip: device.local_ip,
        port: device.local_port,
        selectedAt: new Date().toISOString()
    };
    
    localStorage.setItem('ksgSelectedDevice', JSON.stringify(deviceInfo));
    
    // Redirect to device's local webapp
    const deviceUrl = `http://${device.local_ip}:${device.local_port}/`;
    console.log('Redirecting to:', deviceUrl);
    
    // Add user context as URL parameters for the device webapp
    const params = new URLSearchParams({
        username: userData.username,
        user: encodeURIComponent(JSON.stringify(userData)),
        company: userData.dbName,
        session: userData.sessionId || 'unknown'
    });
    
    const fullUrl = `${deviceUrl}?${params.toString()}`;
    console.log('Full URL with user data:', fullUrl);
    window.location.href = fullUrl;
}

// Utility functions
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return '1分未満';
    if (diffMins < 60) return `${diffMins}分前`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}日前`;
}

// UI state management functions
function setLoginLoading(loading) {
    if (loading) {
        loginBtn.disabled = true;
        loginBtnText.classList.add('hidden');
        loginLoading.classList.remove('hidden');
    } else {
        loginBtn.disabled = false;
        loginBtnText.classList.remove('hidden');
        loginLoading.classList.add('hidden');
    }
}

function setDeviceLoading(loading) {
    if (loading) {
        deviceLoading.classList.remove('hidden');
        deviceList.classList.add('hidden');
        noDevices.classList.add('hidden');
    } else {
        deviceLoading.classList.add('hidden');
    }
}

function showError(message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
}

function hideError() {
    loginError.classList.add('hidden');
}

function showDeviceError(message) {
    deviceError.textContent = message;
    deviceError.classList.remove('hidden');
}

function hideDeviceError() {
    deviceError.classList.add('hidden');
}

function showNoDevices() {
    noDevices.classList.remove('hidden');
    deviceList.classList.add('hidden');
}

function hideNoDevices() {
    noDevices.classList.add('hidden');
}