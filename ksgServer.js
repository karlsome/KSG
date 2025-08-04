const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// 🔐 DEVICE AUTHENTICATION - Authorized device IDs
const AUTHORIZED_DEVICES = {
    '4Y02SX': {
        name: 'Main Raspberry Pi',
        location: 'Living Room',
        added: '2025-08-04'
    }
    // Add more devices here as needed
};

// 📍 FIXED PIN CONFIGURATION - No dynamic config needed
const FIXED_PIN_CONFIG = {
    version: "2.0.0",
    updated: new Date().toISOString(),
    
    // Standard GPIO pins that are always available
    input_pins: {
        17: 'gpio17',   // GPIO17 - Pin 11
        27: 'gpio27',   // GPIO27 - Pin 13  
        22: 'gpio22',   // GPIO22 - Pin 15
        23: 'gpio23',   // GPIO23 - Pin 16
        24: 'gpio24',   // GPIO24 - Pin 18
        25: 'gpio25'    // GPIO25 - Pin 22
    },
    output_pins: {
        18: 'gpio18',   // GPIO18 - Pin 12 (PWM capable)
        19: 'gpio19',   // GPIO19 - Pin 35
        26: 'gpio26',   // GPIO26 - Pin 37
        16: 'gpio16',   // GPIO16 - Pin 36
        20: 'gpio20',   // GPIO20 - Pin 38
        21: 'gpio21'    // GPIO21 - Pin 40
    }
};

// 🎯 FUNCTION REPOSITORY
const GLOBAL_FUNCTIONS = {
    version: "2.2.4",
    updated: new Date().toISOString(),
    hash: "",
    
    functions: {
        buttonBlink3Seconds: {
            enabled: true,
            description: "GPIO17 button triggers GPIO26 to blink for exactly 3 seconds",
            logic: `current_time = sensors.get('timestamp', 0)

# GPIO17 button pressed - start 3-second blink sequence
if sensors.get('gpio17') == 0 and sensors.get('gpio17_prev', 1) == 1:
    config['blink_start_time'] = current_time
    config['blink_3sec_active'] = True
    config['blink_3sec_state'] = False
    executeCommand({'type': 'gpio26', 'state': False})  # Start with LED ON
    print(" GPIO17 pressed: Starting 3-second blink on GPIO26")

# Handle 3-second blink sequence
if config.get('blink_3sec_active', False):
    blink_start = config.get('blink_start_time', 0)
    elapsed_time = current_time - blink_start
    
    # Check if 5 seconds have passed
    if elapsed_time >= 2.0:
        # Stop blinking and turn LED OFF
        config['blink_3sec_active'] = False
        executeCommand({'type': 'gpio26', 'state': True})  # Turn OFF
        print("⏹️  2-second blink completed - LED OFF")
    else:
        # Continue blinking every 200ms (fast blink)
        if current_time - config.get('last_3sec_blink', 0) > 0.2:
            current_blink_state = config.get('blink_3sec_state', False)
            new_state = not current_blink_state
            executeCommand({'type': 'gpio26', 'state': not new_state})  # Invert for LED logic
            config['blink_3sec_state'] = new_state
            config['last_3sec_blink'] = current_time
            
            # Show remaining time
            remaining = 2.0 - elapsed_time
            print(f"💫 Blinking GPIO26 - {remaining:.1f}s remaining")`,
            config: {
                blink_3sec_active: false,
                blink_3sec_state: false,
                blink_start_time: 0,
                last_3sec_blink: 0
            }
        }
    }
};

// 🔒 Device Authentication Middleware
function authenticateDevice(req, res, next) {
    const deviceId = req.query.device_id || req.body.device_id;
    
    if (!deviceId) {
        return res.status(401).json({ 
            error: 'Device ID required',
            message: 'Please provide device_id parameter' 
        });
    }
    
    if (!AUTHORIZED_DEVICES[deviceId]) {
        console.log(`🚫 Unauthorized device attempted access: ${deviceId}`);
        return res.status(403).json({ 
            error: 'Device not authorized',
            device_id: deviceId,
            message: 'This device is not registered in the system' 
        });
    }
    
    console.log(`✅ Authenticated device: ${deviceId} (${AUTHORIZED_DEVICES[deviceId].name})`);
    req.deviceId = deviceId;
    next();
}

// 🔄 Generate hash for version checking
function updateFunctionHash() {
    GLOBAL_FUNCTIONS.hash = crypto.createHash('sha256')
        .update(JSON.stringify(GLOBAL_FUNCTIONS.functions))
        .digest('hex')
        .substring(0, 16);
}

// Initialize hash
updateFunctionHash();

// 📡 API ENDPOINTS

// Check for function updates (Pi devices call this every 5 minutes)
app.get('/api/functions/check/:currentHash?', authenticateDevice, (req, res) => {
    const currentHash = req.params.currentHash;
    const deviceId = req.deviceId;
    
    console.log(`📡 Function update check from ${deviceId} - Current: ${currentHash}, Latest: ${GLOBAL_FUNCTIONS.hash}`);
    
    if (currentHash === GLOBAL_FUNCTIONS.hash) {
        // No update needed
        res.json({
            updateAvailable: false,
            currentVersion: GLOBAL_FUNCTIONS.version,
            message: "Functions up to date",
            device_id: deviceId
        });
    } else {
        // Update available - include pin config if it exists
        const response = {
            updateAvailable: true,
            version: GLOBAL_FUNCTIONS.version,
            hash: GLOBAL_FUNCTIONS.hash,
            updated: GLOBAL_FUNCTIONS.updated,
            functions: GLOBAL_FUNCTIONS.functions,
            device_id: deviceId
        };
        
        // Include fixed pin configuration
        response.pin_config = FIXED_PIN_CONFIG;
        
        console.log(`📥 Sending function update to ${deviceId} v${GLOBAL_FUNCTIONS.version}`);
        res.json(response);
    }
});

// Check for pin configuration updates - REMOVED (using fixed pins)

// Update functions (admin interface)
app.get('/api/functions/latest', authenticateDevice, (req, res) => {
    const deviceId = req.deviceId;
    console.log(`📥 Full function download requested by ${deviceId}`);
    
    const response = {
        ...GLOBAL_FUNCTIONS,
        pin_config: FIXED_PIN_CONFIG,
        device_id: deviceId
    };
    
    res.json(response);
});

// Update functions (admin interface)
app.post('/api/functions/update', (req, res) => {
    try {
        if (req.body.functions) {
            GLOBAL_FUNCTIONS.functions = { ...GLOBAL_FUNCTIONS.functions, ...req.body.functions };
        }
        
        GLOBAL_FUNCTIONS.version = req.body.version || GLOBAL_FUNCTIONS.version;
        GLOBAL_FUNCTIONS.updated = new Date().toISOString();
        updateFunctionHash();
        
        console.log(`🔄 Functions updated to v${GLOBAL_FUNCTIONS.version} - Hash: ${GLOBAL_FUNCTIONS.hash}`);
        
        res.json({
            success: true,
            version: GLOBAL_FUNCTIONS.version,
            hash: GLOBAL_FUNCTIONS.hash,
            message: "Functions updated successfully"
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update pin configuration - REMOVED (using fixed pins)

// Device management
app.get('/api/devices', (req, res) => {
    const devices = Object.keys(AUTHORIZED_DEVICES).map(id => ({
        device_id: id,
        ...AUTHORIZED_DEVICES[id],
        pin_config: FIXED_PIN_CONFIG
    }));
    
    res.json({ devices, count: devices.length });
});

// System status
app.get('/api/status', (req, res) => {
    res.json({
        version: GLOBAL_FUNCTIONS.version,
        hash: GLOBAL_FUNCTIONS.hash,
        lastUpdate: GLOBAL_FUNCTIONS.updated,
        functionsCount: Object.keys(GLOBAL_FUNCTIONS.functions).length,
        devicesCount: Object.keys(AUTHORIZED_DEVICES).length,
        devices: Object.keys(AUTHORIZED_DEVICES)
    });
});

// Simple admin interface
app.get('/', (req, res) => {
    const deviceList = Object.keys(AUTHORIZED_DEVICES).map(id => 
        `<li><strong>${id}</strong> - ${AUTHORIZED_DEVICES[id].name} (${AUTHORIZED_DEVICES[id].location})</li>`
    ).join('');
    
    const functionList = Object.keys(GLOBAL_FUNCTIONS.functions).map(name => 
        `<li><strong>${name}</strong> - ${GLOBAL_FUNCTIONS.functions[name].enabled ? '✅ Enabled' : '❌ Disabled'}</li>`
    ).join('');
    
    res.send(`
        <h1>🏠 Smart Pi Function Server</h1>
        <p><strong>Version:</strong> ${GLOBAL_FUNCTIONS.version}</p>
        <p><strong>Hash:</strong> ${GLOBAL_FUNCTIONS.hash}</p>
        <p><strong>Last Update:</strong> ${GLOBAL_FUNCTIONS.updated}</p>
        
        <h2>📱 Authorized Devices (${Object.keys(AUTHORIZED_DEVICES).length})</h2>
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
        
        <h2>🔧 Fixed Pin Configuration</h2>
        <p><strong>Input Pins:</strong> ${JSON.stringify(FIXED_PIN_CONFIG.input_pins, null, 2).replace(/\n/g, '<br>&nbsp;&nbsp;')}</p>
        <p><strong>Output Pins:</strong> ${JSON.stringify(FIXED_PIN_CONFIG.output_pins, null, 2).replace(/\n/g, '<br>&nbsp;&nbsp;')}</p>
        
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
app.listen(PORT, () => {
    console.log(`🚀 Smart Pi Function Server running on port ${PORT}`);
    console.log(`📡 Ready to serve functions to Pi devices`);
    console.log(`🔑 Function hash: ${GLOBAL_FUNCTIONS.hash}`);
    console.log(`📱 Authorized devices: ${Object.keys(AUTHORIZED_DEVICES).join(', ')}`);
    console.log(`🔧 Fixed pin configuration loaded - Input: ${Object.keys(FIXED_PIN_CONFIG.input_pins).join(',')} Output: ${Object.keys(FIXED_PIN_CONFIG.output_pins).join(',')}`);
});
