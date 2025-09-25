// Enhanced KSG Production System JavaScript
// This script handles authentication, data sync, and server communication

// Global variables
window.KSG_SERVER_URL = "http://localhost:3000"; // Default for development

// Auto-detect KSG server URL based on environment
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Running on production/ESP32 - point to actual ksgServer
    //window.KSG_SERVER_URL = "https://ksg-lu47.onrender.com";
    window.KSG_SERVER_URL = "http://192.168.0.64:3000";
}

let currentUser = null;
let isOnline = true;
let cachedWorkers = [];
let cachedProducts = [];
let systemStatus = {
    online: false,
    device_id: null,
    current_hinban: null
};

// Production Manager for real-time Socket.IO communication
class ProductionManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }
    
    async initialize() {
        if (!window.io) {
            console.log('⚠️  Socket.IO not available - skipping real-time updates');
            return;
        }
        
        try {
            // Connect to ksgServer for real-time production updates
            const serverUrl = window.KSG_SERVER_URL.replace(/\/$/, ''); // Remove trailing slash
            console.log('🔌 Connecting to production server:', serverUrl);
            
            this.socket = window.io(serverUrl, {
                transports: ['websocket', 'polling'],
                timeout: 5000,
                forceNew: true
            });
            
            this.setupEventHandlers();
            
        } catch (error) {
            console.error('❌ Failed to initialize production manager:', error);
        }
    }
    
    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to production server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Register this webapp as a client interested in production updates
            this.socket.emit('webapp_register', {
                type: 'webapp_client',
                device_id: systemStatus.device_id || 'webapp',
                timestamp: Date.now()
            });
            
            // Request current production status from ESP32 for sync after a short delay
            setTimeout(() => {
                console.log('🔄 Requesting current production status from ESP32...');
                this.socket.emit('esp32_command', {
                    type: 'request_production_status',
                    device_id: systemStatus.device_id || 'webapp',
                    timestamp: Date.now()
                });
            }, 500); // 500ms delay to ensure registration is processed
        });
        
        this.socket.on('disconnect', () => {
            console.log('🔌 Disconnected from production server');
            this.isConnected = false;
        });
        
        this.socket.on('connect_error', (error) => {
            console.log('❌ Production server connection error:', error.message);
            this.isConnected = false;
        });
        
        // Handle production updates from ESP32 devices
        this.socket.on('message', (data) => {
            this.handleProductionMessage(data);
        });
        
        // Handle production validation requests from ESP32
        this.socket.on('validate_production_start', (data) => {
            this.handleValidationRequest(data);
        });
    }
    
    handleProductionMessage(data) {
        console.log('📊 Received production update:', data);
        
        if (data.type === 'production_update') {
            // Check if this is initial sync after page refresh
            const currentValue = document.getElementById('goodCount')?.value || '0';
            const isSync = currentValue === '0' && data.good_count > 0;
            if (isSync) {
                console.log('🔄 Initial sync - updating from ESP32 current state');
            }
            // Update good count field in real-time
            const goodCountField = document.getElementById('goodCount');
            const avgCycleTimeField = document.getElementById('averageCycleTime');
            const initialTimeField = document.getElementById('initialTimeDisplay');
            const finalTimeField = document.getElementById('finalTimeDisplay');
            
            if (goodCountField && data.good_count !== undefined) {
                goodCountField.value = data.good_count;
                console.log('🔄 Updated good count to:', data.good_count);
                
                // Flash the field to indicate update
                goodCountField.classList.add('flash-green');
                setTimeout(() => {
                    goodCountField.classList.remove('flash-green');
                }, 200);
            }
            
            if (avgCycleTimeField && data.average_cycle_time !== undefined) {
                avgCycleTimeField.value = data.average_cycle_time.toFixed(2);
                console.log('🔄 Updated average cycle time to:', data.average_cycle_time.toFixed(2));
            }
            
            if (initialTimeField && data.first_cycle_time) {
                initialTimeField.value = data.first_cycle_time;
            }
            
            if (finalTimeField && data.last_cycle_time) {
                finalTimeField.value = data.last_cycle_time;
            }
        }
    }
    
    // Send reset command to ESP32 via server
    async resetProduction() {
        if (!this.isConnected) {
            console.log('⚠️  Not connected to production server - trying direct ESP32 reset');
            return this.resetDirectESP32();
        }
        
        try {
            // Send reset command via Socket.IO
            this.socket.emit('esp32_command', {
                type: 'reset_production',
                device_id: systemStatus.device_id,
                timestamp: Date.now()
            });
            
            console.log('📤 Sent production reset command via server');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to send reset via server:', error);
            return this.resetDirectESP32();
        }
    }
    
    async resetDirectESP32() {
        try {
            // Direct HTTP call to ESP32 reset endpoint
            const response = await fetch(`${window.location.origin}/api/reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                console.log('✅ ESP32 production data reset successfully');
                
                // Reset local UI
                document.getElementById('goodCount').value = '0';
                document.getElementById('averageCycleTime').value = '';
                document.getElementById('initialTimeDisplay').value = '';
                document.getElementById('finalTimeDisplay').value = '';
                
                return true;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to reset ESP32 directly:', error);
            return false;
        }
    }
    
    // Handle production validation request from ESP32
    handleValidationRequest(data) {
        console.log('🔍 Received production validation request:', data);
        
        // Check if 品番 (part number) field is filled
        const hinbanField = document.getElementById('hinban');
        const hinbanValue = hinbanField ? hinbanField.value.trim() : '';
        
        const isValid = hinbanValue.length > 0;
        
        if (isValid) {
            console.log('✅ Validation passed - 品番 is filled:', hinbanValue);
        } else {
            console.log('❌ Validation failed - 品番 field is empty');
            // Show warning modal in webapp instead of ESP32 error
            this.showValidationModal('品番警告', '品番を入力してください。<br>生産カウントは継続しますが、品番を設定することをお勧めします。');
        }
        
        // ALWAYS allow production to proceed - just show warning in webapp
        // Send validation response back to ESP32 (always valid to allow count increment)
        if (this.isConnected && this.socket) {
            this.socket.emit('esp32_command', {
                type: 'validation_response',
                valid: true, // Always allow production to proceed
                message: isValid ? '品番が設定されています' : '品番未設定ですが生産を続行します',
                hinban: hinbanValue,
                device_id: systemStatus.device_id || 'webapp',
                timestamp: Date.now()
            });
            
            console.log('📤 Sent validation response (always allowing production):', { 
                valid: true, 
                message: isValid ? '品番が設定されています' : '品番未設定ですが生産を続行します'
            });
        } else {
            console.error('❌ Cannot send validation response - not connected to server');
        }
    }
    
    // Show validation warning modal
    showValidationModal(title, message) {
        const modal = document.getElementById('validationModal');
        const titleElement = document.getElementById('validationModalTitle');
        const messageElement = document.getElementById('validationModalMessage');
        const button = document.getElementById('validationModalBtn');
        
        if (modal && titleElement && messageElement && button) {
            titleElement.textContent = title;
            messageElement.innerHTML = message;
            modal.classList.add('show');
            
            // Auto-close after 3 seconds, or manual close
            const closeModal = () => {
                modal.classList.remove('show');
            };
            
            button.onclick = closeModal;
            
            // Auto-close timer
            setTimeout(closeModal, 3000);
            
            console.log('🚨 Showed validation modal:', title, message);
        }
    }
}

// Global production manager instance
let productionManager = null;

// Authentication Management
class AuthManager {
    constructor() {
        this.users = [];
        this.currentUser = null;
        this.isCheckingStatus = false; // Add flag to prevent concurrent status checks
        this.lastUpdateCheck = 0; // Add timestamp for caching update checks
    }
    
    async loadAuthorizedUsers() {
        try {
            console.log('🔄 Loading authorized users...');
            console.log('Trying KSG server endpoint:', `${window.KSG_SERVER_URL}/api/users/KSG`);
            
            const response = await fetch(`${window.KSG_SERVER_URL}/api/users/KSG`, {
                headers: {
                    'X-Device-ID': systemStatus.device_id || '6C10F6'
                }
            });
            console.log('KSG server response status:', response.status);
            const data = await response.json();
            console.log('KSG server response data:', data);
            
            if (data.success) {
                // Filter users to only include admin/masterUser roles
                this.users = data.users.filter(user => 
                    user.role === 'admin' || user.role === 'masterUser'
                );
                this.populateUserDropdown();
                console.log(`✅ Loaded ${this.users.length} authorized users from KSG server`);
                return true;
            }
            
            throw new Error('Failed to load users from KSG server');
            
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
                
                // Device selection no longer needed - running directly on ESP32/RPi
                
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
        
        // Instead of showing login modal, redirect back to tablet login page
        // Updated to use Render.com deployment URL
        const tabletLoginUrl = 'https://ksg-lu47.onrender.com'; // Production Render.com server
        console.log('🔄 Redirecting to tablet login page...');
        window.location.href = tabletLoginUrl;
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
            
            // Update user display
            this.updateUserDisplay();
            
            // Ensure users are loaded (important for session restore)
            if (this.users.length === 0) {
                console.log('👥 Users not loaded yet, loading now...');
                await this.loadAuthorizedUsers();
            }
            
            // Load workers
            console.log('👷 Loading workers...');
            await this.loadWorkers();
            
            // Load products
            console.log('📦 Loading products...');
            await this.loadProducts();
            
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
            
            // Start webapp update monitoring (ESP32 only)
            console.log('🔄 Starting update monitoring...');
            this.startUpdateMonitoring();
            
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
    
    updateUserDisplay() {
        const currentUserDisplay = document.getElementById('currentUserDisplay');
        if (currentUserDisplay && this.currentUser) {
            const displayName = this.currentUser.firstName && this.currentUser.lastName 
                ? `${this.currentUser.firstName} ${this.currentUser.lastName}`
                : this.currentUser.username;
            currentUserDisplay.textContent = `ユーザー: ${displayName}`;
            console.log('👤 User display updated:', displayName);
        }
    }
    
    async loadWorkers() {
        try {
            const userCompany = this.currentUser?.company || 'KSG';
            
            // Try main server with dynamic company database first
            try {
                await this.loadWorkersFromServer(userCompany);
                return; // Success - exit early
            } catch (serverError) {
                console.log('🌐 Server unavailable, trying ESP32 local backup...', serverError.message);
            }
            
            // Fallback to ESP32 local backup (offline support)
            try {
                const localResponse = await fetch('/api/data/users');
                if (localResponse.ok) {
                    const localData = await localResponse.json();
                    if (localData.success && localData.users && localData.users.length > 0) {
                        cachedWorkers = localData.users;
                        this.populateWorkerDropdowns();
                        console.log(`💾 Loaded ${localData.users.length} workers from ESP32 local backup`);
                        return;
                    } else {
                        console.log('❌ ESP32 local data exists but is empty or invalid');
                    }
                } else {
                    console.log(`❌ ESP32 local backup returned ${localResponse.status}`);
                }
            } catch (localError) {
                console.log('❌ ESP32 local backup not available:', localError.message);
            }
            
            // Final fallback to hardcoded workers
            await this.loadFallbackWorkers();
            
        } catch (error) {
            console.error('❌ Error loading workers:', error);
            await this.loadFallbackWorkers();
        }
    }
    
    async loadWorkersFromServer(company) {
        try {
            console.log(`🔄 Loading workers from ${company} database...`);
            const response = await fetch(`${window.KSG_SERVER_URL}/api/users/${company}`, {
                headers: {
                    'X-Device-ID': '6C10F6' // Use current ESP32 device ID
                }
            });
            
            const data = await response.json();
            
            if (data.success && data.users && data.users.length > 0) {
                cachedWorkers = data.users.map(user => ({
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    fullName: `${user.lastName} ${user.firstName}`,
                    email: user.email,
                    role: user.role
                }));
                
                this.populateWorkerDropdowns();
                console.log(`✅ Loaded ${data.users.length} workers from ${company} database`);
                
                // Save to local backup for offline use
                this.saveWorkersToLocal(cachedWorkers);
                return;
            } else {
                throw new Error(`No users found in ${company} database`);
            }
        } catch (serverError) {
            console.error(`❌ Failed to load workers from ${company}:`, serverError);
            throw serverError;
        }
    }
    
    async updateWorkersFromServer(company) {
        try {
            await this.loadWorkersFromServer(company);
        } catch (error) {
            console.log('⚠️  Background update failed, using local data');
        }
    }
    
    async saveWorkersToLocal(workers) {
        try {
            const response = await fetch('/api/data/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ users: workers })
            });
            
            if (response.ok) {
                console.log('💾 Workers saved to local backup');
            }
        } catch (error) {
            console.log('⚠️  Failed to save workers to local backup:', error);
        }
    }
    
    async loadFallbackWorkers() {
        console.log('💾 Using fallback workers');
        cachedWorkers = [
            {
                username: 'fallback1',
                firstName: '山田',
                lastName: '太郎',
                fullName: '山田 太郎'
            },
            {
                username: 'fallback2',
                firstName: '田中',
                lastName: '花子',
                fullName: '田中 花子'
            }
        ];
        this.populateWorkerDropdowns();
    }
    
    async loadProducts() {
        try {
            const userCompany = this.currentUser?.company || 'KSG';
            
            // Try main server with dynamic company database first
            try {
                await this.loadProductsFromServer(userCompany);
                return; // Success - exit early
            } catch (serverError) {
                console.log('🌐 Server unavailable, trying ESP32 local backup...', serverError.message);
            }
            
            // Fallback to ESP32 local backup (offline support)
            try {
                const localResponse = await fetch('/api/data/products');
                if (localResponse.ok) {
                    const localData = await localResponse.json();
                    if (localData.success && localData.products && localData.products.length > 0) {
                        this.cachedProducts = localData.products;
                        console.log(`💾 Loaded ${localData.products.length} products from ESP32 local backup`);
                        return;
                    } else {
                        console.log('❌ ESP32 local product data exists but is empty or invalid');
                    }
                } else {
                    console.log(`❌ ESP32 local product backup returned ${localResponse.status}`);
                }
            } catch (localError) {
                console.log('❌ ESP32 local product backup not available:', localError.message);
            }
            
            // Final fallback to empty products array
            await this.loadFallbackProducts();
            
        } catch (error) {
            console.error('❌ Error loading products:', error);
            await this.loadFallbackProducts();
        }
    }
    
    async loadProductsFromServer(company) {
        try {
            console.log(`🔄 Loading products from ${company} database...`);
            const response = await fetch(`${window.KSG_SERVER_URL}/api/products/${company}`, {
                headers: {
                    'X-Device-ID': '6C10F6' // Use current ESP32 device ID
                }
            });
            
            const data = await response.json();
            
            if (data.success && data.products && data.products.length > 0) {
                this.cachedProducts = data.products.map(product => ({
                    品番: product.品番,        // Keep Japanese property names
                    製品名: product.製品名,      // Keep Japanese property names  
                    'LH/RH': product['LH/RH'],  // Keep Japanese property names
                    // Also include English aliases for compatibility
                    hinban: product.品番,
                    productName: product.製品名,
                    lhRh: product['LH/RH']
                }));
                
                console.log(`✅ Loaded ${data.products.length} products from ${company} database`);
                
                // Save to local backup for offline use
                this.saveProductsToLocal(this.cachedProducts);
                return;
            } else {
                throw new Error(`No products found in ${company} database`);
            }
        } catch (serverError) {
            console.error(`❌ Failed to load products from ${company}:`, serverError);
            throw serverError;
        }
    }
    
    async updateProductsFromServer(company) {
        try {
            await this.loadProductsFromServer(company);
        } catch (error) {
            console.log('⚠️  Background product update failed, using local data');
        }
    }
    
    async saveProductsToLocal(products) {
        try {
            const response = await fetch('/api/data/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ products: products })
            });
            
            if (response.ok) {
                console.log('💾 Products saved to local backup');
            }
        } catch (error) {
            console.log('⚠️  Failed to save products to local backup:', error);
        }
    }
    
    async loadFallbackProducts() {
        console.log('💾 Using fallback products');
        this.cachedProducts = [
            {
                品番: 'FALLBACK001',
                製品名: 'フォールバック製品A',
                'LH/RH': 'LH',
                // Also include English aliases for compatibility
                hinban: 'FALLBACK001',
                productName: 'フォールバック製品A',
                lhRh: 'LH'
            },
            {
                品番: 'FALLBACK002', 
                製品名: 'フォールバック製品B',
                'LH/RH': 'RH',
                // Also include English aliases for compatibility
                hinban: 'FALLBACK002',
                productName: 'フォールバック製品B',
                lhRh: 'RH'
            }
        ];
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
            // Detect what type of device we're running on
            const deviceResult = await this.detectDeviceEnvironmentAsync();
            
            if (deviceResult.type === 'esp32') {
                // We're running directly on ESP32 - get actual status from ESP32
                const esp32Status = deviceResult.deviceInfo;
                
                // Check if ESP32 has server connectivity (via Socket.IO heartbeat or recent activity)
                let isESP32Online = false;
                try {
                    // First check if ksgServer is reachable
                    const serverTestResponse = await fetch(`${window.KSG_SERVER_URL}/ping`);
                    if (serverTestResponse.ok) {
                        // Server is reachable, now check ESP32's last_seen in database
                        try {
                            const deviceStatusResponse = await fetch(`${window.KSG_SERVER_URL}/api/device/check/${esp32Status.device_id}`);
                            if (deviceStatusResponse.ok) {
                                const deviceStatusData = await deviceStatusResponse.json();
                                if (deviceStatusData.success && deviceStatusData.registered && deviceStatusData.device) {
                                    const lastSeen = new Date(deviceStatusData.device.last_seen);
                                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                                    isESP32Online = lastSeen > fiveMinutesAgo;
                                    console.log(`ESP32 last seen: ${lastSeen.toISOString()}, 5min ago: ${fiveMinutesAgo.toISOString()}, online: ${isESP32Online}`);
                                } else {
                                    // Fallback to basic server connectivity if device status unknown
                                    isESP32Online = true;
                                }
                            } else {
                                // Fallback to basic server connectivity if API fails
                                isESP32Online = true;
                            }
                        } catch (deviceStatusError) {
                            console.log('Could not check ESP32 device status, using basic connectivity:', deviceStatusError.message);
                            isESP32Online = true;
                        }
                    }
                } catch (serverError) {
                    console.log('ESP32 cannot reach ksgServer:', serverError.message);
                    isESP32Online = false;
                }
                
                systemStatus = {
                    online: isESP32Online,
                    device_id: esp32Status.device_id,
                    device_name: esp32Status.device_name,
                    local_ip: esp32Status.ip,
                    device_type: 'esp32',
                    esp32_direct: true
                };
                
                if (isESP32Online) {
                    this.updateStatusUI(true, `オンライン (ESP32: ${esp32Status.device_id})`);
                    console.log(`✅ ESP32 status: ONLINE, device_id=${esp32Status.device_id}`);
                    
                    // Process any offline submissions when back online
                    this.processOfflineSubmissions();
                } else {
                    this.updateStatusUI(false, `オフライン (ESP32: ${esp32Status.device_id})`);
                    console.log(`❌ ESP32 status: OFFLINE, device_id=${esp32Status.device_id}`);
                }
                
                return;
            }
            
            // Not on ESP32 - check online connectivity to ksgServer (tablet mode)
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
                
                // ksgServer is online - general tablet mode
                systemStatus = {
                    online: true,
                    device_id: null,
                    current_hinban: null,
                    local_ip: null
                };
                
                this.updateStatusUI(true);
                
                // Process any offline submissions when back online
                this.processOfflineSubmissions();
                
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
    

    
    // Device Environment Detection (Async with endpoint testing) - ESP32 or Tablet
    async detectDeviceEnvironmentAsync() {
        // First do quick hostname check
        const hostname = window.location.hostname;
        
        // For localhost, we're definitely not on a device
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            console.log(`Device detection: hostname=${hostname} -> not on device (localhost)`);
            return { type: 'tablet', deviceInfo: null };
        }
        
        // Test for ESP32 endpoints first (port 8080)
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), 3000)
            );
            
            const fetchPromise = fetch(`${window.location.origin}/api/status`);
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (response.ok) {
                const data = await response.json();
                // Check if response looks like ESP32 data (has ffat, counter, etc.)
                if (data.device_id && data.device_name && ('ffat' in data || 'counter' in data || 'uptime_ms' in data)) {
                    console.log(`✅ ESP32 detection: hostname=${hostname}, device_id=${data.device_id}, device_name=${data.device_name}`);
                    return { type: 'esp32', deviceInfo: data };
                }
            }
        } catch (esp32Error) {
            console.log('ESP32 endpoint test failed:', esp32Error.message);
        }
        
        // No device endpoints worked - assume tablet mode
        console.log(`❌ No device endpoints detected, hostname=${hostname} -> tablet mode`);
        return { type: 'tablet', deviceInfo: null };
    }



    // Device management methods (simplified for ESP32 direct connection)
    getSelectedDevice() {
        // Not needed for ESP32 direct connection, but keeping for compatibility
        return null;
    }
    
    setSelectedDevice(deviceInfo) {
        // Not needed for ESP32 direct connection
        console.log('Device selection not needed - running directly on device');
    }
    
    clearSelectedDevice() {
        // Not needed for ESP32 direct connection
        console.log('Device clearing not needed - running directly on device');
    }
    
    updateStatusUI(online, customMessage = null) {
        const statusDiv = document.getElementById('systemStatus');
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (online) {
            statusDiv.className = 'status-online p-3 rounded-lg border flex items-center space-x-2';
            indicator.className = 'w-3 h-3 rounded-full bg-green-500';
            
            if (customMessage) {
                statusText.textContent = customMessage;
            } else {
                // Show device info based on current environment
                if (systemStatus.esp32_direct) {
                    statusText.textContent = `オンライン (ESP32: ${systemStatus.device_id})`;
                    statusText.title = `ESP32 Device: ${systemStatus.device_id}\nIP: ${systemStatus.local_ip}`;
                } else {
                    statusText.textContent = 'オンライン';
                    statusText.title = 'サーバーに接続済み';
                }
            }
        } else {
            statusDiv.className = 'status-offline p-3 rounded-lg border flex items-center space-x-2';
            indicator.className = 'w-3 h-3 rounded-full bg-red-500';
            
            if (customMessage) {
                statusText.textContent = customMessage;
            } else {
                // Show appropriate offline message based on environment
                if (systemStatus.esp32_direct) {
                    statusText.textContent = `オフライン (ESP32: ${systemStatus.device_id})`;
                    statusText.title = 'ESP32デバイスはksgServerに接続できません';
                } else {
                    statusText.textContent = 'オフライン';
                    statusText.title = 'ksgServerに接続できません';
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
    
    startUpdateMonitoring() {
        // Only check for updates on ESP32 devices
        this.detectDeviceEnvironmentAsync().then(deviceResult => {
            if (deviceResult.type === 'esp32') {
                console.log('🔄 Starting ESP32 webapp update monitoring...');
                
                // Check for updates every 10 minutes
                setInterval(async () => {
                    await this.checkForWebappUpdates();
                }, 10 * 60 * 1000);
                
                // Initial check after 30 seconds
                setTimeout(async () => {
                    await this.checkForWebappUpdates();
                }, 30000);
            } else {
                console.log('ℹ️  Update monitoring disabled (not on ESP32)');
            }
        });
    }
    
    async checkForWebappUpdates() {
        try {
            // Only run if we're on ESP32
            const deviceResult = await this.detectDeviceEnvironmentAsync();
            if (deviceResult.type !== 'esp32') {
                return;
            }
            
            // Cache check results for 5 minutes to prevent excessive API calls
            const now = Date.now();
            if (this.lastUpdateCheck && (now - this.lastUpdateCheck) < 5 * 60 * 1000) {
                console.log('⏰ Update check skipped (cached)');
                return;
            }
            
            console.log('🔍 Checking for webapp updates...');
            
            const response = await fetch('/api/webapp/check-updates');
            if (response.ok) {
                const data = await response.json();
                this.lastUpdateCheck = now;
                
                if (data.updates_available) {
                    console.log('🆕 Webapp updates available!');
                    this.showUpdateNotification();
                } else {
                    console.log('✅ Webapp is up to date');
                    // Hide notification if it exists but no updates are available
                    const existingNotification = document.getElementById('updateNotification');
                    if (existingNotification) {
                        existingNotification.remove();
                        console.log('🗑️ Removed outdated update notification');
                    }
                }
            }
        } catch (error) {
            console.log('⚠️  Update check failed:', error.message);
        }
    }
    
    showUpdateNotification() {
        // Check if notification already exists
        if (document.getElementById('updateNotification')) {
            return;
        }
        
        // Create update notification banner
        const notification = document.createElement('div');
        notification.id = 'updateNotification';
        notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-4';
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <span>新しいバージョンが利用可能です</span>
            </div>
            <div class="flex space-x-2">
                <button onclick="authManager.applyUpdates()" class="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100">
                    今すぐ更新
                </button>
                <button onclick="authManager.dismissUpdate()" class="border border-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                    後で
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        console.log('📢 Update notification displayed');
    }
    
    async applyUpdates() {
        try {
            console.log('🔄 Applying webapp updates...');
            
            // Disable the update button and show loading state
            const updateBtn = document.querySelector('#updateNotification button');
            if (updateBtn) {
                updateBtn.disabled = true;
                updateBtn.innerHTML = `
                    <svg class="animate-spin h-4 w-4 mr-2 inline-block" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    更新中...
                `;
                updateBtn.className = 'bg-gray-300 text-gray-600 px-3 py-1 rounded text-sm font-medium cursor-not-allowed';
            }
            
            // Save current form data
            this.saveFormData();
            
            const response = await fetch('/api/webapp/update', { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                
                if (data.success) {
                    console.log('✅ Updates applied successfully');
                    
                    // Show success message and reload
                    this.showStatusMessage('アップデート完了 - ページを再読み込みします...', 'success');
                    
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } else {
                    console.error('❌ Update failed:', data.message);
                    this.showStatusMessage('アップデートに失敗しました', 'error');
                }
            }
        } catch (error) {
            console.error('❌ Update application failed:', error);
            this.showStatusMessage('アップデートエラーが発生しました', 'error');
        }
        
        // Remove notification
        this.dismissUpdate();
    }
    
    dismissUpdate() {
        const notification = document.getElementById('updateNotification');
        if (notification) {
            notification.remove();
        }
    }
    
    setupEventListeners() {
        // Global QR code keyboard listener (for QR scanner input)
        this.setupQRKeyboardListener();
        
        // QR code / hinban input
        const hinbanInput = document.getElementById('hinban');
        let hinbanTimeout;
        
        hinbanInput.addEventListener('input', (e) => {
            // Save form data immediately when hinban changes
            this.saveFormData();
            
            clearTimeout(hinbanTimeout);
            hinbanTimeout = setTimeout(async () => {
                const hinban = e.target.value.trim();
                if (hinban) {
                    await this.processHinban(hinban);
                    // Save again after product info is filled
                    this.saveFormData();
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
        
        // Validation modal close button
        const validationModalBtn = document.getElementById('validationModalBtn');
        if (validationModalBtn) {
            validationModalBtn.addEventListener('click', () => {
                const modal = document.getElementById('validationModal');
                if (modal) {
                    modal.classList.remove('show');
                }
            });
        }
        
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
        ['hinban', 'productName', 'lhRh'].forEach(id => {
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
        
        document.addEventListener('keydown', (event) => {
            // Skip if user is typing in an input field
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
                console.log('⏭️ Skipping keydown - typing in input field');
                return;
            }
            
            // Skip if modal is open (login, device selection, etc.)
            if (document.querySelector('.show, [style*="display: block"]')) {
                console.log('⏭️ Skipping keydown - modal is open');
                return;
            }
            
            if (event.key === 'Enter') {
                event.preventDefault();
                if (qrBuffer.trim()) {
                    console.log(`📱 Processing QR code: "${qrBuffer.trim()}"`);
                    this.processQRCode(qrBuffer.trim());
                }
                qrBuffer = '';
            } else if (event.key.length === 1 || event.key === ' ') {
                qrBuffer += event.key;
                console.log(`📝 Added to buffer: "${event.key}", full buffer: "${qrBuffer}"`);
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
        
        // Handle potential keyboard layout issues - replace common colon alternatives
        let normalizedValue = cleanValue;
        // Replace common alternatives for colon that might occur with different keyboard layouts
        normalizedValue = normalizedValue.replace(/[''`]/g, ':'); // Replace apostrophes/backticks with colon
        
        console.log(`📝 Normalized QR value: "${normalizedValue}"`);
        
        // Split on colon to get parts
        const parts = normalizedValue.split(':');
        if (parts.length < 2) {
            console.warn('❌ Invalid QR format (no colon found):', cleanValue);
            this.showStatusMessage(`無効なQRコード形式: ${cleanValue}`, 'error');
            return;
        }
        
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim(); // Rejoin in case value contains colons
        
        console.log(`🔑 QR Key: "${key}", Value: "${value}"`);
        
        switch (key) {
            case 'hinban':
                console.log(`📋 Setting hinban: "${value}"`);
                const hinbanInput = document.getElementById('hinban');
                if (hinbanInput) {
                    hinbanInput.value = value;
                    // Trigger the hinban processing
                    this.processHinban(value);
                    this.showStatusMessage(`品番を設定しました: ${value}`, 'success');
                }
                break;
                
            case 'worker':
            case 'name': // Support both formats for backward compatibility
                console.log(`👤 Setting worker: "${value}"`);
                
                const operator1Select = document.getElementById('operator1');
                const operator2Select = document.getElementById('operator2');
                
                if (operator1Select && operator2Select) {
                    // Find the worker by matching the scanned name with cached workers
                    let matchedWorker = null;
                    
                    // Try exact match first
                    matchedWorker = cachedWorkers.find(worker => {
                        const fullName = worker.fullName || `${worker.firstName} ${worker.lastName}`;
                        return fullName.toLowerCase() === value.toLowerCase();
                    });
                    
                    // If no exact match, try partial match
                    if (!matchedWorker) {
                        matchedWorker = cachedWorkers.find(worker => {
                            const fullName = worker.fullName || `${worker.firstName} ${worker.lastName}`;
                            return fullName.toLowerCase().includes(value.toLowerCase()) ||
                                   value.toLowerCase().includes(fullName.toLowerCase());
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
                        console.log(`⚠️ Worker "${value}" not found in database, setting as custom value`);
                        
                        // For custom names, we need to add them as options or handle differently
                        // For now, show a warning
                        this.showStatusMessage(`作業者 "${value}" がデータベースにありません`, 'warning');
                    }
                }
                break;
                
            default:
                // If it doesn't match any specific format, treat as regular hinban
                console.log(`📋 Treating as regular hinban: "${cleanValue}"`);
                const hinbanInputElement = document.getElementById('hinban');
                if (hinbanInputElement) {
                    hinbanInputElement.value = cleanValue;
                    // Trigger the hinban processing
                    this.processHinban(cleanValue);
                    this.showStatusMessage(`品番を設定しました: ${cleanValue}`, 'success');
                }
                break;
        }
    }
    
    async processHinban(hinban) {
        try {
            this.showLoadingIndicator(true);
            
            // Try cached product data from ESP32 local storage
            if (this.cachedProducts && this.cachedProducts.length > 0) {
                console.log(`📦 Checking cached product data for hinban ${hinban}`);
                const cachedProduct = this.cachedProducts.find(p => p.品番 === hinban);
                
                if (cachedProduct) {
                    console.log(`✅ Found product in cache:`, cachedProduct);
                    // Auto-fill product information from cache
                    document.getElementById('productName').value = cachedProduct.製品名 || '';
                    document.getElementById('lhRh').value = cachedProduct['LH/RH'] || '';
                    
                    this.showStatusMessage(`製品情報を取得しました: ${cachedProduct.製品名} (キャッシュ)`, 'success');
                    return; // Success from cache - exit early
                } else {
                    console.log(`❌ Product ${hinban} not found in cached data`);
                }
            }
            
            // Fallback to main server (either not on RPi, or RPi is online and local failed, or cache miss)
            console.log(`🌐 Fallback: Getting product info from main server for hinban ${hinban}`);
            
            const productResponse = await fetch(`${window.KSG_SERVER_URL}/api/products/KSG`, {
                headers: {
                    'X-Device-ID': systemStatus.device_id || '6C10F6'  // Required for authentication
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
            
            // Final fallback to cached data if server fails
            if (this.cachedProducts && this.cachedProducts.length > 0) {
                console.log(`🔄 Server failed, trying cached data as final fallback for hinban ${hinban}`);
                const cachedProduct = this.cachedProducts.find(p => p.品番 === hinban);
                
                if (cachedProduct) {
                    console.log(`✅ Found product in cache (fallback):`, cachedProduct);
                    // Auto-fill product information from cache
                    document.getElementById('productName').value = cachedProduct.製品名 || '';
                    document.getElementById('lhRh').value = cachedProduct['LH/RH'] || '';
                    
                    this.showStatusMessage(`製品情報を取得しました: ${cachedProduct.製品名} (オフライン)`, 'warning');
                    return;
                }
            }
            
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
            // Collect all form data
            const formData = this.collectFormData();
            
            // Validate required fields FIRST (before showing loading indicators)
            if (!formData.品番) {
                productionManager.showValidationModal('品番エラー', '品番は必須です。<br>データを送信する前に品番を入力してください。');
                return;
            }
            
            // Operator is required for all submissions
            if (!formData["技能員①"]) {
                productionManager.showValidationModal('技能員エラー', '技能員①は必須です。<br>データを送信する前に技能員を選択してください。');
                return;
            }
            
            // Validation passed - NOW show loading animation
            this.showSubmissionStatus('データを送信中...', 'loading');
            this.showLoadingIndicator(true);
            
            // Direct server submission
            if (systemStatus.online) {
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
                            'X-Device-ID': systemStatus.device_id || '6C10F6'  // Use actual device ID
                        },
                        body: JSON.stringify(formData)
                    });
                    
                    if (directSubmitResponse.ok) {
                        const directSubmitData = await directSubmitResponse.json();
                        
                        if (directSubmitData.success) {
                            this.showSubmissionStatus('送信完了！', 'success');
                            
                            // Show detailed submission status
                            let statusMessage = 'データを正常に送信しました（直接）';
                            if (directSubmitData.mongodb && directSubmitData.googleSheets) {
                                statusMessage += ` - MongoDB: ${directSubmitData.mongodb.success ? '✅' : '❌'}, Google Sheets: ${directSubmitData.googleSheets.success ? '✅' : '❌'}`;
                            }
                            this.showStatusMessage(statusMessage, 'success');
                            

                            
                            // Reset ESP32 production data after successful submission
                            await this.resetESP32ProductionData();
                            
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
                    
                    // Reset ESP32 production data after offline submission
                    await this.resetESP32ProductionData();
                    
                    // Reset form after offline submission
                    setTimeout(() => {
                        this.resetForm();
                    }, 2000);
                    return;
                }
            } else {
                // Completely offline
                this.showSubmissionStatus('オフライン - ローカル保存中...', 'offline');
                this.saveToLocalStorage(formData);
                this.showSubmissionStatus('オフライン保存完了', 'warning');
                this.showStatusMessage('オフライン - ブラウザに一時保存しました', 'warning');
                
                // Reset form after offline submission
                setTimeout(() => {
                    this.resetForm();
                }, 2000);
            }
            
        } catch (error) {
            console.error('Error submitting data:', error);
            this.showSubmissionStatus('送信エラー', 'error');
            
            // Show validation errors in modal, other errors in status message
            if (error.message.includes('必須') || error.message.includes('入力') || error.message.includes('選択')) {
                productionManager.showValidationModal('送信エラー', `${error.message}<br>必要な項目を入力してから再送信してください。`);
            } else {
                this.showStatusMessage(`送信エラー: ${error.message}`, 'error');
            }
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
                    // Try to submit to KSG server
                    let success = false;
                    
                    const response = await fetch(`${window.KSG_SERVER_URL}/api/submit-production-data`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Device-ID': systemStatus.device_id || '6C10F6'
                        },
                        body: JSON.stringify(submission.data)
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        success = result.success;
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
                // Product information
                hinban: document.getElementById('hinban')?.value || '',
                productName: document.getElementById('productName')?.value || '',
                lhRh: document.getElementById('lhRh')?.value || '',
                
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
                breakTime: document.getElementById('breakTime')?.value || '0'
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
            
            // Product information
            if (formData.hinban) {
                const hinban = document.getElementById('hinban');
                if (hinban) hinban.value = formData.hinban;
            }
            if (formData.productName) {
                const productName = document.getElementById('productName');
                if (productName) productName.value = formData.productName;
            }
            if (formData.lhRh) {
                const lhRh = document.getElementById('lhRh');
                if (lhRh) lhRh.value = formData.lhRh;
            }
            
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
            
            // Reset ESP32 production data first
            if (productionManager) {
                console.log('🔄 Resetting ESP32 production data...');
                const espResetSuccess = await productionManager.resetProduction();
                
                if (espResetSuccess) {
                    console.log('✅ ESP32 production data reset successfully');
                    this.showStatusMessage('ESP32生産データをリセットしました', 'success');
                } else {
                    console.log('⚠️ Failed to reset ESP32 production data');
                    this.showStatusMessage('ESP32リセットに失敗しました', 'warning');
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
        
        // Reset all defect counts using correct IDs
        const defectFields = [
            'materialDefect', 'doubleDefect', 'peelingDefect', 'foreignMatterDefect',
            'wrinkleDefect', 'deformationDefect', 'greaseDefect', 'screwLooseDefect',
            'otherDefect', 'shoulderDefect', 'silverDefect', 'shoulderScratchDefect',
            'shoulderOtherDefect'
        ];
        
        defectFields.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '0';
        });
        
        // Reset text areas
        const remarksField = document.getElementById('remarks');
        if (remarksField) remarksField.value = '';
        
        const otherDescField = document.getElementById('otherDescription');
        if (otherDescField) otherDescField.value = '';
        
        // Reset break times
        ['break1', 'break2', 'break3', 'break4'].forEach(breakId => {
            const fromElement = document.getElementById(`${breakId}From`);
            const toElement = document.getElementById(`${breakId}To`);
            if (fromElement) fromElement.value = '';
            if (toElement) toElement.value = '';
        });
        
        document.getElementById('breakTime').value = '0';
        document.getElementById('excludedManHours').value = '0';
        
        // Reinitialize date
        this.initializeDate();
        
        // Clear saved form data
        this.clearFormData();
        console.log('🗑️ Form reset and saved data cleared');
    }
    
    async resetESP32ProductionData() {
        if (productionManager) {
            try {
                console.log('🔄 Resetting ESP32 production data after successful submission...');
                const resetSuccess = await productionManager.resetProduction();
                
                if (resetSuccess) {
                    console.log('✅ ESP32 production data reset successfully after submission');
                } else {
                    console.log('⚠️ Failed to reset ESP32 production data after submission');
                }
            } catch (error) {
                console.error('❌ Error resetting ESP32 production data:', error);
            }
        }
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

// Helper function to get user info from URL parameters
function getUserFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    const usernameParam = urlParams.get('username');
    const companyParam = urlParams.get('company');
    
    if (userParam) {
        try {
            // If full user object is passed as JSON
            return JSON.parse(decodeURIComponent(userParam));
        } catch (e) {
            console.warn('Failed to parse user parameter:', e);
        }
    }
    
    if (usernameParam) {
        // If just username is passed, create basic user object
        return {
            username: usernameParam,
            firstName: usernameParam,
            lastName: '',
            role: 'user',
            company: companyParam || 'KSG'
        };
    }
    
    return null;
}

// Document ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 KSG Production System - Enhanced Version');
    console.log('Environment:', window.location.href);
    console.log('KSG_SERVER_URL:', window.KSG_SERVER_URL);
    
    // Initialize production manager for real-time updates
    console.log('📊 Initializing production manager...');
    productionManager = new ProductionManager();
    await productionManager.initialize();
    
    // First, check if user info is passed via URL parameters (from tablet redirect)
    const urlUser = getUserFromURL();
    if (urlUser) {
        console.log('👥 User info received from tablet:', urlUser);
        authManager.currentUser = urlUser;
        currentUser = urlUser;
        
        // Store in session for future page reloads
        sessionStorage.setItem('ksg_user', JSON.stringify(urlUser));
        
        // Hide login modal and initialize app directly
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.classList.remove('show');
            loginModal.style.display = 'none';
        }
        
        console.log('🔧 Initializing app with tablet user info...');
        await authManager.initializeApp();
        return;
    }
    
    // Check if user is already logged in from previous session
    const savedUser = sessionStorage.getItem('ksg_user');
    if (savedUser) {
        try {
            console.log('📋 Restoring session...');
            const user = JSON.parse(savedUser);
            authManager.currentUser = user;
            currentUser = user;
            
            // Hide login modal and initialize app
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.classList.remove('show');
                loginModal.style.display = 'none';
            }
            console.log('🔧 Initializing app after session restore...');
            await authManager.initializeApp();
        } catch (error) {
            console.error('❌ Error restoring session:', error);
            authManager.logout();
        }
    } else {
        // Show message that user should access from tablet
        console.log('⚠️  No user info available - should access from tablet login');
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            // Update login modal to show message instead of login form
            const modalContent = loginModal.querySelector('.bg-white');
            if (modalContent) {
                modalContent.innerHTML = `
                    <div class="text-center p-8">
                        <h2 class="text-2xl font-bold text-blue-800 mb-6">KSG Production System</h2>
                        <div class="text-red-600 mb-4">
                            <svg class="w-16 h-16 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                            <p class="text-lg font-semibold mb-2">アクセスエラー</p>
                            <p class="text-sm">このページにはタブレットのログインページからアクセスしてください。</p>
                        </div>
                        <button onclick="window.close()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            閉じる
                        </button>
                    </div>
                `;
            }
            loginModal.classList.add('show');
        }
    }
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
