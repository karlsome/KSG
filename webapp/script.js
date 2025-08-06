// Enhanced KSG Production System JavaScript for step7.py integration
// This script handles authentication, data sync, and RPi communication

// Global variables
window.PYTHON_API_BASE_URL = window.location.origin; // Use current host (RPi)
window.KSG_SERVER_URL = "http://localhost:3000"; // Default for development

// Auto-detect KSG server URL based on environment
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Running on tablet - point to actual ksgServer
    window.KSG_SERVER_URL = "http://192.168.0.25:3000"; // Update this to your actual ksgServer IP
}
let currentUser = null;
let isOnline = true;
let cachedWorkers = [];
let systemStatus = {
    online: false,
    device_id: null,
    current_hinban: null
};

// Authentication Management
class AuthManager {
    constructor() {
        this.users = [];
        this.currentUser = null;
    }
    
    async loadAuthorizedUsers() {
        try {
            // Always try local RPi endpoint first when running on RPi
            try {
                const response = await fetch(`${window.PYTHON_API_BASE_URL}/api/auth/users`);
                const data = await response.json();
                
                if (data.success && data.users.length > 0) {
                    this.users = data.users;
                    this.populateUserDropdown();
                    console.log(`✅ Loaded ${this.users.length} authorized users from RPi`);
                    return true;
                }
            } catch (localError) {
                console.log('Local RPi endpoint not available, trying main server...');
            }
            
            // Fallback to main server if RPi endpoint fails
            try {
                const response = await fetch(`${window.KSG_SERVER_URL}/api/users/KSG`, {
                    headers: {
                        'X-Device-ID': '4Y02SX'
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    // Filter users to only include admin/masterUser roles
                    this.users = data.users.filter(user => 
                        user.role === 'admin' || user.role === 'masterUser'
                    );
                    this.populateUserDropdown();
                    console.log(`✅ Loaded ${this.users.length} authorized users from main server`);
                    return true;
                }
            } catch (serverError) {
                console.log('Main server not available');
            }
            
            throw new Error('No user data source available');
            
        } catch (error) {
            console.error('Error loading users:', error);
            
            // Fallback to test users for development
            console.log('Using fallback test users...');
            this.users = [
                {
                    username: 'admin',
                    firstName: 'Admin',
                    lastName: 'User',
                    role: 'admin'
                },
                {
                    username: 'testuser1',
                    firstName: '田中',
                    lastName: '太郎',
                    role: 'masterUser'
                },
                {
                    username: 'testuser2',
                    firstName: '佐藤',
                    lastName: '花子',
                    role: 'masterUser'
                }
            ];
            
            this.populateUserDropdown();
            return true;
        }
    }
    
    populateUserDropdown() {
        const userSelect = document.getElementById('username');
        userSelect.innerHTML = '<option value="">選択してください</option>';
        
        this.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = `${user.firstName} ${user.lastName} (${user.username})`;
            userSelect.appendChild(option);
        });
    }
    
    async login(username) {
        try {
            // Simple authentication - just verify user exists in authorized list
            const user = this.users.find(u => u.username === username);
            
            if (user) {
                this.currentUser = user;
                currentUser = user;
                
                // Store in session
                sessionStorage.setItem('ksg_user', JSON.stringify(user));
                
                // Hide login modal
                document.getElementById('loginModal').classList.remove('show');
                
                // Initialize the app
                await this.initializeApp();
                
                // Check if user needs to select a device
                const selectedDevice = this.getSelectedDevice();
                if (!selectedDevice && systemStatus.online) {
                    // Show device selection after login
                    setTimeout(() => {
                        this.showDeviceSelection();
                    }, 1000); // Small delay to let UI settle
                }
                
                return true;
            } else {
                throw new Error('ユーザーが見つかりません');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showLoginError(error.message);
            return false;
        }
    }
    
    logout() {
        this.currentUser = null;
        currentUser = null;
        sessionStorage.removeItem('ksg_user');
        
        // Show login modal
        document.getElementById('loginModal').classList.add('show');
        
        // Reset form
        this.resetForm();
    }
    
    showLoginError(message) {
        const errorDiv = document.getElementById('loginError');
        const errorText = errorDiv.querySelector('p');
        errorText.textContent = message;
        errorDiv.classList.remove('hidden');
        
        setTimeout(() => {
            errorDiv.classList.add('hidden');
        }, 5000);
    }
    
    showLoginLoading(show) {
        const loadingDiv = document.getElementById('loginLoading');
        const loginForm = document.getElementById('loginForm');
        
        if (show) {
            loadingDiv.classList.remove('hidden');
            loginForm.classList.add('hidden');
        } else {
            loadingDiv.classList.add('hidden');
            loginForm.classList.remove('hidden');
        }
    }
    
    async initializeApp() {
        try {
            // Load workers
            await this.loadWorkers();
            
            // Initialize date
            this.initializeDate();
            
            // Check system status
            await this.checkSystemStatus();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Start status monitoring
            this.startStatusMonitoring();
            
            console.log('✅ App initialized successfully');
        } catch (error) {
            console.error('❌ App initialization failed:', error);
            this.showStatusMessage('アプリの初期化に失敗しました', 'error');
        }
    }
    
    async loadWorkers() {
        try {
            // Always try local RPi endpoint first when running on RPi
            try {
                const response = await fetch(`${window.PYTHON_API_BASE_URL}/api/workers`);
                const data = await response.json();
                
                if (data.success && data.workers.length > 0) {
                    cachedWorkers = data.workers;
                    this.populateWorkerDropdowns();
                    console.log(`✅ Loaded ${data.workers.length} workers from RPi`);
                    return;
                }
            } catch (localError) {
                console.log('Local RPi workers endpoint not available, trying main server...');
            }
            
            // Fallback to main server if RPi endpoint fails
            try {
                const response = await fetch(`${window.KSG_SERVER_URL}/api/users/KSG`, {
                    headers: {
                        'X-Device-ID': '4Y02SX'
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    cachedWorkers = data.users; // All users can be workers
                    this.populateWorkerDropdowns();
                    console.log(`✅ Loaded ${data.users.length} workers from main server`);
                    return;
                }
            } catch (serverError) {
                console.log('Main server not available');
            }
            
            throw new Error('No worker data available');
            
        } catch (error) {
            console.error('Error loading workers:', error);
            // Use cached workers if available
            if (cachedWorkers.length > 0) {
                this.populateWorkerDropdowns();
                console.log('💾 Using cached workers');
            } else {
                // Use fallback workers
                cachedWorkers = [
                    {
                        username: 'worker1',
                        firstName: '山田',
                        lastName: '一郎',
                        fullName: '山田 一郎'
                    },
                    {
                        username: 'worker2',
                        firstName: '鈴木',
                        lastName: '二郎',
                        fullName: '鈴木 二郎'
                    }
                ];
                this.populateWorkerDropdowns();
                console.log('💾 Using fallback workers');
            }
        }
    }
    
    populateWorkerDropdowns() {
        const operator1Select = document.getElementById('operator1');
        const operator2Select = document.getElementById('operator2');
        
        [operator1Select, operator2Select].forEach(select => {
            // Keep first option
            const firstOption = select.querySelector('option');
            select.innerHTML = '';
            select.appendChild(firstOption);
            
            cachedWorkers.forEach(worker => {
                const option = document.createElement('option');
                option.value = worker.username;
                option.textContent = worker.fullName || `${worker.firstName} ${worker.lastName}`;
                select.appendChild(option);
            });
        });
    }
    
    initializeDate() {
        const now = new Date();
        document.getElementById('dateYear').value = now.getFullYear();
        document.getElementById('dateMonth').value = now.getMonth() + 1;
        document.getElementById('dateDay').value = now.getDate();
    }
    
    async checkSystemStatus() {
        try {
            // Check if we're running directly on an RPi (by checking for RPi-specific endpoints)
            const isRunningOnRPi = await this.detectRPiEnvironmentAsync();
            
            if (isRunningOnRPi) {
                // We're running directly on RPi - get actual status from RPi
                try {
                    const rpiResponse = await fetch(`${window.PYTHON_API_BASE_URL}/api/system/status`);
                    const rpiStatus = await rpiResponse.json();
                    
                    // Use the RPi's actual online status (it tests ksgServer connectivity)
                    const isRPiOnline = rpiStatus.online || false;
                    
                    systemStatus = {
                        online: isRPiOnline,
                        device_id: rpiStatus.device_id,
                        current_hinban: rpiStatus.current_hinban,
                        local_ip: rpiStatus.local_ip,
                        device_name: rpiStatus.device_name,
                        rpi_direct: true
                    };
                    
                    if (isRPiOnline) {
                        this.updateStatusUI(true, `オンライン (RPi: ${rpiStatus.device_id})`);
                    } else {
                        this.updateStatusUI(false, `オフライン (RPi: ${rpiStatus.device_id})`);
                    }
                    
                    // Update current hinban if exists
                    if (rpiStatus.current_hinban) {
                        document.getElementById('hinban').value = rpiStatus.current_hinban;
                        await this.processHinban(rpiStatus.current_hinban);
                    }
                    return;
                } catch (rpiError) {
                    console.error('Error connecting to local RPi:', rpiError);
                    this.updateStatusUI(false, 'オフライン (RPi接続エラー)');
                    return;
                }
            }
            
            // Not on RPi - check online connectivity to ksgServer (tablet mode)
            let ksgServerUrl = window.KSG_SERVER_URL;
            
            // Auto-detect environment: if we're running on tablet, try to find ksgServer
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                // Running on tablet - try to find ksgServer on network
                ksgServerUrl = `http://192.168.0.25:3000`; // Update this to your ksgServer IP
            }
            
            // Test ksgServer connectivity
            const ksgResponse = await fetch(`${ksgServerUrl}/ping`, {
                timeout: 3000
            });
            
            if (ksgResponse.ok) {
                // We're online with ksgServer - now check if we have an associated device
                const deviceInfo = this.getSelectedDevice();
                
                if (deviceInfo && deviceInfo.local_ip) {
                    // Try to connect to the selected RPi device
                    try {
                        const rpiResponse = await fetch(`http://${deviceInfo.local_ip}:${deviceInfo.local_port || 5000}/api/system/status`, {
                            timeout: 3000
                        });
                        
                        if (rpiResponse.ok) {
                            const rpiStatus = await rpiResponse.json();
                            systemStatus = {
                                online: true,
                                device_id: rpiStatus.device_id,
                                current_hinban: rpiStatus.current_hinban,
                                local_ip: deviceInfo.local_ip,
                                device_name: deviceInfo.device_name
                            };
                            
                            this.updateStatusUI(true, `オンライン (${deviceInfo.device_name})`);
                            
                            // Update current hinban if exists
                            if (rpiStatus.current_hinban) {
                                document.getElementById('hinban').value = rpiStatus.current_hinban;
                                await this.processHinban(rpiStatus.current_hinban);
                            }
                            return;
                        }
                    } catch (rpiError) {
                        console.log('RPi device not accessible, but ksgServer is online');
                    }
                }
                
                // ksgServer is online but no device selected or device not accessible
                systemStatus = {
                    online: true,
                    device_id: null,
                    current_hinban: null,
                    local_ip: null,
                    needs_device_selection: true
                };
                
                this.updateStatusUI(true);
                
                // Show device selection if user is logged in but no device selected
                if (this.currentUser && !deviceInfo) {
                    this.showDeviceSelection();
                }
                
            } else {
                throw new Error('ksgServer not accessible');
            }
            
        } catch (error) {
            console.error('Error checking system status:', error);
            
            // Fallback - we're offline
            systemStatus = {
                online: false,
                device_id: null,
                current_hinban: null,
                local_ip: null
            };
            
            this.updateStatusUI(false);
        }
    }
    
    // RPi Environment Detection (Simple synchronous check)
    detectRPiEnvironment() {
        // Quick check based on hostname patterns
        const hostname = window.location.hostname;
        const rpiPatterns = [
            /^192\.168\.\d+\.\d+$/, 
            /^10\.\d+\.\d+\.\d+$/,  
            /raspberrypi/i,         
            /rpi/i,                 
            /ksg\d*/i              
        ];
        
        return rpiPatterns.some(pattern => pattern.test(hostname));
    }
    
    // RPi Environment Detection (Async with endpoint testing)
    async detectRPiEnvironmentAsync() {
        // First do quick hostname check
        const hostname = window.location.hostname;
        const hostnameCheck = this.detectRPiEnvironment();
        
        // For localhost, we're definitely not on RPi
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return false;
        }
        
        // If hostname suggests RPi, verify with endpoint test
        try {
            const response = await fetch(`${window.PYTHON_API_BASE_URL}/api/system/status`, {
                timeout: 2000
            });
            
            if (response.ok) {
                const data = await response.json();
                // Check if response looks like RPi data (has device_id, device_name, etc.)
                const isRPiResponse = data.device_id && data.device_name && data.local_ip;
                console.log(`RPi detection: hostname=${hostname}, endpoint_works=${isRPiResponse}`);
                return isRPiResponse;
            }
        } catch (error) {
            console.log(`RPi endpoint test failed: ${error.message}`);
            // If RPi endpoint fails but hostname suggests RPi, assume we're on RPi with issues
            return hostnameCheck;
        }
        
        return hostnameCheck;
    }

    // Device Selection Management
    getSelectedDevice() {
        const deviceData = localStorage.getItem('selectedDevice');
        return deviceData ? JSON.parse(deviceData) : null;
    }
    
    setSelectedDevice(deviceInfo) {
        localStorage.setItem('selectedDevice', JSON.stringify(deviceInfo));
        systemStatus.device_id = deviceInfo.device_id;
        systemStatus.local_ip = deviceInfo.local_ip;
        systemStatus.device_name = deviceInfo.device_name;
    }
    
    clearSelectedDevice() {
        localStorage.removeItem('selectedDevice');
        systemStatus.device_id = null;
        systemStatus.local_ip = null;
        systemStatus.device_name = null;
    }
    
    async showDeviceSelection() {
        try {
            // Get available KSG devices from ksgServer
            let ksgServerUrl = window.KSG_SERVER_URL;
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                ksgServerUrl = `http://192.168.0.25:3000`;
            }
            
            const response = await fetch(`${ksgServerUrl}/api/devices/rpi/KSG`);
            const data = await response.json();
            
            if (data.success && data.devices.length > 0) {
                this.displayDeviceSelectionModal(data.devices);
            } else {
                alert('No RPi devices found for KSG company. Please ensure your devices are registered.');
            }
        } catch (error) {
            console.error('Error loading devices:', error);
            alert('Failed to load available devices. Please check your connection.');
        }
    }
    
    displayDeviceSelectionModal(devices) {
        // Create device selection modal
        const modal = document.createElement('div');
        modal.id = 'deviceSelectionModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        
        const modalContent = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 class="text-lg font-semibold mb-4">デバイス選択 (Select Device)</h3>
                <p class="text-gray-600 mb-4">使用するデバイスを選択してください</p>
                
                <div class="space-y-3">
                    ${devices.map(device => `
                        <div class="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 device-option" 
                             data-device='${JSON.stringify(device)}'>
                            <div class="font-medium">${device.device_name}</div>
                            <div class="text-sm text-gray-500">
                                Device ID: ${device.device_id}<br>
                                IP: ${device.local_ip}:${device.local_port}<br>
                                Owner: ${device.owner}<br>
                                Status: <span class="text-${device.status === 'online' ? 'green' : 'red'}-600">${device.status}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="flex justify-end space-x-3 mt-6">
                    <button onclick="authManager.cancelDeviceSelection()" 
                            class="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50">
                        キャンセル
                    </button>
                </div>
            </div>
        `;
        
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);
        
        // Add click handlers for device selection
        modal.querySelectorAll('.device-option').forEach(option => {
            option.addEventListener('click', () => {
                const deviceData = JSON.parse(option.dataset.device);
                this.selectDevice(deviceData);
            });
        });
    }
    
    async selectDevice(deviceInfo) {
        try {
            // Test connection to the selected device
            const testResponse = await fetch(`http://${deviceInfo.local_ip}:${deviceInfo.local_port || 5000}/device-info`, {
                timeout: 5000
            });
            
            if (testResponse.ok) {
                // Device is accessible
                this.setSelectedDevice(deviceInfo);
                this.cancelDeviceSelection();
                
                // Show brief success message and auto-redirect
                const statusMessage = document.getElementById('statusMessage');
                if (statusMessage) {
                    statusMessage.className = 'p-3 rounded-md text-center text-sm font-medium bg-green-50 border border-green-200 text-green-800';
                    statusMessage.textContent = `デバイス "${deviceInfo.device_name}" に接続中... リダイレクトしています...`;
                    statusMessage.classList.remove('hidden');
                }
                
                // Auto-redirect to the RPi's webapp after a brief delay
                setTimeout(() => {
                    window.location.href = `http://${deviceInfo.local_ip}:${deviceInfo.local_port || 5000}/webapp`;
                }, 1500);
                
            } else {
                alert(`デバイス "${deviceInfo.device_name}" に接続できません。デバイスがオンラインか確認してください。`);
            }
        } catch (error) {
            console.error('Error connecting to device:', error);
            alert(`デバイスへの接続でエラーが発生しました: ${error.message}`);
        }
    }
    
    cancelDeviceSelection() {
        const modal = document.getElementById('deviceSelectionModal');
        if (modal) {
            modal.remove();
        }
    }
    
    updateStatusUI(online, customMessage = null) {
        const statusDiv = document.getElementById('systemStatus');
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const deviceBtn = document.getElementById('deviceSelectBtn');
        
        if (online) {
            statusDiv.className = 'status-online p-3 rounded-lg border flex items-center space-x-2';
            indicator.className = 'w-3 h-3 rounded-full bg-green-500';
            
            if (customMessage) {
                statusText.textContent = customMessage;
            } else {
                // Show device info if connected to a device
                const selectedDevice = this.getSelectedDevice();
                if (selectedDevice) {
                    statusText.textContent = `オンライン (${selectedDevice.device_name})`;
                    statusText.title = `Device: ${selectedDevice.device_id}\nIP: ${selectedDevice.local_ip}`;
                } else {
                    statusText.textContent = 'オンライン (デバイス未選択)';
                    statusText.title = 'ksgServerに接続済み、デバイスを選択してください';
                }
            }
            
            // Enable device selection button
            if (deviceBtn) {
                deviceBtn.disabled = false;
                deviceBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md text-sm';
            }
        } else {
            statusDiv.className = 'status-offline p-3 rounded-lg border flex items-center space-x-2';
            indicator.className = 'w-3 h-3 rounded-full bg-red-500';
            
            if (customMessage) {
                statusText.textContent = customMessage;
            } else {
                statusText.textContent = 'オフライン';
                statusText.title = 'ksgServerに接続できません';
            }
            
            // For offline mode (RPi direct), keep device selection enabled
            // For true offline, disable it
            if (deviceBtn) {
                if (systemStatus.rpi_direct) {
                    // Running directly on RPi - no need for device selection
                    deviceBtn.disabled = true;
                    deviceBtn.className = 'bg-gray-400 text-white font-bold py-2 px-4 rounded-md text-sm cursor-not-allowed';
                    deviceBtn.textContent = 'RPi直接';
                } else {
                    deviceBtn.disabled = true;
                    deviceBtn.className = 'bg-gray-400 text-white font-bold py-2 px-4 rounded-md text-sm cursor-not-allowed';
                }
            }
        }
        
        isOnline = online;
    }
    
    startStatusMonitoring() {
        // Check status every 30 seconds
        setInterval(async () => {
            await this.checkSystemStatus();
        }, 30000);
    }
    
    setupEventListeners() {
        // QR code / hinban input
        const hinbanInput = document.getElementById('hinban');
        let hinbanTimeout;
        
        hinbanInput.addEventListener('input', (e) => {
            clearTimeout(hinbanTimeout);
            hinbanTimeout = setTimeout(async () => {
                const hinban = e.target.value.trim();
                if (hinban) {
                    await this.processHinban(hinban);
                }
            }, 500);
        });
        
        // Quantity buttons
        document.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.getAttribute('data-target');
                const action = e.target.getAttribute('data-action');
                const input = document.getElementById(target);
                let value = parseInt(input.value) || 0;
                
                if (action === 'plus') {
                    value++;
                } else if (action === 'minus' && value > 0) {
                    value--;
                }
                
                input.value = value;
                this.calculateBreakTime();
            });
        });
        
        // Time inputs
        document.querySelectorAll('.time-input').forEach(input => {
            input.addEventListener('click', () => {
                const currentTime = new Date();
                const timeString = currentTime.toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                input.value = timeString;
                this.calculateBreakTime();
            });
        });
        
        // Break reset buttons
        document.querySelectorAll('.reset-break-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const breakId = e.target.getAttribute('data-break-id');
                document.getElementById(`${breakId}From`).value = '';
                document.getElementById(`${breakId}To`).value = '';
                this.calculateBreakTime();
            });
        });
        
        // Submit button
        document.getElementById('submitDataBtn').addEventListener('click', async () => {
            await this.submitData();
        });
        
        // Reset button
        document.getElementById('resetAllBtn').addEventListener('click', async () => {
            if (confirm('すべてのデータをリセットしますか？')) {
                await this.resetAll();
            }
        });
        
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                this.logout();
            }
        });
    }
    
    async processHinban(hinban) {
        try {
            this.showLoadingIndicator(true);
            
            // In development mode, skip RPi hinban setting since step7.py isn't running
            console.log(`🔧 Development mode: Setting hinban to ${hinban}`);
            
            // Get product info from ksgServer
            const productResponse = await fetch(`${window.KSG_SERVER_URL}/api/products/KSG`, {
                headers: {
                    'X-Device-ID': '4Y02SX'  // Required for authentication
                }
            });
            
            if (productResponse.ok) {
                const productData = await productResponse.json();
                
                if (productData.success) {
                    // Find the product with matching hinban
                    const product = productData.products.find(p => p.品番 === hinban);
                    
                    if (product) {
                        // Auto-fill product information
                        document.getElementById('productName').value = product.製品名 || '';
                        document.getElementById('lhRh').value = product['LH/RH'] || '';
                        
                        this.showStatusMessage(`製品情報を取得しました: ${product.製品名}`, 'success');
                    } else {
                        this.showStatusMessage(`品番 "${hinban}" の製品情報が見つかりません`, 'warning');
                    }
                } else {
                    this.showStatusMessage('製品データベースにアクセスできません', 'warning');
                }
            } else {
                throw new Error(`HTTP ${productResponse.status}: ${productResponse.statusText}`);
            }
        } catch (error) {
            console.error('Error processing hinban:', error);
            this.showStatusMessage('品番の処理に失敗しました - 製品データベースを確認してください', 'error');
        } finally {
            this.showLoadingIndicator(false);
        }
    }
    
    calculateBreakTime() {
        const breaks = ['break1', 'break2', 'break3', 'break4'];
        let totalMinutes = 0;
        
        breaks.forEach(breakId => {
            const fromTime = document.getElementById(`${breakId}From`).value;
            const toTime = document.getElementById(`${breakId}To`).value;
            
            if (fromTime && toTime) {
                const from = this.parseTime(fromTime);
                const to = this.parseTime(toTime);
                
                if (from && to && to > from) {
                    totalMinutes += (to - from) / (1000 * 60);
                }
            }
        });
        
        document.getElementById('breakTime').value = Math.round(totalMinutes);
    }
    
    parseTime(timeString) {
        const parts = timeString.split(':');
        if (parts.length === 2) {
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            if (!isNaN(hours) && !isNaN(minutes)) {
                const date = new Date();
                date.setHours(hours, minutes, 0, 0);
                return date.getTime();
            }
        }
        return null;
    }
    
    async submitData() {
        try {
            this.showLoadingIndicator(true);
            
            // Collect all form data
            const formData = this.collectFormData();
            
            // Validate required fields
            if (!formData.品番) {
                throw new Error('品番は必須です');
            }
            
            if (!formData["技能員①"]) {
                throw new Error('技能員①は必須です');
            }
            
            // Get current cycle logs (mock data for development)
            const mockCycleData = {
                status: 'success',
                logs: [] // Empty logs for development mode
            };
            
            if (mockCycleData.status === 'success') {
                formData.生産ログ = mockCycleData.logs;
                
                // Calculate automatic fields (mock data)
                if (mockCycleData.logs.length > 0) {
                    formData.良品数 = mockCycleData.logs.length;
                    formData.開始時間 = mockCycleData.logs[0].initial_time;
                    formData.終了時間 = mockCycleData.logs[mockCycleData.logs.length - 1].final_time;
                    
                    const totalCycleTime = mockCycleData.logs.reduce((sum, log) => sum + log.cycle_time, 0);
                    formData.平均サイクル時間 = totalCycleTime / mockCycleData.logs.length;
                } else {
                    // Set some default values for development
                    formData.良品数 = parseInt(document.getElementById('goodCount').value) || 0;
                    formData.開始時間 = new Date().toISOString();
                    formData.終了時間 = new Date().toISOString();
                    formData.平均サイクル時間 = 0;
                }
            }
            
            // Submit to database via ksgServer
            const submitResponse = await fetch(`${window.KSG_SERVER_URL}/api/submit-production-data`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Device-ID': '4Y02SX'  // Required for authentication
                },
                body: JSON.stringify(formData)
            });
            
            const submitData = await submitResponse.json();
            
            if (submitData.success) {
                if (submitData.queued) {
                    this.showStatusMessage('データを一時保存しました（オフライン）', 'warning');
                } else {
                    this.showStatusMessage('データを正常に送信しました', 'success');
                }
                
                // Clear form after successful submission
                setTimeout(() => {
                    this.resetForm();
                }, 2000);
            } else {
                throw new Error(submitData.error || 'Submission failed');
            }
        } catch (error) {
            console.error('Error submitting data:', error);
            this.showStatusMessage(`送信エラー: ${error.message}`, 'error');
        } finally {
            this.showLoadingIndicator(false);
        }
    }
    
    collectFormData() {
        const now = new Date();
        
        return {
            タイムスタンプ: now.toISOString(),
            "日付（年）": parseInt(document.getElementById('dateYear').value),
            "日付（月）": parseInt(document.getElementById('dateMonth').value),
            "日付（日）": parseInt(document.getElementById('dateDay').value),
            製品名: document.getElementById('productName').value,
            品番: document.getElementById('hinban').value,
            "LH/RH": document.getElementById('lhRh').value,
            "技能員①": document.getElementById('operator1').value,
            "技能員②": document.getElementById('operator2').value || "",
            良品数: parseInt(document.getElementById('goodCount').value) || 0,
            工数: parseInt(document.getElementById('manHours').value) || 0,
            "不良項目　素材不良": parseInt(document.getElementById('materialDefect').value) || 0,
            "不良項目　ダブり": parseInt(document.getElementById('doubleDefect').value) || 0,
            "不良項目　ハガレ": parseInt(document.getElementById('peelingDefect').value) || 0,
            "不良項目　イブツ": parseInt(document.getElementById('foreignMatterDefect').value) || 0,
            "不良項目　シワ": parseInt(document.getElementById('wrinkleDefect').value) || 0,
            "不良項目　ヘンケイ": parseInt(document.getElementById('deformationDefect').value) || 0,
            "不良項目　グリス付着": parseInt(document.getElementById('greaseDefect').value) || 0,
            "不良項目　ビス不締まり": parseInt(document.getElementById('screwLooseDefect').value) || 0,
            "不良項目　その他": parseInt(document.getElementById('otherDefect').value) || 0,
            その他説明: document.getElementById('otherDescription').value,
            "不良項目　ショルダー": parseInt(document.getElementById('shoulderDefect').value) || 0,
            "不良項目　シルバー": parseInt(document.getElementById('silverDefect').value) || 0,
            "不良項目　ショルダー　キズ": parseInt(document.getElementById('shoulderScratchDefect').value) || 0,
            "不良項目　ショルダー　その他": parseInt(document.getElementById('shoulderOtherDefect').value) || 0,
            開始時間: document.getElementById('initialTimeDisplay').value || "",
            終了時間: document.getElementById('finalTimeDisplay').value || "",
            休憩時間: parseInt(document.getElementById('breakTime').value) || 0,
            休憩1開始: document.getElementById('break1From').value,
            休憩1終了: document.getElementById('break1To').value,
            休憩2開始: document.getElementById('break2From').value,
            休憩2終了: document.getElementById('break2To').value,
            休憩3開始: document.getElementById('break3From').value,
            休憩3終了: document.getElementById('break3To').value,
            休憩4開始: document.getElementById('break4From').value,
            休憩4終了: document.getElementById('break4To').value,
            備考: document.getElementById('remarks').value,
            "工数（除外工数）": parseInt(document.getElementById('excludedManHours').value) || 0,
            アイドル時間: null,
            平均サイクル時間: parseFloat(document.getElementById('averageCycleTime').value) || 0,
            最速サイクルタイム: null,
            最も遅いサイクルタイム: null,
            生産ログ: []
        };
    }
    
    async resetAll() {
        try {
            this.showLoadingIndicator(true);
            
            // In development mode, just reset the form since RPi isn't available
            console.log('🔧 Development mode: Resetting form data');
            this.resetForm();
            this.showStatusMessage('フォームをリセットしました（開発モード）', 'success');
            
        } catch (error) {
            console.error('Error resetting data:', error);
            this.showStatusMessage(`リセットエラー: ${error.message}`, 'error');
        } finally {
            this.showLoadingIndicator(false);
        }
    }
    
    resetForm() {
        // Reset all input fields
        document.getElementById('hinban').value = '';
        document.getElementById('productName').value = '';
        document.getElementById('lhRh').value = '';
        document.getElementById('operator1').value = '';
        document.getElementById('operator2').value = '';
        document.getElementById('goodCount').value = '0';
        document.getElementById('initialTimeDisplay').value = '';
        document.getElementById('finalTimeDisplay').value = '';
        document.getElementById('averageCycleTime').value = '';
        document.getElementById('manHours').value = '0';
        
        // Reset defect counts
        const defectFields = [
            'materialDefect', 'doubleDefect', 'peelingDefect', 'foreignMatterDefect',
            'wrinkleDefect', 'deformationDefect', 'greaseDefect', 'screwLooseDefect',
            'otherDefect', 'shoulderDefect', 'silverDefect', 'shoulderScratchDefect',
            'shoulderOtherDefect'
        ];
        
        defectFields.forEach(field => {
            document.getElementById(field).value = '0';
        });
        
        // Reset text areas
        document.getElementById('otherDescription').value = '';
        document.getElementById('remarks').value = '';
        
        // Reset break times
        ['break1', 'break2', 'break3', 'break4'].forEach(breakId => {
            document.getElementById(`${breakId}From`).value = '';
            document.getElementById(`${breakId}To`).value = '';
        });
        
        document.getElementById('breakTime').value = '0';
        document.getElementById('excludedManHours').value = '0';
        
        // Reinitialize date
        this.initializeDate();
    }
    
    showStatusMessage(message, type) {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.textContent = message;
        statusDiv.className = `p-3 rounded-md text-center text-sm font-medium`;
        
        switch (type) {
            case 'success':
                statusDiv.classList.add('bg-green-50', 'text-green-800', 'border', 'border-green-200');
                break;
            case 'error':
                statusDiv.classList.add('bg-red-50', 'text-red-800', 'border', 'border-red-200');
                break;
            case 'warning':
                statusDiv.classList.add('bg-yellow-50', 'text-yellow-800', 'border', 'border-yellow-200');
                break;
            default:
                statusDiv.classList.add('bg-blue-50', 'text-blue-800', 'border', 'border-blue-200');
        }
        
        statusDiv.classList.remove('hidden');
        
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
    
    showLoadingIndicator(show) {
        const loadingDiv = document.getElementById('loadingIndicator');
        if (show) {
            loadingDiv.classList.remove('hidden');
        } else {
            loadingDiv.classList.add('hidden');
        }
    }
}

// Initialize the application
const authManager = new AuthManager();

// Document ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 KSG Production System - Enhanced Version');
    
    // Check if user is already logged in
    const savedUser = sessionStorage.getItem('ksg_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            authManager.currentUser = user;
            currentUser = user;
            
            // Hide login modal and initialize app
            document.getElementById('loginModal').classList.remove('show');
            await authManager.initializeApp();
        } catch (error) {
            console.error('Error restoring session:', error);
            authManager.logout();
        }
    } else {
        // Load users for login
        await authManager.loadAuthorizedUsers();
    }
    
    // Setup login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        if (!username) {
            authManager.showLoginError('ユーザーを選択してください');
            return;
        }
        
        authManager.showLoginLoading(true);
        
        const success = await authManager.login(username);
        
        authManager.showLoginLoading(false);
        
        if (!success) {
            // Error already shown by login method
        }
    });
});

// Handle online/offline events
window.addEventListener('online', () => {
    console.log('🌐 Connection restored');
    authManager.updateStatusUI(true);
    authManager.checkSystemStatus();
});

window.addEventListener('offline', () => {
    console.log('📡 Connection lost');
    authManager.updateStatusUI(false);
});

// Export for global access if needed
window.authManager = authManager;
