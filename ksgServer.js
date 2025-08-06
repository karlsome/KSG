const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(express.json());

// Enable CORS for all origins (development mode)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Device-ID');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// �️ MONGODB CONFIGURATION
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "Sasaki_Coating_MasterDB";
const COLLECTION_NAME = "masterUsers";
let mongoClient = null;

// 📱 DYNAMIC DEVICE CACHE - Fetched from MongoDB
let AUTHORIZED_DEVICES = {};
let lastDeviceFetch = 0;
const DEVICE_CACHE_DURATION = parseInt(process.env.DEVICE_CACHE_DURATION) || 300000; // 5 minutes

// 🔗 MongoDB Connection
async function connectToMongoDB() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set');
        }
        
        console.log('🔗 Connecting to MongoDB Atlas...');
        mongoClient = new MongoClient(MONGODB_URI);
        await mongoClient.connect();
        
        // Test the connection
        await mongoClient.db(DB_NAME).admin().ping();
        console.log('✅ Connected to MongoDB Atlas successfully');
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return false;
    }
}

// 📱 Fetch authorized devices from MongoDB
async function fetchAuthorizedDevices() {
    try {
        if (!mongoClient) {
            console.log('⚠️  MongoDB not connected, using cached devices');
            return Object.keys(AUTHORIZED_DEVICES).length > 0;
        }
        
        console.log('🔄 Fetching authorized devices from MongoDB...');
        
        const db = mongoClient.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);
        
        // Query for KSG company users only
        const masterUsers = await collection.find({ 
            company: "KSG",
            role: "masterUser" 
        }).toArray();
        
        const newAuthorizedDevices = {};
        let totalDevices = 0;
        let expiredUsers = 0;
        let activeUsers = 0;
        
        for (const user of masterUsers) {
            const validUntil = new Date(user.validUntil);
            const now = new Date();
            const isExpired = validUntil < now;
            
            if (isExpired) {
                expiredUsers++;
                console.log(`⏰ User ${user.username} expired on ${validUntil.toISOString().split('T')[0]} - devices disabled`);
                continue;
            }
            
            activeUsers++;
            
            // Process user's devices
            if (user.devices && Array.isArray(user.devices)) {
                for (const device of user.devices) {
                    if (device.uniqueId) {
                        newAuthorizedDevices[device.uniqueId] = {
                            name: device.name || 'Unknown Device',
                            brand: device.brand || 'Unknown Brand',
                            owner: user.username,
                            company: user.company,
                            validUntil: user.validUntil,
                            dbName: user.dbName,
                            added: user.createdAt || new Date().toISOString()
                        };
                        totalDevices++;
                    }
                }
            }
        }
        
        // Update the global cache
        AUTHORIZED_DEVICES = newAuthorizedDevices;
        lastDeviceFetch = Date.now();
        
        console.log(`📊 Device fetch complete:`);
        console.log(`   👥 Active users: ${activeUsers}`);
        console.log(`   ⏰ Expired users: ${expiredUsers}`);
        console.log(`   📱 Total authorized devices: ${totalDevices}`);
        console.log(`   🔧 Device IDs: ${Object.keys(AUTHORIZED_DEVICES).join(', ')}`);
        
        return totalDevices > 0;
        
    } catch (error) {
        console.error('❌ Error fetching devices from MongoDB:', error.message);
        return Object.keys(AUTHORIZED_DEVICES).length > 0; // Return true if we have cached devices
    }
}

// 🔄 Ensure devices are loaded (with caching)
async function ensureDevicesLoaded() {
    const now = Date.now();
    const cacheExpired = (now - lastDeviceFetch) > DEVICE_CACHE_DURATION;
    
    if (Object.keys(AUTHORIZED_DEVICES).length === 0 || cacheExpired) {
        await fetchAuthorizedDevices();
    }
    
    return Object.keys(AUTHORIZED_DEVICES).length > 0;
}

// 🎯 DEVICE-SPECIFIC FUNCTION REPOSITORY
const DEVICE_FUNCTIONS = {
    "4Y02SX": {  // KSG Production Device
        version: "1.0.0",
        updated: new Date().toISOString(),
        hash: "",
        device_name: "KSG Production Line 1",
        functions: {
            productionCycleMonitor: {
                enabled: true,
                description: "Monitor complete production cycle for KSG parts",
                logic: `current_time = sensors.get('timestamp', 0)

# Start switch pressed - begin production cycle
if sensors.get('gpio17') == 0 and sensors.get('gpio17_prev', 1) == 1:
    if current_hinban_being_processed is None:
        print("⚠️  START pressed but no hinban set. Ignoring.")
    else:
        config['cycle_start_time'] = current_time
        config['cycle_active'] = True
        config['clamps_closing_start'] = current_time
        config['state'] = 'CLAMPS_CLOSING'
        executeCommand({'type': 'gpio18', 'state': False})  # Status LED ON
        print(f"🚀 Production cycle started for {current_hinban_being_processed}")

# Monitor production cycle states
if config.get('cycle_active', False):
    state = config.get('state', 'WAITING')
    
    if state == 'CLAMPS_CLOSING':
        # Check if all clamps are closed (gpio27, gpio22, gpio23)
        if (sensors.get('gpio27') == 1 and 
            sensors.get('gpio22') == 1 and 
            sensors.get('gpio23') == 1):
            config['state'] = 'MACHINE_READY'
            print("🔧 All clamps closed - waiting for machine ready")
        
        # Timeout check for clamp closing (60 seconds)
        elif current_time - config.get('clamps_closing_start', 0) > 60.0:
            print("⏰ TIMEOUT: Clamps closing took too long!")
            config['cycle_active'] = False
            config['state'] = 'WAITING'
            executeCommand({'type': 'gpio18', 'state': True})  # Status LED OFF
            executeCommand({'type': 'gpio26', 'state': False})  # Error LED ON
    
    elif state == 'MACHINE_READY':
        # Check if all machines are ready (gpio24, gpio25, gpio19)
        if (sensors.get('gpio24') == 1 and 
            sensors.get('gpio25') == 1 and 
            sensors.get('gpio19') == 1):
            config['state'] = 'PRODUCT_RELEASE'
            print("✅ All machines ready - waiting for product release")
    
    elif state == 'PRODUCT_RELEASE':
        # Check for product release signal (gpio16)
        if sensors.get('gpio16') == 1:
            cycle_time = current_time - config.get('cycle_start_time', current_time)
            cycle_start_time = config.get('cycle_start_time', current_time)
            print(f"📦 Product released! Cycle time: {cycle_time:.2f}s")
            
            # Add cycle to main system logs using callback function
            if 'add_cycle_log' in globals():
                add_cycle_log({
                    'initial_time': datetime.datetime.fromtimestamp(cycle_start_time).strftime('%H:%M:%S.%f')[:-3],
                    'final_time': datetime.datetime.fromtimestamp(current_time).strftime('%H:%M:%S.%f')[:-3],
                    'cycle_time': round(cycle_time, 3),
                    'hinban': current_hinban_being_processed
                })
            
            # Also keep local config logs for compatibility
            if 'cycle_logs' not in config:
                config['cycle_logs'] = []
            
            config['cycle_logs'].append({
                'hinban': current_hinban_being_processed,
                'cycle_time': round(cycle_time, 3),
                'timestamp': current_time
            })
            
            # Reset for next cycle
            config['cycle_active'] = False
            config['state'] = 'WAITING'
            executeCommand({'type': 'gpio18', 'state': True})  # Status LED OFF
            executeCommand({'type': 'gpio26', 'state': True})  # Error LED OFF
            
            # Get total from main system if available
            total_cycles = len(get_cycle_logs()) if 'get_cycle_logs' in globals() else len(config.get('cycle_logs', []))
            print(f"📊 Total cycles completed: {total_cycles}")

# Reset button pressed - clear current cycle and data
if sensors.get('gpio20') == 0 and sensors.get('gpio20_prev', 1) == 1:
    print("🔄 RESET button pressed - clearing all data")
    config['cycle_active'] = False
    config['state'] = 'WAITING'
    config['cycle_logs'] = []
    reset_all_data()  # Call the Python reset function
    executeCommand({'type': 'gpio18', 'state': True})  # Status LED OFF
    executeCommand({'type': 'gpio26', 'state': True})  # Error LED OFF`,
                config: {
                    cycle_active: false,
                    state: 'WAITING',
                    current_hinban: null,
                    cycle_start_time: 0,
                    clamps_closing_start: 0,
                    cycle_logs: []
                }
            },
            
            hinbanQRProcessor: {
                enabled: true,
                description: "Process QR code scans to set current hinban",
                logic: `current_time = sensors.get('timestamp', 0)

# QR scanner input simulation (using gpio21)
if sensors.get('gpio21') == 0 and sensors.get('gpio21_prev', 1) == 1:
    # In real implementation, this would read from QR scanner
    # For now, simulate with a test hinban
    test_hinban = f"TEST{int(current_time) % 1000}"
    
    if config.get('current_hinban') != test_hinban:
        config['current_hinban'] = test_hinban
        config['cycle_logs'] = []  # Reset logs for new product
        print(f"📱 New hinban scanned: {test_hinban}")
        
        # Brief confirmation blink
        executeCommand({'type': 'gpio26', 'state': False})  # LED ON
        config['qr_confirm_time'] = current_time
        config['qr_confirming'] = True

# Handle QR confirmation blink
if config.get('qr_confirming', False):
    if current_time - config.get('qr_confirm_time', 0) > 0.5:  # 500ms
        executeCommand({'type': 'gpio26', 'state': True})  # LED OFF
        config['qr_confirming'] = False`,
                config: {
                    current_hinban: null,
                    qr_confirm_time: 0,
                    qr_confirming: false
                }
            }
        }
    }
};

// � Device Authentication Middleware
async function authenticateDevice(req, res, next) {
    const deviceId = req.headers['x-device-id'];
    
    if (!deviceId) {
        return res.status(401).json({ error: 'Missing device ID header' });
    }
    
    // Ensure devices are loaded from MongoDB
    const hasDevices = await ensureDevicesLoaded();
    
    if (!hasDevices) {
        console.log('⚠️  No authorized devices available - Check MongoDB connection');
        return res.status(503).json({ error: 'Device authorization service unavailable' });
    }
    
    if (!AUTHORIZED_DEVICES[deviceId]) {
        console.log(`🚫 Unauthorized device access attempt: ${deviceId}`);
        return res.status(403).json({ error: 'Device not authorized' });
    }
    
    // Check if user is still valid (expiration check)
    const device = AUTHORIZED_DEVICES[deviceId];
    const validUntil = new Date(device.validUntil);
    const now = new Date();
    
    if (validUntil < now) {
        console.log(`⏰ Device ${deviceId} access denied - User ${device.owner} expired on ${validUntil.toISOString().split('T')[0]}`);
        return res.status(403).json({ 
            error: 'Device authorization expired',
            expiredOn: validUntil.toISOString().split('T')[0]
        });
    }
    
    req.deviceInfo = device;
    req.deviceId = deviceId; // Add deviceId for easy access
    console.log(`✅ Device authenticated: ${deviceId} (${device.name}) - Owner: ${device.owner}`);
    next();
}

// 🔄 Generate hash for version checking per device
function updateFunctionHash(deviceId) {
    if (!DEVICE_FUNCTIONS[deviceId]) {
        return "";
    }
    
    DEVICE_FUNCTIONS[deviceId].hash = crypto.createHash('sha256')
        .update(JSON.stringify(DEVICE_FUNCTIONS[deviceId].functions))
        .digest('hex').substring(0, 16);
    
    return DEVICE_FUNCTIONS[deviceId].hash;
}

// Initialize hashes for all devices
Object.keys(DEVICE_FUNCTIONS).forEach(deviceId => {
    updateFunctionHash(deviceId);
    console.log(`🔑 Device ${deviceId} function hash: ${DEVICE_FUNCTIONS[deviceId].hash}`);
});

// 📡 API ENDPOINTS

// 🆕 NEW ENDPOINTS FOR STEP7.PY INTEGRATION

// RPi device registration endpoint (stores in KSG.deviceInfo)
app.post('/api/device/register-rpi', async (req, res) => {
    const { device_id, company, device_name, local_ip, local_port, capabilities, status } = req.body;
    const deviceIdHeader = req.headers['x-device-id'];
    
    // Basic validation
    if (!device_id || !deviceIdHeader || device_id !== deviceIdHeader) {
        return res.status(400).json({ error: 'Invalid device ID' });
    }
    
    if (company !== 'KSG') {
        return res.status(400).json({ error: 'Only KSG company devices supported' });
    }
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // First, check if device is authorized in Sasaki_Coating_MasterDB.masterUsers
        const authDb = mongoClient.db('Sasaki_Coating_MasterDB');
        const masterUsersCollection = authDb.collection('masterUsers');
        
        // Find KSG users who have this device ID
        const authorizedUser = await masterUsersCollection.findOne({
            company: 'KSG',
            role: 'masterUser',
            'devices.uniqueId': device_id
        });
        
        if (!authorizedUser) {
            console.log(`🚫 Unauthorized RPi registration attempt: Device ${device_id} not found in KSG masterUsers`);
            return res.status(403).json({ 
                error: 'Device not authorized for KSG company',
                message: 'This device is not registered to any KSG user'
            });
        }
        
        // Check if user is still valid (not expired)
        const validUntil = new Date(authorizedUser.validUntil);
        const now = new Date();
        
        if (validUntil < now) {
            console.log(`⏰ RPi registration denied: Device ${device_id} owner ${authorizedUser.username} expired on ${validUntil.toISOString().split('T')[0]}`);
            return res.status(403).json({ 
                error: 'Device authorization expired',
                expiredOn: validUntil.toISOString().split('T')[0],
                owner: authorizedUser.username
            });
        }
        
        // Get device details from the authorized user's devices array
        const deviceDetails = authorizedUser.devices.find(device => device.uniqueId === device_id);
        
        console.log(`✅ Device ${device_id} authorized for RPi registration - Owner: ${authorizedUser.username}`);
        
        // Now register in KSG.deviceInfo collection
        const ksgDb = mongoClient.db('KSG');
        const deviceInfoCollection = ksgDb.collection('deviceInfo');
        
        // Prepare device registration data
        const deviceData = {
            device_id: device_id,
            company: company,
            device_name: device_name || deviceDetails?.name || `RaspberryPi_${device_id}`,
            device_brand: deviceDetails?.brand || 'Raspberry Pi',
            owner: authorizedUser.username,
            owner_first_name: authorizedUser.firstName,
            owner_last_name: authorizedUser.lastName,
            local_ip: local_ip,
            local_port: local_port || 5000,
            capabilities: capabilities || [],
            status: status || 'online',
            last_seen: new Date(),
            last_ip_update: new Date(),
            registered_at: new Date(),
            device_type: 'raspberry_pi',
            authorized_until: authorizedUser.validUntil
        };
        
        // Upsert device info (update if exists, insert if new)
        await deviceInfoCollection.replaceOne(
            { device_id: device_id },
            deviceData,
            { upsert: true }
        );
        
        console.log(`📍 RPi ${device_id} registered in KSG.deviceInfo: ${local_ip}:${local_port} (Owner: ${authorizedUser.username})`);
        res.json({ 
            success: true, 
            message: 'RPi device registered successfully',
            device_id: device_id,
            owner: authorizedUser.username,
            registered_at: deviceData.registered_at
        });
        
    } catch (error) {
        console.error('RPi registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Registration failed',
            details: error.message 
        });
    }
});

// Device network registration endpoint (for authorized devices)
app.post('/api/device/register-network', authenticateDevice, async (req, res) => {
    const { device_id, company, device_name, local_ip, local_port, capabilities, status } = req.body;
    const deviceId = req.deviceId;
    
    // Verify device is authorized and matches request
    if (deviceId !== device_id) {
        return res.status(403).json({ error: 'Device ID mismatch' });
    }
    
    if (!AUTHORIZED_DEVICES[device_id]) {
        return res.status(401).json({ error: 'Device not authorized' });
    }
    
    try {
        // Update device with network info
        AUTHORIZED_DEVICES[device_id] = {
            ...AUTHORIZED_DEVICES[device_id],
            device_name: device_name || AUTHORIZED_DEVICES[device_id].name,
            local_ip: local_ip,
            local_port: local_port || 5000,
            capabilities: capabilities || [],
            last_seen: new Date(),
            network_status: status || 'online',
            last_ip_update: new Date()
        };
        
        console.log(`📍 Device ${device_id} registered: ${local_ip}:${local_port}`);
        res.json({ 
            success: true, 
            registered_at: new Date(),
            device_id: device_id
        });
        
    } catch (error) {
        console.error('Device registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Get products for a specific company
app.get('/api/products/:company', authenticateDevice, async (req, res) => {
    const company = req.params.company;
    const deviceId = req.deviceId;
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        const db = mongoClient.db(company); // Database name is company name
        const collection = db.collection('masterDB');
        
        const products = await collection.find({}).toArray();
        
        console.log(`📦 Served ${products.length} products to device ${deviceId}`);
        res.json({
            success: true,
            products: products,
            count: products.length,
            company: company
        });
        
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch products' 
        });
    }
});

// Get users for a specific company
app.get('/api/users/:company', authenticateDevice, async (req, res) => {
    const company = req.params.company;
    const deviceId = req.deviceId;
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        const db = mongoClient.db(company); // Use company name as database name
        const collection = db.collection('users');
        
        // Get all users from the company's database
        const users = await collection.find({}).toArray();
        
        // Filter sensitive information
        const filteredUsers = users.map(user => ({
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            createdAt: user.createdAt
        }));
        
        console.log(`👥 Served ${filteredUsers.length} users from ${company} database to device ${deviceId}`);
        res.json({
            success: true,
            users: filteredUsers,
            count: filteredUsers.length,
            company: company
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch users' 
        });
    }
});

// Submit production data
app.post('/api/submit-production-data', authenticateDevice, async (req, res) => {
    const deviceId = req.deviceId;
    const submissionData = req.body;
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // Verify device is authorized
        if (!AUTHORIZED_DEVICES[deviceId]) {
            return res.status(401).json({ error: 'Device not authorized' });
        }
        
        const device = AUTHORIZED_DEVICES[deviceId];
        const company = device.company || 'KSG';
        
        // Add submission metadata
        const finalData = {
            ...submissionData,
            タイムスタンプ: new Date(),
            device_id: deviceId,
            submitted_from: device.local_ip || 'unknown',
            company: company
        };
        
        // Insert into company's submittedDB collection
        const db = mongoClient.db(company);
        const collection = db.collection('submittedDB');
        
        const result = await collection.insertOne(finalData);
        
        console.log(`📊 Production data submitted by ${deviceId}: ${finalData.品番}`);
        res.json({
            success: true,
            message: 'Data submitted successfully',
            insertedId: result.insertedId,
            submitted_at: finalData.タイムスタンプ
        });
        
    } catch (error) {
        console.error('Error submitting production data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit data' 
        });
    }
});

// Check if RPi device is registered
app.get('/api/device/check/:deviceId', async (req, res) => {
    const deviceId = req.params.deviceId;
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        const db = mongoClient.db('KSG');
        const collection = db.collection('deviceInfo');
        
        const device = await collection.findOne({ device_id: deviceId });
        
        if (device) {
            res.json({
                success: true,
                registered: true,
                device: device,
                message: `Device ${deviceId} is registered`
            });
        } else {
            res.json({
                success: true,
                registered: false,
                message: `Device ${deviceId} is not registered`
            });
        }
        
    } catch (error) {
        console.error('Error checking device:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to check device' 
        });
    }
});

// Get RPi devices registered in KSG.deviceInfo collection
app.get('/api/devices/rpi/:company', async (req, res) => {
    const company = req.params.company;
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        const db = mongoClient.db(company);
        const collection = db.collection('deviceInfo');
        
        // Get all registered RPi devices for this company
        const devices = await collection.find({}).toArray();
        
        console.log(`📱 Served ${devices.length} RPi devices for company ${company}`);
        res.json({
            success: true,
            company: company,
            devices: devices,
            count: devices.length,
            timestamp: new Date()
        });
        
    } catch (error) {
        console.error('Error fetching RPi devices:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch RPi devices' 
        });
    }
});

// Get company devices with network info
app.get('/api/company-devices/:company', async (req, res) => {
    const company = req.params.company;
    
    try {
        await ensureDevicesLoaded();
        
        const companyDevices = Object.entries(AUTHORIZED_DEVICES)
            .filter(([id, device]) => device.company === company)
            .map(([id, device]) => ({
                device_id: id,
                name: device.name || device.device_name,
                owner: device.owner,
                company: device.company,
                local_ip: device.local_ip || null,
                local_port: device.local_port || 5000,
                last_seen: device.last_seen,
                status: device.network_status || 'unknown',
                capabilities: device.capabilities || []
            }));
        
        console.log(`📱 Served ${companyDevices.length} devices for company ${company}`);
        res.json({
            success: true,
            company: company,
            devices: companyDevices,
            count: companyDevices.length,
            timestamp: new Date()
        });
        
    } catch (error) {
        console.error('Error fetching company devices:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch devices' 
        });
    }
});

// Ping endpoint for connectivity testing
app.get('/ping', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running',
        timestamp: new Date()
    });
});

// Check for function updates (Pi devices call this every 5 minutes)
app.get('/api/functions/check/:currentHash?', authenticateDevice, (req, res) => {
    const currentHash = req.params.currentHash;
    const deviceId = req.deviceId;
    
    // Check if device has specific functions
    const deviceFunctions = DEVICE_FUNCTIONS[deviceId];
    if (!deviceFunctions) {
        return res.status(404).json({
            error: 'No functions available for this device',
            device_id: deviceId
        });
    }
    
    console.log(`📡 Function update check from ${deviceId} - Current: ${currentHash}, Latest: ${deviceFunctions.hash}`);
    
    if (currentHash === deviceFunctions.hash) {
        // No update needed
        res.json({
            updateAvailable: false,
            currentVersion: deviceFunctions.version,
            message: "Functions up to date",
            device_id: deviceId
        });
    } else {
        // Update available
        const response = {
            updateAvailable: true,
            version: deviceFunctions.version,
            hash: deviceFunctions.hash,
            updated: deviceFunctions.updated,
            functions: deviceFunctions.functions,
            device_id: deviceId,
            device_name: deviceFunctions.device_name
        };
        
        console.log(`📥 Sending function update to ${deviceId} v${deviceFunctions.version}`);
        res.json(response);
    }
});

// Get latest functions for a device
app.get('/api/functions/latest', authenticateDevice, (req, res) => {
    const deviceId = req.deviceId;
    
    // Check if device has specific functions
    const deviceFunctions = DEVICE_FUNCTIONS[deviceId];
    if (!deviceFunctions) {
        return res.status(404).json({
            error: 'No functions available for this device',
            device_id: deviceId
        });
    }
    
    console.log(`📥 Full function download requested by ${deviceId}`);
    
    const response = {
        version: deviceFunctions.version,
        hash: deviceFunctions.hash,
        updated: deviceFunctions.updated,
        functions: deviceFunctions.functions,
        device_id: deviceId,
        device_name: deviceFunctions.device_name
    };
    
    res.json(response);
});

// Update functions for a specific device (admin interface)
app.post('/api/functions/update/:deviceId?', (req, res) => {
    try {
        const targetDeviceId = req.params.deviceId || req.body.device_id;
        
        if (!targetDeviceId) {
            return res.status(400).json({
                error: 'Device ID is required (in URL param or body)'
            });
        }
        
        // Create device functions if not exists
        if (!DEVICE_FUNCTIONS[targetDeviceId]) {
            DEVICE_FUNCTIONS[targetDeviceId] = {
                version: "1.0.0",
                updated: new Date().toISOString(),
                hash: "",
                device_name: req.body.device_name || `Device ${targetDeviceId}`,
                functions: {}
            };
        }
        
        // Update functions
        if (req.body.functions) {
            DEVICE_FUNCTIONS[targetDeviceId].functions = { 
                ...DEVICE_FUNCTIONS[targetDeviceId].functions, 
                ...req.body.functions 
            };
        }
        
        // Update metadata
        DEVICE_FUNCTIONS[targetDeviceId].version = req.body.version || DEVICE_FUNCTIONS[targetDeviceId].version;
        DEVICE_FUNCTIONS[targetDeviceId].updated = new Date().toISOString();
        if (req.body.device_name) {
            DEVICE_FUNCTIONS[targetDeviceId].device_name = req.body.device_name;
        }
        
        // Update hash
        updateFunctionHash(targetDeviceId);
        
        console.log(`🔄 Functions updated for ${targetDeviceId} to v${DEVICE_FUNCTIONS[targetDeviceId].version} - Hash: ${DEVICE_FUNCTIONS[targetDeviceId].hash}`);

        res.json({
            success: true,
            device_id: targetDeviceId,
            version: DEVICE_FUNCTIONS[targetDeviceId].version,
            hash: DEVICE_FUNCTIONS[targetDeviceId].hash,
            updated: DEVICE_FUNCTIONS[targetDeviceId].updated
        });
        
    } catch (error) {
        console.error('❌ Error updating functions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Device management
app.get('/api/devices', (req, res) => {
    const devices = Object.keys(AUTHORIZED_DEVICES).map(id => ({
        device_id: id,
        ...AUTHORIZED_DEVICES[id],
        has_functions: !!DEVICE_FUNCTIONS[id],
        function_count: DEVICE_FUNCTIONS[id] ? Object.keys(DEVICE_FUNCTIONS[id].functions).length : 0,
        function_version: DEVICE_FUNCTIONS[id] ? DEVICE_FUNCTIONS[id].version : null
    }));
    
    res.json({ devices, count: devices.length });
});

// Get all device functions (admin view)
app.get('/api/devices/functions', (req, res) => {
    const deviceFunctionSummary = {};
    
    Object.keys(DEVICE_FUNCTIONS).forEach(deviceId => {
        const deviceFuncs = DEVICE_FUNCTIONS[deviceId];
        deviceFunctionSummary[deviceId] = {
            device_name: deviceFuncs.device_name,
            version: deviceFuncs.version,
            updated: deviceFuncs.updated,
            hash: deviceFuncs.hash,
            function_count: Object.keys(deviceFuncs.functions).length,
            functions: Object.keys(deviceFuncs.functions).map(funcName => ({
                name: funcName,
                enabled: deviceFuncs.functions[funcName].enabled,
                description: deviceFuncs.functions[funcName].description
            }))
        };
    });
    
    res.json({
        devices: deviceFunctionSummary,
        total_devices: Object.keys(deviceFunctionSummary).length
    });
});

// Get specific device functions (admin view)
app.get('/api/devices/:deviceId/functions', (req, res) => {
    const deviceId = req.params.deviceId;
    
    if (!DEVICE_FUNCTIONS[deviceId]) {
        return res.status(404).json({
            error: 'Device not found or has no functions',
            device_id: deviceId
        });
    }
    
    res.json({
        device_id: deviceId,
        ...DEVICE_FUNCTIONS[deviceId]
    });
});

// System status
app.get('/api/status', async (req, res) => {
    const hasDevices = await ensureDevicesLoaded();
    const deviceCount = Object.keys(AUTHORIZED_DEVICES).length;
    const cacheAge = Date.now() - lastDeviceFetch;
    
    res.json({
        version: GLOBAL_FUNCTIONS.version,
        hash: GLOBAL_FUNCTIONS.hash,
        lastUpdate: GLOBAL_FUNCTIONS.updated,
        functionsCount: Object.keys(GLOBAL_FUNCTIONS.functions).length,
        mongodb: mongoClient ? '🔗 Connected' : '❌ Disconnected',
        devicesCount: deviceCount,
        deviceCacheAge: `${Math.round(cacheAge / 1000)}s`,
        lastDeviceFetch: new Date(lastDeviceFetch).toISOString(),
        devices: Object.keys(AUTHORIZED_DEVICES)
    });
});

// Simple admin interface
app.get('/', async (req, res) => {
    const hasDevices = await ensureDevicesLoaded();
    const deviceCount = Object.keys(AUTHORIZED_DEVICES).length;
    
    const deviceList = Object.keys(AUTHORIZED_DEVICES).map(id => {
        const device = AUTHORIZED_DEVICES[id];
        const validUntil = new Date(device.validUntil);
        const isExpired = validUntil < new Date();
        const status = isExpired ? '❌ Expired' : '✅ Active';
        
        return `<li><strong>${id}</strong> - ${device.name} (${device.brand}) - Owner: ${device.owner} - ${status} (Valid until: ${validUntil.toISOString().split('T')[0]})</li>`;
    }).join('');
    
    const functionList = Object.keys(GLOBAL_FUNCTIONS.functions).map(name => 
        `<li><strong>${name}</strong> - ${GLOBAL_FUNCTIONS.functions[name].enabled ? '✅ Enabled' : '❌ Disabled'}</li>`
    ).join('');
    
    const mongoStatus = mongoClient ? '🔗 Connected' : '❌ Disconnected';
    const cacheAge = Math.round((Date.now() - lastDeviceFetch) / 1000);
    
    res.send(`
        <h1>🏠 Smart Pi Function Server</h1>
        <p><strong>Version:</strong> ${GLOBAL_FUNCTIONS.version}</p>
        <p><strong>Hash:</strong> ${GLOBAL_FUNCTIONS.hash}</p>
        <p><strong>Last Update:</strong> ${GLOBAL_FUNCTIONS.updated}</p>
        <p><strong>MongoDB:</strong> ${mongoStatus}</p>
        <p><strong>Device Cache Age:</strong> ${cacheAge}s</p>
        
        <h2>📱 Authorized Devices (${deviceCount})</h2>
        <ul>${deviceList}</ul>
        
        <h2>⚙️ Active Functions (${Object.keys(GLOBAL_FUNCTIONS.functions).length})</h2>
        <ul>${functionList}</ul>
        
        <h2>🔌 API Endpoints</h2>
        <ul>
            <li><code>GET /api/functions/check/:hash?device_id=DEVICE_ID</code> - Check for function updates</li>
            <li><code>GET /api/functions/latest?device_id=DEVICE_ID</code> - Get all functions</li>
            <li><code>POST /api/functions/update</code> - Update functions (admin)</li>
            <li><code>GET /api/devices</code> - List all devices</li>
            <li><code>GET /api/status</code> - System status</li>
        </ul>
        
        <h2>� Device-Specific Functions</h2>
        <p>GPIO pin configuration is now hardcoded on each RPi device for reliability.</p>
        <p>Business logic functions are managed centrally and distributed to devices.</p>
        <p>Current active devices: <strong>${Object.keys(DEVICE_FUNCTIONS).length}</strong></p>
        
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #2c3e50; }
            h2 { color: #34495e; margin-top: 30px; }
            code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
            ul { margin: 10px 0; }
            li { margin: 5px 0; }
        </style>
    `);
});

const PORT = process.env.PORT || 3000;

// 🚀 Start server with MongoDB connection
async function startServer() {
    console.log('🚀 Starting KSG IoT Function Server...');
    
    // Connect to MongoDB
    const mongoConnected = await connectToMongoDB();
    
    if (mongoConnected) {
        // Initial device fetch
        await fetchAuthorizedDevices();
    } else {
        console.log('⚠️  Server starting without MongoDB - Using fallback mode');
        console.log('📋 No devices will be authorized until MongoDB connection is established');
    }
    
    // Start the HTTP server
    app.listen(PORT, () => {
        console.log(`🌟 Smart Pi Function Server running on port ${PORT}`);
        console.log(`📡 Ready to serve functions to Pi devices`);
        console.log(`🎯 Device functions loaded: ${Object.keys(DEVICE_FUNCTIONS).length} devices`);
        console.log(`💾 MongoDB: ${mongoConnected ? 'Connected' : 'Disconnected'}`);
        console.log(`📱 Authorized devices: ${Object.keys(AUTHORIZED_DEVICES).length} (${Object.keys(AUTHORIZED_DEVICES).join(', ')})`);
        console.log(`🔧 GPIO configuration: Hardcoded on each Pi device`);
        console.log(`🌐 Admin interface: http://localhost:${PORT}`);
        console.log(`📊 Status API: http://localhost:${PORT}/api/status`);
    });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    if (mongoClient) {
        await mongoClient.close();
        console.log('🔌 MongoDB connection closed');
    }
    process.exit(0);
});

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
