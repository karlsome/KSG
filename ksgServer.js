const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcrypt');

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
  // Disable SSL certificate validation for development (fixes MongoDB Atlas SSL errors)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('⚠️  Development mode: SSL certificate validation disabled');
} else {
  require('dotenv').config();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // � Fix for Arduino SocketIOclient compatibility
    pingTimeout: 60000,          // 60s - increase from default 5s
    pingInterval: 25000,         // 25s - standard interval
    upgradeTimeout: 30000,       // 30s - time to wait for upgrade
    allowUpgrades: true,         // Allow websocket upgrades
    transports: ['polling', 'websocket'],  // Support both transports
    // Force Engine.IO v3 compatibility for Arduino libraries
    allowEIO3: true
});

app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Enable CORS for all origins (development mode)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Device-ID, X-Session-User, X-Session-Role, Authorization');
    
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

// 🔧 GLOBAL FUNCTIONS STRUCTURE (for compatibility)
let GLOBAL_FUNCTIONS = {
    version: '1.0.0',
    hash: 'ksg-production',
    updated: new Date().toISOString(),
    functions: {}
};

// 🔗 MongoDB Connection
async function connectToMongoDB() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set');
        }
        
        console.log('🔗 Connecting to MongoDB Atlas...');
        mongoClient = new MongoClient(MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
            readPreference: 'nearest', // Use 'nearest' read preference for better performance
            tlsAllowInvalidCertificates: true, // Fix for local development SSL certificate issues
            tlsAllowInvalidHostnames: true, // Fix for local development SSL certificate issues
        });
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

// 🔐 LOGIN ENDPOINT
app.post("/loginCustomer", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Use the existing mongoClient connection
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const globalDB = mongoClient.db("Sasaki_Coating_MasterDB");
    const masterUser = await globalDB.collection("masterUsers").findOne({ username });

    // 1️⃣ MasterUser login
    if (masterUser) {
      const passwordMatch = await bcrypt.compare(password, masterUser.password);
      if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

      const today = new Date();
      const validUntil = new Date(masterUser.validUntil);
      if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

      return res.status(200).json({
        username: masterUser.username,
        role: masterUser.role,
        dbName: masterUser.dbName
      });
    }

    // 2️⃣ Sub-user login (loop all master users)
    const allMasterUsers = await globalDB.collection("masterUsers").find({}).toArray();

    for (const mu of allMasterUsers) {
      const customerDB = mongoClient.db(mu.dbName);
      const subUser = await customerDB.collection("users").findOne({ username });

      if (subUser) {
        // Check password
        const passwordMatch = await bcrypt.compare(password, subUser.password);
        if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

        // Check if master account is valid
        const today = new Date();
        const validUntil = new Date(mu.validUntil);
        if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

        return res.status(200).json({
          username: subUser.username,
          role: subUser.role,
          dbName: mu.dbName,
          masterUsername: mu.username
        });
      }
    }

    // Not found
    return res.status(401).json({ error: "Account not found" });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🆕 NEW ENDPOINTS FOR STEP7.PY INTEGRATION

// RPi device registration endpoint (stores in KSG.deviceInfo)
app.post('/api/device/register-rpi', async (req, res) => {
    const { device_id, company, device_name, local_ip, local_port, capabilities, status } = req.body;
    const deviceIdHeader = req.headers['x-device-id'];
    
    // Basic validation
    if (!device_id || !deviceIdHeader || device_id !== deviceIdHeader) {
        return res.status(400).json({ error: 'Invalid device ID' });
    }
    
    // Validate company name (allow any valid company)
    if (!company || company.trim().length === 0) {
        return res.status(400).json({ error: 'Company name is required' });
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
        
        // Find users from the specified company who have this device ID
        const authorizedUser = await masterUsersCollection.findOne({
            company: company,
            role: 'masterUser',
            'devices.uniqueId': device_id
        });
        
        if (!authorizedUser) {
            console.log(`🚫 Unauthorized device registration attempt: Device ${device_id} not found in ${company} masterUsers`);
            return res.status(403).json({ 
                error: `Device not authorized for ${company} company`,
                message: `This device is not registered to any ${company} user`
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
        
        console.log(`✅ Device ${device_id} authorized for ${company} registration - Owner: ${authorizedUser.username}`);
        
        // Register device in company's database
        const companyDb = mongoClient.db(company);
        const deviceInfoCollection = companyDb.collection('deviceInfo');
        
        // Auto-detect device type and brand from request data
        const detectedBrand = req.body.device_brand || deviceDetails?.brand || 'Unknown';
        const detectedType = req.body.device_type || 
                           (detectedBrand.toLowerCase().includes('esp32') ? 'esp32' : 'raspberry_pi');
        
        // Prepare device registration data
        const deviceData = {
            device_id: device_id,
            company: company,
            device_name: device_name || deviceDetails?.name || `${detectedBrand}_${device_id}`,
            device_brand: detectedBrand,
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
            device_type: detectedType,
            authorized_until: authorizedUser.validUntil
        };
        
        // Upsert device info (update if exists, insert if new)
        await deviceInfoCollection.replaceOne(
            { device_id: device_id },
            deviceData,
            { upsert: true }
        );
        
        console.log(`📍 ${detectedBrand} ${device_id} registered in ${company}.deviceInfo: ${local_ip}:${local_port} (Owner: ${authorizedUser.username})`);
        res.json({ 
            success: true, 
            message: `${detectedBrand} device registered successfully`,
            device_id: device_id,
            owner: authorizedUser.username,
            registered_at: deviceData.registered_at,
            device_type: detectedType,
            company: company
        });
        
    } catch (error) {
        console.error(`${company} device registration error:`, error);
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

// Submit production data to both MongoDB and Google Sheets
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
        const company = device.company;
        
        if (!company) {
            return res.status(400).json({ 
                error: 'Device company not configured',
                message: 'Device registration incomplete - no company associated'
            });
        }
        
        // Add submission metadata
        const finalData = {
            ...submissionData,
            タイムスタンプ: new Date(),
            device_id: deviceId,
            submitted_from: device.local_ip || 'unknown',
            company: company
        };
        
        let mongoResult = null;
        let googleSheetsResult = null;
        
        // 1. Submit to MongoDB
        try {
            const db = mongoClient.db(company);
            const collection = db.collection('submittedDB');
            mongoResult = await collection.insertOne(finalData);
            console.log(`📊 Production data submitted to MongoDB by ${deviceId}: ${finalData.品番}`);
        } catch (mongoError) {
            console.error('MongoDB submission error:', mongoError);
            // Continue with Google Sheets even if MongoDB fails
        }
        
        // 2. Submit to Google Sheets
        try {
            const googleSheetsData = await submitToGoogleSheets(finalData, company);
            googleSheetsResult = googleSheetsData;
            console.log(`� Production data submitted to Google Sheets by ${deviceId}: ${finalData.品番}`);
        } catch (googleError) {
            console.error('Google Sheets submission error:', googleError);
            // Continue even if Google Sheets fails
        }
        
        // Return success if at least one submission worked
        const success = mongoResult || googleSheetsResult;
        
        if (success) {
            res.json({
                success: true,
                message: 'Data submitted successfully',
                mongodb: {
                    success: !!mongoResult,
                    insertedId: mongoResult?.insertedId || null
                },
                googleSheets: {
                    success: !!googleSheetsResult,
                    response: googleSheetsResult || null
                },
                submitted_at: finalData.タイムスタンプ
            });
        } else {
            throw new Error('Both MongoDB and Google Sheets submissions failed');
        }
        
    } catch (error) {
        console.error('Error submitting production data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit data',
            details: error.message
        });
    }
});

// Helper function to submit data to Google Sheets
async function submitToGoogleSheets(data, company) {
    const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    
    if (!GOOGLE_SHEETS_URL) {
        console.log('⚠️  Google Sheets webhook URL not configured');
        return null;
    }
    
    try {
        // Format data for Google Sheets (convert to array format expected by Apps Script)
        const formattedData = {
            timestamp: data.タイムスタンプ.toISOString(),
            date_year: data['日付（年）'] || '',
            date_month: data['日付（月）'] || '',
            date_day: data['日付（日）'] || '',
            hinban: data.品番 || '',
            product_name: data.製品名 || '',
            lh_rh: data['LH/RH'] || '',
            operator1: data['技能員①'] || '',
            operator2: data['技能員②'] || '',
            good_count: data.良品数 || 0,
            man_hours: data.工数 || 0,
            material_defect: data['不良項目　素材不良'] || 0,
            double_defect: data['不良項目　ダブり'] || 0,
            peeling_defect: data['不良項目　ハガレ'] || 0,
            foreign_matter_defect: data['不良項目　イブツ'] || 0,
            wrinkle_defect: data['不良項目　シワ'] || 0,
            deformation_defect: data['不良項目　ヘンケイ'] || 0,
            grease_defect: data['不良項目　グリス付着'] || 0,
            screw_loose_defect: data['不良項目　ビス不締まり'] || 0,
            other_defect: data['不良項目　その他'] || 0,
            other_description: data.その他説明 || '',
            shoulder_defect: data['不良項目　ショルダー'] || 0,
            silver_defect: data['不良項目　シルバー'] || 0,
            shoulder_scratch_defect: data['不良項目　ショルダー　キズ'] || 0,
            shoulder_other_defect: data['不良項目　ショルダー　その他'] || 0,
            start_time: data.開始時間 || '',
            end_time: data.終了時間 || '',
            break_time: data.休憩時間 || 0,
            break1_start: data.休憩1開始 || '',
            break1_end: data.休憩1終了 || '',
            break2_start: data.休憩2開始 || '',
            break2_end: data.休憩2終了 || '',
            break3_start: data.休憩3開始 || '',
            break3_end: data.休憩3終了 || '',
            break4_start: data.休憩4開始 || '',
            break4_end: data.休憩4終了 || '',
            remarks: data.備考 || '',
            excluded_man_hours: data['工数（除外工数）'] || 0,
            average_cycle_time: data.平均サイクル時間 || 0,
            fastest_cycle_time: data.最速サイクルタイム || 0,
            slowest_cycle_time: data['最も遅いサイクルタイム'] || 0,
            device_id: data.device_id || '',
            submitted_from: data.submitted_from || '',
            company: company || 'KSG'
        };
        
        const response = await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formattedData)
        });
        
        if (!response.ok) {
            throw new Error(`Google Sheets API returned ${response.status}`);
        }
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Google Sheets submission error:', error);
        throw error;
    }
}

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
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // Get devices from the company's database
        const companyDb = mongoClient.db(company);
        const deviceInfoCollection = companyDb.collection('deviceInfo');
        
        // Fetch all devices for this company
        const allDevices = await deviceInfoCollection.find({}).toArray();
        
        // Also check authorization from AUTHORIZED_DEVICES cache for additional validation
        await ensureDevicesLoaded();
        
        const companyDevices = allDevices
            .filter(device => {
                // Ensure device is still authorized (exists in AUTHORIZED_DEVICES)
                const isAuthorized = AUTHORIZED_DEVICES[device.device_id] && 
                                   AUTHORIZED_DEVICES[device.device_id].company === company;
                return isAuthorized;
            })
            .map(device => ({
                device_id: device.device_id,
                device_name: device.device_name,
                name: device.device_name, // For compatibility
                owner: device.owner,
                owner_first_name: device.owner_first_name,
                owner_last_name: device.owner_last_name,
                company: device.company,
                device_brand: device.device_brand,
                device_type: device.device_type,
                local_ip: device.local_ip,
                local_port: device.local_port,
                last_seen: device.last_seen,
                last_ip_update: device.last_ip_update,
                registered_at: device.registered_at,
                status: device.status,
                capabilities: device.capabilities || [],
                authorized_until: device.authorized_until
            }));
        
        console.log(`📱 Served ${companyDevices.length} devices for company ${company} from database`);
        res.json({
            success: true,
            company: company,
            devices: companyDevices,
            count: companyDevices.length,
            timestamp: new Date()
        });
        
    } catch (error) {
        console.error(`Error fetching devices for company ${company}:`, error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch devices',
            details: error.message
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

// � OPC UA MONITORING SYSTEM - Web UI Routes
app.get('/opcua-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'opcua-admin.html'));
});

app.get('/opcua-monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'opcua-monitor.html'));
});

// �🌐 WEBAPP FILE SERVING ENDPOINTS - For ESP32 file downloads
const path = require('path');
const fs = require('fs');

// Serve webapp files from the webapp folder
app.get('/webapp/index.html', (req, res) => {
    const filePath = path.join(__dirname, 'webapp', 'index.html');
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        console.log('📁 Served index.html to ESP32');
    } else {
        console.log('❌ index.html not found at:', filePath);
        res.status(404).send('File not found');
    }
});

app.get('/webapp/script.js', (req, res) => {
    const filePath = path.join(__dirname, 'webapp', 'script.js');
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        console.log('📁 Served script.js to ESP32');
    } else {
        console.log('❌ script.js not found at:', filePath);
        res.status(404).send('File not found');
    }
});

app.get('/webapp/style.css', (req, res) => {
    const filePath = path.join(__dirname, 'webapp', 'style.css');
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        console.log('📁 Served style.css to ESP32');
    } else {
        console.log('❌ style.css not found at:', filePath);
        res.status(404).send('File not found');
    }
});

// Get webapp files version information for update checking
app.get('/api/webapp/version', (req, res) => {
    try {
        const webappDir = path.join(__dirname, 'webapp');
        const files = ['index.html', 'script.js', 'style.css'];
        const fileInfo = {};
        
        console.log('🔍 ESP32 checking for webapp updates...');
        
        for (const filename of files) {
            const filePath = path.join(webappDir, filename);
            
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const content = fs.readFileSync(filePath);
                const hash = crypto.createHash('md5').update(content).digest('hex');
                
                fileInfo[filename] = {
                    hash: hash,
                    size: stats.size,
                    lastModified: stats.mtime.toISOString()
                };
                
                console.log(`📄 ${filename}: hash=${hash.substr(0,8)}..., size=${stats.size}b`);
            } else {
                console.log(`❌ Webapp file not found: ${filename}`);
                fileInfo[filename] = null;
            }
        }
        
        // Generate consistent version hash based on all file hashes
        const allHashes = files.map(f => fileInfo[f]?.hash || 'missing').join('');
        const versionHash = crypto.createHash('md5').update(allHashes).digest('hex').substr(0, 12);
        
        const response = {
            success: true,
            version: versionHash, // Consistent hash-based version
            files: fileInfo,
            timestamp: new Date().toISOString()
        };
        
        res.json(response);
    } catch (error) {
        console.error('❌ Error generating webapp version info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate version information'
        });
    }
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

// Helper function to update device last_seen in MongoDB
async function updateDeviceLastSeen(deviceId, socketId) {
    if (!mongoClient || !deviceId) return;
    
    try {
        // Determine the device company from AUTHORIZED_DEVICES
        await ensureDevicesLoaded();
        const device = AUTHORIZED_DEVICES[deviceId];
        
        if (!device || !device.company) {
            console.log(`⚠️  Cannot update last_seen for unknown device: ${deviceId}`);
            return;
        }
        
        const companyDb = mongoClient.db(device.company);
        const deviceInfoCollection = companyDb.collection('deviceInfo');
        
        const result = await deviceInfoCollection.updateOne(
            { device_id: deviceId },
            { 
                $set: { 
                    last_seen: new Date(),
                    status: 'online'
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            console.log(`💓 Updated last_seen for device ${deviceId} (${device.company})`);
        }
    } catch (error) {
        console.error(`❌ Failed to update last_seen for device ${deviceId}:`, error.message);
    }
}

// Helper function to update device status in MongoDB
async function updateDeviceStatus(deviceId, status) {
    if (!mongoClient || !deviceId) return;
    
    try {
        // Determine the device company from AUTHORIZED_DEVICES
        await ensureDevicesLoaded();
        const device = AUTHORIZED_DEVICES[deviceId];
        
        if (!device || !device.company) {
            console.log(`⚠️  Cannot update status for unknown device: ${deviceId}`);
            return;
        }
        
        const companyDb = mongoClient.db(device.company);
        const deviceInfoCollection = companyDb.collection('deviceInfo');
        
        const updateData = { status: status };
        if (status === 'offline') {
            updateData.last_seen = new Date(); // Record when it went offline
        }
        
        const result = await deviceInfoCollection.updateOne(
            { device_id: deviceId },
            { $set: updateData }
        );
        
        if (result.modifiedCount > 0) {
            console.log(`📱 Updated device ${deviceId} status to ${status} (${device.company})`);
        }
    } catch (error) {
        console.error(`❌ Failed to update status for device ${deviceId}:`, error.message);
    }
}

// � Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('📱 ESP32 device connected:', socket.id);
    
    // Start a heartbeat interval for this socket to ensure regular last_seen updates
    const heartbeatInterval = setInterval(() => {
        if (socket.deviceId && socket.connected) {
            console.log(`💓 Heartbeat update for device ${socket.deviceId}`);
            updateDeviceLastSeen(socket.deviceId, socket.id);
        }
    }, 30000); // Update every 30 seconds
    
    socket.heartbeatInterval = heartbeatInterval;
    
    // Handle WebSocket ping (heartbeat) - Update last_seen in MongoDB
    socket.on('ping', () => {
        console.log(`💓 Ping received from ${socket.deviceId || socket.id}`);
        
        // Update last_seen in MongoDB if device is identified
        if (socket.deviceId) {
            updateDeviceLastSeen(socket.deviceId, socket.id);
        }
        
        // Send pong response (Socket.IO handles this automatically, but we can log it)
        socket.emit('pong');
    });
    
    // Handle WebSocket pong (response to our ping)
    socket.on('pong', () => {
        console.log(`💓 Pong received from ${socket.deviceId || socket.id}`);
        
        // Update last_seen in MongoDB if device is identified
        if (socket.deviceId) {
            updateDeviceLastSeen(socket.deviceId, socket.id);
        }
    });
    
    // Handle low-level WebSocket ping/pong events (for native WebSocket clients like ESP32)
    socket.conn.on('ping', () => {
        console.log(`💓 Low-level ping received from ${socket.deviceId || socket.id}`);
        if (socket.deviceId) {
            updateDeviceLastSeen(socket.deviceId, socket.id);
        }
    });
    
    socket.conn.on('pong', () => {
        console.log(`💓 Low-level pong received from ${socket.deviceId || socket.id}`);
        if (socket.deviceId) {
            updateDeviceLastSeen(socket.deviceId, socket.id);
        }
    });
    
    // Handle generic messages from Arduino Socket.IO (with "type" field)
    socket.on('message', (data) => {
        try {
            const eventData = typeof data === 'string' ? JSON.parse(data) : data;
            console.log('📨 Received message:', eventData);
            
            // Route based on message type
            // Route based on message type
            switch(eventData.type) {
                case 'device_online':
                    console.log('📱 Device online:', eventData);
                    
                    // Store device info
                    socket.deviceId = eventData.device_id;
                    socket.deviceName = eventData.device_name;
                    socket.deviceIP = eventData.ip;
                    
                    // Update last_seen in MongoDB when device comes online
                    updateDeviceLastSeen(eventData.device_id, socket.id);
                    
                    // Send acknowledgment
                    socket.emit('device_registered', {
                        success: true,
                        message: 'Device registered successfully'
                    });
                    break;
                    
                case 'production_count':
                    console.log('🔢 Counter update from', socket.deviceId || 'unknown device', ':', eventData);
                    
                    // Broadcast to all connected clients (web interface)
                    socket.broadcast.emit('counter_updated', {
                        device_id: socket.deviceId,
                        device_name: socket.deviceName,
                        counter: eventData.count,
                        timestamp: new Date().toISOString()
                    });
                    break;
                    
                case 'production_update':
                    console.log('📊 Production update from', socket.deviceId || 'unknown device', ':', eventData);
                    
                    // Broadcast to all connected webapp clients
                    socket.broadcast.emit('message', eventData);
                    console.log('📤 Relayed production update to webapp clients');
                    break;
                    
                default:
                    console.log('❓ Unknown message type:', eventData.type);
            }
        } catch (error) {
            console.error('❌ Error parsing message data:', error, 'Raw data:', data);
        }
    });
    
    // � DEBUG: Handle various event types that Arduino SocketIOclient might send
    socket.onAny((eventName, ...args) => {
        console.log(`🔍 DEBUG - Any event: "${eventName}", Args:`, args);
    });
    
    // Handle direct events (ESP32 might send as specific event names)
    socket.on('device_online', (data) => {
        console.log('📱 Direct device_online event:', data);
    });
    
    socket.on('production_count', (data) => {
        console.log('🔢 Direct production_count event:', data);
    });
    
    // Handle reset counter command from web interface
    socket.on('reset_counter', (data) => {
        console.log('🔄 Reset counter command for device:', data.device_id);
        
        // Forward to specific device (broadcast to all for now)
        io.emit('reset_counter', {
            device_id: data.device_id,
            timestamp: new Date().toISOString()
        });
    });
    
    // Handle webapp client registration
    socket.on('webapp_register', (data) => {
        console.log('🌐 Webapp client registered:', data);
        socket.isWebapp = true;
        socket.clientType = 'webapp';
    });
    
    // Handle validation requests from ESP32 devices
    socket.on('validate_production_start', (data) => {
        console.log('🔍 Validation request from ESP32:', socket.deviceId || socket.id, data);
        
        // Find webapp clients to handle validation
        const webappSockets = Array.from(io.sockets.sockets.values())
            .filter(s => s.isWebapp === true);
        
        if (webappSockets.length > 0) {
            // Send validation request to all webapp clients
            webappSockets.forEach(webappSocket => {
                webappSocket.emit('validate_production_start', {
                    device_id: socket.deviceId,
                    device_name: socket.deviceName || 'Unknown ESP32',
                    timestamp: Date.now(),
                    ...data
                });
            });
            
            console.log(`📤 Sent validation request to ${webappSockets.length} webapp client(s)`);
        } else {
            console.log('⚠️  No webapp clients connected - cannot validate production start');
            
            // Send automatic approval if no webapp available
            socket.emit('message', {
                type: 'validation_response',
                valid: true,
                message: 'No webapp available - auto approved',
                timestamp: Date.now()
            });
        }
    });
    
    // Handle commands from webapp to ESP32
    socket.on('esp32_command', (data) => {
        console.log('📤 ESP32 command from webapp:', data);
        
        if (data.type === 'reset_production') {
            // Broadcast reset command to all ESP32 devices (or specific device if device_id provided)
            if (data.device_id) {
                console.log('🎯 Sending reset command to device:', data.device_id);
                // Find specific device socket and send command
                const deviceSockets = Array.from(io.sockets.sockets.values())
                    .filter(s => s.deviceId === data.device_id);
                
                deviceSockets.forEach(deviceSocket => {
                    deviceSocket.emit('reset_production', {
                        command: 'reset_all',
                        timestamp: new Date().toISOString()
                    });
                });
                
                if (deviceSockets.length > 0) {
                    console.log(`✅ Reset command sent to ${deviceSockets.length} device(s)`);
                } else {
                    console.log('⚠️  No connected devices found with ID:', data.device_id);
                }
            } else {
                // Broadcast to all ESP32 devices
                console.log('📡 Broadcasting reset command to all ESP32 devices');
                socket.broadcast.emit('reset_production', {
                    command: 'reset_all',
                    timestamp: new Date().toISOString()
                });
            }
        } else if (data.type === 'validation_response') {
            // Route validation response back to ESP32 device
            console.log('🔍 Validation response from webapp:', data);
            
            if (data.device_id) {
                // Find specific ESP32 device socket and send validation response
                const deviceSockets = Array.from(io.sockets.sockets.values())
                    .filter(s => s.deviceId === data.device_id);
                
                deviceSockets.forEach(deviceSocket => {
                    deviceSocket.emit('message', {
                        type: 'validation_response',
                        valid: data.valid,
                        message: data.message || '',
                        hinban: data.hinban || '',
                        timestamp: data.timestamp
                    });
                });
                
                if (deviceSockets.length > 0) {
                    console.log(`✅ Validation response sent to ${deviceSockets.length} device(s):`, data.valid ? 'APPROVED' : 'REJECTED');
                } else {
                    console.log('⚠️  No connected ESP32 devices found for validation response');
                }
            } else {
                console.log('❌ No device_id provided in validation response');
            }
        } else if (data.type === 'request_production_status') {
            // Request current production status from ESP32 devices
            console.log('📊 Status request from webapp for device sync');
            
            // Find ESP32 devices and request current status
            const esp32Sockets = Array.from(io.sockets.sockets.values())
                .filter(s => s.deviceId && !s.isWebapp);
            
            esp32Sockets.forEach(deviceSocket => {
                deviceSocket.emit('message', {
                    type: 'request_status_sync',
                    requesting_client: socket.id,
                    timestamp: Date.now()
                });
            });
            
            if (esp32Sockets.length > 0) {
                console.log(`📤 Status sync request sent to ${esp32Sockets.length} ESP32 device(s)`);
            } else {
                console.log('⚠️  No ESP32 devices connected for status sync');
            }
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log('📱 ESP32 device disconnected:', socket.deviceId || socket.id);
        
        // Clear the heartbeat interval
        if (socket.heartbeatInterval) {
            clearInterval(socket.heartbeatInterval);
        }
        
        // Mark device as offline in MongoDB when it disconnects
        if (socket.deviceId) {
            await updateDeviceStatus(socket.deviceId, 'offline');
        }
    });
    
    // Handle errors
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// ==========================================
// 🏭 OPC UA MONITORING SYSTEM API ENDPOINTS
// ==========================================

// Middleware: Validate Raspberry Pi by uniqueId
async function validateRaspberryPi(req, res, next) {
    try {
        const raspberryId = req.params.raspberryId || req.body.raspberryId || req.headers['x-raspberry-id'];
        
        if (!raspberryId) {
            return res.status(400).json({ error: 'raspberryId is required' });
        }
        
        // Check if raspberryId exists in any masterUser's devices
        const masterDB = mongoClient.db(DB_NAME);
        const masterUser = await masterDB.collection(COLLECTION_NAME).findOne({
            'devices.uniqueId': raspberryId
        });
        
        if (!masterUser) {
            return res.status(403).json({ error: 'Unauthorized Raspberry Pi device' });
        }
        
        req.raspberryId = raspberryId;
        req.company = masterUser.company;
        req.dbName = masterUser.dbName;
        next();
    } catch (error) {
        console.error('❌ Raspberry Pi validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
}

// Middleware: Validate Admin User
async function validateAdminUser(req, res, next) {
    try {
        const username = req.headers['x-session-user'];
        
        if (!username) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const masterDB = mongoClient.db(DB_NAME);
        const masterUser = await masterDB.collection(COLLECTION_NAME).findOne({ username });
        
        if (!masterUser || masterUser.role !== 'masterUser') {
            return res.status(403).json({ error: 'Unauthorized: Admin access required' });
        }
        
        req.username = username;
        req.company = masterUser.company;
        req.dbName = masterUser.dbName;
        next();
    } catch (error) {
        console.error('❌ Admin validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
}

// ==========================================
// RASPBERRY PI ENDPOINTS
// ==========================================

// GET /api/opcua/config/:raspberryId - Get configuration for Raspberry Pi
app.get('/api/opcua/config/:raspberryId', validateRaspberryPi, async (req, res) => {
    try {
        const { raspberryId, dbName } = req;
        const db = mongoClient.db(dbName);
        
        // Get Raspberry Pi configuration
        const config = await db.collection('opcua_config').findOne({ raspberryId });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        
        if (!config.enabled) {
            return res.status(403).json({ error: 'Raspberry Pi is disabled' });
        }
        
        // Get enabled datapoints to monitor
        const datapoints = await db.collection('opcua_datapoints')
            .find({ raspberryId, enabled: true })
            .sort({ equipmentId: 1, sortOrder: 1 })
            .toArray();
        
        res.json({
            success: true,
            config: {
                raspberryId: config.raspberryId,
                raspberryName: config.raspberryName,
                opcua_server_ip: config.opcua_server_ip,
                opcua_server_port: config.opcua_server_port,
                poll_interval: config.poll_interval,
                connection_timeout: config.connection_timeout
            },
            datapoints: datapoints.map(dp => ({
                id: dp._id,
                equipmentId: dp.equipmentId,
                opcNodeId: dp.opcNodeId,
                label: dp.label,
                dataType: dp.dataType
            }))
        });
        
        console.log(`📡 Config fetched for Raspberry Pi: ${raspberryId}`);
        
    } catch (error) {
        console.error('❌ Error fetching config:', error);
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
});

// POST /api/opcua/heartbeat - Update Raspberry Pi heartbeat
app.post('/api/opcua/heartbeat', validateRaspberryPi, async (req, res) => {
    try {
        const { raspberryId, dbName } = req;
        const { status } = req.body;
        const db = mongoClient.db(dbName);
        
        await db.collection('opcua_config').updateOne(
            { raspberryId },
            {
                $set: {
                    status: status || 'online',
                    lastHeartbeat: new Date().toISOString()
                }
            }
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Error updating heartbeat:', error);
        res.status(500).json({ error: 'Failed to update heartbeat' });
    }
});

// POST /api/opcua/data - Push real-time data from Raspberry Pi
app.post('/api/opcua/data', validateRaspberryPi, async (req, res) => {
    try {
        const { raspberryId, dbName } = req;
        const { data } = req.body; // Array of { datapointId, opcNodeId, value, quality, timestamp }
        const db = mongoClient.db(dbName);
        
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid data format' });
        }
        
        const bulkOps = data.map(item => ({
            updateOne: {
                filter: { datapointId: item.datapointId },
                update: {
                    $set: {
                        raspberryId,
                        equipmentId: item.equipmentId,
                        opcNodeId: item.opcNodeId,
                        value: item.value,
                        valueString: String(item.value),
                        quality: item.quality || 'Good',
                        sourceTimestamp: item.timestamp,
                        receivedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                },
                upsert: true
            }
        }));
        
        await db.collection('opcua_realtime').bulkWrite(bulkOps);
        
        // Emit to WebSocket clients
        io.to(`opcua_${dbName}`).emit('opcua_data_update', {
            raspberryId,
            data: data.map(item => ({
                equipmentId: item.equipmentId,
                datapointId: item.datapointId,
                value: item.value,
                quality: item.quality,
                timestamp: item.timestamp
            }))
        });
        
        res.json({ success: true, received: data.length });
        
    } catch (error) {
        console.error('❌ Error saving OPC UA data:', error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// GET /api/opcua/datapoints/:raspberryId - Get list of datapoints to monitor
app.get('/api/opcua/datapoints/:raspberryId', validateRaspberryPi, async (req, res) => {
    try {
        const { raspberryId, dbName } = req;
        const db = mongoClient.db(dbName);
        
        const datapoints = await db.collection('opcua_datapoints')
            .find({ raspberryId, enabled: true })
            .sort({ equipmentId: 1, sortOrder: 1 })
            .toArray();
        
        res.json({ success: true, datapoints });
        
    } catch (error) {
        console.error('❌ Error fetching datapoints:', error);
        res.status(500).json({ error: 'Failed to fetch datapoints' });
    }
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// GET /api/opcua/admin/raspberries - List all Raspberry Pis for logged-in user
app.get('/api/opcua/admin/raspberries', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const db = mongoClient.db(dbName);
        
        const raspberries = await db.collection('opcua_config')
            .find({})
            .sort({ raspberryName: 1 })
            .toArray();
        
        res.json({ success: true, raspberries });
        
    } catch (error) {
        console.error('❌ Error fetching raspberries:', error);
        res.status(500).json({ error: 'Failed to fetch Raspberry Pis' });
    }
});

// POST /api/opcua/admin/raspberry - Add/update Raspberry Pi configuration
app.post('/api/opcua/admin/raspberry', validateAdminUser, async (req, res) => {
    try {
        const { dbName, company } = req;
        const { raspberryId, raspberryName, opcua_server_ip, opcua_server_port, poll_interval, enabled } = req.body;
        const db = mongoClient.db(dbName);
        
        // Validate raspberryId exists in masterUsers.devices
        const masterDB = mongoClient.db(DB_NAME);
        const masterUser = await masterDB.collection(COLLECTION_NAME).findOne({
            company,
            'devices.uniqueId': raspberryId
        });
        
        if (!masterUser) {
            return res.status(400).json({ error: 'Raspberry Pi device not found in masterUsers' });
        }
        
        const configData = {
            raspberryId,
            raspberryName: raspberryName || raspberryId,
            company,
            opcua_server_ip: opcua_server_ip || '',
            opcua_server_port: opcua_server_port || 4840,
            connection_timeout: 60000,
            poll_interval: poll_interval || 5000,
            enabled: enabled !== false,
            status: 'offline',
            lastSync: null,
            lastHeartbeat: null,
            updatedAt: new Date().toISOString()
        };
        
        const result = await db.collection('opcua_config').updateOne(
            { raspberryId },
            {
                $set: configData,
                $setOnInsert: { createdAt: new Date().toISOString() }
            },
            { upsert: true }
        );
        
        res.json({ success: true, raspberryId, isNew: result.upsertedCount > 0 });
        console.log(`✅ Raspberry Pi config saved: ${raspberryId}`);
        
    } catch (error) {
        console.error('❌ Error saving raspberry config:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// DELETE /api/opcua/admin/raspberry/:raspberryId - Remove Raspberry Pi
app.delete('/api/opcua/admin/raspberry/:raspberryId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { raspberryId } = req.params;
        const db = mongoClient.db(dbName);
        
        // Delete config, equipment, datapoints, and realtime data
        await Promise.all([
            db.collection('opcua_config').deleteOne({ raspberryId }),
            db.collection('opcua_equipment').deleteMany({ raspberryId }),
            db.collection('opcua_datapoints').deleteMany({ raspberryId }),
            db.collection('opcua_realtime').deleteMany({ raspberryId })
        ]);
        
        res.json({ success: true });
        console.log(`🗑️  Raspberry Pi deleted: ${raspberryId}`);
        
    } catch (error) {
        console.error('❌ Error deleting raspberry:', error);
        res.status(500).json({ error: 'Failed to delete Raspberry Pi' });
    }
});

// GET /api/opcua/admin/equipment/:raspberryId - Get equipment list
app.get('/api/opcua/admin/equipment/:raspberryId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { raspberryId } = req.params;
        const db = mongoClient.db(dbName);
        
        const equipment = await db.collection('opcua_equipment')
            .find({ raspberryId })
            .sort({ sortOrder: 1 })
            .toArray();
        
        res.json({ success: true, equipment });
        
    } catch (error) {
        console.error('❌ Error fetching equipment:', error);
        res.status(500).json({ error: 'Failed to fetch equipment' });
    }
});

// POST /api/opcua/admin/equipment - Add/update equipment
app.post('/api/opcua/admin/equipment', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { raspberryId, equipmentId, displayName, description, category, location, sortOrder, enabled } = req.body;
        const db = mongoClient.db(dbName);
        
        const equipmentData = {
            raspberryId,
            equipmentId,
            displayName,
            description: description || '',
            category: category || '',
            location: location || '',
            sortOrder: sortOrder || 0,
            enabled: enabled !== false,
            updatedAt: new Date().toISOString()
        };
        
        const result = await db.collection('opcua_equipment').updateOne(
            { raspberryId, equipmentId },
            {
                $set: equipmentData,
                $setOnInsert: { createdAt: new Date().toISOString() }
            },
            { upsert: true }
        );
        
        res.json({ success: true, equipmentId, isNew: result.upsertedCount > 0 });
        
    } catch (error) {
        console.error('❌ Error saving equipment:', error);
        res.status(500).json({ error: 'Failed to save equipment' });
    }
});

// DELETE /api/opcua/admin/equipment/:equipmentId - Remove equipment
app.delete('/api/opcua/admin/equipment/:equipmentId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { equipmentId } = req.params;
        const db = mongoClient.db(dbName);
        
        // Delete equipment and its datapoints
        await Promise.all([
            db.collection('opcua_equipment').deleteOne({ equipmentId }),
            db.collection('opcua_datapoints').deleteMany({ equipmentId }),
            db.collection('opcua_realtime').deleteMany({ equipmentId })
        ]);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Error deleting equipment:', error);
        res.status(500).json({ error: 'Failed to delete equipment' });
    }
});

// GET /api/opcua/admin/datapoints/:equipmentId - Get datapoints for equipment
app.get('/api/opcua/admin/datapoints/:equipmentId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { equipmentId } = req.params;
        const db = mongoClient.db(dbName);
        
        const datapoints = await db.collection('opcua_datapoints')
            .find({ equipmentId })
            .sort({ sortOrder: 1 })
            .toArray();
        
        res.json({ success: true, datapoints });
        
    } catch (error) {
        console.error('❌ Error fetching datapoints:', error);
        res.status(500).json({ error: 'Failed to fetch datapoints' });
    }
});

// POST /api/opcua/admin/datapoints - Add/update datapoint
app.post('/api/opcua/admin/datapoints', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { 
            raspberryId, equipmentId, opcNodeId, label, description, 
            dataType, unit, displayFormat, sortOrder, enabled 
        } = req.body;
        const db = mongoClient.db(dbName);
        
        const datapointData = {
            raspberryId,
            equipmentId,
            opcNodeId,
            label,
            description: description || '',
            dataType: dataType || 'String',
            unit: unit || '',
            displayFormat: displayFormat || 'number',
            sortOrder: sortOrder || 0,
            enabled: enabled !== false,
            alertEnabled: false,
            alertCondition: null,
            updatedAt: new Date().toISOString()
        };
        
        const result = await db.collection('opcua_datapoints').updateOne(
            { raspberryId, equipmentId, opcNodeId },
            {
                $set: datapointData,
                $setOnInsert: { createdAt: new Date().toISOString() }
            },
            { upsert: true }
        );
        
        res.json({ 
            success: true, 
            datapointId: result.upsertedId || opcNodeId, 
            isNew: result.upsertedCount > 0 
        });
        
    } catch (error) {
        console.error('❌ Error saving datapoint:', error);
        res.status(500).json({ error: 'Failed to save datapoint' });
    }
});

// PUT /api/opcua/admin/datapoints/:id/toggle - Enable/disable datapoint
app.put('/api/opcua/admin/datapoints/:id/toggle', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { id } = req.params;
        const { enabled } = req.body;
        const db = mongoClient.db(dbName);
        const { ObjectId } = require('mongodb');
        
        await db.collection('opcua_datapoints').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    enabled: enabled !== false,
                    updatedAt: new Date().toISOString()
                }
            }
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Error toggling datapoint:', error);
        res.status(500).json({ error: 'Failed to toggle datapoint' });
    }
});

// ==========================================
// MONITOR ENDPOINTS
// ==========================================

// GET /api/opcua/monitor/dashboard - Get all equipment + current values
app.get('/api/opcua/monitor/dashboard', async (req, res) => {
    try {
        const company = req.headers['x-company'] || req.query.company;
        
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        // Get dbName for company
        const masterDB = mongoClient.db(DB_NAME);
        const masterUser = await masterDB.collection(COLLECTION_NAME).findOne({ company });
        
        if (!masterUser) {
            return res.status(404).json({ error: 'Company not found' });
        }
        
        const db = mongoClient.db(masterUser.dbName);
        
        // Get all raspberries
        const raspberries = await db.collection('opcua_config')
            .find({ enabled: true })
            .toArray();
        
        const dashboard = [];
        
        for (const raspberry of raspberries) {
            // Get equipment for this raspberry
            const equipment = await db.collection('opcua_equipment')
                .find({ raspberryId: raspberry.raspberryId, enabled: true })
                .sort({ sortOrder: 1 })
                .toArray();
            
            for (const equip of equipment) {
                // Get datapoints
                const datapoints = await db.collection('opcua_datapoints')
                    .find({ equipmentId: equip.equipmentId, enabled: true })
                    .sort({ sortOrder: 1 })
                    .toArray();
                
                // Get current values
                const values = await db.collection('opcua_realtime')
                    .find({ equipmentId: equip.equipmentId })
                    .toArray();
                
                // Map values to datapoints
                const datapointsWithValues = datapoints.map(dp => {
                    const value = values.find(v => v.opcNodeId === dp.opcNodeId);
                    return {
                        label: dp.label,
                        value: value ? value.value : null,
                        quality: value ? value.quality : 'Unknown',
                        unit: dp.unit,
                        timestamp: value ? value.sourceTimestamp : null
                    };
                });
                
                dashboard.push({
                    raspberryId: raspberry.raspberryId,
                    raspberryName: raspberry.raspberryName,
                    equipmentId: equip.equipmentId,
                    displayName: equip.displayName,
                    category: equip.category,
                    location: equip.location,
                    status: raspberry.status,
                    datapoints: datapointsWithValues
                });
            }
        }
        
        res.json({ success: true, dashboard });
        
    } catch (error) {
        console.error('❌ Error fetching dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

// WebSocket namespace for OPC UA real-time updates
io.of('/opcua').on('connection', (socket) => {
    console.log('🔌 OPC UA monitor connected:', socket.id);
    
    socket.on('subscribe', (data) => {
        const { company } = data;
        if (company) {
            socket.join(`opcua_${company}`);
            console.log(`📡 Client subscribed to OPC UA updates for: ${company}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 OPC UA monitor disconnected:', socket.id);
    });
});

// ==========================================
// END OPC UA MONITORING SYSTEM
// ==========================================

// �🚀 Start server with MongoDB connection
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
    server.listen(PORT, () => {
        console.log(`🌟 Smart Pi Function Server running on port ${PORT}`);
        console.log(`📡 Ready to serve functions to Pi devices`);
        console.log(`🎯 Device functions loaded: ${Object.keys(DEVICE_FUNCTIONS).length} devices`);
        console.log(`💾 MongoDB: ${mongoConnected ? 'Connected' : 'Disconnected'}`);
        console.log(`📱 Authorized devices: ${Object.keys(AUTHORIZED_DEVICES).length} (${Object.keys(AUTHORIZED_DEVICES).join(', ')})`);
        console.log(`🔧 GPIO configuration: Hardcoded on each Pi device`);
        console.log(`🌐 Admin interface: http://localhost:${PORT}`);
        console.log(`📊 Status API: http://localhost:${PORT}/api/status`);
        console.log(`🏭 OPC UA Monitor: http://localhost:${PORT}/opcua-monitor`);
        console.log(`⚙️  OPC UA Admin: http://localhost:${PORT}/opcua-admin`);
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
