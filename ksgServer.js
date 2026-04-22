const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const {
    DEFAULT_HEADER_ROW,
    hasGoogleServiceAccountCredentials,
    getGoogleServiceAccountEmail,
    buildExpectedFields,
    analyzeSheetTarget,
    appendSubmissionToSheet,
    inspectSpreadsheet,
} = require('./src/googleSheetsService');

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

// Make Socket.IO instance available to routes
app.set('socketio', io);

function getAdminDashboardRoomName(dbName = 'KSG') {
    const normalizedDbName = String(dbName || 'KSG').trim() || 'KSG';
    return `admin_dashboard_${normalizedDbName}`;
}

function emitAdminDashboardRefresh(dbName = 'KSG', update = {}) {
    const normalizedDbName = String(dbName || 'KSG').trim() || 'KSG';

    io.to(getAdminDashboardRoomName(normalizedDbName)).emit('admin_dashboard_update', {
        dbName: normalizedDbName,
        reason: String(update.reason || 'dashboard-data-changed').trim() || 'dashboard-data-changed',
        source: String(update.source || 'server').trim() || 'server',
        timestamp: update.timestamp || new Date().toISOString(),
        ...update
    });
}

app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Enable CORS for all origins (development mode)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Device-ID, X-Tablet-Name, X-Session-User, X-Session-Role, X-Session-DB-Name, Authorization');
    
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
const GOOGLE_SHEET_TARGETS_COLLECTION = 'googleSheetTargets';

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

function normalizeGoogleSheetString(value = '') {
    return String(value ?? '').trim();
}

function normalizeGoogleSheetObjectIdString(value = '') {
    const normalized = normalizeGoogleSheetString(value);
    return ObjectId.isValid(normalized) ? normalized : '';
}

function normalizeGoogleSheetStringList(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values])
        .map(normalizeGoogleSheetString)
        .filter(Boolean))];
}

function normalizeGoogleSheetFieldMappings(values = []) {
    return (Array.isArray(values) ? values : [])
        .map(mapping => ({
            fieldKey: normalizeGoogleSheetString(mapping?.fieldKey),
            headerName: normalizeGoogleSheetString(mapping?.headerName),
            action: mapping?.action === 'map' ? 'map' : 'create',
        }))
        .filter(mapping => mapping.fieldKey && mapping.headerName);
}

async function logGoogleSheetTargetActivity(db, username, action, details) {
    try {
        await db.collection('activityLogs').insertOne({
            collection: GOOGLE_SHEET_TARGETS_COLLECTION,
            action,
            timestamp: new Date(),
            user: username,
            details,
        });
    } catch (error) {
        console.warn('⚠️ Failed to log Google Sheet target activity:', error.message);
    }
}

async function resolveGoogleSheetTargetProducts(db, masterRecordIds = []) {
    const normalizedIds = normalizeGoogleSheetStringList(masterRecordIds)
        .filter(id => ObjectId.isValid(id));

    if (normalizedIds.length === 0) {
        return [];
    }

    const records = await db.collection('masterDB').find(
        { _id: { $in: normalizedIds.map(id => new ObjectId(id)) } },
        { projection: { 品番: 1, 製品名: 1, kanbanID: 1, ngGroupId: 1 } }
    ).toArray();

    const recordMap = new Map(records.map(record => [String(record._id), record]));
    return normalizedIds.map(id => recordMap.get(id)).filter(Boolean);
}

function buildGoogleSheetTargetProductSnapshots(records = []) {
    return records.map(record => ({
        recordId: String(record._id),
        hinban: normalizeGoogleSheetString(record.品番),
        productName: normalizeGoogleSheetString(record.製品名),
        kanbanId: normalizeGoogleSheetString(record.kanbanID),
        ngGroupId: normalizeGoogleSheetObjectIdString(record.ngGroupId),
    }));
}

function deriveGoogleSheetNgGroupIdFromProducts(records = []) {
    const uniqueGroupIds = [...new Set(records
        .map(record => normalizeGoogleSheetObjectIdString(record.ngGroupId))
        .filter(Boolean))];

    if (uniqueGroupIds.length !== 1) {
        const error = new Error('Selected products must belong to exactly one defect group');
        error.statusCode = 400;
        throw error;
    }

    return uniqueGroupIds[0];
}

async function resolveGoogleSheetNgGroup(db, ngGroupId = '') {
    const normalizedNgGroupId = normalizeGoogleSheetObjectIdString(ngGroupId);
    if (!normalizedNgGroupId) {
        return null;
    }

    return db.collection('ngGroups').findOne({ _id: new ObjectId(normalizedNgGroupId) });
}

function buildResolvedGoogleSheetFieldMappings(analysisFields = [], requestedMappings = [], existingHeaders = []) {
    const requestedMap = new Map(
        normalizeGoogleSheetFieldMappings(requestedMappings).map(mapping => [mapping.fieldKey, mapping])
    );
    const existingHeaderSet = new Set(existingHeaders.map(header => normalizeGoogleSheetString(header)));
    const usedHeaderNames = new Set();

    return analysisFields.map(field => {
        const requested = requestedMap.get(field.fieldKey);
        let headerName = normalizeGoogleSheetString(requested?.headerName || field.headerName || field.fieldLabel);
        let action = requested?.action || (field.status === 'matched' ? 'map' : 'create');

        if (action === 'map' && !existingHeaderSet.has(headerName)) {
            const error = new Error(`Mapped header not found in sheet: ${headerName}`);
            error.statusCode = 400;
            throw error;
        }

        if (action === 'create' && existingHeaderSet.has(headerName)) {
            action = 'map';
        }

        if (!headerName) {
            headerName = field.fieldLabel;
        }

        if (usedHeaderNames.has(headerName)) {
            const error = new Error(`Header is assigned to multiple fields: ${headerName}`);
            error.statusCode = 400;
            throw error;
        }

        usedHeaderNames.add(headerName);

        return {
            fieldKey: field.fieldKey,
            fieldLabel: field.fieldLabel,
            kind: field.kind,
            countUp: field.countUp !== false,
            headerName,
            action,
        };
    });
}

async function resolveTabletSubmissionMasterRecord(db, submissionData = {}) {
    const masterRecordId = normalizeGoogleSheetObjectIdString(submissionData.masterRecordId || submissionData.master_record_id);
    if (masterRecordId) {
        const record = await db.collection('masterDB').findOne({ _id: new ObjectId(masterRecordId) });
        if (record) {
            return record;
        }
    }

    const kanbanId = normalizeGoogleSheetString(submissionData.kanbanID || submissionData.kanban_id);
    if (kanbanId) {
        const record = await db.collection('masterDB').findOne({ kanbanID: kanbanId });
        if (record) {
            return record;
        }
    }

    const hinban = normalizeGoogleSheetString(submissionData.品番 || submissionData.hinban);
    if (hinban) {
        return db.collection('masterDB').findOne({ 品番: hinban });
    }

    return null;
}

function resolveSubmissionNonCountUpDefectKeys(submissionData = {}, ngGroup = null) {
    const requestedKeys = normalizeGoogleSheetStringList(submissionData.nonCountUpDefectKeys);
    if (requestedKeys.length > 0) {
        return requestedKeys;
    }

    return Array.isArray(ngGroup?.items)
        ? ngGroup.items
                .filter(item => item?.countUp === false)
                .map(item => normalizeGoogleSheetString(item?.name))
                .filter(Boolean)
        : [];
}

async function submitTabletDataToRegisteredGoogleSheets(db, submission = {}) {
    if (!hasGoogleServiceAccountCredentials()) {
        return [{ success: false, skipped: true, error: 'Google service account credentials are not configured' }];
    }

    const masterRecordId = normalizeGoogleSheetString(submission.master_record_id);
    const ngGroupId = normalizeGoogleSheetString(submission.ng_group_id);
    if (!masterRecordId && !ngGroupId) {
        return [];
    }

    const query = { isActive: { $ne: false } };
    if (masterRecordId) {
        query.masterRecordIds = masterRecordId;
    } else {
        query.ngGroupId = ngGroupId;
    }

    const targets = await db.collection(GOOGLE_SHEET_TARGETS_COLLECTION).find(query).toArray();
    if (targets.length === 0) {
        return [];
    }

    const ngGroupCache = new Map();
    const results = [];

    for (const target of targets) {
        try {
            const targetNgGroupId = normalizeGoogleSheetObjectIdString(target.ngGroupId || submission.ng_group_id);
            let ngGroup = ngGroupCache.get(targetNgGroupId);
            if (!ngGroup && targetNgGroupId) {
                ngGroup = await resolveGoogleSheetNgGroup(db, targetNgGroupId);
                ngGroupCache.set(targetNgGroupId, ngGroup || null);
            }

            const expectedFields = buildExpectedFields({ ngGroup });
            const appendResult = await appendSubmissionToSheet({
                spreadsheetId: target.spreadsheetId,
                sheetName: target.sheetName,
                expectedFields,
                fieldMappings: target.fieldMappings,
                submission,
                headerRow: Number(target.headerRow) || DEFAULT_HEADER_ROW,
            });

            await db.collection(GOOGLE_SHEET_TARGETS_COLLECTION).updateOne(
                { _id: target._id },
                {
                    $set: {
                        lastUsedAt: new Date(),
                        lastSyncStatus: 'success',
                        lastSyncError: '',
                    }
                }
            );

            results.push({
                success: true,
                targetId: String(target._id),
                label: target.label || `${target.spreadsheetTitle} / ${target.sheetName}`,
                sheetName: target.sheetName,
                spreadsheetTitle: target.spreadsheetTitle || '',
                ...appendResult,
            });
        } catch (error) {
            await db.collection(GOOGLE_SHEET_TARGETS_COLLECTION).updateOne(
                { _id: target._id },
                {
                    $set: {
                        lastUsedAt: new Date(),
                        lastSyncStatus: 'error',
                        lastSyncError: String(error.message || 'Unknown error'),
                    }
                }
            );

            results.push({
                success: false,
                targetId: String(target._id),
                label: target.label || `${target.spreadsheetTitle} / ${target.sheetName}`,
                sheetName: target.sheetName,
                spreadsheetTitle: target.spreadsheetTitle || '',
                error: String(error.message || 'Unknown error'),
            });
        }
    }

    return results;
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
        
        // Setup TTL index for event log collection (2-year retention)
        await setupEventLogTTLIndex();
        await setupSubmittedDBTrashIndexes();
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return false;
    }
}

async function setupSubmittedDBTrashIndexes() {
    try {
        if (!mongoClient) {
            console.log('⚠️  MongoDB not connected, skipping submittedDB trash index setup');
            return false;
        }

        console.log('🗑️ Setting up submittedDB trash indexes...');

        const db = mongoClient.db(DB_NAME);
        const masterUsers = await db.collection(COLLECTION_NAME).find({
            role: 'masterUser'
        }).project({ company: 1, dbName: 1 }).toArray();

        const targetDatabases = new Set(['KSG']);
        masterUsers.forEach(user => {
            const dbName = user.dbName || user.company;
            if (dbName) targetDatabases.add(dbName);
        });

        let configuredCount = 0;

        for (const dbName of targetDatabases) {
            try {
                const companyDb = mongoClient.db(dbName);
                const collection = companyDb.collection('submittedDB');

                await Promise.all([
                    collection.createIndex(
                        { trash_expires_at: 1 },
                        {
                            expireAfterSeconds: 0,
                            name: 'submitted_db_trash_ttl_idx',
                            background: true
                        }
                    ),
                    collection.createIndex(
                        { is_deleted: 1, timestamp: -1 },
                        {
                            name: 'submitted_db_deleted_timestamp_idx',
                            background: true
                        }
                    )
                ]);

                const trashDocs = await collection.find({
                    is_deleted: true,
                    $or: [
                        { trash_expires_at: { $exists: false } },
                        { trash_expires_at: null }
                    ]
                }).project({ _id: 1, deleted_at: 1, timestamp: 1 }).toArray();

                for (const doc of trashDocs) {
                    const baseDate = new Date(doc.deleted_at || doc.timestamp || Date.now());
                    if (Number.isNaN(baseDate.getTime())) {
                        continue;
                    }

                    const expiresAt = new Date(baseDate);
                    expiresAt.setMonth(expiresAt.getMonth() + 2);

                    await collection.updateOne(
                        { _id: doc._id },
                        { $set: { trash_expires_at: expiresAt } }
                    );
                }

                configuredCount += 1;
                console.log(`  ✓ submittedDB trash indexes ready for ${dbName}`);
            } catch (error) {
                if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                    console.log(`  ℹ️  submittedDB trash indexes already exist for ${dbName}`);
                } else {
                    console.error(`  ❌ Failed to configure submittedDB trash indexes for ${dbName}:`, error.message);
                }
            }
        }

        console.log(`✅ submittedDB trash index setup complete (${configuredCount} databases)`);
        return true;
    } catch (error) {
        console.error('❌ Failed to setup submittedDB trash indexes:', error.message);
        return false;
    }
}

// Setup TTL index for opcua_event_log collection (2-year retention)
async function setupEventLogTTLIndex() {
    try {
        if (!mongoClient) {
            console.log('⚠️  MongoDB not connected, skipping TTL index setup');
            return false;
        }
        
        console.log('🔧 Setting up TTL index for opcua_event_log...');
        
        const db = mongoClient.db(DB_NAME);
        const masterUsers = await db.collection(COLLECTION_NAME).find({ 
            role: "masterUser" 
        }).toArray();
        
        let indexCount = 0;
        
        for (const user of masterUsers) {
            try {
                const userDb = mongoClient.db(user.dbName);
                const eventLogCollection = userDb.collection('opcua_event_log');
                
                // Create TTL index: documents expire after 2 years (63072000 seconds)
                await eventLogCollection.createIndex(
                    { timestamp: 1 }, 
                    { 
                        expireAfterSeconds: 63072000,  // 2 years
                        name: 'event_log_ttl_idx',
                        background: true
                    }
                );
                
                indexCount++;
                console.log(`  ✓ TTL index created for ${user.dbName}`);
                
            } catch (error) {
                // Index might already exist, that's okay
                if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                    console.log(`  ℹ️  TTL index already exists for ${user.dbName}`);
                } else {
                    console.error(`  ❌ Failed to create index for ${user.dbName}:`, error.message);
                }
            }
        }
        
        console.log(`✅ Event log TTL index setup complete (${indexCount} databases)`);
        return true;
        
    } catch (error) {
        console.error('❌ Failed to setup event log TTL index:', error.message);
        return false;
    }
}

// Setup indexes for OPC Management query performance
async function setupOpcManagementIndexes() {
    try {
        if (!mongoClient) {
            console.log('⚠️  MongoDB not connected, skipping OPC Management index setup');
            return false;
        }

        console.log('🔧 Setting up OPC Management indexes...');

        const db = mongoClient.db(DB_NAME);
        const masterUsers = await db.collection(COLLECTION_NAME).find({
            role: 'masterUser'
        }).project({ company: 1, dbName: 1 }).toArray();

        const targetDatabases = new Set();
        masterUsers.forEach(user => {
            const dbName = user.company || user.dbName;
            if (dbName) targetDatabases.add(dbName);
        });

        let configuredCount = 0;

        for (const dbName of targetDatabases) {
            try {
                const userDb = mongoClient.db(dbName);

                await Promise.all([
                    userDb.collection('deviceInfo').createIndex(
                        { device_id: 1 },
                        { name: 'device_id_idx', background: true }
                    ),
                    userDb.collection('opcua_discovered_nodes').createIndex(
                        { raspberryId: 1, opcNodeId: 1 },
                        { name: 'discovered_node_lookup_idx', background: true }
                    ),
                    userDb.collection('opcua_datapoints').createIndex(
                        { raspberryId: 1, opcNodeId: 1 },
                        { name: 'datapoint_node_lookup_idx', background: true }
                    ),
                    userDb.collection('opcua_conversions').createIndex(
                        { company: 1, variableName: 1 },
                        { name: 'conversion_company_var_idx', background: true }
                    ),
                    userDb.collection('opcua_conversions').createIndex(
                        { raspberryId: 1, opcNodeId: 1 },
                        { name: 'conversion_source_idx', background: true }
                    )
                ]);

                configuredCount++;
                console.log(`  ✓ OPC indexes ready for ${dbName}`);
            } catch (error) {
                if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                    console.log(`  ℹ️  OPC indexes already exist/conflict for ${dbName}`);
                } else {
                    console.error(`  ❌ Failed to create OPC indexes for ${dbName}:`, error.message);
                }
            }
        }

        console.log(`✅ OPC Management index setup complete (${configuredCount} databases)`);
        return true;
    } catch (error) {
        console.error('❌ Failed to setup OPC Management indexes:', error.message);
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

function normalizeCsvValues(values) {
    if (Array.isArray(values)) {
        return values.map(value => String(value).trim()).filter(Boolean);
    }

    return [];
}

function normalizeUsername(value = '') {
    return String(value).trim().toLowerCase();
}

function userHasTabletAccess(user, tablet) {
    if (!user || !tablet) {
        return false;
    }

    const normalizedUsername = normalizeUsername(user.username);
    const authorizedUsers = Array.isArray(tablet.authorizedUsers)
        ? tablet.authorizedUsers.map(value => String(value).trim()).filter(Boolean)
        : [];

    console.log('🔍 Access Check Debug:');
    console.log('  User:', user.username);
    console.log('  User factories:', user.factories);
    console.log('  User equipment:', user.equipment);
    console.log('  Tablet:', tablet.tabletName);
    console.log('  Tablet factory:', tablet.factoryLocation);
    console.log('  Tablet equipment:', tablet.設備名);
    console.log('  Tablet authorizedUsers:', tablet.authorizedUsers);

    if (authorizedUsers.length > 0) {
        return authorizedUsers.includes(user._id.toString()) ||
            authorizedUsers.some(value => normalizeUsername(value) === normalizedUsername);
    }

    let userFactories = normalizeCsvValues(user.factories);
    let userEquipment = normalizeCsvValues(user.equipment);

    if (!userFactories.length && user.factory) {
        userFactories = String(user.factory).split(',').map(value => value.trim()).filter(Boolean);
    }

    console.log('  Parsed factories:', userFactories);
    console.log('  Parsed equipment:', userEquipment);

    const factoryMatch = userFactories.length > 0 && userFactories.includes(tablet.factoryLocation);
    const equipmentMatch = userEquipment.length > 0 && userEquipment.includes(tablet.設備名);

    console.log('  Factory match:', factoryMatch);
    console.log('  Equipment match:', equipmentMatch);

    if (userFactories.length > 0 && userEquipment.length > 0) {
        return factoryMatch && equipmentMatch;
    }

    if (userFactories.length > 0) {
        return factoryMatch;
    }

    if (userEquipment.length > 0) {
        return equipmentMatch;
    }

    return false;
}

async function resolveTabletForRequest(db, decoded, requestedTabletName = '') {
    const tablets = db.collection('tabletDB');
    const normalizedRequestedTabletName = String(requestedTabletName || '').trim();

    if (decoded.tabletId && ObjectId.isValid(decoded.tabletId)) {
        const tabletById = await tablets.findOne({ _id: new ObjectId(decoded.tabletId) });
        if (tabletById) {
            return tabletById;
        }
    }

    if (decoded.tabletName) {
        const tabletByName = await tablets.findOne({ tabletName: decoded.tabletName });
        if (tabletByName) {
            return tabletByName;
        }
    }

    if (normalizedRequestedTabletName) {
        return tablets.findOne({ tabletName: normalizedRequestedTabletName });
    }

    return null;
}

// 🔐 Tablet Authentication Middleware
async function authenticateTablet(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const requestedTabletName = decodeURIComponent(String(req.headers['x-tablet-name'] || '').trim());
        
        // Get user from database to check current enable status
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const db = mongoClient.db(decoded.dbName || 'KSG');
        const user = await db.collection('users').findOne({ username: decoded.username });
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (user.enable !== 'enabled') {
            return res.status(403).json({ error: 'Account is disabled', forceLogout: true });
        }

        const tablet = await resolveTabletForRequest(db, decoded, requestedTabletName);

        if (tablet && !userHasTabletAccess(user, tablet)) {
            return res.status(403).json({ error: 'Tablet access denied', forceLogout: true });
        }

        if (!tablet && requestedTabletName) {
            console.warn(`⚠️ [TABLET] Could not resolve tablet from request header: ${requestedTabletName}`);
        }
        
        // Attach user info to request
        req.user = {
            username: user.username,
            role: user.role,
            dbName: decoded.dbName,
            userId: user._id.toString(),
            tabletId: tablet?._id?.toString() || decoded.tabletId || '',
            tabletName: tablet?.tabletName || decoded.tabletName || ''
        };

        if (tablet) {
            req.tablet = {
                tabletId: tablet._id.toString(),
                tabletName: tablet.tabletName,
                factoryLocation: tablet.factoryLocation || '',
                equipmentName: tablet.設備名 || ''
            };
        }
        
        next();
    } catch (error) {
        console.error('Tablet authentication error:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token', forceLogout: true });
        }
        res.status(500).json({ error: 'Authentication error' });
    }
}

const TABLET_ACTIVE_SESSION_COLLECTION = 'tabletActiveSessions';

function normalizeTabletSessionString(value = '') {
    return String(value ?? '').trim();
}

function normalizeTabletSessionNumber(value, fallback = 0) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeTabletSessionDate(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTabletSessionOperators(values = []) {
    const seen = new Set();

    return (Array.isArray(values) ? values : [values])
        .map(normalizeTabletSessionString)
        .filter(name => {
            if (!name || seen.has(name)) return false;
            seen.add(name);
            return true;
        })
        .slice(0, 4);
}

function resolveTabletSessionQuery(req) {
    const company = normalizeTabletSessionString(req.user?.dbName || 'KSG') || 'KSG';
    const tabletId = normalizeTabletSessionString(req.tablet?.tabletId || req.user?.tabletId || '');
    const tabletName = normalizeTabletSessionString(req.tablet?.tabletName || req.user?.tabletName || '');

    if (tabletId) {
        return {
            company,
            tabletId
        };
    }

    if (tabletName) {
        return {
            company,
            tabletName
        };
    }

    throw new Error('Unable to resolve tablet identity for active session');
}

function buildTabletActiveSessionDocument(req, payload = {}, now = new Date()) {
    const workStartTime = normalizeTabletSessionDate(payload.workStartTime || payload.startedAt);
    const breakStartTime = normalizeTabletSessionDate(payload.breakStartTime);
    const troubleStartTime = normalizeTabletSessionDate(payload.troubleStartTime);
    const isStarted = Boolean(payload.isStarted && workStartTime);
    const breakActive = Boolean(payload.breakActive && breakStartTime);
    const troubleActive = Boolean(payload.troubleActive && troubleStartTime);
    const operators = normalizeTabletSessionOperators(payload.operators);
    const totalBreakHours = Math.max(0, normalizeTabletSessionNumber(payload.totalBreakHours, 0));
    const totalTroubleHours = Math.max(0, normalizeTabletSessionNumber(payload.totalTroubleHours, 0));
    let status = 'idle';

    if (troubleActive) {
        status = 'trouble';
    } else if (breakActive) {
        status = 'break';
    } else if (isStarted) {
        status = 'running';
    }

    return {
        company: normalizeTabletSessionString(req.user?.dbName || 'KSG') || 'KSG',
        tabletId: normalizeTabletSessionString(req.tablet?.tabletId || req.user?.tabletId || ''),
        tabletName: normalizeTabletSessionString(req.tablet?.tabletName || req.user?.tabletName || ''),
        tabletKey: normalizeTabletSessionString(req.tablet?.tabletId || req.user?.tabletId || req.tablet?.tabletName || req.user?.tabletName || ''),
        factoryLocation: normalizeTabletSessionString(req.tablet?.factoryLocation || ''),
        equipmentName: normalizeTabletSessionString(req.tablet?.equipmentName || ''),
        username: normalizeTabletSessionString(req.user?.username || ''),
        userId: normalizeTabletSessionString(req.user?.userId || ''),
        userRole: normalizeTabletSessionString(req.user?.role || ''),
        operators,
        status,
        isStarted,
        breakActive,
        troubleActive,
        startTime: normalizeTabletSessionString(payload.startTime),
        workStartTime,
        breakStartTime,
        troubleStartTime,
        totalBreakHours,
        totalTroubleHours,
        stopTimeHours: Math.max(0, normalizeTabletSessionNumber(payload.stopTimeHours, totalBreakHours + totalTroubleHours)),
        manHours: Math.max(0, normalizeTabletSessionNumber(payload.manHours, 0)),
        currentCount: Math.max(0, normalizeTabletSessionNumber(payload.currentCount, 0)),
        goodCount: Math.max(0, normalizeTabletSessionNumber(payload.goodCount, 0)),
        seisanSuStartValue: normalizeTabletSessionNumber(payload.seisanSuStartValue, 0),
        currentSeisanSuValue: normalizeTabletSessionNumber(payload.currentSeisanSuValue, 0),
        kanbanId: normalizeTabletSessionString(payload.kanbanId),
        productId: normalizeTabletSessionString(payload.productId),
        productName: normalizeTabletSessionString(payload.productName),
        lhRh: normalizeTabletSessionString(payload.lhRh),
        hakoIresu: Math.max(0, normalizeTabletSessionNumber(payload.hakoIresu, 0)),
        remarks: normalizeTabletSessionString(payload.remarks),
        otherDetails: normalizeTabletSessionString(payload.otherDetails),
        updatedAt: now
    };
}

async function upsertTabletActiveSession(req, payload = {}) {
    if (!mongoClient) {
        throw new Error('Database not connected');
    }

    const dbName = normalizeTabletSessionString(req.user?.dbName || 'KSG') || 'KSG';
    const db = mongoClient.db(dbName);
    const collection = db.collection(TABLET_ACTIVE_SESSION_COLLECTION);
    const query = resolveTabletSessionQuery(req);
    const now = new Date();

    const document = buildTabletActiveSessionDocument(req, payload, now);

    await collection.updateOne(
        query,
        {
            $set: document,
            $setOnInsert: { createdAt: now }
        },
        { upsert: true }
    );

    return {
        query,
        document
    };
}

async function clearTabletActiveSession(req) {
    if (!mongoClient) {
        throw new Error('Database not connected');
    }

    const dbName = normalizeTabletSessionString(req.user?.dbName || 'KSG') || 'KSG';
    const db = mongoClient.db(dbName);
    const collection = db.collection(TABLET_ACTIVE_SESSION_COLLECTION);
    const query = resolveTabletSessionQuery(req);
    const result = await collection.deleteOne(query);

    return {
        query,
        deletedCount: result.deletedCount || 0
    };
}

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

// 🔐 TOKEN VALIDATION ENDPOINT
app.post("/validateToken", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Token is valid, return user data
    res.json({
      username: decoded.username,
      role: decoded.role,
      dbName: decoded.dbName
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

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

// ============================================================
// 🔹 TABLET API ENDPOINTS (Public - No Authentication Required)
// ============================================================

// Get users for tablet (filtered by factory + equipment and enabled status)
app.get('/api/tablet/users', async (req, res) => {
    const factory = req.query.factory ? decodeURIComponent(req.query.factory) : '';
    const equipment = req.query.equipment ? decodeURIComponent(req.query.equipment) : '';

    if (!factory) {
        return res.status(400).json({ success: false, error: 'factory query parameter is required' });
    }

    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // Use KSG database
        const db = mongoClient.db('KSG');
        const collection = db.collection('users');
        
        // Fetch all enabled users that have this factory in their assignment
        const users = await collection.find({
            enable: 'enabled',
            factory: { $regex: factory, $options: 'i' }
        }).toArray();

        // If an equipment is specified, also require the user to have it assigned
        const filteredUsers = users.filter(user => {
            if (!equipment) return true;
            const userEquipment = Array.isArray(user.equipment)
                ? user.equipment
                : (user.equipment || '').split(',').map(e => e.trim()).filter(e => e);
            return userEquipment.includes(equipment);
        });
        
        // Return user info needed for dropdowns
        const result = filteredUsers.map(user => ({
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: `${user.lastName || ''} ${user.firstName || ''}`.trim()
        }));
        
        console.log(`👥 [TABLET] Served ${result.length} users for factory: ${factory}, equipment: ${equipment}`);
        res.json({
            success: true,
            users: result,
            count: result.length,
            factory: factory,
            equipment: equipment
        });
        
    } catch (error) {
        console.error('❌ [TABLET] Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch users' 
        });
    }
});

// Get product info from masterDB (for kensaMembers)
app.get('/api/tablet/product/:productId', async (req, res) => {
    const productId = decodeURIComponent(req.params.productId);
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // Use KSG database
        const db = mongoClient.db('KSG');
        const collection = db.collection('masterDB');
        
        // Query product by 品番
        const product = await collection.findOne({ 品番: productId });
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        console.log(`📦 [TABLET] Served product info for: ${productId}, kensaMembers: ${product.kensaMembers || 2}`);
        res.json({
            success: true,
            product: {
                _id: String(product._id),
                品番: product.品番,
                製品名: product.製品名,
                'LH/RH': product['LH/RH'],
                kensaMembers: product.kensaMembers || 2,
                工場: product.工場,
                設備: product.設備
            }
        });
        
    } catch (error) {
        console.error('❌ [TABLET] Error fetching product:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch product' 
        });
    }
});

// Get product info by kanbanID
app.get('/api/tablet/product-by-kanban/:kanbanId', async (req, res) => {
    const kanbanId = decodeURIComponent(req.params.kanbanId);
    
    try {
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // Use KSG database
        const db = mongoClient.db('KSG');
        const collection = db.collection('masterDB');
        
        // Query product by kanbanID
        const product = await collection.findOne({ kanbanID: kanbanId });
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                kanbanId: kanbanId
            });
        }
        
        console.log(`📦 [TABLET] Served product info for kanbanID: ${kanbanId} → ${product.品番}, kensaMembers: ${product.kensaMembers || 2}`);

        // Fetch associated NG group if assigned
        let ngGroup = null;
        if (product.ngGroupId) {
            try {
                const { ObjectId } = require('mongodb');
                ngGroup = await db.collection('ngGroups').findOne({ _id: new ObjectId(product.ngGroupId) });
            } catch (e) {
                console.warn('⚠️ [TABLET] Failed to load ngGroup for product:', e.message);
            }
        }

        res.json({
            success: true,
            product: {
                品番: product.品番,
                製品名: product.製品名,
                'LH/RH': product['LH/RH'],
                kensaMembers: product.kensaMembers || 2,
                工場: product.工場,
                設備: product.設備,
                kanbanID: product.kanbanID,
                ngGroupId: product.ngGroupId || null,
                ngGroup: ngGroup || null
            }
        });
        
    } catch (error) {
        console.error('❌ [TABLET] Error fetching product by kanbanID:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch product' 
        });
    }
});

// Get equipment configuration for tablet (including OPC variable mappings)
app.get('/api/tablet/equipment-config/:tabletName', async (req, res) => {
    const tabletName = decodeURIComponent(req.params.tabletName);
    
    try {

app.post('/api/tablet/session', authenticateTablet, async (req, res) => {
    try {
        const payload = req.body || {};
        const dbName = req.user?.dbName || req.company || 'KSG';

        if (payload.clear) {
            const cleared = await clearTabletActiveSession(req);
            emitAdminDashboardRefresh(dbName, {
                reason: 'tablet-session-cleared',
                source: 'tablet-session',
                tabletId: req.tablet?.tabletId || req.user?.tabletId || '',
                tabletName: req.tablet?.tabletName || req.user?.tabletName || ''
            });
            return res.json({
                success: true,
                cleared: true,
                deletedCount: cleared.deletedCount,
                tablet: {
                    tabletId: req.tablet?.tabletId || req.user?.tabletId || '',
                    tabletName: req.tablet?.tabletName || req.user?.tabletName || ''
                }
            });
        }

        const result = await upsertTabletActiveSession(req, payload);
        emitAdminDashboardRefresh(dbName, {
            reason: 'tablet-session-updated',
            source: 'tablet-session',
            tabletId: result.document.tabletId,
            tabletName: result.document.tabletName,
            equipmentName: result.document.equipmentName,
            status: result.document.status
        });

        res.json({
            success: true,
            session: {
                tabletId: result.document.tabletId,
                tabletName: result.document.tabletName,
                equipmentName: result.document.equipmentName,
                status: result.document.status,
                updatedAt: result.document.updatedAt,
                operators: result.document.operators,
                currentCount: result.document.currentCount,
                startTime: result.document.startTime
            }
        });
    } catch (error) {
        console.error('❌ [TABLET] Error syncing active session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync tablet session',
            details: error.message
        });
    }
});
        if (!mongoClient) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not connected' 
            });
        }
        
        // Use KSG database
        const db = mongoClient.db('KSG');
        
        // First, find the tablet to get its equipment
        const tabletsCollection = db.collection('tabletDB');
        const tablet = await tabletsCollection.findOne({ tabletName: tabletName });
        
        if (!tablet) {
            return res.status(404).json({
                success: false,
                error: 'Tablet not found'
            });
        }
        
        const equipmentName = tablet.設備名;
        
        if (!equipmentName) {
            return res.status(400).json({
                success: false,
                error: 'Tablet has no equipment assigned'
            });
        }
        
        // Find the equipment configuration
        const equipmentCollection = db.collection('equipment');
        const equipment = await equipmentCollection.findOne({ 設備名: equipmentName });
        
        if (!equipment) {
            return res.status(404).json({
                success: false,
                error: 'Equipment not found'
            });
        }
        
        // Return equipment config with default values if opcVariables not set
        const opcVariables = equipment.opcVariables || {
            kanbanVariable: 'kenyokiRHKanban',
            productionCountVariable: 'seisanSu',
            boxQuantityVariable: 'hakoIresu'
        };
        
        console.log(`📱 [TABLET] Served equipment config for tablet: ${tabletName} → Equipment: ${equipmentName}`);
        console.log(`   Variables: kanban=${opcVariables.kanbanVariable}, production=${opcVariables.productionCountVariable}, box=${opcVariables.boxQuantityVariable}`);
        
        res.json({
            success: true,
            equipment: {
                設備名: equipment.設備名,
                工場: equipment.工場,
                description: equipment.description,
                opcVariables: opcVariables
            }
        });
        
    } catch (error) {
        console.error('❌ [TABLET] Error fetching equipment config:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch equipment configuration' 
        });
    }
});

// Submit tablet production data to Google Sheets
app.post('/api/tablet/submit', authenticateTablet, async (req, res) => {
    const submissionData = req.body;
    
    try {
        console.log('📱 [TABLET] Received submission:', submissionData);
        
        const now = new Date();

        // Auto-set end_time to current time if not provided
        const endTime = submissionData.終了時間 || (() => {
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            return `${h}:${m}`;
        })();

        // Calculate man_hours from start/end times if not provided or zero
        let manHours = parseFloat(submissionData.工数) || 0;
        if (manHours === 0 && submissionData.開始時間 && endTime) {
            try {
                const [startH, startM] = submissionData.開始時間.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                let startMinutes = startH * 60 + startM;
                let endMinutes = endH * 60 + endM;
                if (endMinutes < startMinutes) endMinutes += 24 * 60; // midnight crossover
                const breakTime = parseFloat(submissionData.休憩時間) || 0;
                const troubleTime = parseFloat(submissionData['機械トラブル時間']) || 0;
                manHours = parseFloat(Math.max(0, (endMinutes - startMinutes) / 60 - breakTime - troubleTime).toFixed(2));
                console.log(`⏱️ [TABLET] Calculated man_hours: ${manHours}h (${submissionData.開始時間} → ${endTime}, break: ${breakTime}h, trouble: ${troubleTime}h)`);
            } catch (e) {
                console.warn('⚠️ [TABLET] Could not calculate man_hours:', e.message);
            }
        }

        const dbName = req.user?.dbName || 'KSG';
        const db = mongoClient ? mongoClient.db(dbName) : null;
        const masterRecord = db ? await resolveTabletSubmissionMasterRecord(db, submissionData) : null;
        const resolvedNgGroupId = normalizeGoogleSheetObjectIdString(submissionData.ngGroupId || masterRecord?.ngGroupId);
        const ngGroup = (db && resolvedNgGroupId)
            ? await resolveGoogleSheetNgGroup(db, resolvedNgGroupId)
            : null;
        const nonCountUpDefectKeys = resolveSubmissionNonCountUpDefectKeys(submissionData, ngGroup);

        // Known fixed keys — everything else is a dynamic defect field
        const KNOWN_KEYS = new Set([
            '品番', '製品名', 'kanbanID', 'hakoIresu', 'LH/RH',
            '技能員①', '技能員②', '良品数', '工数',
            'その他詳細', '開始時間', '終了時間', '休憩時間', '機械トラブル時間', '備考', '工数（除外工数）',
            'masterRecordId', 'ngGroupId', 'nonCountUpDefectKeys'
        ]);

        // Extract dynamic defect fields with their original Japanese names
        const defects = {};
        Object.keys(submissionData).forEach(key => {
            if (!KNOWN_KEYS.has(key)) {
                defects[key] = submissionData[key] ?? 0;
            }
        });

        console.log(`🔴 [TABLET] Dynamic defects extracted:`, defects);

        // Calculate cycle time (min/piece) based on total count (good + defects) and man hours
        const totalDefectCount = Object.values(defects).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
        const totalWorkCount = (parseInt(submissionData['良品数']) || 0) + totalDefectCount;
        const cycleTime = totalWorkCount > 0 ? parseFloat((manHours * 60 / totalWorkCount).toFixed(2)) : 0;
        const submittedFrom = req.user.tabletName || 'tablet';
        console.log(`⏱️ [TABLET] cycle_time: ${cycleTime} min/piece (${totalWorkCount} total pieces, ${manHours}h)`);
        console.log(`📍 [TABLET] Submission source resolved as: ${submittedFrom}`);

        // Build final data: fixed metadata → dynamic defects → fixed trailing fields
        const finalData = {
            timestamp: now.toISOString(),
            date_year: now.getFullYear(),
            date_month: now.getMonth() + 1,
            date_day: now.getDate(),
            hinban: submissionData.品番 || '',
            product_name: submissionData.製品名 || '',
            kanban_id: submissionData.kanbanID || '',
            hako_iresu: submissionData.hakoIresu || 0,
            lh_rh: submissionData['LH/RH'] || '',
            operator1: submissionData['技能員①'] || '',
            operator2: submissionData['技能員②'] || '',
            good_count: submissionData.良品数 || 0,
            man_hours: manHours,
            cycle_time: cycleTime,
            ...defects,
            other_description: submissionData.その他詳細 || '',
            start_time: submissionData.開始時間 || '',
            end_time: endTime,
            break_time: parseFloat(submissionData.休憩時間) || 0,
            trouble_time: parseFloat(submissionData['機械トラブル時間']) || 0,
            remarks: submissionData.備考 || '',
            excluded_man_hours: submissionData['工数（除外工数）'] || 0,
            submitted_from: submittedFrom,
            master_record_id: normalizeGoogleSheetObjectIdString(submissionData.masterRecordId || masterRecord?._id),
            ng_group_id: resolvedNgGroupId,
            non_countup_defect_keys: nonCountUpDefectKeys
        };
        
        let mongoResult = null;
        let googleSheetsResult = null;
        
        // 1. Submit to MongoDB
        try {
            if (!mongoClient) {
                console.log('⚠️  [TABLET] MongoDB not connected, skipping database save');
            } else {
                const db = mongoClient.db(dbName);
                const collection = db.collection('submittedDB');
                mongoResult = await collection.insertOne(finalData);
                console.log(`📊 [TABLET] Data submitted to MongoDB: ${finalData.hinban}`);
            }
        } catch (mongoError) {
            console.error('❌ [TABLET] MongoDB submission error:', mongoError);
            // Continue with Google Sheets even if MongoDB fails
        }
        
        // 2. Submit to registered Google Sheets targets
        try {
            if (!db) {
                console.log('⚠️  [TABLET] MongoDB not connected, skipping Google Sheets target lookup');
            } else {
                const targetResults = await submitTabletDataToRegisteredGoogleSheets(db, finalData);
                googleSheetsResult = {
                    success: targetResults.some(result => result.success),
                    targets: targetResults,
                };

                if (targetResults.length === 0) {
                    console.log(`ℹ️ [TABLET] No registered Google Sheets targets matched ${finalData.hinban}`);
                } else {
                    console.log(`📊 [TABLET] Google Sheets target results for ${finalData.hinban}:`, targetResults);
                }
            }
        } catch (googleError) {
            console.error('❌ [TABLET] Google Sheets submission error:', googleError);
            googleSheetsResult = {
                success: false,
                targets: [{ success: false, error: googleError.message || 'Unknown error' }]
            };
            // Continue even if Google Sheets fails (MongoDB might have succeeded)
        }
        
        // Return success if at least one submission worked
        const success = mongoResult || googleSheetsResult;
        
        if (success) {
            try {
                await clearTabletActiveSession(req);
            } catch (sessionError) {
                console.error('❌ [TABLET] Failed to clear active session after submit:', sessionError);
            }

            emitAdminDashboardRefresh(req.user?.dbName || req.company || 'KSG', {
                reason: 'tablet-submit-success',
                source: 'tablet-submit',
                insertedId: mongoResult?.insertedId ? String(mongoResult.insertedId) : ''
            });

            res.json({
                success: true,
                message: 'Data submitted successfully',
                mongodb: {
                    success: !!mongoResult,
                    insertedId: mongoResult?.insertedId || null
                },
                googleSheets: {
                    success: !!googleSheetsResult?.success,
                    targetCount: Array.isArray(googleSheetsResult?.targets) ? googleSheetsResult.targets.length : 0,
                    targets: googleSheetsResult?.targets || []
                },
                submitted_at: finalData.timestamp
            });
        } else {
            throw new Error('Both MongoDB and Google Sheets submissions failed');
        }
        
    } catch (error) {
        console.error('❌ [TABLET] Error submitting data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit data',
            details: error.message
        });
    }
});

// ============================================================

const SUBMITTED_DB_OPERATOR_FIELDS = ['operator1', 'operator2', 'operator3', 'operator4'];

const SUBMITTED_DB_FIXED_FIELDS = new Set([
    '_id', 'timestamp', 'date_year', 'date_month', 'date_day',
    'hinban', 'product_name', 'kanban_id', 'hako_iresu', 'lh_rh',
    ...SUBMITTED_DB_OPERATOR_FIELDS,
    'good_count', 'man_hours', 'cycle_time',
    'other_description', 'start_time', 'end_time', 'break_time',
    'trouble_time', 'remarks', 'excluded_man_hours', 'submitted_from',
    'master_record_id', 'ng_group_id', 'non_countup_defect_keys',
    'is_deleted', 'deleted_at', 'deleted_by', 'deleted_by_role', 'trash_expires_at'
]);
const SUBMITTED_DB_NON_EDITABLE_FIELDS = new Set([
    '_id', 'timestamp', 'date_year', 'date_month', 'date_day',
    'submitted_from', 'master_record_id', 'ng_group_id', 'non_countup_defect_keys',
    'is_deleted', 'deleted_at', 'deleted_by', 'deleted_by_role', 'trash_expires_at'
]);
const SUBMITTED_DB_EDITABLE_STRING_FIELDS = new Set([
    'hinban', 'product_name', 'kanban_id', 'lh_rh',
    ...SUBMITTED_DB_OPERATOR_FIELDS,
    'other_description', 'start_time', 'end_time', 'remarks'
]);

function normalizeSubmittedDBUpdates(source = {}) {
    const updates = {};

    for (const [key, rawValue] of Object.entries(source)) {
        if (!key || SUBMITTED_DB_NON_EDITABLE_FIELDS.has(key) || key.includes('.') || key.startsWith('$')) {
            continue;
        }

        if (SUBMITTED_DB_EDITABLE_STRING_FIELDS.has(key)) {
            updates[key] = String(rawValue ?? '').trim();
            continue;
        }

        const normalizedValue = rawValue === '' || rawValue === null || rawValue === undefined
            ? 0
            : Number(rawValue);

        if (!Number.isFinite(normalizedValue)) {
            const error = new Error(`Invalid numeric value for ${key}`);
            error.statusCode = 400;
            throw error;
        }

        updates[key] = normalizedValue;
    }

    return updates;
}

function getSubmittedDBNonCountUpDefectKeySet(record = {}) {
    return new Set(
        (Array.isArray(record.non_countup_defect_keys) ? record.non_countup_defect_keys : [])
            .map(key => String(key ?? '').trim())
            .filter(Boolean)
    );
}

function getJapanCalendarDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') {
            acc[part.type] = part.value;
        }
        return acc;
    }, {});

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        key: `${parts.year}-${parts.month}-${parts.day}`,
        label: `${Number(parts.month)}/${Number(parts.day)}`
    };
}

function parseSubmittedDBCalendarDate(value) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().replace(/\//g, '-');
    if (!normalized) return null;

    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() + 1 !== month ||
        parsedDate.getUTCDate() !== day
    ) {
        return null;
    }

    return {
        year,
        month,
        day,
        key: (year * 10000) + (month * 100) + day
    };
}

function buildSubmittedDBDateRangeExpr(startDateValue, endDateValue) {
    const startDate = parseSubmittedDBCalendarDate(startDateValue);
    const endDate = parseSubmittedDBCalendarDate(endDateValue);

    if (startDateValue && !startDate) {
        throw new Error(`Invalid startDate: ${startDateValue}`);
    }
    if (endDateValue && !endDate) {
        throw new Error(`Invalid endDate: ${endDateValue}`);
    }
    if (startDate && endDate && startDate.key > endDate.key) {
        return { $eq: [1, 0] };
    }

    const yearExpr = { $convert: { input: '$date_year', to: 'int', onError: 0, onNull: 0 } };
    const monthExpr = { $convert: { input: '$date_month', to: 'int', onError: 0, onNull: 0 } };
    const dayExpr = { $convert: { input: '$date_day', to: 'int', onError: 0, onNull: 0 } };
    const dateKeyExpr = {
        $add: [
            { $multiply: [yearExpr, 10000] },
            { $multiply: [monthExpr, 100] },
            dayExpr
        ]
    };

    const rangeExpr = [];
    if (startDate) rangeExpr.push({ $gte: [dateKeyExpr, startDate.key] });
    if (endDate) rangeExpr.push({ $lte: [dateKeyExpr, endDate.key] });

    if (rangeExpr.length === 0) return null;
    if (rangeExpr.length === 1) return rangeExpr[0];

    return { $and: rangeExpr };
}

function getSubmittedDBRecordDefects(record = {}, options = {}) {
    const includeNonCountUp = Boolean(options.includeNonCountUp);
    const excludedDefectKeys = includeNonCountUp ? new Set() : getSubmittedDBNonCountUpDefectKeySet(record);

    return Object.entries(record)
        .filter(([key]) => !SUBMITTED_DB_FIXED_FIELDS.has(key) && !excludedDefectKeys.has(String(key ?? '').trim()))
        .map(([name, rawValue]) => ({
            name,
            count: Number(rawValue ?? 0)
        }))
        .filter(defect => Number.isFinite(defect.count) && defect.count > 0);
}

function getSubmittedDBTotalDefects(record = {}) {
    return getSubmittedDBRecordDefects(record).reduce((sum, defect) => sum + defect.count, 0);
}

function getSubmittedDBCreatedTotal(goodCount, defectCount) {
    return Math.max(0, (Number(goodCount ?? 0) || 0) + (Number(defectCount ?? 0) || 0));
}

function getSubmittedDBDefectRate(goodCount, defectCount) {
    const createdTotal = getSubmittedDBCreatedTotal(goodCount, defectCount);
    if (createdTotal <= 0) return 0;

    return ((Number(defectCount ?? 0) || 0) / createdTotal) * 100;
}

function getSubmittedDBRate(numerator, denominator) {
    const safeDenominator = Number(denominator ?? 0) || 0;
    if (safeDenominator <= 0) return 0;

    return ((Number(numerator ?? 0) || 0) / safeDenominator) * 100;
}

function getSubmittedDBCoefficientOfVariation(values = []) {
    const samples = values.filter(value => Number.isFinite(value) && value >= 0);
    if (samples.length <= 1) return 0;

    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    if (average <= 0) return 0;

    const variance = samples.reduce((sum, value) => sum + ((value - average) ** 2), 0) / samples.length;
    return Math.sqrt(variance) / average;
}

function escapeSubmittedDBRegex(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSubmittedDBAnalyticsFilter(query = {}) {
    const filter = {
        is_deleted: { $ne: true }
    };

    const dateRangeExpr = buildSubmittedDBDateRangeExpr(query.startDate, query.endDate);
    if (dateRangeExpr) {
        filter.$expr = dateRangeExpr;
    }

    const hinban = String(query.hinban ?? '').trim();
    const productName = String(query.productName ?? '').trim();
    const operator = String(query.operator ?? '').trim();
    const kanbanId = String(query.kanbanId ?? '').trim();
    const source = String(query.source ?? '').trim();
    const lhRh = String(query.lhRh ?? '').trim();

    if (hinban) {
        filter.hinban = { $regex: escapeSubmittedDBRegex(hinban), $options: 'i' };
    }
    if (productName) {
        filter.product_name = { $regex: escapeSubmittedDBRegex(productName), $options: 'i' };
    }
    if (operator) {
        const safeOperator = escapeSubmittedDBRegex(operator);
        filter.$or = SUBMITTED_DB_OPERATOR_FIELDS.map(field => ({
            [field]: { $regex: safeOperator, $options: 'i' }
        }));
    }
    if (kanbanId) {
        filter.kanban_id = { $regex: escapeSubmittedDBRegex(kanbanId), $options: 'i' };
    }
    if (source && source !== 'all') {
        filter.submitted_from = source;
    }
    if (lhRh && lhRh !== 'all') {
        filter.lh_rh = lhRh;
    }

    return filter;
}

function getSubmittedDBRecordOperators(record = {}) {
    return [...new Set(
        SUBMITTED_DB_OPERATOR_FIELDS
            .map(field => String(record[field] ?? '').trim())
            .filter(Boolean)
    )];
}

function getSubmittedDBRecordDateInfo(record = {}) {
    const year = Number(record.date_year ?? 0);
    const month = Number(record.date_month ?? 0);
    const day = Number(record.date_day ?? 0);

    if (year > 0 && month > 0 && day > 0) {
        return {
            key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            label: `${month}/${day}`
        };
    }

    const fallbackDate = new Date(record.timestamp || Date.now());
    if (!Number.isNaN(fallbackDate.getTime())) {
        const calendarDate = getJapanCalendarDate(fallbackDate);
        return {
            key: calendarDate.key,
            label: calendarDate.label
        };
    }

    return {
        key: 'Unknown',
        label: 'Unknown'
    };
}

function normalizeSubmittedDBOptionList(values = [], limit = 250) {
    return [...new Set(
        values
            .map(value => String(value ?? '').trim())
            .filter(Boolean)
    )]
        .sort((a, b) => a.localeCompare(b, 'ja'))
        .slice(0, limit);
}

app.get('/api/admin/analytics/filter-options', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const activeFilter = { is_deleted: { $ne: true } };
        const operatorValueFields = Object.fromEntries(
            SUBMITTED_DB_OPERATOR_FIELDS.map(field => [`${field}Values`, { $addToSet: `$${field}` }])
        );

        const [optionsDoc = {}] = await collection.aggregate([
            { $match: activeFilter },
            {
                $group: {
                    _id: null,
                    sources: { $addToSet: '$submitted_from' },
                    lhRh: { $addToSet: '$lh_rh' },
                    hinban: { $addToSet: '$hinban' },
                    productNames: { $addToSet: '$product_name' },
                    ...operatorValueFields
                }
            }
        ]).toArray();

        res.json({
            success: true,
            options: {
                sources: normalizeSubmittedDBOptionList(optionsDoc.sources || []),
                lhRh: normalizeSubmittedDBOptionList(optionsDoc.lhRh || []),
                hinban: normalizeSubmittedDBOptionList(optionsDoc.hinban || []),
                productNames: normalizeSubmittedDBOptionList(optionsDoc.productNames || []),
                operators: normalizeSubmittedDBOptionList(
                    SUBMITTED_DB_OPERATOR_FIELDS.flatMap(field => optionsDoc[`${field}Values`] || [])
                )
            }
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching analytics filter options:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to load analytics filter options' });
    }
});

app.get('/api/admin/analytics', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const filter = buildSubmittedDBAnalyticsFilter(req.query);
        const records = await collection.find(filter).sort({ date_year: 1, date_month: 1, date_day: 1, timestamp: 1 }).toArray();

        const dailyMap = new Map();
        const defectMap = new Map();
        const operatorMap = new Map();
        const operatorProductMap = new Map();
        const operatorSourceMap = new Map();
        const productMap = new Map();
        const productWorkerBenchmarkMap = new Map();
        const sourceMap = new Map();
        const sourceWorkerBenchmarkMap = new Map();
        const qualityHotspots = [];
        const uniqueOperators = new Set();
        const uniqueProducts = new Set();
        const uniqueSources = new Set();
        const uniqueKanbans = new Set();

        let totalGoodCount = 0;
        let totalDefectCount = 0;
        let totalManHours = 0;
        let totalBreakTime = 0;
        let totalTroubleTime = 0;
        let totalIssueRecords = 0;
        let cycleTimeTotal = 0;
        let cycleTimeSamples = 0;

        records.forEach(record => {
            const goodCount = Number(record.good_count ?? 0) || 0;
            const manHours = Number(record.man_hours ?? 0) || 0;
            const breakTime = Number(record.break_time ?? 0) || 0;
            const troubleTime = Number(record.trouble_time ?? 0) || 0;
            const cycleTime = Number(record.cycle_time ?? 0);
            const defects = getSubmittedDBRecordDefects(record);
            const totalDefects = defects.reduce((sum, defect) => sum + defect.count, 0);
            const dateInfo = getSubmittedDBRecordDateInfo(record);
            const operators = getSubmittedDBRecordOperators(record);
            const operatorCount = Math.max(operators.length, 1);
            const source = String(record.submitted_from ?? '').trim() || 'Unknown';
            const kanbanId = String(record.kanban_id ?? '').trim();
            const hasIssue = totalDefects > 0 || troubleTime > 0 || String(record.remarks ?? '').trim() !== '';
            const attributedGoodCount = goodCount / operatorCount;
            const attributedDefectCount = totalDefects / operatorCount;
            const attributedIssueCount = hasIssue ? 1 / operatorCount : 0;

            totalGoodCount += goodCount;
            totalDefectCount += totalDefects;
            totalManHours += manHours;
            totalBreakTime += breakTime;
            totalTroubleTime += troubleTime;
            if (hasIssue) {
                totalIssueRecords += 1;
            }

            if (Number.isFinite(cycleTime) && cycleTime > 0) {
                cycleTimeTotal += cycleTime;
                cycleTimeSamples += 1;
            }

            if (kanbanId) uniqueKanbans.add(kanbanId);
            uniqueSources.add(source);
            if (record.hinban || record.product_name || record.lh_rh) {
                uniqueProducts.add([
                    String(record.hinban ?? '').trim(),
                    String(record.product_name ?? '').trim(),
                    String(record.lh_rh ?? '').trim()
                ].join('||'));
            }
            operators.forEach(name => uniqueOperators.add(name));

            const dailyEntry = dailyMap.get(dateInfo.key) || {
                date: dateInfo.key,
                label: dateInfo.label,
                submissions: 0,
                goodCount: 0,
                defectCount: 0,
                issueCount: 0,
                manHours: 0,
                breakTime: 0,
                troubleTime: 0
            };
            dailyEntry.submissions += 1;
            dailyEntry.goodCount += goodCount;
            dailyEntry.defectCount += totalDefects;
            if (hasIssue) {
                dailyEntry.issueCount += 1;
            }
            dailyEntry.manHours += manHours;
            dailyEntry.breakTime += breakTime;
            dailyEntry.troubleTime += troubleTime;
            dailyMap.set(dateInfo.key, dailyEntry);

            defects.forEach(defect => {
                defectMap.set(defect.name, (defectMap.get(defect.name) || 0) + defect.count);
            });

            const sourceEntry = sourceMap.get(source) || {
                source,
                submissions: 0,
                totalGoodCount: 0,
                totalDefectCount: 0,
                issueCount: 0,
                totalManHours: 0,
                totalTroubleTime: 0
            };
            sourceEntry.submissions += 1;
            sourceEntry.totalGoodCount += goodCount;
            sourceEntry.totalDefectCount += totalDefects;
            if (hasIssue) {
                sourceEntry.issueCount += 1;
            }
            sourceEntry.totalManHours += manHours;
            sourceEntry.totalTroubleTime += troubleTime;
            sourceMap.set(source, sourceEntry);

            const productKey = [
                String(record.hinban ?? '').trim(),
                String(record.product_name ?? '').trim(),
                String(record.lh_rh ?? '').trim()
            ].join('||');
            const productEntry = productMap.get(productKey) || {
                hinban: String(record.hinban ?? '').trim(),
                productName: String(record.product_name ?? '').trim(),
                lhRh: String(record.lh_rh ?? '').trim(),
                submissions: 0,
                totalGoodCount: 0,
                totalDefectCount: 0,
                issueCount: 0,
                totalManHours: 0,
                cycleTimeTotal: 0,
                cycleTimeSamples: 0
            };
            productEntry.submissions += 1;
            productEntry.totalGoodCount += goodCount;
            productEntry.totalDefectCount += totalDefects;
            if (hasIssue) {
                productEntry.issueCount += 1;
            }
            productEntry.totalManHours += manHours;
            if (Number.isFinite(cycleTime) && cycleTime > 0) {
                productEntry.cycleTimeTotal += cycleTime;
                productEntry.cycleTimeSamples += 1;
            }
            productMap.set(productKey, productEntry);

            operators.forEach(name => {
                const operatorEntry = operatorMap.get(name) || {
                    name,
                    submissions: 0,
                    sharedSubmissions: 0,
                    soloSubmissions: 0,
                    totalGoodCount: 0,
                    totalDefectCount: 0,
                    issueCount: 0,
                    attributedIssueCount: 0,
                    totalManHours: 0,
                    totalBreakTime: 0,
                    totalTroubleTime: 0,
                    cycleTimeTotal: 0,
                    cycleTimeSamples: 0,
                    activeDates: new Set(),
                    productKeys: new Set(),
                    sourceKeys: new Set(),
                    dailyMap: new Map()
                };
                operatorEntry.submissions += 1;
                if (operators.length > 1) {
                    operatorEntry.sharedSubmissions += 1;
                } else {
                    operatorEntry.soloSubmissions += 1;
                }
                operatorEntry.totalGoodCount += attributedGoodCount;
                operatorEntry.totalDefectCount += attributedDefectCount;
                if (hasIssue) {
                    operatorEntry.issueCount += 1;
                }
                operatorEntry.attributedIssueCount += attributedIssueCount;
                operatorEntry.totalManHours += manHours;
                operatorEntry.totalBreakTime += breakTime;
                operatorEntry.totalTroubleTime += troubleTime;
                operatorEntry.activeDates.add(dateInfo.key);
                operatorEntry.productKeys.add(productKey);
                operatorEntry.sourceKeys.add(source);
                if (Number.isFinite(cycleTime) && cycleTime > 0) {
                    operatorEntry.cycleTimeTotal += cycleTime;
                    operatorEntry.cycleTimeSamples += 1;
                }

                const operatorDailyEntry = operatorEntry.dailyMap.get(dateInfo.key) || {
                    date: dateInfo.key,
                    label: dateInfo.label,
                    submissions: 0,
                    goodCount: 0,
                    defectCount: 0,
                    issueCount: 0,
                    manHours: 0,
                    breakTime: 0,
                    troubleTime: 0
                };
                operatorDailyEntry.submissions += 1;
                operatorDailyEntry.goodCount += attributedGoodCount;
                operatorDailyEntry.defectCount += attributedDefectCount;
                if (hasIssue) {
                    operatorDailyEntry.issueCount += 1;
                }
                operatorDailyEntry.manHours += manHours;
                operatorDailyEntry.breakTime += breakTime;
                operatorDailyEntry.troubleTime += troubleTime;
                operatorEntry.dailyMap.set(dateInfo.key, operatorDailyEntry);
                operatorMap.set(name, operatorEntry);

                const operatorProductKey = `${name}||${productKey}`;
                const operatorProductEntry = operatorProductMap.get(operatorProductKey) || {
                    name,
                    contextKey: productKey,
                    hinban: String(record.hinban ?? '').trim(),
                    productName: String(record.product_name ?? '').trim(),
                    lhRh: String(record.lh_rh ?? '').trim(),
                    submissions: 0,
                    totalGoodCount: 0,
                    totalDefectCount: 0,
                    totalManHours: 0
                };
                operatorProductEntry.submissions += 1;
                operatorProductEntry.totalGoodCount += attributedGoodCount;
                operatorProductEntry.totalDefectCount += attributedDefectCount;
                operatorProductEntry.totalManHours += manHours;
                operatorProductMap.set(operatorProductKey, operatorProductEntry);

                const productWorkerBenchmark = productWorkerBenchmarkMap.get(productKey) || {
                    contextKey: productKey,
                    hinban: String(record.hinban ?? '').trim(),
                    productName: String(record.product_name ?? '').trim(),
                    lhRh: String(record.lh_rh ?? '').trim(),
                    submissions: 0,
                    totalGoodCount: 0,
                    totalDefectCount: 0,
                    totalManHours: 0
                };
                productWorkerBenchmark.submissions += 1;
                productWorkerBenchmark.totalGoodCount += attributedGoodCount;
                productWorkerBenchmark.totalDefectCount += attributedDefectCount;
                productWorkerBenchmark.totalManHours += manHours;
                productWorkerBenchmarkMap.set(productKey, productWorkerBenchmark);

                const operatorSourceKey = `${name}||${source}`;
                const operatorSourceEntry = operatorSourceMap.get(operatorSourceKey) || {
                    name,
                    contextKey: source,
                    source,
                    submissions: 0,
                    totalGoodCount: 0,
                    totalDefectCount: 0,
                    totalManHours: 0
                };
                operatorSourceEntry.submissions += 1;
                operatorSourceEntry.totalGoodCount += attributedGoodCount;
                operatorSourceEntry.totalDefectCount += attributedDefectCount;
                operatorSourceEntry.totalManHours += manHours;
                operatorSourceMap.set(operatorSourceKey, operatorSourceEntry);

                const sourceWorkerBenchmark = sourceWorkerBenchmarkMap.get(source) || {
                    contextKey: source,
                    source,
                    submissions: 0,
                    totalGoodCount: 0,
                    totalDefectCount: 0,
                    totalManHours: 0
                };
                sourceWorkerBenchmark.submissions += 1;
                sourceWorkerBenchmark.totalGoodCount += attributedGoodCount;
                sourceWorkerBenchmark.totalDefectCount += attributedDefectCount;
                sourceWorkerBenchmark.totalManHours += manHours;
                sourceWorkerBenchmarkMap.set(source, sourceWorkerBenchmark);
            });

            qualityHotspots.push({
                id: record._id,
                timestamp: record.timestamp,
                date: dateInfo.key,
                productName: String(record.product_name ?? '').trim(),
                hinban: String(record.hinban ?? '').trim(),
                kanbanId,
                source,
                operators,
                goodCount,
                totalDefects,
                manHours,
                breakTime,
                troubleTime,
                defectRate: getSubmittedDBDefectRate(goodCount, totalDefects),
                remarks: String(record.remarks ?? '').trim(),
                topDefects: defects
                    .slice()
                    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
                    .slice(0, 3),
                hasIssue
            });
        });

        const summary = {
            submissions: records.length,
            totalGoodCount,
            totalDefectCount,
            defectRate: getSubmittedDBDefectRate(totalGoodCount, totalDefectCount),
            totalManHours,
            totalBreakTime,
            totalTroubleTime,
            totalIssueRecords,
            averageCycleTime: cycleTimeSamples > 0 ? cycleTimeTotal / cycleTimeSamples : 0,
            uniqueOperators: uniqueOperators.size,
            uniqueProducts: uniqueProducts.size,
            uniqueSources: uniqueSources.size,
            uniqueKanbans: uniqueKanbans.size
        };

        const dailyTrend = [...dailyMap.values()]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(entry => ({
                ...entry,
                defectRate: getSubmittedDBDefectRate(entry.goodCount, entry.defectCount)
            }));

        const topDefects = [...defectMap.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
            .slice(0, 10);

        const operatorComparisonAll = [...operatorMap.values()]
            .map(entry => {
                const dailyPoints = [...entry.dailyMap.values()]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(point => ({
                        ...point,
                        defectRate: getSubmittedDBDefectRate(point.goodCount, point.defectCount),
                        outputPerHour: point.manHours > 0 ? point.goodCount / point.manHours : 0,
                        downtimeRate: getSubmittedDBRate(point.breakTime + point.troubleTime, point.manHours)
                    }));
                const outputPerHourSamples = dailyPoints
                    .map(point => point.outputPerHour)
                    .filter(value => Number.isFinite(value) && value > 0);

                return {
                    name: entry.name,
                    submissions: entry.submissions,
                    sharedSubmissions: entry.sharedSubmissions,
                    soloSubmissions: entry.soloSubmissions,
                    totalGoodCount: entry.totalGoodCount,
                    totalDefectCount: entry.totalDefectCount,
                    issueCount: entry.issueCount,
                    attributedIssueCount: entry.attributedIssueCount,
                    totalManHours: entry.totalManHours,
                    totalBreakTime: entry.totalBreakTime,
                    totalTroubleTime: entry.totalTroubleTime,
                    averageCycleTime: entry.cycleTimeSamples > 0 ? entry.cycleTimeTotal / entry.cycleTimeSamples : 0,
                    defectRate: getSubmittedDBDefectRate(entry.totalGoodCount, entry.totalDefectCount),
                    issueRate: getSubmittedDBRate(entry.issueCount, entry.submissions),
                    outputPerHour: entry.totalManHours > 0 ? entry.totalGoodCount / entry.totalManHours : 0,
                    downtimeRate: getSubmittedDBRate(entry.totalBreakTime + entry.totalTroubleTime, entry.totalManHours),
                    troubleRate: getSubmittedDBRate(entry.totalTroubleTime, entry.totalManHours),
                    activeDays: entry.activeDates.size,
                    productCount: entry.productKeys.size,
                    sourceCount: entry.sourceKeys.size,
                    consistencyScore: Math.max(0, 100 - (getSubmittedDBCoefficientOfVariation(outputPerHourSamples) * 100)),
                    dailyPoints
                };
            })
            .sort((a, b) => b.totalGoodCount - a.totalGoodCount || b.outputPerHour - a.outputPerHour || b.totalManHours - a.totalManHours || a.name.localeCompare(b.name, 'ja'));

        const operatorComparison = operatorComparisonAll
            .slice(0, 20)
            .map(({ dailyPoints, ...entry }) => entry);
        const operatorDerivedMap = new Map(operatorComparisonAll.map(entry => [entry.name, entry]));

        const topProducts = [...productMap.values()]
            .sort((a, b) => b.totalGoodCount - a.totalGoodCount || b.submissions - a.submissions || a.productName.localeCompare(b.productName, 'ja'))
            .slice(0, 20)
            .map(entry => ({
                ...entry,
                averageCycleTime: entry.cycleTimeSamples > 0 ? entry.cycleTimeTotal / entry.cycleTimeSamples : 0,
                defectRate: getSubmittedDBDefectRate(entry.totalGoodCount, entry.totalDefectCount)
            }));

        const sourceBreakdown = [...sourceMap.values()]
            .sort((a, b) => b.totalGoodCount - a.totalGoodCount || b.submissions - a.submissions || a.source.localeCompare(b.source, 'ja'))
            .map(entry => ({
                ...entry,
                defectRate: getSubmittedDBDefectRate(entry.totalGoodCount, entry.totalDefectCount)
            }));

        const requestedFocusOperator = String(req.query.focusOperator ?? '').trim();
        const resolvedFocusOperator = requestedFocusOperator || operatorComparison[0]?.name || '';
        const focusWorker = operatorDerivedMap.get(resolvedFocusOperator);
        const operatorFocus = focusWorker
            ? {
                name: focusWorker.name,
                points: focusWorker.dailyPoints
            }
            : null;

        const buildFocusSkillContexts = (scope, entries, benchmarks) => {
            if (!resolvedFocusOperator) return [];

            return [...entries.values()]
                .filter(entry => entry.name === resolvedFocusOperator && entry.totalManHours > 0)
                .map(entry => {
                    const benchmark = benchmarks.get(entry.contextKey);
                    if (!benchmark || benchmark.totalManHours <= 0) return null;

                    const outputPerHour = entry.totalGoodCount / entry.totalManHours;
                    const benchmarkOutputPerHour = benchmark.totalGoodCount / benchmark.totalManHours;

                    return {
                        scope,
                        label: scope === 'source'
                            ? entry.source
                            : [entry.productName || entry.hinban || 'Unknown', entry.hinban && entry.productName && entry.hinban !== entry.productName ? entry.hinban : '', entry.lhRh].filter(Boolean).join(' / '),
                        source: entry.source || '',
                        hinban: entry.hinban || '',
                        productName: entry.productName || '',
                        lhRh: entry.lhRh || '',
                        submissions: entry.submissions,
                        totalGoodCount: entry.totalGoodCount,
                        totalManHours: entry.totalManHours,
                        outputPerHour,
                        defectRate: getSubmittedDBDefectRate(entry.totalGoodCount, entry.totalDefectCount),
                        benchmarkOutputPerHour,
                        benchmarkDefectRate: getSubmittedDBDefectRate(benchmark.totalGoodCount, benchmark.totalDefectCount),
                        deltaOutputPerHour: outputPerHour - benchmarkOutputPerHour,
                        deltaPercent: benchmarkOutputPerHour > 0 ? ((outputPerHour / benchmarkOutputPerHour) - 1) * 100 : 0
                    };
                })
                .filter(Boolean)
                .sort((a, b) => b.totalManHours - a.totalManHours || b.submissions - a.submissions || a.label.localeCompare(b.label, 'ja'));
        };

        const operatorSkillProfile = resolvedFocusOperator
            ? {
                name: resolvedFocusOperator,
                contexts: [
                    ...buildFocusSkillContexts('source', operatorSourceMap, sourceWorkerBenchmarkMap).slice(0, 4),
                    ...buildFocusSkillContexts('product', operatorProductMap, productWorkerBenchmarkMap).slice(0, 4)
                ]
            }
            : null;

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            filters: {
                startDate: String(req.query.startDate ?? '').trim(),
                endDate: String(req.query.endDate ?? '').trim(),
                hinban: String(req.query.hinban ?? '').trim(),
                productName: String(req.query.productName ?? '').trim(),
                operator: String(req.query.operator ?? '').trim(),
                kanbanId: String(req.query.kanbanId ?? '').trim(),
                source: String(req.query.source ?? '').trim(),
                lhRh: String(req.query.lhRh ?? '').trim(),
                focusOperator: resolvedFocusOperator
            },
            summary,
            dailyTrend,
            topDefects,
            operatorComparison,
            operatorFocus,
            operatorSkillProfile,
            topProducts,
            sourceBreakdown,
            qualityHotspots: qualityHotspots
                .filter(entry => entry.hasIssue)
                .sort((a, b) => b.totalDefects - a.totalDefects || b.troubleTime - a.troubleTime || String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))
                .slice(0, 20)
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching analytics:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to load analytics' });
    }
});

app.get('/api/admin/dashboard-summary', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const now = new Date();
        const today = getJapanCalendarDate();
        const last7Days = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
            return getJapanCalendarDate(date);
        });
        const last7DayFilters = last7Days.map(day => ({
            date_year: day.year,
            date_month: day.month,
            date_day: day.day
        }));

        const activeFilter = { is_deleted: { $ne: true } };
        const todayFilter = {
            ...activeFilter,
            date_year: today.year,
            date_month: today.month,
            date_day: today.day
        };

        const [todayRecords, recentRecords, trendRecords, activeRecords, trashRecords, sessionRecords] = await Promise.all([
            collection.find(todayFilter).sort({ timestamp: -1 }).toArray(),
            collection.find(activeFilter).sort({ timestamp: -1 }).limit(8).toArray(),
            collection.find({ ...activeFilter, $or: last7DayFilters }).toArray(),
            collection.countDocuments(activeFilter),
            collection.countDocuments({ is_deleted: true }),
            db.collection(TABLET_ACTIVE_SESSION_COLLECTION)
                .find({ isStarted: true })
                .sort({ updatedAt: -1 })
                .toArray()
        ]);

        const operatorMap = new Map();
        const productMap = new Map();
        const defectMap = new Map();
        const issueRecords = [];
        const activeOperators = new Set();
        const activeKanbans = new Set();
        const dashboardWorkdayHours = 8;
        const workerStatusRank = {
            idle: 0,
            running: 1,
            break: 2,
            trouble: 3
        };

        const pickDominantWorkerStatus = (currentStatus = 'idle', nextStatus = 'idle') => {
            const currentRank = workerStatusRank[currentStatus] ?? 0;
            const nextRank = workerStatusRank[nextStatus] ?? 0;
            return nextRank > currentRank ? nextStatus : currentStatus;
        };

        let totalGoodCount = 0;
        let totalDefectCount = 0;
        let totalTroubleHours = 0;
        let cycleTimeTotal = 0;
        let cycleTimeSamples = 0;

        todayRecords.forEach(record => {
            const goodCount = Number(record.good_count ?? 0) || 0;
            const manHours = Number(record.man_hours ?? 0) || 0;
            const troubleTime = Number(record.trouble_time ?? 0) || 0;
            const cycleTime = Number(record.cycle_time ?? 0);
            const operatorNames = SUBMITTED_DB_OPERATOR_FIELDS
                .map(field => record[field])
                .map(name => String(name ?? '').trim())
                .filter(Boolean);
            const kanbanId = String(record.kanban_id ?? '').trim();
            const defectEntries = getSubmittedDBRecordDefects(record);
            const totalDefects = defectEntries.reduce((sum, defect) => sum + defect.count, 0);
            const hasIssue = totalDefects > 0
                || troubleTime > 0
                || String(record.remarks ?? '').trim() !== ''
                || String(record.other_description ?? '').trim() !== '';

            totalGoodCount += goodCount;
            totalDefectCount += totalDefects;
            totalTroubleHours += troubleTime;

            if (Number.isFinite(cycleTime) && cycleTime > 0) {
                cycleTimeTotal += cycleTime;
                cycleTimeSamples += 1;
            }

            if (kanbanId) {
                activeKanbans.add(kanbanId);
            }

            operatorNames.forEach(name => {
                activeOperators.add(name);
                const operatorEntry = operatorMap.get(name) || {
                    name,
                    submissions: 0,
                    totalGoodCount: 0,
                    totalManHours: 0,
                    totalTroubleHours: 0,
                    cycleTimeTotal: 0,
                    cycleTimeSamples: 0
                };

                operatorEntry.submissions += 1;
                operatorEntry.totalGoodCount += goodCount;
                operatorEntry.totalManHours += manHours;
                operatorEntry.totalTroubleHours += troubleTime;
                operatorEntry.liveSessionCount = operatorEntry.liveSessionCount || 0;
                operatorEntry.activeStatus = operatorEntry.activeStatus || 'idle';
                operatorEntry.activeMachines = Array.isArray(operatorEntry.activeMachines) ? operatorEntry.activeMachines : [];
                if (Number.isFinite(cycleTime) && cycleTime > 0) {
                    operatorEntry.cycleTimeTotal += cycleTime;
                    operatorEntry.cycleTimeSamples += 1;
                }
                operatorMap.set(name, operatorEntry);
            });

            const productKey = [record.hinban, record.product_name, record.lh_rh]
                .map(value => String(value ?? '').trim())
                .join('||');
            const productEntry = productMap.get(productKey) || {
                hinban: record.hinban || '',
                productName: record.product_name || '',
                lhRh: record.lh_rh || '',
                submissions: 0,
                totalGoodCount: 0,
                cycleTimeTotal: 0,
                cycleTimeSamples: 0
            };

            productEntry.submissions += 1;
            productEntry.totalGoodCount += goodCount;
            if (Number.isFinite(cycleTime) && cycleTime > 0) {
                productEntry.cycleTimeTotal += cycleTime;
                productEntry.cycleTimeSamples += 1;
            }
            productMap.set(productKey, productEntry);

            defectEntries.forEach(defect => {
                defectMap.set(defect.name, (defectMap.get(defect.name) || 0) + defect.count);
            });

            if (hasIssue) {
                issueRecords.push({
                    id: record._id,
                    timestamp: record.timestamp,
                    productName: record.product_name || '',
                    hinban: record.hinban || '',
                    kanbanId: record.kanban_id || '',
                    operators: operatorNames,
                    totalDefects,
                    troubleTime,
                    remarks: String(record.remarks ?? '').trim(),
                    otherDescription: String(record.other_description ?? '').trim(),
                    topDefects: defectEntries
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 2)
                });
            }
        });

        sessionRecords.forEach(session => {
            const sessionDate = normalizeTabletSessionDate(session.updatedAt || session.workStartTime);
            if (!sessionDate || getJapanCalendarDate(sessionDate).key !== today.key) {
                return;
            }

            const operatorNames = normalizeTabletSessionOperators(session.operators);
            if (operatorNames.length === 0) {
                return;
            }

            const kanbanId = normalizeTabletSessionString(session.kanbanId);
            if (kanbanId) {
                activeKanbans.add(kanbanId);
            }

            const sessionStatus = normalizeTabletSessionString(session.status) || 'running';
            const durations = getMachineStatusDurationMetrics(session, now);
            const liveManHours = Math.max(0, durations.netRunMinutes / 60);
            const machineName = normalizeTabletSessionString(session.equipmentName || session.tabletName);

            operatorNames.forEach(name => {
                activeOperators.add(name);
                const operatorEntry = operatorMap.get(name) || {
                    name,
                    submissions: 0,
                    totalGoodCount: 0,
                    totalManHours: 0,
                    totalTroubleHours: 0,
                    cycleTimeTotal: 0,
                    cycleTimeSamples: 0,
                    liveSessionCount: 0,
                    activeStatus: 'idle',
                    activeMachines: []
                };

                operatorEntry.totalManHours += liveManHours;
                operatorEntry.liveSessionCount += 1;
                operatorEntry.activeStatus = pickDominantWorkerStatus(operatorEntry.activeStatus, sessionStatus);
                if (machineName && !operatorEntry.activeMachines.includes(machineName)) {
                    operatorEntry.activeMachines.push(machineName);
                }

                operatorMap.set(name, operatorEntry);
            });
        });

        const trendMap = new Map(last7Days.map(day => [day.key, {
            date: day.key,
            label: day.label,
            submissions: 0,
            goodCount: 0,
            defectCount: 0
        }]));

        trendRecords.forEach(record => {
            const key = `${record.date_year}-${String(record.date_month).padStart(2, '0')}-${String(record.date_day).padStart(2, '0')}`;
            const trendEntry = trendMap.get(key);
            if (!trendEntry) return;

            trendEntry.submissions += 1;
            trendEntry.goodCount += Number(record.good_count ?? 0) || 0;
            trendEntry.defectCount += getSubmittedDBTotalDefects(record);
        });

        const topDefects = [...defectMap.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        const topProducts = [...productMap.values()]
            .sort((a, b) => b.totalGoodCount - a.totalGoodCount || b.submissions - a.submissions)
            .slice(0, 5)
            .map(product => ({
                ...product,
                averageCycleTime: product.cycleTimeSamples > 0
                    ? product.cycleTimeTotal / product.cycleTimeSamples
                    : 0
            }));

        const topOperators = [...operatorMap.values()]
            .sort((a, b) => b.totalGoodCount - a.totalGoodCount || b.submissions - a.submissions)
            .slice(0, 5)
            .map(operator => ({
                ...operator,
                averageCycleTime: operator.cycleTimeSamples > 0
                    ? operator.cycleTimeTotal / operator.cycleTimeSamples
                    : 0
            }));

        const workerHoursToday = [...operatorMap.values()]
            .sort((a, b) => b.totalManHours - a.totalManHours || b.submissions - a.submissions || a.name.localeCompare(b.name, 'ja'))
            .map(operator => {
                const displayWorkHours = Math.min(operator.totalManHours, dashboardWorkdayHours);
                return {
                    name: operator.name,
                    submissions: operator.submissions,
                    totalManHours: operator.totalManHours,
                    displayWorkHours,
                    shiftProgressPercent: dashboardWorkdayHours > 0
                        ? Math.min((displayWorkHours / dashboardWorkdayHours) * 100, 100)
                        : 0,
                    totalGoodCount: operator.totalGoodCount,
                    totalTroubleHours: operator.totalTroubleHours,
                    activeStatus: operator.activeStatus || 'idle',
                    activeMachines: Array.isArray(operator.activeMachines) ? operator.activeMachines : [],
                    liveSessionCount: operator.liveSessionCount || 0
                };
            });

        const activeOperatorList = [...operatorMap.values()]
            .sort((a, b) => b.totalGoodCount - a.totalGoodCount || b.submissions - a.submissions || a.name.localeCompare(b.name, 'ja'))
            .map(operator => ({
                ...operator,
                averageCycleTime: operator.cycleTimeSamples > 0
                    ? operator.cycleTimeTotal / operator.cycleTimeSamples
                    : 0
            }));

        const mappedTodayRecords = todayRecords.map(record => {
            const defectEntries = getSubmittedDBRecordDefects(record)
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));

            return {
                id: record._id,
                timestamp: record.timestamp,
                productName: record.product_name || '',
                hinban: record.hinban || '',
                kanbanId: record.kanban_id || '',
                operators: SUBMITTED_DB_OPERATOR_FIELDS
                    .map(field => record[field])
                    .map(name => String(name ?? '').trim())
                    .filter(Boolean),
                goodCount: Number(record.good_count ?? 0) || 0,
                totalDefects: defectEntries.reduce((sum, defect) => sum + defect.count, 0),
                troubleTime: Number(record.trouble_time ?? 0) || 0,
                cycleTime: Number(record.cycle_time ?? 0) || 0,
                source: record.submitted_from || '',
                lhRh: record.lh_rh || '',
                remarks: String(record.remarks ?? '').trim(),
                otherDescription: String(record.other_description ?? '').trim(),
                topDefects: defectEntries.slice(0, 3)
            };
        });

        const mappedRecentRecords = recentRecords.map(record => ({
            id: record._id,
            timestamp: record.timestamp,
            productName: record.product_name || '',
            hinban: record.hinban || '',
            kanbanId: record.kanban_id || '',
            operators: SUBMITTED_DB_OPERATOR_FIELDS
                .map(field => record[field])
                .map(name => String(name ?? '').trim())
                .filter(Boolean),
            goodCount: Number(record.good_count ?? 0) || 0,
            totalDefects: getSubmittedDBTotalDefects(record),
            troubleTime: Number(record.trouble_time ?? 0) || 0,
            cycleTime: Number(record.cycle_time ?? 0) || 0,
            source: record.submitted_from || '',
            lhRh: record.lh_rh || ''
        }));

        res.json({
            success: true,
            generatedAt: now.toISOString(),
            today: {
                date: today.key,
                submissions: todayRecords.length,
                totalGoodCount,
                totalDefectCount,
                totalTroubleHours,
                issueCount: issueRecords.length,
                activeOperators: activeOperators.size,
                activeKanbans: activeKanbans.size,
                averageCycleTime: cycleTimeSamples > 0 ? cycleTimeTotal / cycleTimeSamples : 0
            },
            meta: {
                activeRecords,
                trashRecords
            },
            todaySubmissions: mappedTodayRecords,
            activeOperatorList,
            recentSubmissions: mappedRecentRecords,
            problemsToday: {
                topDefects,
                totalIssueRecords: issueRecords.length,
                issueRecords: issueRecords.slice(0, 6),
                allIssueRecords: issueRecords
            },
            topProducts,
            topOperators,
            workerHoursToday,
            dailyTrend: last7Days.map(day => trendMap.get(day.key))
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching dashboard summary:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to load dashboard summary' });
    }
});

function normalizeMachineStatusStringList(values = []) {
    return (Array.isArray(values) ? values : [values])
        .map(value => String(value ?? '').trim())
        .filter(Boolean);
}

function getMachineStatusDurationMetrics(session = {}, now = new Date()) {
    const workStartTime = normalizeTabletSessionDate(session.workStartTime);
    const breakStartTime = normalizeTabletSessionDate(session.breakStartTime);
    const troubleStartTime = normalizeTabletSessionDate(session.troubleStartTime);

    if (!workStartTime) {
        return {
            elapsedMinutes: 0,
            stoppedMinutes: 0,
            netRunMinutes: 0
        };
    }

    const elapsedMinutes = Math.max(0, (now.getTime() - workStartTime.getTime()) / 60000);
    let stoppedMinutes = Math.max(0, normalizeTabletSessionNumber(session.totalBreakHours, 0) * 60)
        + Math.max(0, normalizeTabletSessionNumber(session.totalTroubleHours, 0) * 60);

    if (session.breakActive && breakStartTime) {
        stoppedMinutes += Math.max(0, (now.getTime() - breakStartTime.getTime()) / 60000);
    }

    if (session.troubleActive && troubleStartTime) {
        stoppedMinutes += Math.max(0, (now.getTime() - troubleStartTime.getTime()) / 60000);
    }

    return {
        elapsedMinutes,
        stoppedMinutes,
        netRunMinutes: Math.max(0, elapsedMinutes - stoppedMinutes)
    };
}

app.get('/api/admin/dashboard-machine-status', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const db = mongoClient.db(req.dbName || 'KSG');
        const now = new Date();
        const machineStatusRank = {
            trouble: 3,
            break: 2,
            running: 1,
            idle: 0
        };
        const [equipmentRecords, tabletRecords, sessionRecords] = await Promise.all([
            db.collection('equipment')
                .find({}, { projection: { _id: 1, 設備名: 1, 工場: 1, description: 1 } })
                .sort({ 設備名: 1 })
                .toArray(),
            db.collection('tabletDB')
                .find({ enabled: { $ne: false } }, { projection: { _id: 1, tabletName: 1, 設備名: 1, factoryLocation: 1 } })
                .sort({ 設備名: 1, tabletName: 1 })
                .toArray(),
            db.collection(TABLET_ACTIVE_SESSION_COLLECTION)
                .find({})
                .sort({ updatedAt: -1 })
                .toArray()
        ]);

        const machineMap = new Map();

        const ensureMachineEntry = (machineKey, seed = {}) => {
            if (!machineMap.has(machineKey)) {
                machineMap.set(machineKey, {
                    machineKey,
                    machineName: '',
                    factoryLocations: [],
                    tabletId: '',
                    tabletName: '',
                    description: '',
                    session: null
                });
            }

            const current = machineMap.get(machineKey);
            if (seed.machineName) current.machineName = seed.machineName;
            if (seed.tabletId) current.tabletId = seed.tabletId;
            if (seed.tabletName) current.tabletName = seed.tabletName;
            if (seed.description) current.description = seed.description;
            if (Array.isArray(seed.factoryLocations) && seed.factoryLocations.length > 0) {
                current.factoryLocations = [...new Set([...current.factoryLocations, ...seed.factoryLocations])];
            }
            if (seed.session) current.session = seed.session;

            return current;
        };

        equipmentRecords.forEach(record => {
            const machineName = String(record.設備名 ?? '').trim();
            if (!machineName) return;

            ensureMachineEntry(machineName, {
                machineName,
                description: String(record.description ?? '').trim(),
                factoryLocations: normalizeMachineStatusStringList(record.工場)
            });
        });

        tabletRecords.forEach(record => {
            const machineName = String(record.設備名 ?? '').trim() || String(record.tabletName ?? '').trim();
            if (!machineName) return;

            ensureMachineEntry(machineName, {
                machineName,
                tabletId: record._id ? String(record._id) : '',
                tabletName: String(record.tabletName ?? '').trim(),
                factoryLocations: normalizeMachineStatusStringList(record.factoryLocation)
            });
        });

        sessionRecords.forEach(record => {
            const machineName = String(record.equipmentName ?? '').trim() || String(record.tabletName ?? '').trim() || String(record.tabletId ?? '').trim();
            if (!machineName) return;

            ensureMachineEntry(machineName, {
                machineName,
                tabletId: String(record.tabletId ?? '').trim(),
                tabletName: String(record.tabletName ?? '').trim(),
                factoryLocations: normalizeMachineStatusStringList(record.factoryLocation),
                session: record
            });
        });

        const machineEntries = [...machineMap.values()];
        const kanbanIds = [...new Set(machineEntries.map(entry => String(entry.session?.kanbanId ?? '').trim()).filter(Boolean))];
        const productIds = [...new Set(machineEntries.map(entry => String(entry.session?.productId ?? '').trim()).filter(Boolean))];

        let productRecords = [];
        if (kanbanIds.length > 0 || productIds.length > 0) {
            const productFilters = [];
            if (kanbanIds.length > 0) productFilters.push({ kanbanID: { $in: kanbanIds } });
            if (productIds.length > 0) productFilters.push({ 品番: { $in: productIds } });

            productRecords = await db.collection('masterDB')
                .find({ $or: productFilters }, { projection: { _id: 1, 品番: 1, 製品名: 1, kanbanID: 1, cycleTime: 1 } })
                .toArray();
        }

        const productByKanban = new Map();
        const productById = new Map();
        productRecords.forEach(record => {
            const kanbanId = String(record.kanbanID ?? '').trim();
            const productId = String(record.品番 ?? '').trim();
            if (kanbanId && !productByKanban.has(kanbanId)) productByKanban.set(kanbanId, record);
            if (productId && !productById.has(productId)) productById.set(productId, record);
        });

        const rows = machineEntries
            .map(entry => {
                const session = entry.session || null;
                const sessionKanbanId = String(session?.kanbanId ?? '').trim();
                const sessionProductId = String(session?.productId ?? '').trim();
                const matchedProduct = productByKanban.get(sessionKanbanId) || productById.get(sessionProductId) || null;
                const cycleTime = Math.max(0, normalizeTabletSessionNumber(matchedProduct?.cycleTime, 0));
                const durations = getMachineStatusDurationMetrics(session || {}, now);
                const currentCount = session?.isStarted ? Math.max(0, normalizeTabletSessionNumber(session.currentCount, 0)) : null;
                const expectedCount = cycleTime > 0 && durations.netRunMinutes > 0
                    ? durations.netRunMinutes / cycleTime
                    : 0;
                const efficiency = currentCount !== null && expectedCount > 0
                    ? (currentCount / expectedCount) * 100
                    : null;

                return {
                    machineKey: entry.machineKey,
                    machineName: entry.machineName || '—',
                    machineDescription: entry.description || '',
                    factory: entry.factoryLocations.join(', '),
                    tabletId: entry.tabletId || '',
                    tabletName: entry.tabletName || '',
                    status: String(session?.status ?? '').trim() || 'idle',
                    isStarted: Boolean(session?.isStarted),
                    productId: String(matchedProduct?.品番 ?? session?.productId ?? '').trim(),
                    productName: String(matchedProduct?.製品名 ?? session?.productName ?? '').trim(),
                    kanbanId: String(matchedProduct?.kanbanID ?? sessionKanbanId).trim(),
                    operators: normalizeMachineStatusStringList(session?.operators),
                    targetQuantity: null,
                    startTime: String(session?.startTime ?? '').trim(),
                    elapsedMinutes: Math.round(durations.elapsedMinutes),
                    stoppedMinutes: Math.round(durations.stoppedMinutes),
                    netRunMinutes: Math.round(durations.netRunMinutes),
                    currentCount,
                    efficiency,
                    cycleTime,
                    updatedAt: session?.updatedAt || null
                };
            })
            .sort((a, b) => {
                const statusDiff = (machineStatusRank[b.status] ?? 0) - (machineStatusRank[a.status] ?? 0);
                if (statusDiff !== 0) return statusDiff;
                const startedDiff = Number(b.isStarted) - Number(a.isStarted);
                if (startedDiff !== 0) return startedDiff;
                return a.machineName.localeCompare(b.machineName, 'ja');
            });

        res.json({
            success: true,
            generatedAt: now.toISOString(),
            rows
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching machine status dashboard:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to load machine status dashboard' });
    }
});

// GET /api/admin/submitted-db  — Fetch submittedDB records with filtering, sorting, pagination
app.get('/api/admin/submitted-db', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const view = req.query.view === 'trash' ? 'trash' : 'active';
        const exportAll = req.query.all === 'true' || req.query.all === '1';

        // --- Build MongoDB filter ---
        const baseFilter = {};

        // Date range uses the stored calendar fields because timestamp is saved as an ISO string.
        const dateRangeExpr = buildSubmittedDBDateRangeExpr(req.query.startDate, req.query.endDate);
        if (dateRangeExpr) {
            baseFilter.$expr = dateRangeExpr;
        }

        // Text filters (case-insensitive)
        if (req.query.hinban)      baseFilter.hinban      = { $regex: req.query.hinban,      $options: 'i' };
        if (req.query.productName) baseFilter.product_name = { $regex: req.query.productName, $options: 'i' };
        if (req.query.operator)    baseFilter.$or = [
            { operator1: { $regex: req.query.operator, $options: 'i' } },
            { operator2: { $regex: req.query.operator, $options: 'i' } }
        ];
        if (req.query.lhRh && req.query.lhRh !== 'all') baseFilter.lh_rh = req.query.lhRh;
        if (req.query.kanbanId)    baseFilter.kanban_id   = { $regex: req.query.kanbanId,    $options: 'i' };

        const filter = {
            ...baseFilter,
            ...(view === 'trash' ? { is_deleted: true } : { is_deleted: { $ne: true } })
        };

        // --- Sorting ---
        const sortField = req.query.sortField || 'timestamp';
        const sortDir   = req.query.sortDir   === 'asc' ? 1 : -1;
        const sort = { [sortField]: sortDir };

        // --- Pagination ---
        const limit = exportAll ? 0 : Math.min(parseInt(req.query.limit) || 100, 500);
        const page  = exportAll ? 1 : Math.max(parseInt(req.query.page)  || 1, 1);
        const skip  = (page - 1) * limit;

        const findCursor = collection.find(filter).sort(sort);
        if (!exportAll) {
            findCursor.skip(skip).limit(limit);
        }

        // --- Execute ---
        const [data, total, activeCount, trashCount] = await Promise.all([
            findCursor.toArray(),
            collection.countDocuments(filter),
            collection.countDocuments({ ...baseFilter, is_deleted: { $ne: true } }),
            collection.countDocuments({ ...baseFilter, is_deleted: true })
        ]);

        // --- Aggregate summary ---
        const summaryPipeline = [
            { $match: filter },
            { $group: {
                _id: null,
                totalGoodCount:  { $sum: '$good_count' },
                totalManHours:   { $sum: '$man_hours' },
                totalBreakTime:  { $sum: '$break_time' },
                totalTroubleTime:{ $sum: '$trouble_time' },
                recordCount:     { $sum: 1 }
            }}
        ];
        const summaryResult = await collection.aggregate(summaryPipeline).toArray();
        const summary = summaryResult[0] || { totalGoodCount: 0, totalManHours: 0, totalBreakTime: 0, totalTroubleTime: 0, recordCount: 0 };

        res.json({
            success: true,
            data,
            total,
            page,
            limit: exportAll ? total : limit,
            totalPages: exportAll ? 1 : Math.ceil(total / limit),
            summary,
            view,
            counts: {
                active: activeCount,
                trash: trashCount
            },
            canPermanentDelete: !!req.canPermanentDelete
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching submittedDB:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/submitted-db/soft-delete', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No submitted data selected' });
        }

        const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid submitted data IDs provided' });
        }

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const deletedAt = new Date();
        const trashExpiresAt = new Date(deletedAt);
        trashExpiresAt.setMonth(trashExpiresAt.getMonth() + 2);
        const result = await collection.updateMany(
            { _id: { $in: validIds }, is_deleted: { $ne: true } },
            {
                $set: {
                    is_deleted: true,
                    deleted_at: deletedAt,
                    deleted_by: req.username,
                    deleted_by_role: req.userRole,
                    trash_expires_at: trashExpiresAt
                }
            }
        );

        res.json({
            success: true,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error soft-deleting submittedDB records:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/submitted-db/:id', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const recordId = req.params?.id;
        if (!ObjectId.isValid(recordId)) {
            return res.status(400).json({ success: false, error: 'Invalid submitted data ID' });
        }

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const data = await collection.findOne({
            _id: new ObjectId(recordId),
            is_deleted: { $ne: true }
        });

        if (!data) {
            return res.status(404).json({ success: false, error: 'Submitted data not found' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching submittedDB record:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch submitted data' });
    }
});

app.patch('/api/admin/submitted-db/:id', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const recordId = req.params?.id;
        if (!ObjectId.isValid(recordId)) {
            return res.status(400).json({ success: false, error: 'Invalid submitted data ID' });
        }

        const updates = normalizeSubmittedDBUpdates(req.body?.updates || {});
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No editable fields provided' });
        }

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const _id = new ObjectId(recordId);
        const result = await collection.updateOne(
            { _id, is_deleted: { $ne: true } },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, error: 'Submitted data not found' });
        }

        const data = await collection.findOne({ _id });
        res.json({ success: true, data });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 500) {
            console.error('❌ [ADMIN] Error updating submittedDB record:', error);
        }
        res.status(statusCode).json({ success: false, error: error.message || 'Failed to update submitted data' });
    }
});

app.post('/api/admin/submitted-db/restore', validateSubmittedDBAccess, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No submitted data selected' });
        }

        const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid submitted data IDs provided' });
        }

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const result = await collection.updateMany(
            { _id: { $in: validIds }, is_deleted: true },
            {
                $set: {
                    is_deleted: false
                },
                $unset: {
                    deleted_at: '',
                    deleted_by: '',
                    deleted_by_role: '',
                    trash_expires_at: ''
                }
            }
        );

        res.json({
            success: true,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error restoring submittedDB records:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/submitted-db/permanent-delete', validateSubmittedDBPermanentDelete, async (req, res) => {
    try {
        if (!mongoClient) return res.status(503).json({ success: false, error: 'Database not connected' });

        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No submitted data selected' });
        }

        const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid submitted data IDs provided' });
        }

        const db = mongoClient.db(req.dbName || 'KSG');
        const collection = db.collection('submittedDB');
        const result = await collection.deleteMany({
            _id: { $in: validIds },
            is_deleted: true
        });

        res.json({
            success: true,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error permanently deleting submittedDB records:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================

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

// Helper function: Broadcast variables to a specific tablet
async function broadcastVariablesToTablet(socket, company) {
    try {
        console.log(`🔍 Broadcasting variables to tablet for company: ${company}`);
        const { ObjectId } = require('mongodb');
        const db = mongoClient.db(company);
        const conversions = await db.collection('opcua_conversions').find({}).toArray();
        const devices = await db.collection('deviceInfo').find({}).toArray();
        
        console.log(`📋 Found ${conversions.length} variables and ${devices.length} devices`);
        
        const variables = {};
        const now = new Date();
        
        for (const variable of conversions) {
            console.log(`🔧 Processing variable: ${variable.variableName} (${variable.sourceType})`);
            try {
                let calculatedValue = null;
                let quality = 'Unknown';
                let dataTimestamp = null;
                let dataAge = null;
                let isStale = false;
                
                // Check if it's a simple conversion variable (not combined)
                if (variable.sourceType !== 'combined' && variable.raspberryId) {
                    // Get the device - try both _id (ObjectId) and device_id (string)
                    const device = devices.find(d => 
                        d._id.toString() === variable.raspberryId || 
                        d.device_id === variable.raspberryId
                    );
                    console.log(`🔍 Looking for device ${variable.raspberryId}, found:`, !!device);
                    
                    if (device) {
                        // Try to get datapoint by opcNodeId first (stable), then fall back to datapointId
                        let datapoint = null;
                        
                        if (variable.opcNodeId) {
                            datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                opcNodeId: variable.opcNodeId,
                                raspberryId: variable.raspberryId
                            });
                        }
                        
                        // Fallback to datapointId
                        if (!datapoint && variable.datapointId) {
                            try {
                                datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                    _id: new ObjectId(variable.datapointId),
                                    raspberryId: variable.raspberryId
                                });
                            } catch (e) {
                                // Invalid ObjectId
                            }
                        }
                        
                        if (datapoint && datapoint.value !== undefined) {
                            let rawValue = datapoint.value;
                            
                            // Get actual data timestamp and quality from opcua_realtime if available
                            const realtimeData = await db.collection('opcua_realtime').findOne({
                                raspberryId: variable.raspberryId,
                                opcNodeId: datapoint.opcNodeId
                            });
                            
                            if (realtimeData) {
                                quality = realtimeData.quality || 'Unknown';
                                dataTimestamp = realtimeData.sourceTimestamp || realtimeData.updatedAt;
                                
                                // Calculate data age in seconds
                                if (dataTimestamp) {
                                    const timestampDate = new Date(dataTimestamp);
                                    dataAge = Math.floor((now - timestampDate) / 1000);
                                    // Mark as stale if older than 60 seconds
                                    isStale = dataAge > 60;
                                }
                            } else {
                                // Fallback to discovered node timestamp
                                dataTimestamp = datapoint.discoveredAt || datapoint.updatedAt;
                                quality = 'Unknown';
                                if (dataTimestamp) {
                                    const timestampDate = new Date(dataTimestamp);
                                    dataAge = Math.floor((now - timestampDate) / 1000);
                                    isStale = dataAge > 60;
                                }
                            }
                            
                            // Extract array value if needed
                            if (variable.arrayIndex !== undefined && variable.arrayIndex !== null && Array.isArray(rawValue)) {
                                rawValue = rawValue[variable.arrayIndex];
                            }
                            
                            // Apply conversion
                            calculatedValue = applyConversionOnServer(rawValue, variable.conversionFromType, variable.conversionToType);
                            console.log(`✅ ${variable.variableName} = ${calculatedValue}`);
                        }
                    }
                } else if (variable.sourceType === 'combined' && variable.sourceVariables && variable.operation) {
                    console.log(`🔗 Processing combined variable with ${variable.sourceVariables?.length} sources`);
                    // Get values of all source variables
                    const sourceValues = [];
                    const sourceQualities = [];
                    const sourceTimestamps = [];
                    
                    for (const sourceVarName of variable.sourceVariables) {
                        const sourceVar = conversions.find(v => v.variableName === sourceVarName);
                        if (sourceVar && sourceVar.raspberryId) {
                            // Try to get datapoint by opcNodeId first (stable), then fall back to datapointId
                            let datapoint = null;
                            
                            if (sourceVar.opcNodeId) {
                                datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                    opcNodeId: sourceVar.opcNodeId,
                                    raspberryId: sourceVar.raspberryId
                                });
                            }
                            
                            // Fallback to datapointId
                            if (!datapoint && sourceVar.datapointId) {
                                try {
                                    datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                        _id: new ObjectId(sourceVar.datapointId),
                                        raspberryId: sourceVar.raspberryId
                                    });
                                } catch (e) {
                                    // Invalid ObjectId
                                }
                            }
                            
                            if (datapoint && datapoint.value !== undefined) {
                                let rawValue = datapoint.value;
                                if (sourceVar.arrayIndex !== undefined && sourceVar.arrayIndex !== null && Array.isArray(rawValue)) {
                                    rawValue = rawValue[sourceVar.arrayIndex];
                                }
                                const converted = applyConversionOnServer(rawValue, sourceVar.conversionFromType, sourceVar.conversionToType);
                                sourceValues.push(converted);
                                
                                // Get quality for this source
                                const realtimeData = await db.collection('opcua_realtime').findOne({
                                    raspberryId: sourceVar.raspberryId,
                                    opcNodeId: datapoint.opcNodeId
                                });
                                
                                if (realtimeData) {
                                    sourceQualities.push(realtimeData.quality || 'Unknown');
                                    sourceTimestamps.push(realtimeData.sourceTimestamp || realtimeData.updatedAt);
                                } else {
                                    sourceQualities.push('Unknown');
                                    sourceTimestamps.push(datapoint.discoveredAt || datapoint.updatedAt);
                                }
                            }
                        }
                    }
                    
                    // Apply operation
                    if (sourceValues.length > 0) {
                        calculatedValue = applyCombinedOperation(sourceValues, variable.operation);
                        
                        // Combined quality: Bad if any Bad, Uncertain if any Uncertain, else Good
                        if (sourceQualities.includes('Bad')) {
                            quality = 'Bad';
                        } else if (sourceQualities.includes('Uncertain')) {
                            quality = 'Uncertain';
                        } else if (sourceQualities.every(q => q === 'Good')) {
                            quality = 'Good';
                        } else {
                            quality = 'Unknown';
                        }
                        
                        // Use oldest timestamp
                        if (sourceTimestamps.length > 0) {
                            dataTimestamp = sourceTimestamps.reduce((oldest, ts) => {
                                return new Date(ts) < new Date(oldest) ? ts : oldest;
                            });
                            
                            if (dataTimestamp) {
                                const timestampDate = new Date(dataTimestamp);
                                dataAge = Math.floor((now - timestampDate) / 1000);
                                isStale = dataAge > 60;
                            }
                        }
                        console.log(`✅ Combined ${variable.variableName} = ${calculatedValue}`);
                    }
                }

                variables[variable.variableName] = {
                    value: calculatedValue,
                    quality: quality,
                    timestamp: dataTimestamp,
                    dataAge: dataAge,
                    isStale: isStale
                };
            } catch (error) {
                console.error(`❌ Error processing variable ${variable.variableName}:`, error);
                variables[variable.variableName] = {
                    value: null,
                    quality: 'Bad',
                    timestamp: null,
                    dataAge: null,
                    isStale: true
                };
            }
        }
        
        console.log(`📤 Sending ${Object.keys(variables).length} variables to tablet:`, Object.keys(variables));
        // Send to tablet
        socket.emit('opcua_variables_update', { variables });
        
    } catch (error) {
        console.error('❌ Error broadcasting variables to tablet:', error);
    }
}

// Helper function: Broadcast variables to all tablets subscribed to a company
async function broadcastVariablesToAllTablets(company) {
    try {
        // Get all connected sockets - io.sockets.sockets is a Map
        const allSockets = Array.from(io.sockets.sockets.values());
        const tabletsForCompany = allSockets.filter(s => s.tabletCompany === company);
        
        if (tabletsForCompany.length === 0) {
            return; // No tablets subscribed to this company
        }
        
        console.log(`🔔 Broadcasting real-time updates to ${tabletsForCompany.length} tablets for ${company}`);
        
        // Broadcast to each tablet
        for (const socket of tabletsForCompany) {
            await broadcastVariablesToTablet(socket, company);
        }
        
    } catch (error) {
        console.error('Error broadcasting to all tablets:', error);
    }
}

// � Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('📱 ESP32 device connected:', socket.id);
    
    // Handle tablet subscription to real-time variable updates
    socket.on('subscribe_variables', async (data) => {
        try {
            const token = data.token;
            const company = data.company || 'KSG';
            
            // Validate token and check user enable status
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const db = mongoClient.db(decoded.dbName || 'KSG');
                    const user = await db.collection('users').findOne({ username: decoded.username });
                    
                    if (!user || user.enable !== 'enabled') {
                        console.log(`❌ Tablet ${socket.id} authentication failed: user disabled or not found`);
                        socket.emit('auth_error', { error: 'Account is disabled', forceLogout: true });
                        return;
                    }
                    
                    socket.authenticatedUser = decoded.username;
                    console.log(`✅ Tablet ${socket.id} authenticated as ${decoded.username}`);
                } catch (err) {
                    console.log(`❌ Tablet ${socket.id} token validation failed:`, err.message);
                    socket.emit('auth_error', { error: 'Invalid or expired token', forceLogout: true });
                    return;
                }
            }
            
            console.log(`📊 Tablet ${socket.id} subscribed to variables for ${company}`);
            
            // Store company in socket for broadcasting
            socket.tabletCompany = company;
            
            // 🔧 JOIN THE ROOM - This was missing!
            const room = `opcua_${company}`;
            socket.join(room);
            console.log(`🏠 Tablet ${socket.id} joined room: ${room}`);
            
            // Send initial values immediately
            await broadcastVariablesToTablet(socket, company);
            
        } catch (error) {
            console.error('Error subscribing to variables:', error);
        }
    });
    
    // Handle immediate variable data request (triggered by variable config updates)
    socket.on('requestVariables', async (data) => {
        try {
            const company = data.company || 'KSG';
            console.log(`🔄 Tablet ${socket.id} requesting fresh variables for ${company}`);
            
            // Send fresh variable data immediately
            await broadcastVariablesToTablet(socket, company);
            
        } catch (error) {
            console.error('Error sending requested variables:', error);
        }
    });
    
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

    socket.on('admin_dashboard_register', async (data = {}) => {
        try {
            const session = extractSubmittedDBSocketContext(data);
            const userContext = await resolveSubmittedDBUserFromSession(session);
            const room = getAdminDashboardRoomName(userContext.dbName);

            if (socket.adminDashboardRoom && socket.adminDashboardRoom !== room) {
                socket.leave(socket.adminDashboardRoom);
            }

            socket.join(room);
            socket.adminDashboardRoom = room;
            socket.clientType = 'admin-dashboard';

            console.log(`📈 Admin dashboard ${socket.id} subscribed to ${room} as ${userContext.username}`);
            socket.emit('admin_dashboard_registered', {
                success: true,
                dbName: userContext.dbName,
                username: userContext.username,
                room
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;
            if (statusCode === 500) {
                console.error('❌ Admin dashboard socket registration error:', error);
            }
            socket.emit('admin_dashboard_error', {
                error: error.message || 'Dashboard subscription failed',
                statusCode
            });
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
            const { raspberryId, equipmentId, data: datapoints, discovered_nodes } = data;
            const deviceId = raspberryId; // device_id from Raspberry Pi
            
            // Handle discovered nodes (from discovered_nodes key)
            const nodesToProcess = datapoints || discovered_nodes || [];
            
            if (!deviceId || nodesToProcess.length === 0) {
                console.error('❌ Invalid opcua_data_change payload - no deviceId or data');
                return;
            }
            
            // Find which company/database this device belongs to
            // First try deviceInfo collection (new system)
            let dbName = null;
            let company = null;
            
            // Check all possible companies by looking at deviceInfo
            const masterDB = mongoClient.db(DB_NAME);
            const masterUsers = await masterDB.collection(COLLECTION_NAME).find({}).toArray();
            
            for (const user of masterUsers) {
                const testDb = mongoClient.db(user.company || user.dbName);
                const device = await testDb.collection('deviceInfo').findOne({ device_id: deviceId });
                
                if (device) {
                    dbName = user.company || user.dbName;
                    company = user.company;
                    console.log(`✅ Found device ${deviceId} in company: ${company}`);
                    break;
                }
            }
            
            // Fallback: Try old devices structure
            if (!dbName) {
                const user = await masterDB.collection(COLLECTION_NAME).findOne({
                    'devices': {
                        $elemMatch: { uniqueId: deviceId }
                    }
                });
                
                if (user) {
                    dbName = user.dbName;
                    company = user.company;
                }
            }
            
            if (!dbName) {
                console.error(`❌ Device ${deviceId} not found in any company database`);
                return;
            }
            
            const db = mongoClient.db(dbName);
            
            // Separate configured datapoints from discovered nodes
            const configuredDatapoints = nodesToProcess.filter(item => item.datapointId && item.equipmentId);
            const discoveredNodesData = nodesToProcess.filter(item => !item.datapointId || !item.equipmentId);
            
            // Save configured datapoints to MongoDB (async, non-blocking)
            if (configuredDatapoints.length > 0) {
                const bulkOps = configuredDatapoints.map(item => ({
                    updateOne: {
                        filter: { 
                            datapointId: item.datapointId,
                            device_id: deviceId 
                        },
                        update: {
                            $set: {
                                device_id: deviceId,
                                raspberryId: deviceId, // Keep for backward compatibility
                                equipmentId: item.equipmentId || equipmentId,
                                datapointId: item.datapointId,
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
            }
            
            // Update device last_seen in deviceInfo
            db.collection('deviceInfo').updateOne(
                { device_id: deviceId },
                { 
                    $set: { 
                        updated_at: new Date().toISOString() 
                    } 
                }
            ).catch(err => {
                console.error('❌ Error updating device timestamp:', err.message);
            });
            
            // Update all nodes (both configured and discovered) in opcua_discovered_nodes
            const allNodesUpdates = [];
            nodesToProcess.forEach(item => {
                allNodesUpdates.push(
                    db.collection('opcua_discovered_nodes').updateOne(
                        { 
                            raspberryId: deviceId,
                            opcNodeId: item.opcNodeId 
                        },
                        {
                            $set: {
                                value: item.value,
                                currentValue: typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value),
                                updatedAt: new Date().toISOString()
                            }
                        }
                    )
                );
            });
            
            // Wait for all nodes to be updated
            await Promise.all(allNodesUpdates).catch(err => {
                console.error('❌ Error updating discovered nodes:', err.message);
            });
            
            // Broadcast to company room for OPC Management page
            const broadcastData = {
                device_id: deviceId,
                raspberryId: deviceId, // backward compatibility
                equipmentId,
                data: nodesToProcess.map(item => ({
                    datapointId: item.datapointId,
                    opcNodeId: item.opcNodeId,
                    value: item.value,
                    quality: item.quality,
                    timestamp: item.timestamp
                }))
            };
            
            // Emit to company-specific room for real-time data updates
            io.to(`opcua_${dbName}`).emit('opcua_data_update', broadcastData);
            
            // 🔥 Emit discovered nodes update event for OPC Management page
            // This ensures the Real-Time Data table updates in real-time
            io.to(`opcua_${dbName}`).emit('opcua_discovered_nodes_update', {
                raspberryId: deviceId,
                updates: nodesToProcess.map(item => ({
                    opcNodeId: item.opcNodeId,
                    value: item.value,
                    updatedAt: new Date().toISOString()
                }))
            });
            
            // Also emit to general tablets (backward compatibility)
            io.emit('opcua_realtime_update', broadcastData);
            
            // 🔥 IMPORTANT: Broadcast updated variables to all tablets subscribed to this company
            // This ensures tablets get real-time updates when OPC UA data changes
            await broadcastVariablesToAllTablets(company || dbName);
            
            console.log(`📤 Broadcasted ${nodesToProcess.length} node(s) from ${deviceId} to company ${company} (${configuredDatapoints.length} configured, ${discoveredNodesData.length} discovered)`);
            
        } catch (error) {
            console.error('❌ Error handling OPC UA data change:', error.message);
            console.error(error.stack);
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
        let username = req.headers['x-session-user'];

        // Fallback: accept Authorization: Bearer <jwt>
        if (!username) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
                    username = decoded.username;
                } catch (jwtErr) {
                    return res.status(401).json({ error: 'Invalid or expired token' });
                }
            }
        }

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

function extractSubmittedDBSessionContext(req) {
    const context = {
        username: String(req.headers['x-session-user'] || '').trim(),
        role: String(req.headers['x-session-role'] || '').trim(),
        dbName: String(req.headers['x-session-db-name'] || '').trim()
    };

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        context.username = decoded.username || context.username;
        context.role = decoded.role || context.role;
        context.dbName = decoded.dbName || context.dbName;
    }

    return context;
}

function extractSubmittedDBSocketContext(payload = {}) {
    const context = {
        username: String(payload.username || '').trim(),
        role: String(payload.role || '').trim(),
        dbName: String(payload.dbName || '').trim()
    };

    const token = String(payload.token || '').trim();
    if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        context.username = decoded.username || context.username;
        context.role = decoded.role || context.role;
        context.dbName = decoded.dbName || context.dbName;
    }

    return context;
}

async function resolveSubmittedDBUserFromSession(session = {}) {
    if (!mongoClient) {
        const error = new Error('Database not connected');
        error.statusCode = 503;
        throw error;
    }

    if (!session.username) {
        const error = new Error('Authentication required');
        error.statusCode = 401;
        throw error;
    }

    const masterDB = mongoClient.db(DB_NAME);
    const masterUser = await masterDB.collection(COLLECTION_NAME).findOne({ username: session.username });

    if (masterUser && masterUser.role === 'masterUser') {
        return {
            username: masterUser.username,
            company: masterUser.company,
            dbName: masterUser.dbName || session.dbName || 'KSG',
            userRole: 'masterUser',
            canPermanentDelete: true
        };
    }

    if (!session.dbName) {
        const error = new Error('Unauthorized: Admin access required');
        error.statusCode = 403;
        throw error;
    }

    const user = await mongoClient.db(session.dbName).collection('users').findOne({ username: session.username });
    if (!user || user.enable !== 'enabled' || user.role !== 'admin') {
        const error = new Error('Unauthorized: Admin access required');
        error.statusCode = 403;
        throw error;
    }

    return {
        username: user.username,
        company: session.dbName,
        dbName: session.dbName,
        userRole: user.role,
        canPermanentDelete: true
    };
}

async function resolveSubmittedDBUser(req) {
    const session = extractSubmittedDBSessionContext(req);
    return resolveSubmittedDBUserFromSession(session);
}

async function validateSubmittedDBAccess(req, res, next) {
    try {
        const userContext = await resolveSubmittedDBUser(req);
        req.username = userContext.username;
        req.company = userContext.company;
        req.dbName = userContext.dbName;
        req.userRole = userContext.userRole;
        req.canPermanentDelete = userContext.canPermanentDelete;
        next();
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 500) {
            console.error('❌ SubmittedDB validation error:', error);
        }
        res.status(statusCode).json({ success: false, error: error.message || 'Validation failed' });
    }
}

async function validateSubmittedDBPermanentDelete(req, res, next) {
    try {
        const userContext = await resolveSubmittedDBUser(req);
        if (!userContext.canPermanentDelete) {
            return res.status(403).json({ success: false, error: 'Only admin and masterUser users can permanently delete submitted data' });
        }

        req.username = userContext.username;
        req.company = userContext.company;
        req.dbName = userContext.dbName;
        req.userRole = userContext.userRole;
        req.canPermanentDelete = true;
        next();
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 500) {
            console.error('❌ SubmittedDB permanent-delete validation error:', error);
        }
        res.status(statusCode).json({ success: false, error: error.message || 'Validation failed' });
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

// GET /api/deviceInfo/:deviceId/opcua-data - Get OPC UA discovered nodes for a specific device
app.get('/api/deviceInfo/:deviceId/opcua-data', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const company = req.headers['x-company'] || req.query.company;
        
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const db = mongoClient.db(company);
        
        // Get device info to verify it exists
        const device = await db.collection('deviceInfo').findOne({ device_id: deviceId });
        
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }
        
        // Get discovered nodes for this device (raspberryId = device_id)
        const discoveredNodes = await db.collection('opcua_discovered_nodes')
            .find(
                { raspberryId: deviceId },
                {
                    projection: {
                        _id: 1,
                        variableName: 1,
                        browseName: 1,
                        opcNodeId: 1,
                        dataType: 1,
                        type: 1,
                        value: 1,
                        currentValue: 1,
                        discoveredAt: 1,
                        createdAt: 1,
                        namespace: 1
                    }
                }
            )
            .sort({ variableName: 1 })
            .toArray();
        
        // Format discovered nodes for display
        const formattedNodes = discoveredNodes.map(node => {
            // Parse currentValue if it's a string representation of array
            let value = node.value;
            if (node.currentValue && typeof node.currentValue === 'string') {
                try {
                    value = JSON.parse(node.currentValue);
                } catch (e) {
                    value = node.currentValue;
                }
            }
            
            return {
                _id: node._id,
                name: node.variableName || node.browseName,
                opcNodeId: node.opcNodeId,
                dataType: node.dataType || node.type,
                value: value,
                timestamp: node.discoveredAt || node.createdAt,
                namespace: node.namespace
            };
        });
        
        res.json({ 
            success: true, 
            device: {
                device_id: device.device_id,
                device_name: device.device_name
            },
            datapoints: formattedNodes 
        });
        
    } catch (error) {
        console.error('❌ Error fetching device OPC UA data:', error);
        res.status(500).json({ error: 'Failed to fetch device data' });
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
        const { data } = req.body; // Array of mixed items: configured datapoints OR discovered nodes
        const db = mongoClient.db(dbName);
        
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid data format' });
        }
        
        // Separate configured datapoints from discovered nodes
        const configuredDatapoints = [];
        const discoveredNodes = [];
        
        for (const item of data) {
            if (item.datapointId && item.equipmentId) {
                // This is a configured datapoint
                configuredDatapoints.push(item);
            } else if (item.opcNodeId && !item.datapointId) {
                // This is a discovered node
                discoveredNodes.push(item);
            }
        }
        
        // Handle configured datapoints (save to opcua_realtime)
        if (configuredDatapoints.length > 0) {
            const bulkOps = configuredDatapoints.map(item => ({
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
            console.log(`📊 Saved ${configuredDatapoints.length} configured datapoints to opcua_realtime`);
        }
        
        // Handle discovered nodes (update opcua_discovered_nodes)
        if (discoveredNodes.length > 0) {
            const discoveredBulkOps = discoveredNodes.map(item => ({
                updateOne: {
                    filter: { 
                        raspberryId,
                        opcNodeId: item.opcNodeId 
                    },
                    update: {
                        $set: {
                            value: item.value,
                            currentValue: Array.isArray(item.value) ? JSON.stringify(item.value) : String(item.value),
                            quality: item.quality || 'Good',
                            lastUpdated: new Date().toISOString()
                        }
                    }
                }
            }));
            
            const discoveredResult = await db.collection('opcua_discovered_nodes').bulkWrite(discoveredBulkOps);
            console.log(`🔍 Updated ${discoveredNodes.length} discovered nodes (${discoveredResult.modifiedCount} modified)`);
            
            // Emit discovered nodes update to admin pages
            io.to(`opcua_${dbName}`).emit('opcua_discovered_nodes_update', {
                raspberryId,
                nodes: discoveredNodes.map(item => ({
                    opcNodeId: item.opcNodeId,
                    value: item.value,
                    quality: item.quality,
                    timestamp: item.timestamp
                }))
            });
        }
        
        // Emit configured datapoints to WebSocket clients
        if (configuredDatapoints.length > 0) {
            io.to(`opcua_${dbName}`).emit('opcua_data_update', {
                raspberryId,
                data: configuredDatapoints.map(item => ({
                    equipmentId: item.equipmentId,
                    datapointId: item.datapointId,
                    value: item.value,
                    quality: item.quality,
                    timestamp: item.timestamp
                }))
            });
        }
        
        // Broadcast real-time updates to all subscribed tablets
        await broadcastVariablesToAllTablets(dbName);
        
        res.json({ 
            success: true, 
            received: data.length,
            configured: configuredDatapoints.length,
            discovered: discoveredNodes.length
        });
        
    } catch (error) {
        console.error('❌ Error saving OPC UA data:', error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// POST /api/opcua/event-log - Batch insert event logs from Raspberry Pi
app.post('/api/opcua/event-log', validateRaspberryPi, async (req, res) => {
    try {
        const { raspberryId, dbName } = req;
        const { events } = req.body; // Array of event objects
        const db = mongoClient.db(dbName);
        
        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({ error: 'Invalid events format' });
        }
        
        // Add timestamps for when events were received by server
        const eventsToInsert = events.map(event => ({
            ...event,
            receivedAt: new Date(),
            timestamp: new Date(event.timestamp) // Convert ISO string to Date
        }));
        
        // Batch insert all events
        const result = await db.collection('opcua_event_log').insertMany(eventsToInsert);
        
        console.log(`📝 Logged ${result.insertedCount} events from Raspberry Pi ${raspberryId}`);
        
        res.json({ 
            success: true, 
            inserted: result.insertedCount 
        });
        
    } catch (error) {
        console.error('❌ Error saving event log:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save event log' 
        });
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
        const { company, variableName, sourceType, datapointId, opcNodeId, raspberryId, arrayIndex, conversionType, conversionFromType, conversionToType, sourceVariables, operation, createdBy } = req.body;
        
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
            datapointId: datapointId || null, // Legacy: MongoDB ObjectId (changes on restart)
            opcNodeId: opcNodeId || null, // Stable: OPC UA Node ID (e.g., ns=4;s=example5)
            raspberryId: raspberryId || null, // Source device ID
            arrayIndex: arrayIndex !== undefined ? arrayIndex : null,
            conversionType: conversionType || null,
            conversionFromType: conversionFromType || null,
            conversionToType: conversionToType || null,
            sourceVariables: sourceVariables || [], // for combined variables
            operation: operation || null, // for combined variables
            createdBy: createdBy || 'admin',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await db.collection('opcua_conversions').insertOne(conversion);
        
        console.log(`✅ Created variable: ${variableName} (${sourceType}) from device ${raspberryId || 'unknown'}, opcNodeId: ${opcNodeId || 'N/A'}`);
        res.json({ success: true, conversionId: result.insertedId, conversion });
        
    } catch (error) {
        console.error('❌ Error creating conversion:', error);
        res.status(500).json({ error: 'Failed to create conversion' });
    }
});

// GET /api/opcua/conversions - Get all conversions/variables for company
app.get('/api/opcua/conversions', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { company } = req.query;
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        const db = mongoClient.db(company);
        const conversions = await db.collection('opcua_conversions').find({}).toArray();

        if (conversions.length === 0) {
            return res.json({ success: true, conversions });
        }

        const datapointsCollection = db.collection('opcua_datapoints');
        const datapointIds = [];
        const pairQueries = [];
        const pairSet = new Set();

        conversions.forEach(conv => {
            if (conv.datapointId) {
                try {
                    datapointIds.push(new ObjectId(conv.datapointId));
                } catch (e) {
                    // Ignore invalid ObjectId format
                }
            }

            if (conv.opcNodeId && conv.raspberryId) {
                const key = `${conv.raspberryId}::${conv.opcNodeId}`;
                if (!pairSet.has(key)) {
                    pairSet.add(key);
                    pairQueries.push({ raspberryId: conv.raspberryId, opcNodeId: conv.opcNodeId });
                }
            }
        });

        const [datapointsByPair, datapointsById] = await Promise.all([
            pairQueries.length > 0
                ? datapointsCollection.find(
                    { $or: pairQueries },
                    { projection: { _id: 1, name: 1, opcNodeId: 1, raspberryId: 1 } }
                ).toArray()
                : Promise.resolve([]),
            datapointIds.length > 0
                ? datapointsCollection.find(
                    { _id: { $in: datapointIds } },
                    { projection: { _id: 1, name: 1, opcNodeId: 1, raspberryId: 1 } }
                ).toArray()
                : Promise.resolve([])
        ]);

        const datapointByPair = new Map();
        datapointsByPair.forEach(dp => {
            datapointByPair.set(`${dp.raspberryId}::${dp.opcNodeId}`, dp);
        });

        const datapointById = new Map();
        datapointsById.forEach(dp => {
            datapointById.set(dp._id.toString(), dp);
        });

        // Enrich with datapoint names (preserve original precedence: opcNodeId lookup first, then datapointId)
        for (const conv of conversions) {
            let datapoint = null;

            if (conv.opcNodeId && conv.raspberryId) {
                datapoint = datapointByPair.get(`${conv.raspberryId}::${conv.opcNodeId}`) || null;
            }

            if (!datapoint && conv.datapointId) {
                datapoint = datapointById.get(String(conv.datapointId)) || null;
            }

            if (datapoint) {
                conv.datapointName = datapoint.name || datapoint.opcNodeId;
                if (conv.opcNodeId && datapoint._id.toString() !== conv.datapointId) {
                    conv.datapointId = datapoint._id.toString();
                }
            }
        }
        
        res.json({ success: true, conversions });
        
    } catch (error) {
        console.error('❌ Error loading conversions:', error);
        res.status(500).json({ error: 'Failed to load conversions' });
    }
});

// GET /api/opcua/variables/values - Get all variables with calculated current values (for external apps)
app.get('/api/opcua/variables/values', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { company } = req.query;
        if (!company) {
            return res.status(400).json({ error: 'Company parameter required' });
        }
        
        const db = mongoClient.db(company);
        const conversions = await db.collection('opcua_conversions').find({}).toArray();
        const devices = await db.collection('deviceInfo').find({}).toArray();
        
        const result = {};
        const now = new Date();
        
        for (const variable of conversions) {
            try {
                let calculatedValue = null;
                let sourceInfo = '';
                let quality = 'Unknown';
                let dataTimestamp = null;
                let dataAge = null;
                let isStale = false;
                
                // Check if it's a simple conversion variable (not combined)
                if (variable.sourceType !== 'combined' && variable.raspberryId) {
                    // Get the device - try both _id (ObjectId) and device_id (string)
                    const device = devices.find(d => 
                        d._id.toString() === variable.raspberryId || 
                        d.device_id === variable.raspberryId
                    );
                    
                    if (device) {
                        // Try to get datapoint by opcNodeId first (stable), then fall back to datapointId
                        let datapoint = null;
                        
                        if (variable.opcNodeId) {
                            datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                opcNodeId: variable.opcNodeId,
                                raspberryId: variable.raspberryId
                            });
                        }
                        
                        // Fallback to datapointId
                        if (!datapoint && variable.datapointId) {
                            try {
                                datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                    _id: new ObjectId(variable.datapointId),
                                    raspberryId: variable.raspberryId
                                });
                            } catch (e) {
                                // Invalid ObjectId
                            }
                        }
                        
                        if (datapoint && datapoint.value !== undefined) {
                            let rawValue = datapoint.value;
                            
                            // Get actual data timestamp and quality from opcua_realtime if available
                            const realtimeData = await db.collection('opcua_realtime').findOne({
                                raspberryId: variable.raspberryId,
                                opcNodeId: datapoint.opcNodeId
                            });
                            
                            if (realtimeData) {
                                quality = realtimeData.quality || 'Unknown';
                                dataTimestamp = realtimeData.sourceTimestamp || realtimeData.updatedAt;
                                
                                // Calculate data age in seconds
                                if (dataTimestamp) {
                                    const timestampDate = new Date(dataTimestamp);
                                    dataAge = Math.floor((now - timestampDate) / 1000);
                                    // Mark as stale if older than 60 seconds
                                    isStale = dataAge > 60;
                                }
                            } else {
                                // Fallback to discovered node timestamp
                                dataTimestamp = datapoint.discoveredAt || datapoint.updatedAt;
                                quality = 'Unknown';
                                if (dataTimestamp) {
                                    const timestampDate = new Date(dataTimestamp);
                                    dataAge = Math.floor((now - timestampDate) / 1000);
                                    isStale = dataAge > 60;
                                }
                            }
                            
                            // Extract array value if needed
                            if (variable.arrayIndex !== undefined && variable.arrayIndex !== null && Array.isArray(rawValue)) {
                                rawValue = rawValue[variable.arrayIndex];
                            }
                            
                            // Apply conversion
                            calculatedValue = applyConversionOnServer(rawValue, variable.conversionFromType, variable.conversionToType);
                            
                            // Build source info
                            const datapointName = datapoint.name || datapoint.opcNodeId || variable.datapointId;
                            sourceInfo = `${device.device_name}.${datapointName}`;
                            if (variable.arrayIndex !== undefined && variable.arrayIndex !== null) {
                                sourceInfo += `[${variable.arrayIndex}]`;
                            }
                        }
                    }
                } else if (variable.sourceType === 'combined' && variable.sourceVariables && variable.operation) {
                    // Get values of all source variables
                    const sourceValues = [];
                    const sourceQualities = [];
                    const sourceTimestamps = [];
                    
                    for (const sourceVarName of variable.sourceVariables) {
                        const sourceVar = conversions.find(v => v.variableName === sourceVarName);
                        if (sourceVar && sourceVar.raspberryId) {
                            // Try to get datapoint by opcNodeId first (stable), then fall back to datapointId
                            let datapoint = null;
                            
                            if (sourceVar.opcNodeId) {
                                datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                    opcNodeId: sourceVar.opcNodeId,
                                    raspberryId: sourceVar.raspberryId
                                });
                            }
                            
                            // Fallback to datapointId
                            if (!datapoint && sourceVar.datapointId) {
                                try {
                                    datapoint = await db.collection('opcua_discovered_nodes').findOne({ 
                                        _id: new ObjectId(sourceVar.datapointId),
                                        raspberryId: sourceVar.raspberryId
                                    });
                                } catch (e) {
                                    // Invalid ObjectId
                                }
                            }
                            
                            if (datapoint && datapoint.value !== undefined) {
                                let rawValue = datapoint.value;
                                if (sourceVar.arrayIndex !== undefined && sourceVar.arrayIndex !== null && Array.isArray(rawValue)) {
                                    rawValue = rawValue[sourceVar.arrayIndex];
                                }
                                const converted = applyConversionOnServer(rawValue, sourceVar.conversionFromType, sourceVar.conversionToType);
                                sourceValues.push(converted);
                                
                                // Get quality for this source
                                const realtimeData = await db.collection('opcua_realtime').findOne({
                                    raspberryId: sourceVar.raspberryId,
                                    opcNodeId: datapoint.opcNodeId
                                });
                                
                                if (realtimeData) {
                                    sourceQualities.push(realtimeData.quality || 'Unknown');
                                    sourceTimestamps.push(realtimeData.sourceTimestamp || realtimeData.updatedAt);
                                } else {
                                    sourceQualities.push('Unknown');
                                    sourceTimestamps.push(datapoint.discoveredAt || datapoint.updatedAt);
                                }
                            }
                        }
                    }
                    
                    // Apply operation
                    if (sourceValues.length > 0) {
                        calculatedValue = applyCombinedOperation(sourceValues, variable.operation);
                        sourceInfo = `Combined: ${variable.sourceVariables.join(', ')}`;
                        
                        // Combined quality: Bad if any Bad, Uncertain if any Uncertain, else Good
                        if (sourceQualities.includes('Bad')) {
                            quality = 'Bad';
                        } else if (sourceQualities.includes('Uncertain')) {
                            quality = 'Uncertain';
                        } else if (sourceQualities.every(q => q === 'Good')) {
                            quality = 'Good';
                        } else {
                            quality = 'Unknown';
                        }
                        
                        // Use oldest timestamp
                        if (sourceTimestamps.length > 0) {
                            dataTimestamp = sourceTimestamps.reduce((oldest, ts) => {
                                return new Date(ts) < new Date(oldest) ? ts : oldest;
                            });
                            
                            if (dataTimestamp) {
                                const timestampDate = new Date(dataTimestamp);
                                dataAge = Math.floor((now - timestampDate) / 1000);
                                isStale = dataAge > 60;
                            }
                        }
                    }
                }
                
                result[variable.variableName] = {
                    value: calculatedValue,
                    quality: quality,
                    timestamp: dataTimestamp,
                    dataAge: dataAge,
                    isStale: isStale,
                    source: sourceInfo,
                    type: variable.sourceType,
                    conversionType: variable.conversionToType || null,
                    operation: variable.operation || null,
                    serverTime: now.toISOString()
                };
            } catch (error) {
                console.error(`Error calculating variable ${variable.variableName}:`, error);
                result[variable.variableName] = {
                    value: null,
                    quality: 'Bad',
                    error: 'Calculation failed',
                    timestamp: null,
                    dataAge: null,
                    isStale: true,
                    serverTime: now.toISOString()
                };
            }
        }
        
        res.json({ 
            success: true, 
            variables: result, 
            count: Object.keys(result).length,
            serverTime: now.toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting variable values:', error);
        res.status(500).json({ error: 'Failed to get variable values' });
    }
});

// Helper function: Apply conversion (same logic as frontend)
function applyConversionOnServer(value, fromType, toType) {
    // Step 1: Parse value based on fromType
    let numValue;
    
    switch (fromType) {
        case 'uint16':
        case 'uint8':
        case 'uint32':
        case 'int16':
        case 'int8':
        case 'int32':
            numValue = parseInt(value);
            break;
        case 'hex16':
        case 'hex8':
            numValue = parseInt(value, 16);
            break;
        case 'binary16':
        case 'binary8':
        case 'binary4':
            numValue = parseInt(value, 2);
            break;
        case 'float32':
        case 'double64':
            numValue = parseFloat(value);
            break;
        case 'string':
            numValue = parseInt(value);
            break;
        case 'boolean':
            numValue = value ? 1 : 0;
            break;
        default:
            numValue = parseInt(value);
    }
    
    // Step 2: Convert to target format
    switch (toType) {
        case 'uint16':
            return (numValue & 0xFFFF).toString();
        case 'uint8':
            return (numValue & 0xFF).toString();
        case 'uint32':
            return (numValue >>> 0).toString();
        case 'int16':
            return (numValue << 16 >> 16).toString();
        case 'int8':
            return (numValue << 24 >> 24).toString();
        case 'int32':
            return (numValue | 0).toString();
        case 'hex16':
            return '0x' + (numValue & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
        case 'hex8':
            return '0x' + (numValue & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        case 'binary16':
            return (numValue & 0xFFFF).toString(2).padStart(16, '0');
        case 'binary8':
            return (numValue & 0xFF).toString(2).padStart(8, '0');
        case 'binary4':
            return (numValue & 0xF).toString(2).padStart(4, '0');
        case 'ascii2':
            const high = (numValue >> 8) & 0xFF;
            const low = numValue & 0xFF;
            return String.fromCharCode(high) + String.fromCharCode(low);
        case 'ascii1':
            return String.fromCharCode(numValue & 0xFF);
        case 'float32':
            return parseFloat(numValue).toFixed(6);
        case 'double64':
            return parseFloat(numValue).toFixed(12);
        case 'string':
            return numValue.toString();
        case 'boolean':
            return numValue !== 0 ? 'true' : 'false';
        case 'none':
        default:
            return value.toString();
    }
}

// Helper function: Apply combined operation
function applyCombinedOperation(values, operation) {
    if (!values || values.length === 0) return null;
    
    switch (operation) {
        case 'concatenate':
            return values.join('');
        case 'add':
            return values.reduce((sum, val) => {
                const num = parseFloat(val);
                return sum + (isNaN(num) ? 0 : num);
            }, 0).toString();
        case 'subtract':
            if (values.length < 2) return values[0];
            const first = parseFloat(values[0]);
            return values.slice(1).reduce((result, val) => {
                const num = parseFloat(val);
                return result - (isNaN(num) ? 0 : num);
            }, first).toString();
        case 'multiply':
            return values.reduce((product, val) => {
                const num = parseFloat(val);
                return product * (isNaN(num) ? 1 : num);
            }, 1).toString();
        case 'divide':
            if (values.length < 2) return values[0];
            const dividend = parseFloat(values[0]);
            return values.slice(1).reduce((result, val) => {
                const num = parseFloat(val);
                return num !== 0 ? result / num : result;
            }, dividend).toString();
        case 'average':
            const sum = values.reduce((acc, val) => {
                const num = parseFloat(val);
                return acc + (isNaN(num) ? 0 : num);
            }, 0);
            return (sum / values.length).toString();
        default:
            return values.join('');
    }
}

// PUT /api/opcua/conversions/:id - Update a conversion/variable
app.put('/api/opcua/conversions/:id', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { id } = req.params;
        const { variableName, conversionType, conversionFromType, conversionToType, operation, sourceVariables } = req.body;
        const { company } = req.query || { company: 'sasaki' };
        
        console.log(`🔧 Updating variable ${id} with data:`, req.body);
        
        const db = mongoClient.db(company);
        
        const updateData = {
            updatedAt: new Date()
        };
        
        if (variableName) updateData.variableName = variableName;
        if (conversionType) updateData.conversionType = conversionType;
        if (conversionFromType) updateData.conversionFromType = conversionFromType;
        if (conversionToType) updateData.conversionToType = conversionToType;
        if (operation) updateData.operation = operation; // For combined variables
        if (sourceVariables && Array.isArray(sourceVariables)) {
            updateData.sourceVariables = sourceVariables; // For combined variables
            console.log(`🔗 Updating sourceVariables to:`, sourceVariables);
        }
        
        const result = await db.collection('opcua_conversions').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Variable not found' });
        }
        
        console.log(`✅ Updated variable: ${id}`);
        
        // Broadcast updated variables to all connected tablets in real-time
        try {
            console.log(`📡 Broadcasting variable update to tablets for company: ${company}`);
            // Use the global io instance directly
            if (io) {
                const room = `opcua_${company}`;
                console.log(`📡 Broadcasting to room: ${room}`);
                
                // Simple approach: just emit to the entire room
                // This will trigger all tablets to request fresh data
                io.to(room).emit('variable-updated', {
                    variableId: id,
                    company: company,
                    message: 'Variable configuration updated',
                    timestamp: new Date()
                });
                
                console.log(`✅ Variable update event sent to room: ${room}`);
            } else {
                console.log(`⚠️ Socket.IO instance not available`);
            }
        } catch (broadcastError) {
            console.error('❌ Error broadcasting variable update:', broadcastError);
            // Don't fail the request if broadcasting fails
        }
        
        res.json({ success: true, message: 'Variable updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating conversion:', error);
        res.status(500).json({ error: 'Failed to update conversion' });
    }
});

// GET /api/opcua/conversions/:id - Get a specific conversion/variable by ID
app.get('/api/opcua/conversions/:id', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const { id } = req.params;
        const { company } = req.query || { company: 'sasaki' };
        
        const db = mongoClient.db(company);
        const variable = await db.collection('opcua_conversions').findOne({ _id: new ObjectId(id) });
        
        if (!variable) {
            return res.status(404).json({ error: 'Variable not found' });
        }
        
        res.json(variable);
        
    } catch (error) {
        console.error('❌ Error fetching variable:', error);
        res.status(500).json({ error: 'Failed to fetch variable' });
    }
});

// DELETE /api/opcua/conversions/:id - Delete a conversion/variable
app.delete('/api/opcua/conversions/:id', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
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

const userIndexInitializedDBs = new Set();
const userReferenceDataCache = new Map();
const USER_REFERENCE_CACHE_TTL_MS = parseInt(process.env.USER_REFERENCE_CACHE_TTL_MS || '120000', 10);

function escapeRegex(input = "") {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCSVFieldRegex(value) {
    const escaped = escapeRegex(value);
    return new RegExp(`(^|\\s*,\\s*)${escaped}(\\s*,\\s*|$)`, "i");
}

async function ensureUsersCollectionIndexes(db) {
    const dbName = db.databaseName;
    if (userIndexInitializedDBs.has(dbName)) {
        return;
    }

    const usersCollection = db.collection("users");
    await Promise.all([
        usersCollection.createIndex({ username: 1 }),
        usersCollection.createIndex({ email: 1 }),
        usersCollection.createIndex({ role: 1 }),
        usersCollection.createIndex({ division: 1 }),
        usersCollection.createIndex({ section: 1 }),
        usersCollection.createIndex({ enable: 1 }),
        usersCollection.createIndex({ userID: 1 })
    ]);

    userIndexInitializedDBs.add(dbName);
}

async function fetchUserReferenceData(db) {
    const [roles, primaryFactories, legacyFactories, equipment, departments, sections] = await Promise.all([
        db.collection('roles')
            .find({}, { projection: { _id: 0, roleName: 1 } })
            .sort({ roleName: 1 })
            .toArray(),
        db.collection('factory')
            .find({}, { projection: { _id: 0, name: 1 } })
            .sort({ name: 1 })
            .toArray(),
        db.collection('factories')
            .find({}, { projection: { _id: 0, name: 1 } })
            .sort({ name: 1 })
            .toArray(),
        db.collection('equipment')
            .find({}, { projection: { _id: 0, 設備名: 1 } })
            .sort({ 設備名: 1 })
            .toArray(),
        db.collection('department')
            .find({}, { projection: { _id: 0, name: 1 } })
            .sort({ name: 1 })
            .toArray(),
        db.collection('section')
            .find({}, { projection: { _id: 0, name: 1 } })
            .sort({ name: 1 })
            .toArray()
    ]);

    const factories = Array.from(new Set([
        ...primaryFactories.map(item => item.name).filter(Boolean),
        ...legacyFactories.map(item => item.name).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return {
        roles: roles.map(item => item.roleName).filter(Boolean),
        factories,
        equipment: equipment.map(item => item.設備名).filter(Boolean),
        departments: departments.map(item => item.name).filter(Boolean),
        sections: sections.map(item => item.name).filter(Boolean)
    };
}

// Get all user-management reference data in a single request
app.post('/customerUserReferenceData', async (req, res) => {
    const { dbName, forceRefresh = false } = req.body;

    if (!dbName) {
        return res.status(400).json({ error: 'Missing dbName' });
    }

    try {
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        const cacheKey = `userRef:${dbName}`;
        const now = Date.now();
        const cached = userReferenceDataCache.get(cacheKey);

        if (!forceRefresh && cached && (now - cached.timestamp) < USER_REFERENCE_CACHE_TTL_MS) {
            return res.status(200).json({ success: true, ...cached.data, cached: true });
        }

        const db = mongoClient.db(dbName);
        const referenceData = await fetchUserReferenceData(db);

        userReferenceDataCache.set(cacheKey, {
            timestamp: now,
            data: referenceData
        });

        res.status(200).json({ success: true, ...referenceData, cached: false });
    } catch (error) {
        console.error('Error fetching user reference data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users for a customer database
app.post("/customerGetUsers", async (req, res) => {
    const {
        dbName,
        role,
        page = 1,
        limit = 25,
        search = "",
        filterRole = "",
        filterDivision = "",
        filterSection = "",
        filterEnable = "",
        filterFactory = "",
        filterEquipment = "",
        sortField = "",
        sortOrder = ""
    } = req.body;
    console.log("Received request to get users:", {
        dbName,
        role,
        page,
        limit,
        search,
        filterRole,
        filterDivision,
        filterSection,
        filterEnable,
        filterFactory,
        filterEquipment,
        sortField,
        sortOrder
    });

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
        await ensureUsersCollectionIndexes(db);

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
        const skip = (pageNumber - 1) * pageSize;

        const queryClauses = [];

        if (filterRole) queryClauses.push({ role: filterRole });
        if (filterDivision) queryClauses.push({ division: filterDivision });
        if (filterSection) queryClauses.push({ section: filterSection });
        if (filterEnable) queryClauses.push({ enable: filterEnable });

        if (filterFactory) {
            queryClauses.push({
                $or: [
                    { factory: filterFactory },
                    { factory: buildCSVFieldRegex(filterFactory) }
                ]
            });
        }

        if (filterEquipment) {
            queryClauses.push({
                $or: [
                    { equipment: filterEquipment },
                    { equipment: buildCSVFieldRegex(filterEquipment) }
                ]
            });
        }

        const trimmedSearch = String(search || "").trim();
        if (trimmedSearch) {
            const searchRegex = new RegExp(escapeRegex(trimmedSearch), "i");
            queryClauses.push({
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { email: searchRegex },
                    { username: searchRegex },
                    { userID: searchRegex },
                    { role: searchRegex },
                    { division: searchRegex },
                    { section: searchRegex },
                    { factory: searchRegex },
                    { equipment: searchRegex }
                ]
            });
        }

        const query = queryClauses.length > 0 ? { $and: queryClauses } : {};

        const allowedSortFields = new Set([
            'firstName',
            'lastName',
            'email',
            'username',
            'role',
            'division',
            'section',
            'enable',
            'factory',
            'equipment',
            'userID',
            'createdAt',
            'updatedAt'
        ]);

const normalizedSortField = allowedSortFields.has(sortField) ? sortField : 'userID';
    const normalizedSortOrder = sortOrder === 'asc' ? 1 : -1;
    const sortSpec = normalizedSortField
      ? { [normalizedSortField]: normalizedSortOrder, _id: -1 }
      : { userID: 1, _id: -1 };

        const [result, totalCount] = await Promise.all([
            users
                .find(query, { projection: { password: 0 } })
                .sort(sortSpec)
                .skip(skip)
                .limit(pageSize)
                .toArray(),
            users.countDocuments(query)
        ]);

        const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

        res.status(200).json({
            users: result,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                totalCount,
                totalPages,
                hasPrevPage: pageNumber > 1,
                hasNextPage: pageNumber < totalPages,
                sortField: normalizedSortField,
                sortOrder: normalizedSortField ? (normalizedSortOrder === 1 ? 'asc' : 'desc') : null
            }
        });
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
    const newUser = {
      firstName,
      lastName,
      email,
      username: normalizedUsername,
      password: hashedPassword,
      role,
      division: req.body.division || '',
      section: req.body.section || '',
      enable: req.body.enable || 'enabled',
      factory: req.body.factory || '',  // CSV string
      equipment: req.body.equipment || '',  // CSV string
      userID: req.body.userID || '',
      createdAt: new Date()
    };
    
    await users.insertOne(newUser);

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

    // Special handling for username changes in users collection
    if (collectionName === "users" && updateData.username) {
      // Get the old username before updating
      const oldUser = await collection.findOne({ _id: new ObjectId(recordId) });
      
      if (oldUser && oldUser.username !== updateData.username) {
        const oldUsername = oldUser.username;
        const newUsername = updateData.username;
        
        // Normalize both usernames
        const normalizedOldUsername = oldUsername.trim().toLowerCase();
        const normalizedNewUsername = newUsername.trim().toLowerCase();
        
        // Update the username in subUsernames array in master database
        const masterDB = mongoClient.db(DB_NAME);
        const masterUsers = masterDB.collection(COLLECTION_NAME);
        
        await masterUsers.updateOne(
          { dbName, subUsernames: normalizedOldUsername },
          { 
            $pull: { subUsernames: normalizedOldUsername },
          }
        );
        
        await masterUsers.updateOne(
          { dbName },
          { 
            $addToSet: { subUsernames: normalizedNewUsername }
          }
        );
        
        console.log(`📝 Updated username in master database: ${normalizedOldUsername} → ${normalizedNewUsername}`);
      }
    }

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

app.post('/getGoogleSheetServiceAccountInfo', async (_req, res) => {
    res.json({
        configured: hasGoogleServiceAccountCredentials(),
        serviceAccountEmail: getGoogleServiceAccountEmail(),
    });
});

app.post('/getGoogleSheetTargets', async (req, res) => {
    const { dbName } = req.body;

    if (!dbName) {
        return res.status(400).json({ error: 'dbName is required' });
    }

    try {
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        const db = mongoClient.db(dbName);
        const targets = await db.collection(GOOGLE_SHEET_TARGETS_COLLECTION)
            .find({})
            .sort({ updatedAt: -1, createdAt: -1 })
            .toArray();

        res.json(targets);
    } catch (err) {
        console.error('Error fetching Google Sheet targets:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/inspectGoogleSheet', async (req, res) => {
    const { spreadsheetUrl } = req.body;

    if (!spreadsheetUrl) {
        return res.status(400).json({ error: 'spreadsheetUrl is required' });
    }

    try {
        if (!hasGoogleServiceAccountCredentials()) {
            return res.status(503).json({
                error: 'Google service account credentials are not configured',
                serviceAccountEmail: getGoogleServiceAccountEmail(),
            });
        }

        const inspection = await inspectSpreadsheet(spreadsheetUrl);
        res.json({
            success: true,
            spreadsheetId: inspection.spreadsheetId,
            spreadsheetTitle: inspection.spreadsheetTitle,
            sheets: inspection.sheets,
            serviceAccountEmail: getGoogleServiceAccountEmail(),
        });
    } catch (error) {
        console.error('Error inspecting Google Sheet:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to inspect Google Sheet',
            serviceAccountEmail: getGoogleServiceAccountEmail(),
        });
    }
});

app.post('/analyzeGoogleSheetTarget', async (req, res) => {
    const { dbName, spreadsheetUrl, sheetName, masterRecordIds, ngGroupId, fieldMappings } = req.body;

    if (!dbName || !spreadsheetUrl || !sheetName) {
        return res.status(400).json({ error: 'dbName, spreadsheetUrl, and sheetName are required' });
    }

    try {
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        if (!hasGoogleServiceAccountCredentials()) {
            return res.status(503).json({
                error: 'Google service account credentials are not configured',
                serviceAccountEmail: getGoogleServiceAccountEmail(),
            });
        }

        const db = mongoClient.db(dbName);
        const products = await resolveGoogleSheetTargetProducts(db, masterRecordIds);
        const resolvedNgGroupId = normalizeGoogleSheetObjectIdString(ngGroupId || deriveGoogleSheetNgGroupIdFromProducts(products));
        const ngGroup = await resolveGoogleSheetNgGroup(db, resolvedNgGroupId);

        if (!ngGroup) {
            return res.status(404).json({ error: 'Defect group not found for selected products' });
        }

        const analysis = await analyzeSheetTarget({
            spreadsheetUrlOrId: spreadsheetUrl,
            sheetName,
            ngGroup,
            storedMappings: fieldMappings,
            headerRow: DEFAULT_HEADER_ROW,
        });

        res.json({
            success: true,
            spreadsheetId: analysis.spreadsheetId,
            spreadsheetTitle: analysis.spreadsheetTitle,
            sheetName: analysis.selectedSheet.sheetName,
            sheetId: analysis.selectedSheet.sheetId,
            headers: analysis.headers,
            fields: analysis.analysis.fields,
            unusedHeaders: analysis.analysis.unusedHeaders,
            ngGroup: {
                _id: String(ngGroup._id),
                groupName: ngGroup.groupName || '',
            },
            products: buildGoogleSheetTargetProductSnapshots(products),
            serviceAccountEmail: getGoogleServiceAccountEmail(),
        });
    } catch (error) {
        console.error('Error analyzing Google Sheet target:', error);
        res.status(error.statusCode || 400).json({
            success: false,
            error: error.message || 'Failed to analyze Google Sheet target',
            serviceAccountEmail: getGoogleServiceAccountEmail(),
        });
    }
});

app.post('/saveGoogleSheetTarget', async (req, res) => {
    const { dbName, username, targetId, target = {} } = req.body;

    if (!dbName || !username) {
        return res.status(400).json({ error: 'dbName and username are required' });
    }

    try {
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        if (!hasGoogleServiceAccountCredentials()) {
            return res.status(503).json({
                error: 'Google service account credentials are not configured',
                serviceAccountEmail: getGoogleServiceAccountEmail(),
            });
        }

        const db = mongoClient.db(dbName);
        const products = await resolveGoogleSheetTargetProducts(db, target.masterRecordIds);
        if (products.length === 0) {
            return res.status(400).json({ error: 'At least one product must be selected' });
        }

        const ngGroupId = normalizeGoogleSheetObjectIdString(target.ngGroupId || deriveGoogleSheetNgGroupIdFromProducts(products));
        const ngGroup = await resolveGoogleSheetNgGroup(db, ngGroupId);
        if (!ngGroup) {
            return res.status(404).json({ error: 'Defect group not found for selected products' });
        }

        const analysis = await analyzeSheetTarget({
            spreadsheetUrlOrId: target.spreadsheetUrl || target.spreadsheetId,
            sheetName: normalizeGoogleSheetString(target.sheetName),
            ngGroup,
            storedMappings: target.fieldMappings,
            headerRow: DEFAULT_HEADER_ROW,
        });

        const fieldMappings = buildResolvedGoogleSheetFieldMappings(
            analysis.analysis.fields,
            target.fieldMappings,
            analysis.headers
        );

        const now = new Date();
        const productSnapshots = buildGoogleSheetTargetProductSnapshots(products);
        const document = {
            label: normalizeGoogleSheetString(target.label) || `${analysis.spreadsheetTitle} / ${analysis.selectedSheet.sheetName}`,
            spreadsheetId: analysis.spreadsheetId,
            spreadsheetUrl: normalizeGoogleSheetString(target.spreadsheetUrl),
            spreadsheetTitle: analysis.spreadsheetTitle,
            sheetId: analysis.selectedSheet.sheetId,
            sheetName: analysis.selectedSheet.sheetName,
            headerRow: DEFAULT_HEADER_ROW,
            ngGroupId,
            ngGroupName: normalizeGoogleSheetString(ngGroup.groupName),
            masterRecordIds: productSnapshots.map(product => product.recordId),
            masterRecords: productSnapshots,
            fieldMappings,
            isActive: target.isActive !== false,
            updatedAt: now,
            updatedBy: username,
            serviceAccountEmail: getGoogleServiceAccountEmail(),
        };

        const collection = db.collection(GOOGLE_SHEET_TARGETS_COLLECTION);
        let savedId = '';
        const normalizedTargetId = normalizeGoogleSheetObjectIdString(targetId || target._id);

        if (normalizedTargetId) {
            await collection.updateOne(
                { _id: new ObjectId(normalizedTargetId) },
                {
                    $set: document,
                    $setOnInsert: { createdAt: now, createdBy: username }
                },
                { upsert: true }
            );
            savedId = normalizedTargetId;
            await logGoogleSheetTargetActivity(db, username, 'update', `Google Sheet連携「${document.label}」を更新しました`);
        } else {
            const result = await collection.insertOne({
                ...document,
                createdAt: now,
                createdBy: username,
            });
            savedId = String(result.insertedId);
            await logGoogleSheetTargetActivity(db, username, 'create', `Google Sheet連携「${document.label}」を登録しました`);
        }

        res.json({
            success: true,
            savedId,
            target: {
                _id: savedId,
                ...document,
            },
        });
    } catch (error) {
        console.error('Error saving Google Sheet target:', error);
        res.status(error.statusCode || 400).json({
            success: false,
            error: error.message || 'Failed to save Google Sheet target',
            serviceAccountEmail: getGoogleServiceAccountEmail(),
        });
    }
});

app.post('/deleteGoogleSheetTarget', async (req, res) => {
    const { dbName, username, targetId } = req.body;

    if (!dbName || !username || !targetId) {
        return res.status(400).json({ error: 'dbName, username, and targetId are required' });
    }

    try {
        if (!mongoClient) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        const normalizedTargetId = normalizeGoogleSheetObjectIdString(targetId);
        if (!normalizedTargetId) {
            return res.status(400).json({ error: 'Invalid targetId' });
        }

        const db = mongoClient.db(dbName);
        const collection = db.collection(GOOGLE_SHEET_TARGETS_COLLECTION);
        const existing = await collection.findOne({ _id: new ObjectId(normalizedTargetId) });
        const result = await collection.deleteOne({ _id: new ObjectId(normalizedTargetId) });

        await logGoogleSheetTargetActivity(
            db,
            username,
            'delete',
            `Google Sheet連携「${existing?.label || normalizedTargetId}」を削除しました`
        );

        res.json({ success: true, deletedCount: result.deletedCount || 0 });
    } catch (error) {
        console.error('Error deleting Google Sheet target:', error);
        res.status(500).json({ success: false, error: 'Failed to delete Google Sheet target' });
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
// NG GROUPS ROUTES
// ==========================================

// Get all NG groups
app.post("/getNGGroups", async (req, res) => {
  const { dbName } = req.body;
  if (!dbName) return res.status(400).json({ error: "dbName is required" });
  try {
    if (!mongoClient) return res.status(503).json({ error: "Database not connected" });
    const db = mongoClient.db(dbName);
    const groups = await db.collection("ngGroups").find({}).toArray();
    res.json(groups);
  } catch (err) {
    console.error("Error fetching ngGroups:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create NG group
app.post("/createNGGroup", async (req, res) => {
  const { dbName, username, groupName, items } = req.body;
  if (!dbName || !username || !groupName) return res.status(400).json({ error: "dbName, username, groupName required" });
  try {
    if (!mongoClient) return res.status(503).json({ error: "Database not connected" });
    const db = mongoClient.db(dbName);
    const newGroup = {
      groupName,
      items: items || [],
      createdBy: username,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection("ngGroups").insertOne(newGroup);
    res.json({ message: "NG Group created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating ngGroup:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update NG group
app.post("/updateNGGroup", async (req, res) => {
  const { groupId, dbName, username, groupName, items } = req.body;
  if (!groupId || !dbName || !username) return res.status(400).json({ error: "groupId, dbName, username required" });
  try {
    if (!mongoClient) return res.status(503).json({ error: "Database not connected" });
    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const updateData = { updatedAt: new Date(), updatedBy: username };
    if (groupName !== undefined) updateData.groupName = groupName;
    if (items !== undefined) updateData.items = items;
    const result = await db.collection("ngGroups").updateOne(
      { _id: new ObjectId(groupId) },
      { $set: updateData }
    );
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating ngGroup:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete NG groups (batch)
app.post("/deleteNGGroups", async (req, res) => {
  const { groupIds, dbName, username } = req.body;
  if (!groupIds || !dbName || !username) return res.status(400).json({ error: "groupIds, dbName, username required" });
  try {
    if (!mongoClient) return res.status(503).json({ error: "Database not connected" });
    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const result = await db.collection("ngGroups").deleteMany({
      _id: { $in: groupIds.map(id => new ObjectId(id)) }
    });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting ngGroups:", err);
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
// Department Routes
// ====================

// Get all departments
app.post("/getDepartments", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const departments = db.collection("department");

    const result = await departments.find({}).toArray();
    res.json({ departments: result });
  } catch (err) {
    console.error("Error fetching departments:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create department
app.post("/createDepartment", async (req, res) => {
  const { dbName, ...departmentData } = req.body;

  if (!dbName || !departmentData.name) {
    return res.status(400).json({ error: "dbName and name required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const departments = db.collection("department");

    // Check if department already exists
    const existing = await departments.findOne({ name: departmentData.name });
    if (existing) {
      return res.status(400).json({ error: "Department already exists" });
    }

    const result = await departments.insertOne({
      ...departmentData,
      createdAt: new Date()
    });

    res.json({ message: "Department created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating department:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete department
app.post("/deleteDepartment", async (req, res) => {
  const { ids, dbName } = req.body;

  if (!ids || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const departments = db.collection("department");

    const objectIds = ids.map(id => new ObjectId(id));
    const result = await departments.deleteMany({ _id: { $in: objectIds } });
    
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting department:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================
// Section Routes
// ====================

// Get all sections
app.post("/getSections", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const sections = db.collection("section");

    const result = await sections.find({}).toArray();
    res.json({ sections: result });
  } catch (err) {
    console.error("Error fetching sections:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create section
app.post("/createSection", async (req, res) => {
  const { dbName, ...sectionData } = req.body;

  if (!dbName || !sectionData.name) {
    return res.status(400).json({ error: "dbName and name required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const sections = db.collection("section");

    // Check if section already exists
    const existing = await sections.findOne({ name: sectionData.name });
    if (existing) {
      return res.status(400).json({ error: "Section already exists" });
    }

    const result = await sections.insertOne({
      ...sectionData,
      createdAt: new Date()
    });

    res.json({ message: "Section created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating section:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete section
app.post("/deleteSection", async (req, res) => {
  const { ids, dbName } = req.body;

  if (!ids || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const sections = db.collection("section");

    const objectIds = ids.map(id => new ObjectId(id));
    const result = await sections.deleteMany({ _id: { $in: objectIds } });
    
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting section:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================
// Tablet Routes
// ====================

// Get tablets
app.post("/getTablets", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "dbName is required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const tablets = db.collection("tabletDB");

    const records = await tablets.find({}).toArray();
    res.json(records);
  } catch (err) {
    console.error("Error fetching tablets:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create tablet
app.post("/createTablet", async (req, res) => {
  const { dbName, username, tabletData } = req.body;

  if (!dbName || !username || !tabletData) {
    return res.status(400).json({ error: "dbName, username, and tabletData required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const tablets = db.collection("tabletDB");
    const activityLogs = db.collection("activityLogs");

    const newTablet = {
      ...tabletData,
      registeredAt: new Date(),
      registeredBy: username,
      createdAt: new Date(),
      createdBy: username,
      authorizedUsers: tabletData.authorizedUsers || [] // Default to empty array
    };

    const result = await tablets.insertOne(newTablet);

    // Log activity
    await activityLogs.insertOne({
      collection: "tabletDB",
      action: "create",
      timestamp: new Date(),
      user: username,
      details: `タブレット「${tabletData.tabletName}」を登録しました`
    });

    res.json({ message: "Tablet created", insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating tablet:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tablet
app.post("/updateTablet", async (req, res) => {
  const { tabletId, updateData, dbName, username } = req.body;

  if (!tabletId || !dbName || !username) {
    return res.status(400).json({ error: "tabletId, dbName, username required" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const tablets = db.collection("tabletDB");
    const activityLogs = db.collection("activityLogs");

    const result = await tablets.updateOne(
      { _id: new ObjectId(tabletId) },
      { 
        $set: {
          ...updateData,
          updatedAt: new Date(),
          updatedBy: username
        }
      }
    );

    // Log activity
    await activityLogs.insertOne({
      collection: "tabletDB",
      action: "update",
      timestamp: new Date(),
      user: username,
      details: `タブレット「${updateData.tabletName || tabletId}」を更新しました`
    });

    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating tablet:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete tablet
app.post("/deleteTablet", async (req, res) => {
  const { tabletId, dbName, username } = req.body;

  if (!tabletId || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const tablets = db.collection("tabletDB");
    const activityLogs = db.collection("activityLogs");

    const tablet = await tablets.findOne({ _id: new ObjectId(tabletId) });
    const result = await tablets.deleteOne({ _id: new ObjectId(tabletId) });

    // Log activity
    await activityLogs.insertOne({
      collection: "tabletDB",
      action: "delete",
      timestamp: new Date(),
      user: username,
      details: `タブレット「${tablet?.tabletName || tabletId}」を削除しました`
    });

    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting tablet:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete multiple tablets
app.post("/deleteMultipleTablets", async (req, res) => {
  const { tabletIds, dbName, username } = req.body;

  if (!tabletIds || !Array.isArray(tabletIds) || !dbName || !username) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db(dbName);
    const tablets = db.collection("tabletDB");
    const activityLogs = db.collection("activityLogs");

    const objectIds = tabletIds.map(id => new ObjectId(id));
    const result = await tablets.deleteMany({ _id: { $in: objectIds } });

    // Log activity
    await activityLogs.insertOne({
      collection: "tabletDB",
      action: "delete",
      timestamp: new Date(),
      user: username,
      details: `${tabletIds.length}件のタブレットを削除しました`
    });

    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting multiple tablets:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Tablet Login with hybrid access control
app.post("/tabletLogin", async (req, res) => {
  const { dbName, username, password, tabletName, tabletId } = req.body;

  if (!dbName || !username || !password || (!tabletName && !tabletId)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (!mongoClient) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const db = mongoClient.db(dbName);
    const users = db.collection("users");
    const tablets = db.collection("tabletDB");

    // 1. Authenticate user
    const user = await users.findOne({ username: username.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if user is enabled
    if (user.enable !== "enabled") {
      return res.status(403).json({ error: "Account is disabled. Contact administrator." });
    }

    // 2. Get tablet information (by name or ID)
    let tablet;
    if (tabletName) {
      tablet = await tablets.findOne({ tabletName });
    } else if (tabletId) {
      tablet = await tablets.findOne({ _id: new ObjectId(tabletId) });
    }
    
    if (!tablet) {
      return res.status(404).json({ error: "Tablet not found" });
    }

    // 3. Check access permissions (Hybrid approach)
    let hasAccess = false;

    console.log('🔍 Access Check Debug:');
    console.log('  User:', username);
    console.log('  User factories:', user.factories);
    console.log('  User equipment:', user.equipment);
    console.log('  Tablet:', tablet.tabletName);
    console.log('  Tablet factory:', tablet.factoryLocation);
    console.log('  Tablet equipment:', tablet.設備名);
    console.log('  Tablet authorizedUsers:', tablet.authorizedUsers);

        hasAccess = userHasTabletAccess(user, tablet);

    console.log('  ✅ hasAccess:', hasAccess);

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied: You are not authorized to use this tablet" });
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      { 
        username: user.username, 
        role: user.role, 
        dbName,
                tabletId: tablet._id.toString(),
                tabletName: tablet.tabletName,
        userId: user._id.toString()
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      tablet: {
        tabletName: tablet.tabletName,
        factoryLocation: tablet.factoryLocation,
        設備名: tablet.設備名
      }
    });
  } catch (err) {
    console.error("Error in tablet login:", err);
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
        await setupOpcManagementIndexes();
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
