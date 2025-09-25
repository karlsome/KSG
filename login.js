// KSG Production System Login & Device Discovery
// Base configuration
// NOTE: Change this to your render.com server URL when deploying
// For local testing: http://192.168.0.64:3000/
// For production: https://your-app.render.com/
const BASE_URL = 'http://192.168.0.64:3000/';

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
    const fiveMinutesAgo = new Date(now.getTime() - (5 * 60 * 1000));
    
    return devices.filter(device => {
        if (!device.last_seen) return false;
        
        const lastSeen = new Date(device.last_seen);
        const isOnline = lastSeen > fiveMinutesAgo;
        
        console.log(`Device ${device.device_id}: Last seen ${lastSeen.toISOString()}, Online: ${isOnline}`);
        
        return isOnline;
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
    const lastSeen = new Date(device.last_seen);
    const timeAgo = getTimeAgo(lastSeen);
    
    return `
        <div class="device-card bg-white border border-gray-200 rounded-xl p-6 cursor-pointer hover:shadow-lg" data-device-id="${device.device_id}">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center space-x-3">
                    <div class="status-online w-4 h-4 rounded-full"></div>
                    <div>
                        <h3 class="font-semibold text-lg text-gray-900">${device.device_name}</h3>
                        <p class="text-sm text-gray-500">${device.device_type || 'Unknown Type'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-medium text-gray-900">${device.local_ip}:${device.local_port}</p>
                    <p class="text-xs text-gray-500">${timeAgo}</p>
                </div>
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