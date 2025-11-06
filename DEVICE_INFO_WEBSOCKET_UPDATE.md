# Device Info & WebSocket Update

## Changes Made

Added two critical features to the Raspberry Pi monitoring system:

1. **Device Information Upload** - Automatically uploads device details to MongoDB
2. **WebSocket Connection** - Real-time online/offline status monitoring

---

## 1. Device Information Upload

### What It Does
When the Python client starts, it automatically collects and uploads device information to the `deviceInfo` collection.

### Data Structure
```json
{
  "device_id": "6C10F6",
  "company": "KSG",
  "device_name": "raspberrypi",
  "device_brand": "Raspberry Pi",
  "owner": "kasugai",
  "local_ip": "192.168.25.85",
  "local_port": 0,
  "device_type": "Raspberry Pi",
  "registered_at": "2025-11-06T14:30:00.000Z",
  "authorized_until": "2026-11-06T14:30:00.000Z",
  "updated_at": "2025-11-06T14:30:00.000Z"
}
```

### Collected Information
- **device_id**: Raspberry Pi unique ID (e.g., `6C10F6`)
- **device_name**: System hostname (e.g., `raspberrypi`)
- **local_ip**: Current IP address on local network
- **device_type**: Device type identifier
- **registered_at**: First registration timestamp
- **authorized_until**: Authorization expiry (set to 1 year by backend)
- **updated_at**: Last update timestamp

### Backend Endpoint
```javascript
POST /api/opcua/device-info
```
- Stores in `{company}/deviceInfo` collection
- Upserts based on `device_id`
- Automatically sets `authorized_until` to 1 year on first registration

---

## 2. WebSocket Real-Time Status

### What It Does
Maintains a persistent WebSocket connection between Raspberry Pi and backend server for real-time status monitoring.

### Connection Flow
```
Raspberry Pi → WebSocket → Backend Server → Admin UI
                              ↓
                         MongoDB (opcua_config)
```

### Status Events

#### On Connection:
```javascript
// Raspberry Pi sends:
{
  event: 'raspberry_register',
  data: {
    raspberryId: '6C10F6',
    status: 'online',
    timestamp: '2025-11-06T14:30:00.000Z'
  }
}
```

#### On Disconnection:
- Backend automatically marks Raspberry Pi as `offline`
- Updates `opcua_config` collection
- Broadcasts to all admin UIs

#### Status Updates:
```javascript
// Admin UI receives:
{
  event: 'raspberry_status_update',
  data: {
    raspberryId: '6C10F6',
    status: 'online' | 'offline',
    timestamp: '2025-11-06T14:30:00.000Z'
  }
}
```

### Benefits
✅ **Real-time status** - Know immediately when Raspberry Pi goes offline
✅ **Automatic reconnection** - WebSocket auto-reconnects if connection drops
✅ **Visual indicators** - Admin UI shows online/offline badge
✅ **No polling needed** - Push-based updates instead of HTTP polling

---

## Code Changes

### Python Client (`opcua_client.py`)

**New Dependencies:**
```python
import socket          # For getting local IP
import socketio        # WebSocket client
import threading       # Background WebSocket thread
```

**New Functions:**
```python
get_local_ip()              # Get device's local IP address
get_device_info()           # Collect device information
upload_device_info()        # Upload to MongoDB via API
start_websocket()           # Connect WebSocket in background
stop_websocket()            # Gracefully disconnect
```

**WebSocket Handlers:**
```python
@sio.event
def connect():              # On WebSocket connection
@sio.event
def disconnect():           # On WebSocket disconnection
@sio.event
def connect_error(data):    # On connection error
@sio.event
def raspberry_status_update(data):  # Receive status updates
```

**Main Loop Updates:**
```python
# On startup:
upload_device_info()        # Upload device details
start_websocket()           # Start WebSocket connection

# On shutdown:
stop_websocket()            # Disconnect gracefully
```

### Backend (`ksgServer.js`)

**New Endpoint:**
```javascript
POST /api/opcua/device-info
// Stores device information in deviceInfo collection
```

**New WebSocket Handlers:**
```javascript
socket.on('raspberry_register', async (data) => {
    // Mark Raspberry Pi as online
    // Update MongoDB: opcua_config
    // Broadcast to admin UIs
});

socket.on('disconnect', async () => {
    // Mark Raspberry Pi as offline
    // Broadcast to admin UIs
});
```

**Database Updates:**
```javascript
// opcua_config collection now includes:
{
  raspberryId: '6C10F6',
  status: 'online' | 'offline',
  lastSeen: Date,
  socketId: 'socket_abc123'
}
```

---

## Installation & Testing

### 1. Install New Dependency
```bash
cd raspberry_pi
pip install -r requirements.txt
```

This will install `python-socketio[client]==5.10.0`

### 2. Restart Python Client
```bash
python3 opcua_client.py
```

### 3. Check Logs
You should see:
```
📤 Uploading device information...
✅ Device info uploaded: raspberrypi (192.168.25.85)
🔌 Starting WebSocket connection...
🔄 Connecting WebSocket to https://ksg-lu47.onrender.com...
🔌 WebSocket connected to https://ksg-lu47.onrender.com
```

### 4. Verify in MongoDB

**Check deviceInfo Collection:**
```javascript
db = db.getSiblingDB('KSG');
db.deviceInfo.findOne({ device_id: '6C10F6' });
```

**Check opcua_config Collection:**
```javascript
db = db.getSiblingDB('Sasaki_Coating_MasterDB');
db.opcua_config.findOne({ raspberryId: '6C10F6' });
// Should show: status: 'online', lastSeen: <recent timestamp>
```

### 5. Test Disconnect
Stop the Python client (Ctrl+C) and check:
```javascript
db.opcua_config.findOne({ raspberryId: '6C10F6' });
// Should show: status: 'offline'
```

---

## Admin UI Integration

The admin UI will automatically receive WebSocket events:

```javascript
// Listen for status updates
socket.on('raspberry_status_update', (data) => {
    console.log(`Raspberry Pi ${data.raspberryId}: ${data.status}`);
    // Update UI badge to show online/offline
});
```

**Visual Indicator Example:**
```html
<div class="raspberry-card">
  <span class="status-badge online">Online</span>
  <!-- or -->
  <span class="status-badge offline">Offline</span>
</div>
```

---

## Configuration

You can customize device info in `opcua_client.py`:

```python
# Device Configuration
COMPANY_NAME = "KSG"              # Your company name
DEVICE_OWNER = "kasugai"          # Device owner
DEVICE_TYPE = "Raspberry Pi"      # Device type
DEVICE_BRAND = "Raspberry Pi"     # Device brand
```

---

## Troubleshooting

### WebSocket not connecting?
1. Check firewall allows outbound WebSocket connections
2. Verify backend server URL is correct
3. Check logs for connection errors

### Device info not appearing?
1. Verify `POST /api/opcua/device-info` endpoint is accessible
2. Check MongoDB connection
3. Verify company name matches database

### Status not updating?
1. Check WebSocket connection is active
2. Verify `opcua_config` collection has `status` and `lastSeen` fields
3. Check backend logs for WebSocket events

---

## Performance Impact

- **WebSocket**: < 1KB/sec bandwidth (lightweight)
- **Device info**: Uploaded once on startup
- **Status updates**: Only on connect/disconnect (no polling)
- **Reconnection**: Automatic with exponential backoff

---

## Next Steps

1. ✅ Test device info upload
2. ✅ Test WebSocket connection
3. ⬜ Update admin UI to show online/offline status
4. ⬜ Add last seen timestamp to admin UI
5. ⬜ Deploy to production (Render.com)
