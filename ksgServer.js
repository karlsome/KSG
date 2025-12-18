const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const multer = require('multer');

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

// � FIREBASE CONFIGURATION
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID || '',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

if (serviceAccount.private_key && serviceAccount.client_email) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  console.log('🔥 Firebase Admin SDK initialized successfully!');
} else {
  console.error('❌ Firebase Admin SDK initialization failed. Ensure FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL are set in .env file.');
}

// Multer configuration for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// �🔧 GLOBAL FUNCTIONS STRUCTURE (for compatibility)
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
    
    // Handle generic room join requests
    socket.on('join', (data) => {
        if (data && data.room) {
            socket.join(data.room);
            console.log(`🔗 Client ${socket.id} joined room: ${data.room}`);
        }
    });
    
    // Handle Raspberry Pi registration
    socket.on('raspberry_register', async (data) => {
        console.log('🥧 Raspberry Pi registered:', data);
        socket.raspberryId = data.raspberryId;
        socket.clientType = 'raspberry';
        
        // Update status in MongoDB
        try {
            const db = mongoClient.db(DB_NAME);
            const collection = db.collection('opcua_config');
            
            await collection.updateOne(
                { raspberryId: data.raspberryId },
                { 
                    $set: { 
                        status: data.status || 'online',
                        lastSeen: new Date(),
                        socketId: socket.id
                    } 
                },
                { upsert: false }
            );
            
            // Broadcast status update to admin UIs
            io.emit('raspberry_status_update', {
                raspberryId: data.raspberryId,
                status: data.status || 'online',
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ Raspberry Pi ${data.raspberryId} status updated: ${data.status || 'online'}`);
        } catch (error) {
            console.error(`❌ Failed to update Raspberry Pi status:`, error.message);
        }
    });
    
    // Handle OPC UA data changes from Raspberry Pi (real-time via WebSocket)
    socket.on('opcua_data_change', async (data) => {
        console.log('📊 OPC UA data change from Raspberry Pi:', socket.raspberryId || socket.id);
        
        try {
            const { raspberryId, equipmentId, data: datapoints } = data;
            
            // Find which company/database this Raspberry Pi belongs to
            const masterDB = mongoClient.db(DB_NAME);
            const masterUsers = masterDB.collection(COLLECTION_NAME);
            
            const user = await masterUsers.findOne({
                'devices': {
                    $elemMatch: { uniqueId: raspberryId }
                }
            });
            
            if (!user) {
                console.error(`❌ Raspberry Pi ${raspberryId} not found in any user's devices`);
                return;
            }
            
            const dbName = user.dbName;
            const db = mongoClient.db(dbName);
            
            // Save to MongoDB (async, non-blocking)
            const bulkOps = datapoints.map(item => ({
                updateOne: {
                    filter: { datapointId: item.datapointId },
                    update: {
                        $set: {
                            raspberryId,
                            equipmentId: item.equipmentId || equipmentId,
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
            
            // Save to MongoDB in background (don't await - non-blocking)
            db.collection('opcua_realtime').bulkWrite(bulkOps).catch(err => {
                console.error('❌ Error saving OPC UA data to MongoDB:', err.message);
            });
            
            // Broadcast to all tablets immediately (don't wait for MongoDB)
            io.emit('opcua_realtime_update', {
                raspberryId,
                equipmentId,
                data: datapoints.map(item => ({
                    datapointId: item.datapointId,
                    opcNodeId: item.opcNodeId,
                    value: item.value,
                    quality: item.quality,
                    timestamp: item.timestamp
                }))
            });
            
            console.log(`📤 Broadcasted ${datapoints.length} datapoint(s) to tablets`);
            
        } catch (error) {
            console.error('❌ Error handling OPC UA data change:', error.message);
        }
    });
    
    // Handle tablet monitor registration
    socket.on('monitor_register', async (data) => {
        console.log('📱 Monitor tablet registered:', data);
        socket.isMonitor = true;
        socket.clientType = 'monitor';
        socket.monitorRaspberryId = data.raspberryId;
        socket.monitorLayoutId = data.layoutId;
        
        // Optionally join specific equipment rooms for targeted updates
        if (data.equipmentId) {
            socket.join(`equipment_${data.equipmentId}`);
            console.log(`📱 Tablet joined room: equipment_${data.equipmentId}`);
        }
        
        // Send latest cached datapoint values immediately
        try {
            if (!mongoClient || !data.raspberryId) {
                console.log('⚠️ Cannot send cached values: missing mongoClient or raspberryId');
                return;
            }
            
            // Find which company/database this Raspberry Pi belongs to
            const masterDB = mongoClient.db(DB_NAME);
            const masterUsers = masterDB.collection(COLLECTION_NAME);
            
            const user = await masterUsers.findOne({
                'devices': {
                    $elemMatch: { uniqueId: data.raspberryId }
                }
            });
            
            if (!user || !user.dbName) {
                console.log(`⚠️ Raspberry Pi ${data.raspberryId} not found in any user's devices`);
                return;
            }
            
            // Get latest values from opcua_realtime collection
            const db = mongoClient.db(user.dbName);
            const realtimeData = await db.collection('opcua_realtime')
                .find({ raspberryId: data.raspberryId })
                .toArray();
            
            if (realtimeData && realtimeData.length > 0) {
                // Group by equipment
                const equipmentGroups = {};
                realtimeData.forEach(item => {
                    if (!equipmentGroups[item.equipmentId]) {
                        equipmentGroups[item.equipmentId] = [];
                    }
                    equipmentGroups[item.equipmentId].push({
                        datapointId: item.datapointId,
                        opcNodeId: item.opcNodeId,
                        value: item.value,
                        quality: item.quality,
                        timestamp: item.timestamp
                    });
                });
                
                // Send cached data for each equipment group
                for (const [equipmentId, datapoints] of Object.entries(equipmentGroups)) {
                    socket.emit('opcua_realtime_update', {
                        raspberryId: data.raspberryId,
                        equipmentId: equipmentId,
                        data: datapoints
                    });
                }
                
                console.log(`✅ Sent ${realtimeData.length} cached datapoint(s) to monitor ${socket.id}`);
            } else {
                console.log(`ℹ️ No cached data available for Raspberry Pi ${data.raspberryId}`);
            }
        } catch (error) {
            console.error('❌ Error sending cached values to monitor:', error.message);
        }
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
        console.log('📱 Device disconnected:', socket.deviceId || socket.raspberryId || socket.id);
        
        // Clear the heartbeat interval
        if (socket.heartbeatInterval) {
            clearInterval(socket.heartbeatInterval);
        }
        
        // Mark device as offline in MongoDB when it disconnects
        if (socket.deviceId) {
            await updateDeviceStatus(socket.deviceId, 'offline');
        }
        
        // Mark Raspberry Pi as offline
        if (socket.raspberryId) {
            try {
                const db = mongoClient.db(DB_NAME);
                const collection = db.collection('opcua_config');
                
                await collection.updateOne(
                    { raspberryId: socket.raspberryId },
                    { 
                        $set: { 
                            status: 'offline',
                            lastSeen: new Date()
                        } 
                    }
                );
                
                // Broadcast status update to admin UIs
                io.emit('raspberry_status_update', {
                    raspberryId: socket.raspberryId,
                    status: 'offline',
                    timestamp: new Date().toISOString()
                });
                
                console.log(`✅ Raspberry Pi ${socket.raspberryId} marked as offline`);
            } catch (error) {
                console.error(`❌ Failed to mark Raspberry Pi as offline:`, error.message);
            }
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

// POST /api/opcua/device-info - Upload device information
app.post('/api/opcua/device-info', async (req, res) => {
    try {
        // Check if MongoDB is connected
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const deviceInfo = req.body;
        
        if (!deviceInfo.device_id) {
            return res.status(400).json({ error: 'device_id is required' });
        }
        
        // Store in deviceInfo collection under company's database
        const db = mongoClient.db(deviceInfo.company || 'KSG');
        
        // Remove fields that conflict with $setOnInsert
        const { registered_at, authorized_until, ...deviceInfoToUpdate } = deviceInfo;
        
        await db.collection('deviceInfo').updateOne(
            { device_id: deviceInfo.device_id },
            {
                $set: {
                    ...deviceInfoToUpdate,
                    updated_at: new Date()
                },
                $setOnInsert: {
                    registered_at: new Date(),
                    authorized_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
                }
            },
            { upsert: true }
        );
        
        console.log(`✅ Device info uploaded: ${deviceInfo.device_name} (${deviceInfo.device_id})`);
        res.json({ success: true, message: 'Device info uploaded successfully' });
        
    } catch (error) {
        console.error('❌ Error uploading device info:', error);
        res.status(500).json({ error: 'Failed to upload device info' });
    }
});

// GET /api/deviceInfo - Get all devices for a company
app.get('/api/deviceInfo', async (req, res) => {
    try {
        const { company } = req.query;
        
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const db = mongoClient.db(company);
        const devices = await db.collection('deviceInfo').find({}).toArray();
        
        res.json({ success: true, devices });
        
    } catch (error) {
        console.error('❌ Error loading devices:', error);
        res.status(500).json({ error: 'Failed to load devices' });
    }
});

// GET /api/deviceInfo/:deviceId - Get specific device
app.get('/api/deviceInfo/:deviceId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { deviceId } = req.params;
        const { company } = req.query;
        
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const db = mongoClient.db(company);
        const device = await db.collection('deviceInfo').findOne({ _id: new ObjectId(deviceId) });
        
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }
        
        res.json({ success: true, device });
        
    } catch (error) {
        console.error('❌ Error loading device:', error);
        res.status(500).json({ error: 'Failed to load device' });
    }
});

// PUT /api/deviceInfo/:deviceId - Update device name and owner
app.put('/api/deviceInfo/:deviceId', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { deviceId } = req.params;
        const { company, device_name, owner } = req.body;
        
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        if (!device_name) {
            return res.status(400).json({ error: 'Device name is required' });
        }
        
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const db = mongoClient.db(company);
        
        const result = await db.collection('deviceInfo').updateOne(
            { _id: new ObjectId(deviceId) },
            {
                $set: {
                    device_name,
                    owner,
                    updated_at: new Date()
                }
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        
        console.log(`✅ Device updated: ${device_name} (${deviceId})`);
        res.json({ success: true, message: 'Device updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating device:', error);
        res.status(500).json({ error: 'Failed to update device' });
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

// GET /api/opcua/data/latest - Get latest real-time data (for array viewer)
app.get('/api/opcua/data/latest', async (req, res) => {
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
        
        // Get all latest real-time data
        const data = await db.collection('opcua_realtime')
            .find({})
            .toArray();
        
        res.json({ success: true, data });
        
    } catch (error) {
        console.error('❌ Error fetching latest data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// GET /api/opcua/discovered-arrays - Get all discovered array nodes (for array viewer)
app.get('/api/opcua/discovered-arrays', async (req, res) => {
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
        
        // Get all discovered nodes that are arrays (type: 'list')
        const arrays = await db.collection('opcua_discovered_nodes')
            .find({ type: 'list' })
            .sort({ variableName: 1 })
            .toArray();
        
        // Format the response to match what array-viewer expects
        const formattedArrays = arrays.map(node => ({
            opcNodeId: node.opcNodeId,
            datapointId: node._id.toString(),
            value: node.value || [],
            quality: 'Good',
            timestamp: node.discoveredAt,
            equipmentId: node.raspberryId
        }));
        
        res.json({ success: true, data: formattedArrays });
        
    } catch (error) {
        console.error('❌ Error fetching discovered arrays:', error);
        res.status(500).json({ error: 'Failed to fetch arrays' });
    }
});

// POST /api/opcua/discovered-nodes - Save discovered nodes from Raspberry Pi
app.post('/api/opcua/discovered-nodes', validateRaspberryPi, async (req, res) => {
    try {
        const { raspberryId, dbName } = req;
        const { nodes, timestamp } = req.body;
        
        if (!nodes || !Array.isArray(nodes)) {
            return res.status(400).json({ error: 'Invalid nodes data' });
        }
        
        const db = mongoClient.db(dbName);
        
        // Delete old discovered nodes for this Raspberry Pi
        await db.collection('opcua_discovered_nodes').deleteMany({ raspberryId });
        
        // Insert new discovered nodes
        const nodesToInsert = nodes.map(node => ({
            raspberryId,
            namespace: node.namespace,
            variableName: node.variableName,
            browseName: node.browseName,
            opcNodeId: node.opcNodeId,
            dataType: node.dataType,
            type: node.type || 'unknown',  // list, number, string, boolean
            value: node.value,  // Full value including arrays
            currentValue: node.currentValue,
            discoveredAt: timestamp,
            createdAt: new Date().toISOString()
        }));
        
        if (nodesToInsert.length > 0) {
            await db.collection('opcua_discovered_nodes').insertMany(nodesToInsert);
        }
        
        console.log(`✅ Saved ${nodes.length} discovered nodes for ${raspberryId}`);
        res.json({ success: true, count: nodes.length });
        
    } catch (error) {
        console.error('❌ Error saving discovered nodes:', error);
        res.status(500).json({ error: 'Failed to save discovered nodes' });
    }
});

// GET /api/opcua/discovered-nodes/:raspberryId - Get discovered nodes for admin UI
app.get('/api/opcua/discovered-nodes/:raspberryId', validateAdminUser, async (req, res) => {
    try {
        const { raspberryId } = req.params;
        const { dbName } = req;
        const db = mongoClient.db(dbName);
        
        const nodes = await db.collection('opcua_discovered_nodes')
            .find({ raspberryId })
            .sort({ variableName: 1 })
            .toArray();
        
        res.json({ success: true, nodes });
        
    } catch (error) {
        console.error('❌ Error fetching discovered nodes:', error);
        res.status(500).json({ error: 'Failed to fetch discovered nodes' });
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

// GET /api/opcua/admin/datapoints-by-raspberry/:raspberryId - Get all datapoints for a raspberry
app.get('/api/opcua/admin/datapoints-by-raspberry/:raspberryId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { raspberryId } = req.params;
        const db = mongoClient.db(dbName);
        
        const datapoints = await db.collection('opcua_datapoints')
            .find({ raspberryId })
            .sort({ sortOrder: 1, label: 1 })
            .toArray();
        
        res.json({ success: true, datapoints });
        
    } catch (error) {
        console.error('❌ Error loading datapoints:', error);
        res.status(500).json({ error: 'Failed to load datapoints' });
    }
});

// ==========================================
// LAYOUT EDITOR ENDPOINTS
// ==========================================

// GET /api/opcua/admin/layouts - Get all layouts
app.get('/api/opcua/admin/layouts', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const db = mongoClient.db(dbName);
        
        const layouts = await db.collection('opcua_layouts')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json({ success: true, layouts });
        
    } catch (error) {
        console.error('❌ Error loading layouts:', error);
        res.status(500).json({ error: 'Failed to load layouts' });
    }
});

// POST /api/opcua/admin/layouts - Create or update layout
app.post('/api/opcua/admin/layouts', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const db = mongoClient.db(dbName);
        const layout = req.body;
        
        // Add timestamps
        const now = new Date().toISOString();
        
        // Remove _id and createdAt from layout data to avoid conflicts
        const { _id, createdAt, ...layoutWithoutImmutableFields } = layout;
        
        const layoutData = {
            ...layoutWithoutImmutableFields,
            updatedAt: now
        };
        
        const result = await db.collection('opcua_layouts').updateOne(
            { layoutId: layout.layoutId },
            {
                $set: layoutData,
                $setOnInsert: { createdAt: now }
            },
            { upsert: true }
        );
        
        res.json({ success: true, layoutId: layout.layoutId, isNew: result.upsertedCount > 0 });
        
    } catch (error) {
        console.error('❌ Error saving layout:', error);
        res.status(500).json({ error: 'Failed to save layout' });
    }
});

// GET /api/opcua/admin/layouts/:layoutId - Get specific layout
app.get('/api/opcua/admin/layouts/:layoutId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { layoutId } = req.params;
        const db = mongoClient.db(dbName);
        
        const layout = await db.collection('opcua_layouts').findOne({ layoutId });
        
        if (!layout) {
            return res.status(404).json({ error: 'Layout not found' });
        }
        
        res.json({ success: true, layout });
        
    } catch (error) {
        console.error('❌ Error loading layout:', error);
        res.status(500).json({ error: 'Failed to load layout' });
    }
});

// DELETE /api/opcua/admin/layouts/:layoutId - Delete layout
app.delete('/api/opcua/admin/layouts/:layoutId', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { layoutId } = req.params;
        const db = mongoClient.db(dbName);
        
        await db.collection('opcua_layouts').deleteOne({ layoutId });
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Error deleting layout:', error);
        res.status(500).json({ error: 'Failed to delete layout' });
    }
});

// POST /api/opcua/admin/layouts/:layoutId/images - Upload images for layout
app.post('/api/opcua/admin/layouts/:layoutId/images', validateAdminUser, upload.array('images', 10), async (req, res) => {
    try {
        const { dbName } = req;
        const { layoutId } = req.params;
        const files = req.files;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }
        
        const companyName = dbName;
        const downloadToken = crypto.randomBytes(16).toString('hex');
        const uploadedImages = [];
        
        for (const file of files) {
            const timestamp = Date.now();
            const fileName = `${timestamp}_${file.originalname}`;
            const filePath = `layouts/${companyName}/${layoutId}/${fileName}`;
            
            const bucket = admin.storage().bucket();
            const firebaseFile = bucket.file(filePath);
            
            await firebaseFile.save(file.buffer, {
                metadata: {
                    contentType: file.mimetype,
                    metadata: {
                        firebaseStorageDownloadTokens: downloadToken
                    }
                }
            });
            
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
            
            uploadedImages.push({
                id: `img-${timestamp}`,
                name: file.originalname,
                url: publicUrl,
                path: filePath,
                uploadedAt: new Date().toISOString()
            });
        }
        
        console.log(`✅ Uploaded ${uploadedImages.length} images for layout ${layoutId}`);
        res.json({ success: true, images: uploadedImages });
        
    } catch (error) {
        console.error('❌ Error uploading images:', error);
        res.status(500).json({ error: 'Failed to upload images', details: error.message });
    }
});

// GET /api/opcua/admin/layouts/:layoutId/images - Get all images for layout
app.get('/api/opcua/admin/layouts/:layoutId/images', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { layoutId } = req.params;
        const companyName = dbName;
        
        const bucket = admin.storage().bucket();
        const prefix = `layouts/${companyName}/${layoutId}/`;
        
        const [files] = await bucket.getFiles({ prefix });
        
        const images = files.map(file => {
            const metadata = file.metadata;
            const token = metadata.metadata?.firebaseStorageDownloadTokens || '';
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
            
            return {
                id: `img-${file.metadata.timeCreated}`,
                name: file.name.split('/').pop(),
                url: publicUrl,
                path: file.name,
                uploadedAt: file.metadata.timeCreated
            };
        });
        
        res.json({ success: true, images });
        
    } catch (error) {
        console.error('❌ Error loading images:', error);
        res.status(500).json({ error: 'Failed to load images', details: error.message });
    }
});

// DELETE /api/opcua/admin/layouts/:layoutId/images/:imagePath - Delete specific image
app.delete('/api/opcua/admin/layouts/:layoutId/images/*', validateAdminUser, async (req, res) => {
    try {
        const { dbName } = req;
        const { layoutId } = req.params;
        const imagePath = req.params[0]; // Get the wildcard path
        const companyName = dbName;
        
        // Reconstruct full path
        const fullPath = `layouts/${companyName}/${layoutId}/${imagePath}`;
        
        const bucket = admin.storage().bucket();
        const file = bucket.file(fullPath);
        
        // Verify file exists and belongs to the correct layout
        const [exists] = await file.exists();
        if (!exists) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        // Delete the file
        await file.delete();
        
        console.log(`🗑️ Deleted image: ${fullPath}`);
        res.json({ success: true, message: 'Image deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image', details: error.message });
    }
});

// ==========================================
// OPC MANAGEMENT API - Data Conversions & Variables
// ==========================================

// GET /api/opcua/raspberries - Get all Raspberry Pis for company (for OPC Management page)
app.get('/api/opcua/raspberries', async (req, res) => {
    try {
        const { company } = req.query;
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        const db = mongoClient.db(company);
        const raspberries = await db.collection('opcua_raspberries').find({}).toArray();
        
        res.json({ success: true, raspberries });
    } catch (error) {
        console.error('❌ Error loading raspberries:', error);
        res.status(500).json({ error: 'Failed to load raspberries' });
    }
});

// GET /api/opcua/realtime-data/:raspberryId - Get current real-time data for a Raspberry Pi
app.get('/api/opcua/realtime-data/:raspberryId', async (req, res) => {
    try {
        const { raspberryId } = req.params;
        const { company } = req.query || 'sasaki';
        
        const db = mongoClient.db(company);
        
        // Get latest data for this Raspberry Pi
        const latestData = await db.collection('opcua_data')
            .find({ raspberryId })
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();
        
        if (latestData.length === 0) {
            return res.json({ 
                success: true, 
                raspberryId, 
                datapoints: [],
                message: 'No data available yet' 
            });
        }
        
        // Get datapoint configurations with names
        const datapoints = await db.collection('opcua_datapoints')
            .find({ raspberryId })
            .toArray();
        
        // Merge data with datapoint info
        const dataWithNames = latestData[0].data.map(d => {
            const dpConfig = datapoints.find(dp => dp._id.toString() === d.datapointId || dp.opcNodeId === d.opcNodeId);
            return {
                ...d,
                name: dpConfig?.name || d.opcNodeId,
                _id: d.datapointId
            };
        });
        
        res.json({
            success: true,
            raspberryId,
            timestamp: latestData[0].timestamp,
            datapoints: dataWithNames
        });
        
    } catch (error) {
        console.error('❌ Error loading real-time data:', error);
        res.status(500).json({ error: 'Failed to load real-time data' });
    }
});

// POST /api/opcua/conversions - Create a new data conversion/variable
app.post('/api/opcua/conversions', async (req, res) => {
    try {
        const { company, variableName, sourceType, datapointId, arrayIndex, conversionType, sourceVariables, operation, createdBy } = req.body;
        
        if (!company || !variableName) {
            return res.status(400).json({ error: 'Company and variableName are required' });
        }
        
        const db = mongoClient.db(company);
        
        // Check if variable name already exists
        const existing = await db.collection('opcua_conversions').findOne({ variableName });
        if (existing) {
            return res.status(400).json({ error: 'Variable name already exists' });
        }
        
        const conversion = {
            company,
            variableName,
            sourceType, // 'array', 'single', or 'combined'
            datapointId: datapointId || null,
            arrayIndex: arrayIndex !== undefined ? arrayIndex : null,
            conversionType: conversionType || null,
            sourceVariables: sourceVariables || [], // for combined variables
            operation: operation || null, // for combined variables
            createdBy: createdBy || 'admin',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await db.collection('opcua_conversions').insertOne(conversion);
        
        console.log(`✅ Created variable: ${variableName} (${sourceType})`);
        res.json({ success: true, conversionId: result.insertedId, conversion });
        
    } catch (error) {
        console.error('❌ Error creating conversion:', error);
        res.status(500).json({ error: 'Failed to create conversion' });
    }
});

// GET /api/opcua/conversions - Get all conversions/variables for company
app.get('/api/opcua/conversions', async (req, res) => {
    try {
        const { company } = req.query;
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        const db = mongoClient.db(company);
        const conversions = await db.collection('opcua_conversions').find({}).toArray();
        
        // Enrich with datapoint names
        for (const conv of conversions) {
            if (conv.datapointId) {
                const datapoint = await db.collection('opcua_datapoints').findOne({ _id: new ObjectId(conv.datapointId) });
                if (datapoint) {
                    conv.datapointName = datapoint.name || datapoint.opcNodeId;
                }
            }
        }
        
        res.json({ success: true, conversions });
        
    } catch (error) {
        console.error('❌ Error loading conversions:', error);
        res.status(500).json({ error: 'Failed to load conversions' });
    }
});

// PUT /api/opcua/conversions/:id - Update a conversion/variable
app.put('/api/opcua/conversions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { variableName, conversionType } = req.body;
        const { company } = req.query || { company: 'sasaki' };
        
        const db = mongoClient.db(company);
        
        const updateData = {
            updatedAt: new Date()
        };
        
        if (variableName) updateData.variableName = variableName;
        if (conversionType) updateData.conversionType = conversionType;
        
        const result = await db.collection('opcua_conversions').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Variable not found' });
        }
        
        console.log(`✅ Updated variable: ${id}`);
        res.json({ success: true, message: 'Variable updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating conversion:', error);
        res.status(500).json({ error: 'Failed to update conversion' });
    }
});

// DELETE /api/opcua/conversions/:id - Delete a conversion/variable
app.delete('/api/opcua/conversions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { company } = req.query || { company: 'sasaki' };
        
        const db = mongoClient.db(company);
        
        // Check if variable is used in any combined variables
        const usedIn = await db.collection('opcua_conversions').find({
            sourceType: 'combined',
            sourceVariables: { $exists: true }
        }).toArray();
        
        const variable = await db.collection('opcua_conversions').findOne({ _id: new ObjectId(id) });
        if (variable) {
            const usages = usedIn.filter(cv => cv.sourceVariables && cv.sourceVariables.includes(variable.variableName));
            if (usages.length > 0) {
                return res.status(400).json({ 
                    error: 'Variable is used in combined variables', 
                    usedIn: usages.map(u => u.variableName) 
                });
            }
        }
        
        const result = await db.collection('opcua_conversions').deleteOne({ _id: new ObjectId(id) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Variable not found' });
        }
        
        console.log(`🗑️ Deleted variable: ${id}`);
        res.json({ success: true, message: 'Variable deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting conversion:', error);
        res.status(500).json({ error: 'Failed to delete conversion' });
    }
});

// ==========================================
// MONITOR ENDPOINTS
// ==========================================

// GET /monitor/layout/:layoutId - Serve layout renderer HTML
app.get('/monitor/layout/:layoutId', (req, res) => {
    res.sendFile(__dirname + '/public/layout-renderer.html');
});

// GET /api/layout/:layoutId - Get layout data (no auth required for monitor view)
app.get('/api/layout/:layoutId', async (req, res) => {
    try {
        if (!mongoClient) {
            return res.status(503).json({ success: false, error: 'Database not connected' });
        }
        
        const { layoutId } = req.params;
        
        console.log(`🔍 Looking for layout: ${layoutId}`);
        
        // Try to find layout in any company database
        // First, get all company databases
        const masterDB = mongoClient.db(DB_NAME);
        const companies = await masterDB.collection(COLLECTION_NAME)
            .find({ dbName: { $exists: true, $ne: null } })
            .project({ dbName: 1 })
            .toArray();
        
        console.log(`📚 Searching in ${companies.length} company databases`);
        
        let layout = null;
        
        for (const company of companies) {
            if (!company.dbName) continue;
            
            try {
                const db = mongoClient.db(company.dbName);
                layout = await db.collection('opcua_layouts').findOne({ layoutId });
                if (layout) {
                    console.log(`✅ Found layout in database: ${company.dbName}`);
                    break;
                }
            } catch (dbError) {
                console.error(`Error searching in ${company.dbName}:`, dbError.message);
            }
        }
        
        if (!layout) {
            console.log(`❌ Layout not found: ${layoutId}`);
            return res.status(404).json({ success: false, error: 'Layout not found' });
        }
        
        res.json({ success: true, layout });
        
    } catch (error) {
        console.error('❌ Error loading layout:', error);
        res.status(500).json({ success: false, error: 'Failed to load layout', details: error.message });
    }
});

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

// ==========================================
// CUSTOMER USER MANAGEMENT ROUTES
// ==========================================

// Get all users for a customer database
app.post("/customerGetUsers", async (req, res) => {
  const { dbName, role } = req.body;
  console.log("Received request to get users:", { dbName, role });

  if (!dbName) {
    return res.status(400).json({ error: "Missing dbName" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }
    
    const db = mongoClient.db(dbName);
    const users = db.collection("users");

    const result = await users.find({}, { projection: { password: 0 } }).toArray();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new user in customer database
app.post("/customerCreateUser", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    username,
    password,
    role,
    dbName,
    creatorRole
  } = req.body;

  if (!firstName || !lastName || !email || !username || !password || !role || !dbName || !creatorRole) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(creatorRole)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const customerDB = mongoClient.db(dbName);
    const masterDB = mongoClient.db(DB_NAME);

    const users = customerDB.collection("users");
    const masterUsers = masterDB.collection(COLLECTION_NAME);

    // 1. Check in customer DB
    const existingInCustomer = await users.findOne({ username: normalizedUsername });
    if (existingInCustomer) {
      return res.status(400).json({ error: "Username already exists in this customer database" });
    }

    // 2. Check in masterUsers (username or subUsernames)
    const conflictInMaster = await masterUsers.findOne({
      $or: [
        { username: normalizedUsername },
        { subUsernames: normalizedUsername }
      ]
    });
    if (conflictInMaster) {
      return res.status(400).json({ error: "Username already exists in a master account" });
    }

    // 3. Check across all other customer DBs
    const dbs = await mongoClient.db().admin().listDatabases();
    for (const db of dbs.databases) {
      if (["admin", "local", "config", DB_NAME, dbName].includes(db.name)) continue;
      const userCol = mongoClient.db(db.name).collection("users");
      const existsElsewhere = await userCol.findOne({ username: normalizedUsername });
      if (existsElsewhere) {
        return res.status(400).json({ error: "Username already exists in another customer company" });
      }
    }

    // 4. Insert user in customer DB
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({
      firstName,
      lastName,
      email,
      username: normalizedUsername,
      password: hashedPassword,
      role,
      createdAt: new Date()
    });

    // 5. Track sub-user in masterUsers
    await masterUsers.updateOne(
      { dbName },
      { $addToSet: { subUsernames: normalizedUsername } }
    );

    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating customer user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user or record in customer database
app.post("/customerUpdateRecord", async (req, res) => {
  const { recordId, updateData, dbName, collectionName, role, username } = req.body;

  if (!recordId || !updateData || !dbName || !collectionName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.updateOne(
      { _id: new ObjectId(recordId) },
      { $set: updateData }
    );

    res.status(200).json({
      message: `Record updated in ${collectionName}`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error updating record:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete user from customer database
app.post("/customerDeleteUser", async (req, res) => {
  const { recordId, dbName, role, username } = req.body;

  if (!recordId || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const customerDB = mongoClient.db(dbName);
    const masterDB = mongoClient.db(DB_NAME);
    
    const users = customerDB.collection("users");
    const masterUsers = masterDB.collection(COLLECTION_NAME);

    // 1. Get the user to be deleted first to get their username
    const userToDelete = await users.findOne({ _id: new ObjectId(recordId) });
    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }

    // 2. Delete user from customer database
    const result = await users.deleteOne({ _id: new ObjectId(recordId) });

    // 3. Remove username from subUsernames in master database
    if (result.deletedCount > 0) {
      await masterUsers.updateOne(
        { dbName },
        { $pull: { subUsernames: userToDelete.username } }
      );
    }

    res.status(200).json({
      message: "User record deleted",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset user password
app.post("/customerResetUserPassword", async (req, res) => {
  const { userId, newPassword, dbName, role, username } = req.body;

  if (!userId || !newPassword || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const users = db.collection("users");

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password: hashedPassword } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (result.modifiedCount === 0) {
      return res.status(200).json({ message: "Password is the same as the old one, no update needed." });
    }

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Error resetting customer user password:", err);
    res.status(500).json({ error: "Internal server error during password reset." });
  }
});

// ==========================================
// END CUSTOMER USER MANAGEMENT ROUTES
// ==========================================

// ==========================================
// MASTER DB ROUTES
// ==========================================

// Get Master DB records
app.post("/getMasterDB", async (req, res) => {
  const { dbName, role } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const masterDB = db.collection("masterDB");

    const records = await masterDB.find({}).toArray();
    res.json(records);
  } catch (err) {
    console.error("Error fetching masterDB:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create Master DB record with image upload
app.post("/createMasterRecord", async (req, res) => {
  const { dbName, username, imageBase64, ...recordData } = req.body;

  if (!dbName || !username) {
    return res.status(400).json({ error: "dbName and username required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const masterDB = db.collection("masterDB");

    // Handle image upload to Firebase if provided
    let imageURL = null;
    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${recordData.品番 || 'unknown'}_${timestamp}.jpg`;
      const filePath = `${dbName}/masterImages/${fileName}`;
      const file = admin.storage().bucket().file(filePath);
      const downloadToken = crypto.randomBytes(16).toString('hex');

      await file.save(buffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken
          }
        }
      });

      imageURL = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
    }

    const newRecord = {
      ...recordData,
      imageURL,
      changeHistory: [{
        timestamp: new Date(),
        changedBy: username,
        action: "新規作成",
        changes: [{ field: "全体", oldValue: "(なし)", newValue: "新規レコード作成" }]
      }],
      createdAt: new Date(),
      createdBy: username
    };

    const result = await masterDB.insertOne(newRecord);
    res.json({ message: "Record created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating master record:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update Master DB record
app.post("/updateMasterRecord", async (req, res) => {
  const { recordId, updateData, dbName, username } = req.body;

  if (!recordId || !dbName || !username) {
    return res.status(400).json({ error: "recordId, dbName, username required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const masterDB = db.collection("masterDB");

    // Get old record for change history
    const oldRecord = await masterDB.findOne({ _id: new ObjectId(recordId) });
    if (!oldRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    // Build change history
    const changes = [];
    for (const [key, newValue] of Object.entries(updateData)) {
      const oldValue = oldRecord[key];
      if (oldValue !== newValue) {
        changes.push({ field: key, oldValue: oldValue || "(なし)", newValue });
      }
    }

    const historyEntry = {
      timestamp: new Date(),
      changedBy: username,
      action: "更新",
      changes
    };

    const result = await masterDB.updateOne(
      { _id: new ObjectId(recordId) },
      { 
        $set: updateData,
        $push: { changeHistory: historyEntry }
      }
    );

    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating master record:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete Master DB record
app.post("/deleteMasterRecord", async (req, res) => {
  const { recordId, dbName, username } = req.body;

  if (!recordId || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const masterDB = db.collection("masterDB");

    const result = await masterDB.deleteOne({ _id: new ObjectId(recordId) });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting master record:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================
// FACTORY ROUTES
// ==========================================

// Get all factories
app.post("/getFactories", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const factories = db.collection("factory");

    const result = await factories.find({}).toArray();
    res.json(result);
  } catch (err) {
    console.error("Error fetching factories:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create factory
app.post("/createFactory", async (req, res) => {
  const { dbName, ...factoryData } = req.body;

  if (!dbName || !factoryData.name) {
    return res.status(400).json({ error: "dbName and name required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const factories = db.collection("factory");

    const result = await factories.insertOne({
      ...factoryData,
      createdAt: new Date()
    });

    res.json({ message: "Factory created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating factory:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update factory
app.post("/updateFactory", async (req, res) => {
  const { factoryId, updateData, dbName } = req.body;

  if (!factoryId || !dbName) {
    return res.status(400).json({ error: "factoryId and dbName required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const factories = db.collection("factory");

    const result = await factories.updateOne(
      { _id: new ObjectId(factoryId) },
      { $set: updateData }
    );

    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating factory:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete factory
app.post("/deleteFactory", async (req, res) => {
  const { factoryId, dbName } = req.body;

  if (!factoryId || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const factories = db.collection("factory");

    const result = await factories.deleteOne({ _id: new ObjectId(factoryId) });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting factory:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add division to factory
app.post("/addDivision", async (req, res) => {
  const { factoryId, division, dbName } = req.body;

  if (!factoryId || !division || !dbName) {
    return res.status(400).json({ error: "factoryId, division, dbName required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const factories = db.collection("factory");

    const result = await factories.updateOne(
      { _id: new ObjectId(factoryId) },
      { $push: { divisions: division } }
    );

    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error adding division:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete division from factory
app.post("/deleteDivision", async (req, res) => {
  const { factoryId, divisionIndex, dbName } = req.body;

  if (factoryId === undefined || divisionIndex === undefined || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const factories = db.collection("factory");

    // Get the factory first
    const factory = await factories.findOne({ _id: new ObjectId(factoryId) });
    if (!factory || !factory.divisions) {
      return res.status(404).json({ error: "Factory or divisions not found" });
    }

    // Remove division at index
    factory.divisions.splice(divisionIndex, 1);

    const result = await factories.updateOne(
      { _id: new ObjectId(factoryId) },
      { $set: { divisions: factory.divisions } }
    );

    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error deleting division:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================
// EQUIPMENT ROUTES
// ==========================================

// Get all equipment
app.post("/getEquipment", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const equipment = db.collection("equipment");

    const result = await equipment.find({}).toArray();
    res.json(result);
  } catch (err) {
    console.error("Error fetching equipment:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create equipment
app.post("/createEquipment", async (req, res) => {
  const { dbName, ...equipmentData } = req.body;

  if (!dbName || !equipmentData.設備名) {
    return res.status(400).json({ error: "dbName and 設備名 required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const equipment = db.collection("equipment");

    const result = await equipment.insertOne({
      ...equipmentData,
      createdAt: new Date()
    });

    res.json({ message: "Equipment created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating equipment:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update equipment
app.post("/updateEquipment", async (req, res) => {
  const { equipmentId, updateData, dbName } = req.body;

  if (!equipmentId || !dbName) {
    return res.status(400).json({ error: "equipmentId and dbName required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const equipment = db.collection("equipment");

    const result = await equipment.updateOne(
      { _id: new ObjectId(equipmentId) },
      { $set: updateData }
    );

    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating equipment:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete equipment
app.post("/deleteEquipment", async (req, res) => {
  const { equipmentId, dbName } = req.body;

  if (!equipmentId || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const equipment = db.collection("equipment");

    const result = await equipment.deleteOne({ _id: new ObjectId(equipmentId) });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting equipment:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================
// ROLES ROUTES
// ==========================================

// Get all roles
app.post("/getRoles", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const roles = db.collection("roles");

    const result = await roles.find({}).toArray();
    res.json(result);
  } catch (err) {
    console.error("Error fetching roles:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create role
app.post("/createRole", async (req, res) => {
  const { dbName, ...roleData } = req.body;

  if (!dbName || !roleData.roleName) {
    return res.status(400).json({ error: "dbName and roleName required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const roles = db.collection("roles");

    // Check if role already exists
    const existing = await roles.findOne({ roleName: roleData.roleName });
    if (existing) {
      return res.status(400).json({ error: "Role already exists" });
    }

    const result = await roles.insertOne({
      ...roleData,
      createdAt: new Date()
    });

    res.json({ message: "Role created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating role:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete role
app.post("/deleteRole", async (req, res) => {
  const { roleId, dbName } = req.body;

  if (!roleId || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const roles = db.collection("roles");

    const result = await roles.deleteOne({ _id: new ObjectId(roleId) });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting role:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================
// Activity Logs Routes
// ====================

// Get activity logs for a collection
app.post("/getActivityLogs", async (req, res) => {
  const { dbName, collection } = req.body;

  if (!dbName || !collection) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const activityLogs = db.collection("activityLogs");

    const logs = await activityLogs.find({ collection })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    res.json(logs);
  } catch (err) {
    console.error("Error fetching activity logs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create activity log entry
app.post("/createActivityLog", async (req, res) => {
  const { dbName, collection, action, performedBy, recordsAffected, recordIds } = req.body;

  if (!dbName || !collection || !action) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const activityLogs = db.collection("activityLogs");

    await activityLogs.insertOne({
      collection,
      action, // 'create' or 'delete'
      performedBy: performedBy || 'Unknown',
      recordsAffected: recordsAffected || 1,
      recordIds: recordIds || [],
      timestamp: new Date(),
      ip: req.ip
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error creating activity log:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================
// Bulk Delete Routes
// ====================

// Bulk delete master records
app.post("/deleteMultipleMasterRecords", async (req, res) => {
  const { ids, dbName, username } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0 || !dbName) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const collection = db.collection("masterDB");

    const result = await collection.deleteMany({
      _id: { $in: ids.map(id => new ObjectId(id)) }
    });

    // Log to activity logs
    await db.collection("activityLogs").insertOne({
      collection: 'masterDB',
      action: 'delete',
      performedBy: username || 'Unknown',
      recordsAffected: result.deletedCount,
      recordIds: ids,
      timestamp: new Date(),
      ip: req.ip
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting multiple master records:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk delete factories
app.post("/deleteMultipleFactories", async (req, res) => {
  const { ids, dbName, username } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0 || !dbName) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const collection = db.collection("factory");

    const result = await collection.deleteMany({
      _id: { $in: ids.map(id => new ObjectId(id)) }
    });

    // Log to activity logs
    await db.collection("activityLogs").insertOne({
      collection: 'factory',
      action: 'delete',
      performedBy: username || 'Unknown',
      recordsAffected: result.deletedCount,
      recordIds: ids,
      timestamp: new Date(),
      ip: req.ip
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting multiple factories:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk delete equipment
app.post("/deleteMultipleEquipment", async (req, res) => {
  const { ids, dbName, username } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0 || !dbName) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const collection = db.collection("equipment");

    const result = await collection.deleteMany({
      _id: { $in: ids.map(id => new ObjectId(id)) }
    });

    // Log to activity logs
    await db.collection("activityLogs").insertOne({
      collection: 'equipment',
      action: 'delete',
      performedBy: username || 'Unknown',
      recordsAffected: result.deletedCount,
      recordIds: ids,
      timestamp: new Date(),
      ip: req.ip
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting multiple equipment:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk delete roles
app.post("/deleteMultipleRoles", async (req, res) => {
  const { ids, dbName, username } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0 || !dbName) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const collection = db.collection("roles");

    const result = await collection.deleteMany({
      _id: { $in: ids.map(id => new ObjectId(id)) }
    });

    // Log to activity logs
    await db.collection("activityLogs").insertOne({
      collection: 'roles',
      action: 'delete',
      performedBy: username || 'Unknown',
      recordsAffected: result.deletedCount,
      recordIds: ids,
      timestamp: new Date(),
      ip: req.ip
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting multiple roles:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================
// END MASTER DB ROUTES
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
