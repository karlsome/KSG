// Device Discovery Module for Raspberry Pi Production Monitor
// This module provides functions to discover and connect to Raspberry Pi devices on the local network

class DeviceDiscovery {
    constructor() {
        this.discoveredDevices = [];
        this.selectedDevice = null;
        this.currentApiBaseUrl = null;
        
        // Try common IP addresses first (for faster discovery)
        this.commonIPs = [
            '192.168.0.68', '192.168.0.100', '192.168.0.101', '192.168.0.102', '192.168.0.103',
            '192.168.1.100', '192.168.1.101', '192.168.1.102', '192.168.1.103',
            '10.0.0.100', '10.0.0.101', '10.0.0.102', '10.0.0.103'
        ];
    }

    /**
     * Discover Raspberry Pi devices on the network
     * Note: This works only when the web page is served from the same local network
     */
    async discoverDevices() {
        console.log('🔍 Starting device discovery...');
        this.discoveredDevices = [];
        
        // Method 1: Try to get devices from any already-known device first
        await this.getDevicesFromKnownDevice();
        
        // Method 2: Try common IP addresses if no devices found
        if (this.discoveredDevices.length === 0) {
            await this.tryCommonIPs();
        }
        
        // Method 3: If still no devices found, try broader scan
        if (this.discoveredDevices.length === 0) {
            await this.broadScan();
        }
        
        // Method 4: If we found at least one device, ask it for other devices
        if (this.discoveredDevices.length > 0) {
            await this.getDevicesFromNetwork();
        }
        
        console.log(`✅ Discovery completed. Found ${this.discoveredDevices.length} devices:`, this.discoveredDevices);
        return this.discoveredDevices;
    }

    /**
     * Try to get devices from any device that might be currently serving this page
     */
    async getDevicesFromKnownDevice() {
        try {
            // Try the current page's host (if served from a Pi)
            const currentHost = window.location.hostname;
            if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
                console.log(`🔍 Checking current host: ${currentHost}`);
                await this.getDevicesFromSpecificHost(currentHost);
            }
            
            // Also try localhost (if the page is served from the same Pi)
            if (this.discoveredDevices.length === 0) {
                console.log('🔍 Checking localhost...');
                await this.getDevicesFromSpecificHost('localhost');
                await this.getDevicesFromSpecificHost('127.0.0.1');
            }
        } catch (error) {
            console.log('ℹ️ Could not get devices from current host:', error.message);
        }
    }

    /**
     * Get discovered devices from a specific host
     */
    async getDevicesFromSpecificHost(host) {
        try {
            const response = await fetch(`http://${host}:5000/discovered-devices`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.devices) {
                    console.log(`✅ Got ${data.devices.length} devices from ${host}`);
                    // Merge devices, avoiding duplicates
                    const existingIPs = this.discoveredDevices.map(d => d.ip_address);
                    data.devices.forEach(device => {
                        if (!existingIPs.includes(device.ip_address)) {
                            this.discoveredDevices.push(device);
                        }
                    });
                }
            }
        } catch (error) {
            // Silently fail - this is expected for most attempts
            console.log(`ℹ️ Could not connect to ${host}:`, error.message);
        }
    }

    /**
     * Try connecting to common IP addresses
     */
    async tryCommonIPs() {
        const promises = this.commonIPs.map(ip => this.testDeviceConnection(ip));
        const results = await Promise.allSettled(promises);
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                console.log(`✅ Found device at common IP: ${this.commonIPs[index]}`);
                this.discoveredDevices.push(result.value);
            }
        });
    }

    /**
     * Broader IP scan (tries more IPs, but slower)
     */
    async broadScan() {
        console.log('🔍 Starting broader network scan...');
        
        // Try to determine local network range
        const networkRanges = [
            '192.168.0.', '192.168.1.', '10.0.0.', '172.16.0.'
        ];
        
        for (const range of networkRanges) {
            const promises = [];
            // Try IPs 1-100 in each range (increased from 20 to catch more devices)
            for (let i = 1; i <= 100; i++) {
                promises.push(this.testDeviceConnection(range + i));
            }
            
            const results = await Promise.allSettled(promises);
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    console.log(`✅ Found device at: ${range}${index + 1}`);
                    this.discoveredDevices.push(result.value);
                }
            });
            
            // If we found devices in this range, no need to try other ranges
            if (this.discoveredDevices.length > 0) {
                break;
            }
        }
    }

    /**
     * Get other devices from the network via the discovered device
     */
    async getDevicesFromNetwork() {
        if (this.discoveredDevices.length === 0) return;
        
        try {
            const primaryDevice = this.discoveredDevices[0];
            const response = await fetch(`http://${primaryDevice.ip_address}:${primaryDevice.port}/discovered-devices`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.devices) {
                    // Merge discovered devices, avoiding duplicates
                    const existingIPs = this.discoveredDevices.map(d => d.ip_address);
                    data.devices.forEach(device => {
                        if (!existingIPs.includes(device.ip_address)) {
                            this.discoveredDevices.push(device);
                        }
                    });
                    console.log(`🔗 Got ${data.devices.length} devices from network registry`);
                }
            }
        } catch (error) {
            console.warn('⚠️ Could not get devices from network registry:', error.message);
        }
    }

    /**
     * Test connection to a specific IP address
     */
    async testDeviceConnection(ip) {
        try {
            const response = await fetch(`http://${ip}:5000/device-info`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(3000) // 3 second timeout
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && 
                    data.device_info && 
                    data.device_info.service_type === 'production_monitor') {
                    
                    return {
                        ...data.device_info,
                        connection_tested: true,
                        discovered_at: new Date().toISOString()
                    };
                }
            }
        } catch (error) {
            // Silently fail for network scanning (expected for most IPs)
            return null;
        }
    }

    /**
     * Connect to a specific device
     */
    async connectToDevice(deviceInfo) {
        try {
            // Test the connection first
            const testResult = await this.testDeviceConnection(deviceInfo.ip_address);
            if (!testResult) {
                throw new Error('Device is not responding');
            }
            
            this.selectedDevice = deviceInfo;
            this.currentApiBaseUrl = `http://${deviceInfo.ip_address}:${deviceInfo.port}`;
            
            console.log(`🔗 Connected to device: ${deviceInfo.device_name} at ${deviceInfo.ip_address}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to device:', error.message);
            throw error;
        }
    }

    /**
     * Get the current API base URL
     */
    getApiBaseUrl() {
        return this.currentApiBaseUrl;
    }

    /**
     * Get the currently selected device
     */
    getSelectedDevice() {
        return this.selectedDevice;
    }

    /**
     * Create a UI element to display discovered devices
     */
    createDeviceSelector(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container element not found:', containerId);
            return;
        }

        container.innerHTML = `
            <div class="device-discovery-container">
                <h3>🔍 Raspberry Pi Device Discovery</h3>
                <div class="discovery-controls">
                    <button id="discoverBtn" class="btn btn-primary">Discover Devices</button>
                    <button id="refreshBtn" class="btn btn-secondary">Refresh</button>
                </div>
                <div id="discoveryStatus" class="status-message"></div>
                <div id="deviceList" class="device-list"></div>
            </div>
        `;

        // Add event listeners
        document.getElementById('discoverBtn').addEventListener('click', () => this.handleDiscovery());
        document.getElementById('refreshBtn').addEventListener('click', () => this.handleRefresh());
    }

    /**
     * Handle discovery button click
     */
    async handleDiscovery() {
        const statusEl = document.getElementById('discoveryStatus');
        const deviceListEl = document.getElementById('deviceList');
        
        statusEl.innerHTML = '🔍 Searching for devices...';
        deviceListEl.innerHTML = '';
        
        try {
            const devices = await this.discoverDevices();
            
            if (devices.length > 0) {
                statusEl.innerHTML = `✅ Found ${devices.length} device(s)`;
                this.renderDeviceList(devices);
            } else {
                statusEl.innerHTML = '❌ No devices found. Make sure devices are on the same network.';
            }
        } catch (error) {
            statusEl.innerHTML = `❌ Discovery failed: ${error.message}`;
        }
    }

    /**
     * Handle refresh button click
     */
    async handleRefresh() {
        await this.handleDiscovery();
    }

    /**
     * Render the device list
     */
    renderDeviceList(devices) {
        const deviceListEl = document.getElementById('deviceList');
        
        const deviceCards = devices.map(device => `
            <div class="device-card" data-device-id="${device.device_id}">
                <div class="device-info">
                    <h4>${device.device_name}</h4>
                    <p><strong>IP:</strong> ${device.ip_address}:${device.port}</p>
                    <p><strong>Model:</strong> ${device.pi_model || 'Unknown'}</p>
                    <p><strong>Status:</strong> <span class="status-online">Online</span></p>
                    <p><strong>Uptime:</strong> ${Math.floor(device.uptime / 60)} minutes</p>
                </div>
                <button class="connect-btn btn btn-success" data-device-id="${device.device_id}">
                    Connect
                </button>
            </div>
        `).join('');

        deviceListEl.innerHTML = deviceCards;

        // Add connect button event listeners
        document.querySelectorAll('.connect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const deviceId = e.target.dataset.deviceId;
                const device = devices.find(d => d.device_id === deviceId);
                if (device) {
                    this.handleConnect(device);
                }
            });
        });
    }

    /**
     * Handle device connection
     */
    async handleConnect(device) {
        try {
            await this.connectToDevice(device);
            
            // Update the global PYTHON_API_BASE_URL if it exists
            if (typeof window !== 'undefined' && window.PYTHON_API_BASE_URL !== undefined) {
                window.PYTHON_API_BASE_URL = this.currentApiBaseUrl;
            }
            
            // Trigger a custom event to notify other parts of the application
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('deviceConnected', {
                    detail: { device, apiBaseUrl: this.currentApiBaseUrl }
                }));
            }
            
            alert(`✅ Connected to ${device.device_name}!\nAPI URL: ${this.currentApiBaseUrl}`);
        } catch (error) {
            alert(`❌ Failed to connect: ${error.message}`);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceDiscovery;
} else if (typeof window !== 'undefined') {
    window.DeviceDiscovery = DeviceDiscovery;
}

// CSS for the device discovery UI (inject into page)
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        .device-discovery-container {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .discovery-controls {
            display: flex;
            gap: 10px;
            margin: 15px 0;
        }
        
        .btn {
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
        
        .btn-primary { background: #007bff; color: white; }
        .btn-secondary { background: #6c757d; color: white; }
        .btn-success { background: #28a745; color: white; }
        
        .btn:hover { opacity: 0.8; }
        
        .status-message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
            background: #f8f9fa;
            border-left: 4px solid #007bff;
        }
        
        .device-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .device-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .device-info h4 {
            margin: 0 0 10px 0;
            color: #333;
        }
        
        .device-info p {
            margin: 5px 0;
            color: #666;
        }
        
        .status-online {
            color: #28a745;
            font-weight: bold;
        }
        
        .connect-btn {
            width: 100%;
            margin-top: 15px;
        }
    `;
    document.head.appendChild(style);
}
