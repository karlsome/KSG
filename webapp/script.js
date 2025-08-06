// Enhanced KSG Production System JavaScript for step7.py integration
// This script handles authentication, data sync, and RPi communication

// Global variables
window.PYTHON_API_BASE_URL = window.location.origin; // Use current host (RPi)
window.KSG_SERVER_URL = "http://localhost:3000"; // Default for development

// Auto-detect KSG server URL based on environment
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Running on tablet - point to actual ksgServer
    window.KSG_SERVER_URL = "http://192.168.0.23:3000"; // Update this to your actual ksgServer IP
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
        this.isCheckingStatus = false; // Add flag to prevent concurrent status checks
    }
    
    async loadAuthorizedUsers() {
        try {
            console.log('🔄 Loading authorized users...');
            console.log('Trying RPi endpoint:', `${window.PYTHON_API_BASE_URL}/api/auth/users`);
            
            // Always try local RPi endpoint first when running on RPi
            try {
                const response = await fetch(`${window.PYTHON_API_BASE_URL}/api/auth/users`);
                console.log('RPi endpoint response status:', response.status);
                const data = await response.json();
                console.log('RPi endpoint response data:', data);
                
                if (data.success && data.users.length > 0) {
                    this.users = data.users;
                    this.populateUserDropdown();
                    console.log(`✅ Loaded ${this.users.length} authorized users from RPi`);
                    return true;
                }
            } catch (localError) {
                console.log('⚠️  Local RPi endpoint error:', localError.message);
                console.log('⚠️  Trying main server instead...');
            }
            
            // Fallback to main server if RPi endpoint fails
            console.log('Trying main server endpoint:', `${window.KSG_SERVER_URL}/api/users/KSG`);
            try {
                const response = await fetch(`${window.KSG_SERVER_URL}/api/users/KSG`, {
                    headers: {
                        'X-Device-ID': '4Y02SX'
                    }
                });
                console.log('Main server response status:', response.status);
                const data = await response.json();
                console.log('Main server response data:', data);
                
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
                console.log('⚠️  Main server error:', serverError.message);
            }
            
            throw new Error('No user data source available');
            
        } catch (error) {
            console.error('❌ Error loading users:', error);
            
            // Fallback to test users for development
            console.log('🔧 Using fallback test users...');
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
            console.log(`✅ Loaded ${this.users.length} fallback test users`);
            return true;
        }
    }
    
    populateUserDropdown() {
        console.log('📝 Populating user dropdown with', this.users.length, 'users');
        const userSelect = document.getElementById('username');
        if (!userSelect) {
            console.error('❌ Username select element not found!');
            return;
        }
        
        userSelect.innerHTML = '<option value="">選択してください</option>';
        
        this.users.forEach((user, index) => {
            console.log(`Adding user ${index + 1}:`, user);
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = `${user.firstName} ${user.lastName} (${user.username})`;
            userSelect.appendChild(option);
        });
        
        console.log('✅ User dropdown populated with', this.users.length, 'options');
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
            console.log('🔧 Starting app initialization...');
            
            // Ensure users are loaded (important for session restore)
            if (this.users.length === 0) {
                console.log('👥 Users not loaded yet, loading now...');
                await this.loadAuthorizedUsers();
            }
            
            // Load workers
            console.log('� Loading workers...');
            await this.loadWorkers();
            
            // Initialize date
            console.log('📅 Initializing date...');
            this.initializeDate();
            
            // Check system status
            console.log('🌐 Checking system status...');
            await this.checkSystemStatus();
            
            // Set up event listeners
            console.log('📡 Setting up event listeners...');
            this.setupEventListeners();
            
            // Start status monitoring
            console.log('⏰ Starting status monitoring...');
            this.startStatusMonitoring();
            
            // Check for and process any offline submissions
            await this.processOfflineSubmissions();
            
            // Load saved form data
            console.log('📋 Loading saved form data...');
            this.loadFormData();
            
            // Check if there are still offline submissions to show notification
            const offlineData = JSON.parse(localStorage.getItem('ksg_offline_submissions') || '[]');
            if (offlineData.length > 0) {
                this.showOfflineQueueNotification(offlineData.length);
            }
            
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
        // Prevent concurrent status checks
        if (this.isCheckingStatus) {
            console.log('⏳ Status check already in progress, skipping...');
            return;
        }
        
        this.isCheckingStatus = true;
        
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
                        console.log(`✅ RPi status: ONLINE, device_id=${rpiStatus.device_id}`);
                        
                        // Process any offline submissions when back online
                        this.processOfflineSubmissions();
                    } else {
                        this.updateStatusUI(false, `オフライン (RPi: ${rpiStatus.device_id})`);
                        console.log(`❌ RPi status: OFFLINE, device_id=${rpiStatus.device_id}`);
                    }
                    
                    // Update current hinban if exists
                    if (rpiStatus.current_hinban) {
                        document.getElementById('hinban').value = rpiStatus.current_hinban;
                        await this.processHinban(rpiStatus.current_hinban);
                    }
                    
                    // Update cycle statistics from RPi
                    await this.updateCycleStatsFromRPi();
                    return;
                } catch (rpiError) {
                    console.error('❌ Error connecting to local RPi:', rpiError);
                    this.updateStatusUI(false, 'オフライン (RPi接続エラー)');
                    return;
                }
            }
            
            // Not on RPi - check online connectivity to ksgServer (tablet mode)
            let ksgServerUrl = window.KSG_SERVER_URL;
            
            // Auto-detect environment: if we're running on tablet, use the configured KSG server
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                // Running on tablet - use the global KSG server URL
                ksgServerUrl = window.KSG_SERVER_URL;
            }
            
            // Test ksgServer connectivity
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), 5000)
            );
            
            const fetchPromise = fetch(`${ksgServerUrl}/ping`);
            const ksgResponse = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (ksgResponse.ok) {
                // We're online with ksgServer - now check if we have an associated device
                const deviceInfo = this.getSelectedDevice();
                
                if (deviceInfo && deviceInfo.local_ip) {
                    // Try to connect to the selected RPi device
                    try {
                        const rpiTimeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Request timeout')), 3000)
                        );
                        
                        const rpiFetchPromise = fetch(`http://${deviceInfo.local_ip}:${deviceInfo.local_port || 5000}/api/system/status`);
                        const rpiResponse = await Promise.race([rpiFetchPromise, rpiTimeoutPromise]);
                        
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
                            
                            // Process any offline submissions when back online
                            this.processOfflineSubmissions();
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
                
                // Process any offline submissions when back online
                this.processOfflineSubmissions();
                // Show device selection if user is logged in but no device selected
                if (this.currentUser && !deviceInfo) {
                    this.showDeviceSelection();
                }
                
            } else {
                throw new Error('ksgServer not accessible');
            }
            
        } catch (error) {
            console.error('❌ Error checking system status:', error);
            
            // Fallback - we're offline
            systemStatus = {
                online: false,
                device_id: null,
                current_hinban: null,
                local_ip: null
            };
            
            this.updateStatusUI(false);
        } finally {
            // Always reset the flag
            this.isCheckingStatus = false;
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
            console.log(`RPi detection: hostname=${hostname} -> not RPi (localhost)`);
            return false;
        }
        
        // If hostname suggests RPi, verify with endpoint test
        try {
            // Create a promise that rejects after 3 seconds
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), 3000)
            );
            
            const fetchPromise = fetch(`${window.PYTHON_API_BASE_URL}/api/system/status`);
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (response.ok) {
                const data = await response.json();
                // Check if response looks like RPi data (has device_id, device_name, etc.)
                const isRPiResponse = data.device_id && data.device_name && data.local_ip;
                console.log(`✅ RPi detection: hostname=${hostname}, endpoint_works=${isRPiResponse}, device_id=${data.device_id}`);
                return isRPiResponse;
            } else {
                console.log(`❌ RPi endpoint returned ${response.status}, falling back to hostname check`);
                return hostnameCheck;
            }
        } catch (error) {
            console.log(`⚠️  RPi endpoint test failed: ${error.message}, falling back to hostname check (${hostnameCheck})`);
            // If RPi endpoint fails but hostname suggests RPi, assume we're on RPi with issues
            return hostnameCheck;
        }
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
                ksgServerUrl = window.KSG_SERVER_URL;
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
        
        // Update cycle stats more frequently (every 5 seconds) when running on RPi
        if (this.detectRPiEnvironment()) {
            setInterval(async () => {
                await this.updateCycleStatsFromRPi();
            }, 5000);
        }
    }
    
    async updateCycleStatsFromRPi() {
        try {
            const response = await fetch(`${window.PYTHON_API_BASE_URL}/get-current-cycle-stats`);
            if (response.ok) {
                const stats = await response.json();
                if (stats.status === 'success') {
                    // Update the good count display
                    const goodCountInput = document.getElementById('goodCount');
                    if (goodCountInput && stats.quantity !== undefined) {
                        goodCountInput.value = stats.quantity;
                        console.log(`🔄 Updated good count to: ${stats.quantity}`);
                    }
                    
                    // Update other fields if they exist
                    if (stats.initial_time && stats.initial_time !== "N/A") {
                        const initialTimeInput = document.getElementById('initialTimeDisplay');
                        if (initialTimeInput) {
                            initialTimeInput.value = stats.initial_time;
                        }
                    }
                    
                    if (stats.final_time && stats.final_time !== "N/A") {
                        const finalTimeInput = document.getElementById('finalTimeDisplay');
                        if (finalTimeInput) {
                            finalTimeInput.value = stats.final_time;
                        }
                    }
                    
                    if (stats.average_cycle_time !== undefined) {
                        const avgTimeInput = document.getElementById('averageCycleTime');
                        if (avgTimeInput) {
                            avgTimeInput.value = stats.average_cycle_time.toFixed(2);
                        }
                    }
                }
            }
        } catch (error) {
            console.log('⚠️ Could not fetch cycle stats from RPi:', error.message);
        }
    }
    
    setupEventListeners() {
        // Global QR code keyboard listener (for QR scanner input)
        this.setupQRKeyboardListener();
        
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
        
        // Prevent form submission on Enter key for all input fields except submit button
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Allow Enter only on the submit button
                if (e.target.id === 'submitDataBtn') {
                    return; // Let the button handle it
                }
                // Prevent form submission for all other elements
                e.preventDefault();
                e.stopPropagation();
            }
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
                
                // Save form data after quantity change
                this.saveFormData();
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
                
                // Save form data after time change
                this.saveFormData();
            });
            
            // Add change event listener for manual time edits
            input.addEventListener('change', () => {
                this.calculateBreakTime();
                this.saveFormData();
            });
            
            // Add input event listener for real-time updates
            input.addEventListener('input', () => {
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
                
                // Save form data after break reset
                this.saveFormData();
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
        
        // Add persistence event listeners for form fields
        this.setupFormPersistence();
    }
    
    setupFormPersistence() {
        console.log('💾 Setting up form persistence...');
        
        // Worker dropdowns
        ['operator1', 'operator2'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    this.saveFormData();
                    console.log(`💾 Saved ${id}: ${element.value}`);
                });
            }
        });
        
        // Defect counts (with quantity buttons)
        ['defectCount1', 'defectCount2', 'defectCount3', 'defectCount4', 'defectCount5'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => {
                    this.saveFormData();
                });
            }
        });
        
        // Comments
        const comments = document.getElementById('comments');
        if (comments) {
            comments.addEventListener('input', () => {
                this.saveFormData();
            });
        }
        
        // Break time fields
        ['break1From', 'break1To', 'break2From', 'break2To', 
         'break3From', 'break3To', 'break4From', 'break4To'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    this.saveFormData();
                });
            }
        });
        
        // Other fields
        ['productName', 'lhRh'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => {
                    this.saveFormData();
                });
            }
        });
        
        console.log('✅ Form persistence setup complete');
    }
    
    setupQRKeyboardListener() {
        let qrBuffer = '';
        
        console.log('🔧 Setting up QR keyboard listener - waiting for Enter key...');
        
        document.addEventListener('keypress', (e) => {
            console.log(`📥 Keypress detected: "${e.key}", target: ${e.target.tagName}, buffer: "${qrBuffer}"`);
            
            // Skip if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                console.log('⏭️ Skipping keypress - typing in input field');
                return;
            }
            
            // Skip if modal is open (login, device selection, etc.)
            if (document.querySelector('.show, [style*="display: block"]')) {
                console.log('⏭️ Skipping keypress - modal is open');
                return;
            }
            
            // Add character to buffer (except Enter)
            if (e.key !== 'Enter') {
                qrBuffer += e.key;
                console.log(`📝 Added to buffer: "${e.key}", new buffer: "${qrBuffer}"`);
            } else {
                // Enter key pressed - process the QR code if we have data
                if (qrBuffer.length > 0) {
                    console.log(`📱 Keypress Enter detected, processing QR: "${qrBuffer}"`);
                    this.processQRCode(qrBuffer);
                    qrBuffer = '';
                    e.preventDefault();
                } else {
                    console.log('⚠️ Keypress Enter detected but buffer is empty');
                }
            }
        });
        
        // Also listen for keydown Enter (some QR scanners only send keydown)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                console.log(`🔽 Keydown Enter detected, buffer: "${qrBuffer}", target: ${e.target.tagName}`);
                
                // Skip if user is typing in an input field
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                    console.log('⏭️ Skipping keydown - typing in input field');
                    return;
                }
                
                // Skip if modal is open
                if (document.querySelector('.show, [style*="display: block"]')) {
                    console.log('⏭️ Skipping keydown - modal is open');
                    return;
                }
                
                // Process the QR code if we have data
                if (qrBuffer.length > 0) {
                    console.log(`📱 Keydown Enter processing QR: "${qrBuffer}"`);
                    this.processQRCode(qrBuffer);
                    qrBuffer = '';
                    e.preventDefault();
                } else {
                    console.log('⚠️ Keydown Enter detected but buffer is empty');
                }
            }
        });
    }
    
    processQRCode(qrValue) {
        console.log(`📱 QR Code detected: "${qrValue}"`);
        
        // Remove any whitespace
        const cleanValue = qrValue.trim();
        
        if (!cleanValue) {
            return;
        }
        
        // Check for hinban QR code format: "hinban:aaa"
        if (cleanValue.startsWith('hinban:')) {
            const hinban = cleanValue.substring(7); // Remove "hinban:" prefix
            if (hinban) {
                console.log(`📋 Setting hinban: "${hinban}"`);
                const hinbanInput = document.getElementById('hinban');
                if (hinbanInput) {
                    hinbanInput.value = hinban;
                    // Trigger the hinban processing
                    this.processHinban(hinban);
                    this.showStatusMessage(`品番を設定しました: ${hinban}`, 'success');
                }
            }
            return;
        }
        
        // Check for worker QR code format: "worker:karl handsome"
        if (cleanValue.startsWith('worker:')) {
            const workerName = cleanValue.substring(7); // Remove "worker:" prefix
            if (workerName) {
                console.log(`👤 Setting worker: "${workerName}"`);
                
                const operator1Select = document.getElementById('operator1');
                const operator2Select = document.getElementById('operator2');
                
                if (operator1Select && operator2Select) {
                    // Find the worker by matching the scanned name with cached workers
                    let matchedWorker = null;
                    
                    // Try exact match first
                    matchedWorker = cachedWorkers.find(worker => {
                        const fullName = worker.fullName || `${worker.firstName} ${worker.lastName}`;
                        return fullName.toLowerCase() === workerName.toLowerCase();
                    });
                    
                    // If no exact match, try partial match
                    if (!matchedWorker) {
                        matchedWorker = cachedWorkers.find(worker => {
                            const fullName = worker.fullName || `${worker.firstName} ${worker.lastName}`;
                            return fullName.toLowerCase().includes(workerName.toLowerCase()) ||
                                   workerName.toLowerCase().includes(fullName.toLowerCase());
                        });
                    }
                    
                    if (matchedWorker) {
                        const workerUsername = matchedWorker.username;
                        const displayName = matchedWorker.fullName || `${matchedWorker.firstName} ${matchedWorker.lastName}`;
                        
                        // Check if operator1 already has a value
                        if (!operator1Select.value || operator1Select.value.trim() === '') {
                            // Set as operator1
                            operator1Select.value = workerUsername;
                            this.showStatusMessage(`技能員①を設定しました: ${displayName}`, 'success');
                        } else if (!operator2Select.value || operator2Select.value.trim() === '') {
                            // operator1 is filled, set as operator2
                            operator2Select.value = workerUsername;
                            this.showStatusMessage(`技能員②を設定しました: ${displayName}`, 'success');
                        } else {
                            // Both operators are filled, replace operator1 and move current operator1 to operator2
                            const previousOperator1Value = operator1Select.value;
                            const previousOperator1Text = operator1Select.options[operator1Select.selectedIndex].text;
                            
                            operator1Select.value = workerUsername;
                            operator2Select.value = previousOperator1Value;
                            this.showStatusMessage(`技能員を更新しました: ①${displayName} ②${previousOperator1Text}`, 'info');
                        }
                        
                        // Save form data after worker assignment
                        this.saveFormData();
                    } else {
                        // No matching worker found - set directly as text (for custom names)
                        console.log(`⚠️ Worker "${workerName}" not found in database, setting as custom value`);
                        
                        // For custom names, we need to add them as options or handle differently
                        // For now, show a warning
                        this.showStatusMessage(`作業者 "${workerName}" がデータベースにありません`, 'warning');
                    }
                }
            }
            return;
        }
        
        // If it doesn't match any specific format, treat as regular hinban
        console.log(`📋 Treating as regular hinban: "${cleanValue}"`);
        const hinbanInput = document.getElementById('hinban');
        if (hinbanInput) {
            hinbanInput.value = cleanValue;
            // Trigger the hinban processing
            this.processHinban(cleanValue);
            this.showStatusMessage(`品番を設定しました: ${cleanValue}`, 'success');
        }
    }
    
    async processHinban(hinban) {
        try {
            this.showLoadingIndicator(true);
            
            // Try local RPi endpoint first if we're running on RPi
            const isRunningOnRPi = await this.detectRPiEnvironmentAsync();
            
            if (isRunningOnRPi) {
                console.log(`🔧 RPi mode: Getting product info for hinban ${hinban} from local database`);
                
                try {
                    // Try local RPi product endpoint first
                    const localResponse = await fetch(`${window.PYTHON_API_BASE_URL}/api/product/${hinban}`);
                    console.log('Local RPi product endpoint response status:', localResponse.status);
                    
                    if (localResponse.ok) {
                        const localData = await localResponse.json();
                        console.log('Local RPi product response data:', localData);
                        
                        if (localData.success && localData.product) {
                            const product = localData.product;
                            // Auto-fill product information
                            document.getElementById('productName').value = product.製品名 || '';
                            document.getElementById('lhRh').value = product['LH/RH'] || '';
                            
                            this.showStatusMessage(`製品情報を取得しました: ${product.製品名} (ローカル)`, 'success');
                            
                            // Also set hinban on RPi for production tracking
                            try {
                                await fetch(`${window.PYTHON_API_BASE_URL}/set-current-hinban`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ hinban: hinban })
                                });
                                console.log(`✅ Set current hinban on RPi: ${hinban}`);
                            } catch (hinbanError) {
                                console.log('⚠️  Could not set hinban on RPi:', hinbanError.message);
                            }
                            
                            return; // Success - exit early
                        } else {
                            console.log(`❌ Product ${hinban} not found in local database`);
                        }
                    } else {
                        console.log(`❌ Local RPi product endpoint returned ${localResponse.status}`);
                    }
                } catch (localError) {
                    console.log('⚠️  Local RPi product endpoint error:', localError.message);
                }
                
                // If we get here, local RPi failed, but we're still on RPi
                // Don't fallback to main server if we're offline
                if (!systemStatus.online) {
                    this.showStatusMessage(`品番 "${hinban}" がローカルデータベースに見つかりません (オフライン)`, 'warning');
                    return;
                }
            }
            
            // Fallback to main server (either not on RPi, or RPi is online and local failed)
            console.log(`🌐 Fallback: Getting product info from main server for hinban ${hinban}`);
            
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
                        
                        this.showStatusMessage(`製品情報を取得しました: ${product.製品名} (サーバー)`, 'success');
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
        
        const calculatedBreakTime = Math.round(totalMinutes);
        document.getElementById('breakTime').value = calculatedBreakTime;
        
        // Save form data after break time calculation
        this.saveFormData();
        
        console.log(`🕐 Break time calculated: ${calculatedBreakTime} minutes`);
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
            // Show loading animation
            this.showSubmissionStatus('データを送信中...', 'loading');
            this.showLoadingIndicator(true);
            
            // Collect all form data
            const formData = this.collectFormData();
            
            // Validate required fields only if we have basic data
            if (!formData.品番) {
                throw new Error('品番は必須です');
            }
            
            // Allow submission without operator if this is offline test data
            if (!formData["技能員①"] && !systemStatus.rpi_direct) {
                throw new Error('技能員①は必須です');
            }
            
            // Detect environment and handle submission accordingly
            const isRunningOnRPi = await this.detectRPiEnvironmentAsync();
            
            if (isRunningOnRPi) {
                // Running on RPi - try RPi submission endpoint first
                console.log('🔧 RPi mode: Submitting data through RPi endpoint');
                this.showSubmissionStatus('RPi経由で送信中...', 'loading');
                
                try {
                    // Get current cycle logs from RPi if available
                    try {
                        const cycleResponse = await fetch(`${window.PYTHON_API_BASE_URL}/get-all-cycle-logs-for-submission`);
                        if (cycleResponse.ok) {
                            const cycleData = await cycleResponse.json();
                            if (cycleData.status === 'success') {
                                formData.生産ログ = cycleData.logs;
                                
                                // Calculate automatic fields from real cycle data
                                if (cycleData.logs.length > 0) {
                                    formData.良品数 = cycleData.logs.length;
                                    formData.開始時間 = cycleData.logs[0].initial_time;
                                    formData.終了時間 = cycleData.logs[cycleData.logs.length - 1].final_time;
                                    
                                    const totalCycleTime = cycleData.logs.reduce((sum, log) => sum + log.cycle_time, 0);
                                    formData.平均サイクル時間 = totalCycleTime / cycleData.logs.length;
                                }
                            }
                        }
                    } catch (cycleError) {
                        console.log('⚠️ Could not get cycle logs, using form data');
                        // Use form data as fallback
                        formData.良品数 = parseInt(document.getElementById('goodCount').value) || 0;
                        formData.開始時間 = document.getElementById('initialTimeDisplay').value || new Date().toISOString();
                        formData.終了時間 = document.getElementById('finalTimeDisplay').value || new Date().toISOString();
                        formData.平均サイクル時間 = parseFloat(document.getElementById('averageCycleTime').value) || 0;
                    }
                    
                    // Submit through RPi endpoint (handles offline queuing automatically)
                    const rpiSubmitResponse = await fetch(`${window.PYTHON_API_BASE_URL}/api/submit-production-data`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });
                    
                    if (rpiSubmitResponse.ok) {
                        const rpiSubmitData = await rpiSubmitResponse.json();
                        
                        if (rpiSubmitData.success) {
                            if (rpiSubmitData.queued) {
                                this.showSubmissionStatus('オフラインモード - RPiに保存しました', 'warning');
                                this.showStatusMessage('データを一時保存しました（オフライン）- RPiで管理中', 'warning');
                            } else {
                                this.showSubmissionStatus('送信完了！', 'success');
                                this.showStatusMessage('データを正常に送信しました（RPi経由）', 'success');
                            }
                            
                            // Reset RPi state after successful submission
                            try {
                                await fetch(`${window.PYTHON_API_BASE_URL}/reset-all-data`, {
                                    method: 'POST'
                                });
                                console.log('✅ RPi state reset after submission');
                            } catch (resetError) {
                                console.log('⚠️ Failed to reset RPi state:', resetError.message);
                            }
                            
                            // Clear form after successful submission
                            setTimeout(() => {
                                this.resetForm();
                            }, 2000);
                            return;
                        } else {
                            throw new Error(rpiSubmitData.error || 'RPi submission failed');
                        }
                    } else {
                        throw new Error(`RPi endpoint returned ${rpiSubmitResponse.status}`);
                    }
                    
                } catch (rpiError) {
                    console.error('❌ RPi submission failed:', rpiError);
                    // If RPi submission fails, fall back to direct server submission if online
                    if (systemStatus.online) {
                        console.log('⚠️ Falling back to direct server submission...');
                        this.showSubmissionStatus('RPi接続失敗 - サーバー直接送信中...', 'loading');
                    } else {
                        // Completely offline - save to browser local storage as last resort
                        this.showSubmissionStatus('オフライン - ブラウザに保存中...', 'offline');
                        this.saveToLocalStorage(formData);
                        this.showSubmissionStatus('オフライン保存完了', 'warning');
                        this.showStatusMessage('RPi接続不可 - ブラウザに一時保存しました', 'warning');
                        return;
                    }
                }
            }
            
            // Not on RPi or RPi submission failed - try direct server submission
            if (systemStatus.online || !isRunningOnRPi) {
                console.log('🌐 Direct server submission mode');
                this.showSubmissionStatus('サーバーに直接送信中...', 'loading');
                
                // Prepare form data for direct submission
                if (!formData.生産ログ) {
                    // No cycle logs available - use form data
                    formData.生産ログ = [];
                    formData.良品数 = parseInt(document.getElementById('goodCount').value) || 0;
                    formData.開始時間 = document.getElementById('initialTimeDisplay').value || new Date().toISOString();
                    formData.終了時間 = document.getElementById('finalTimeDisplay').value || new Date().toISOString();
                    formData.平均サイクル時間 = parseFloat(document.getElementById('averageCycleTime').value) || 0;
                }
                
                try {
                    const directSubmitResponse = await fetch(`${window.KSG_SERVER_URL}/api/submit-production-data`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Device-ID': '4Y02SX'  // Required for authentication
                        },
                        body: JSON.stringify(formData)
                    });
                    
                    if (directSubmitResponse.ok) {
                        const directSubmitData = await directSubmitResponse.json();
                        
                        if (directSubmitData.success) {
                            this.showSubmissionStatus('送信完了！', 'success');
                            this.showStatusMessage('データを正常に送信しました（直接）', 'success');
                            
                            // Reset RPi state if we're connected to one
                            const isRunningOnRPi = await this.detectRPiEnvironmentAsync();
                            if (isRunningOnRPi) {
                                try {
                                    await fetch(`${window.PYTHON_API_BASE_URL}/reset-all-data`, {
                                        method: 'POST'
                                    });
                                    console.log('✅ RPi state reset after direct submission');
                                } catch (resetError) {
                                    console.log('⚠️ Failed to reset RPi state:', resetError.message);
                                }
                            }
                            
                            // Clear form after successful submission
                            setTimeout(() => {
                                this.resetForm();
                            }, 2000);
                            return;
                        } else {
                            throw new Error(directSubmitData.error || 'Direct submission failed');
                        }
                    } else {
                        throw new Error(`Server returned ${directSubmitResponse.status}`);
                    }
                    
                } catch (directError) {
                    console.error('❌ Direct server submission failed:', directError);
                    // Save to local storage as last resort
                    this.showSubmissionStatus('サーバー接続失敗 - ローカル保存中...', 'offline');
                    this.saveToLocalStorage(formData);
                    this.showSubmissionStatus('オフライン保存完了', 'warning');
                    this.showStatusMessage('サーバー接続不可 - ブラウザに一時保存しました', 'warning');
                    return;
                }
            } else {
                // Completely offline
                this.showSubmissionStatus('オフライン - ローカル保存中...', 'offline');
                this.saveToLocalStorage(formData);
                this.showSubmissionStatus('オフライン保存完了', 'warning');
                this.showStatusMessage('オフライン - ブラウザに一時保存しました', 'warning');
            }
            
        } catch (error) {
            console.error('Error submitting data:', error);
            this.showSubmissionStatus('送信エラー', 'error');
            this.showStatusMessage(`送信エラー: ${error.message}`, 'error');
        } finally {
            this.showLoadingIndicator(false);
        }
    }
    
    saveToLocalStorage(formData) {
        try {
            // Get existing offline submissions
            const existingData = JSON.parse(localStorage.getItem('ksg_offline_submissions') || '[]');
            
            // Add current submission with timestamp
            existingData.push({
                data: formData,
                saved_at: new Date().toISOString(),
                submission_id: `offline_${Date.now()}`
            });
            
            // Save back to localStorage
            localStorage.setItem('ksg_offline_submissions', JSON.stringify(existingData));
            
            console.log(`💾 Saved submission to localStorage. Total offline: ${existingData.length}`);
            
            // Show offline queue notification
            this.showOfflineQueueNotification(existingData.length);
            
        } catch (storageError) {
            console.error('❌ Failed to save to localStorage:', storageError);
        }
    }
    
    async processOfflineSubmissions() {
        try {
            const offlineData = JSON.parse(localStorage.getItem('ksg_offline_submissions') || '[]');
            
            if (offlineData.length === 0) {
                this.hideOfflineQueueNotification();
                return;
            }
            
            console.log(`🔄 Processing ${offlineData.length} offline submissions...`);
            this.showSubmissionStatus(`${offlineData.length}件のオフラインデータを送信中...`, 'loading');
            
            let successCount = 0;
            const remainingData = [];
            
            for (const submission of offlineData) {
                try {
                    // Try to submit through appropriate endpoint
                    const isOnRPi = await this.detectRPiEnvironmentAsync();
                    let success = false;
                    
                    if (isOnRPi) {
                        // Try RPi endpoint
                        const response = await fetch(`${window.PYTHON_API_BASE_URL}/api/submit-production-data`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(submission.data)
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            success = result.success;
                        }
                    } else {
                        // Try direct server
                        const response = await fetch(`${window.KSG_SERVER_URL}/api/submit-production-data`, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'X-Device-ID': '4Y02SX'
                            },
                            body: JSON.stringify(submission.data)
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            success = result.success;
                        }
                    }
                    
                    if (success) {
                        successCount++;
                        console.log(`✅ Submitted offline data: ${submission.data.品番}`);
                    } else {
                        remainingData.push(submission);
                    }
                    
                } catch (submitError) {
                    console.log(`⚠️ Failed to submit offline data: ${submitError.message}`);
                    remainingData.push(submission);
                }
            }
            
            // Update localStorage with remaining unsent data
            localStorage.setItem('ksg_offline_submissions', JSON.stringify(remainingData));
            
            if (successCount > 0) {
                this.showSubmissionStatus(`${successCount}件のデータを送信完了！`, 'success');
                this.showStatusMessage(`${successCount}件のオフラインデータを送信しました`, 'success');
            }
            
            // Update or hide queue notification
            if (remainingData.length > 0) {
                this.showOfflineQueueNotification(remainingData.length);
            } else {
                this.hideOfflineQueueNotification();
            }
            
        } catch (error) {
            console.error('❌ Error processing offline submissions:', error);
            this.showSubmissionStatus('オフラインデータ送信エラー', 'error');
        }
    }
    
    // Form Data Persistence Management
    saveFormData() {
        try {
            const formData = {
                // Worker dropdowns
                operator1: document.getElementById('operator1')?.value || '',
                operator2: document.getElementById('operator2')?.value || '',
                
                // Defect counts
                defectCount1: document.getElementById('defectCount1')?.value || '0',
                defectCount2: document.getElementById('defectCount2')?.value || '0',
                defectCount3: document.getElementById('defectCount3')?.value || '0',
                defectCount4: document.getElementById('defectCount4')?.value || '0',
                defectCount5: document.getElementById('defectCount5')?.value || '0',
                
                // Comments
                comments: document.getElementById('comments')?.value || '',
                
                // Break times
                break1From: document.getElementById('break1From')?.value || '',
                break1To: document.getElementById('break1To')?.value || '',
                break2From: document.getElementById('break2From')?.value || '',
                break2To: document.getElementById('break2To')?.value || '',
                break3From: document.getElementById('break3From')?.value || '',
                break3To: document.getElementById('break3To')?.value || '',
                break4From: document.getElementById('break4From')?.value || '',
                break4To: document.getElementById('break4To')?.value || '',
                
                // Calculated break time (minutes)
                breakTime: document.getElementById('breakTime')?.value || '0',
                
                // Other fields
                productName: document.getElementById('productName')?.value || '',
                lhRh: document.getElementById('lhRh')?.value || ''
            };
            
            localStorage.setItem('ksg_form_data', JSON.stringify(formData));
            console.log('💾 Form data saved to localStorage');
        } catch (error) {
            console.error('❌ Error saving form data:', error);
        }
    }
    
    loadFormData() {
        try {
            const savedData = localStorage.getItem('ksg_form_data');
            if (!savedData) return;
            
            const formData = JSON.parse(savedData);
            console.log('📋 Loading saved form data:', formData);
            
            // Worker dropdowns
            if (formData.operator1) {
                const operator1 = document.getElementById('operator1');
                if (operator1) operator1.value = formData.operator1;
            }
            if (formData.operator2) {
                const operator2 = document.getElementById('operator2');
                if (operator2) operator2.value = formData.operator2;
            }
            
            // Defect counts
            ['defectCount1', 'defectCount2', 'defectCount3', 'defectCount4', 'defectCount5'].forEach(id => {
                if (formData[id]) {
                    const element = document.getElementById(id);
                    if (element) element.value = formData[id];
                }
            });
            
            // Comments
            if (formData.comments) {
                const comments = document.getElementById('comments');
                if (comments) comments.value = formData.comments;
            }
            
            // Break times
            ['break1From', 'break1To', 'break2From', 'break2To', 
             'break3From', 'break3To', 'break4From', 'break4To'].forEach(id => {
                if (formData[id]) {
                    const element = document.getElementById(id);
                    if (element) element.value = formData[id];
                }
            });
            
            // Calculated break time
            if (formData.breakTime) {
                const breakTime = document.getElementById('breakTime');
                if (breakTime) breakTime.value = formData.breakTime;
            }
            
            // Other fields
            if (formData.productName) {
                const productName = document.getElementById('productName');
                if (productName) productName.value = formData.productName;
            }
            if (formData.lhRh) {
                const lhRh = document.getElementById('lhRh');
                if (lhRh) lhRh.value = formData.lhRh;
            }
            
            // Recalculate break time after loading
            this.calculateBreakTime();
            
            console.log('✅ Form data loaded from localStorage');
        } catch (error) {
            console.error('❌ Error loading form data:', error);
        }
    }
    
    clearFormData() {
        try {
            localStorage.removeItem('ksg_form_data');
            console.log('🗑️ Form data cleared from localStorage');
        } catch (error) {
            console.error('❌ Error clearing form data:', error);
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
            
            // Check if we're running on RPi and reset RPi state
            const isRunningOnRPi = await this.detectRPiEnvironmentAsync();
            
            if (isRunningOnRPi) {
                try {
                    // Reset RPi production state
                    const resetResponse = await fetch(`${window.PYTHON_API_BASE_URL}/reset-all-data`, {
                        method: 'POST'
                    });
                    
                    if (resetResponse.ok) {
                        const resetData = await resetResponse.json();
                        if (resetData.status === 'success') {
                            console.log('✅ RPi state reset successfully');
                            this.showStatusMessage('RPi状態をリセットしました', 'success');
                        } else {
                            console.log('⚠️ RPi reset response:', resetData.message);
                        }
                    } else {
                        console.log('⚠️ RPi reset endpoint returned:', resetResponse.status);
                    }
                } catch (rpiError) {
                    console.log('⚠️ Failed to reset RPi state:', rpiError.message);
                    // Continue with form reset even if RPi reset fails
                }
            }
            
            // Reset the form
            this.resetForm();
            this.showStatusMessage('フォームをリセットしました', 'success');
            
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
        ['defectCount1', 'defectCount2', 'defectCount3', 'defectCount4', 'defectCount5'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '0';
        });
        
        // Reset text areas
        const commentsField = document.getElementById('comments');
        if (commentsField) commentsField.value = '';
        
        // Reset break times
        ['break1', 'break2', 'break3', 'break4'].forEach(breakId => {
            document.getElementById(`${breakId}From`).value = '';
            document.getElementById(`${breakId}To`).value = '';
        });
        
        document.getElementById('breakTime').value = '0';
        document.getElementById('excludedManHours').value = '0';
        
        // Reinitialize date
        this.initializeDate();
        
        // Clear saved form data
        this.clearFormData();
        console.log('🗑️ Form reset and saved data cleared');
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
    
    showSubmissionStatus(message, type, animated = false) {
        // Create or get submission status element
        let statusDiv = document.getElementById('submissionStatus');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'submissionStatus';
            statusDiv.className = 'fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300';
            document.body.appendChild(statusDiv);
        }
        
        // Clear existing content
        statusDiv.innerHTML = '';
        statusDiv.className = 'fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300';
        
        // Set styling based on type
        switch (type) {
            case 'loading':
                statusDiv.classList.add('bg-blue-50', 'text-blue-800', 'border', 'border-blue-200');
                statusDiv.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span class="font-medium">${message}</span>
                    </div>
                `;
                break;
            case 'offline':
                statusDiv.classList.add('bg-orange-50', 'text-orange-800', 'border', 'border-orange-200');
                statusDiv.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <div class="flex space-x-1">
                            <div class="w-2 h-2 bg-orange-600 rounded-full animate-bounce"></div>
                            <div class="w-2 h-2 bg-orange-600 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                            <div class="w-2 h-2 bg-orange-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                        </div>
                        <span class="font-medium">${message}</span>
                    </div>
                `;
                break;
            case 'success':
                statusDiv.classList.add('bg-green-50', 'text-green-800', 'border', 'border-green-200');
                statusDiv.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <div class="text-green-600">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <span class="font-medium">${message}</span>
                    </div>
                `;
                break;
            case 'error':
                statusDiv.classList.add('bg-red-50', 'text-red-800', 'border', 'border-red-200');
                statusDiv.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <div class="text-red-600">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <span class="font-medium">${message}</span>
                    </div>
                `;
                break;
            case 'warning':
                statusDiv.classList.add('bg-yellow-50', 'text-yellow-800', 'border', 'border-yellow-200');
                statusDiv.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <div class="text-yellow-600">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <span class="font-medium">${message}</span>
                    </div>
                `;
                break;
        }
        
        // Show the notification
        statusDiv.classList.remove('opacity-0', 'translate-x-full');
        statusDiv.classList.add('opacity-100', 'translate-x-0');
        
        // Auto-hide after delay (except for loading)
        if (type !== 'loading') {
            setTimeout(() => {
                this.hideSubmissionStatus();
            }, type === 'success' ? 3000 : 5000);
        }
    }
    
    hideSubmissionStatus() {
        const statusDiv = document.getElementById('submissionStatus');
        if (statusDiv) {
            statusDiv.classList.remove('opacity-100', 'translate-x-0');
            statusDiv.classList.add('opacity-0', 'translate-x-full');
            
            setTimeout(() => {
                if (statusDiv.parentNode) {
                    statusDiv.parentNode.removeChild(statusDiv);
                }
            }, 300);
        }
    }
    
    showOfflineQueueNotification(count) {
        // Create or get offline queue notification
        let queueDiv = document.getElementById('offlineQueueNotification');
        if (!queueDiv) {
            queueDiv = document.createElement('div');
            queueDiv.id = 'offlineQueueNotification';
            queueDiv.className = 'fixed bottom-4 right-4 z-50 p-3 rounded-lg shadow-lg transition-all duration-300 bg-purple-50 text-purple-800 border border-purple-200';
            document.body.appendChild(queueDiv);
        }
        
        queueDiv.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="animate-pulse w-2 h-2 bg-purple-600 rounded-full"></div>
                <span class="text-sm font-medium">${count}件のデータが送信待ち</span>
                <button onclick="authManager.processOfflineSubmissions()" class="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700">
                    送信
                </button>
            </div>
        `;
        
        queueDiv.classList.remove('opacity-0', 'translate-y-full');
        queueDiv.classList.add('opacity-100', 'translate-y-0');
    }
    
    hideOfflineQueueNotification() {
        const queueDiv = document.getElementById('offlineQueueNotification');
        if (queueDiv) {
            queueDiv.classList.remove('opacity-100', 'translate-y-0');
            queueDiv.classList.add('opacity-0', 'translate-y-full');
            
            setTimeout(() => {
                if (queueDiv.parentNode) {
                    queueDiv.parentNode.removeChild(queueDiv);
                }
            }, 300);
        }
    }
}

// Initialize the application
const authManager = new AuthManager();

// Document ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 KSG Production System - Enhanced Version');
    console.log('Environment:', window.location.href);
    console.log('PYTHON_API_BASE_URL:', window.PYTHON_API_BASE_URL);
    console.log('KSG_SERVER_URL:', window.KSG_SERVER_URL);
    
    // Check if user is already logged in
    const savedUser = sessionStorage.getItem('ksg_user');
    if (savedUser) {
        try {
            console.log('📋 Restoring session...');
            const user = JSON.parse(savedUser);
            authManager.currentUser = user;
            currentUser = user;
            
            // Hide login modal and initialize app
            document.getElementById('loginModal').classList.remove('show');
            console.log('🔧 Initializing app after session restore...');
            await authManager.initializeApp();
        } catch (error) {
            console.error('❌ Error restoring session:', error);
            authManager.logout();
        }
    } else {
        // Load users for login
        console.log('🔑 No saved session, loading users for login...');
        try {
            await authManager.loadAuthorizedUsers();
        } catch (error) {
            console.error('❌ Critical error loading users:', error);
        }
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
