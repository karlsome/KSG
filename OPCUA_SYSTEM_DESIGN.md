# OPC UA Monitoring System - Architecture Design

## Overview
Multi-tenant OPC UA monitoring system for factory equipment across multiple locations.

---

## System Components

### 1. Node.js Backend (Render.com)
- **URL:** `https://ksg-lu47.onrender.com`
- **File:** `ksgServer.js`
- **Purpose:** API endpoints, authentication, MongoDB interface

### 2. Raspberry Pi Client (Python)
- **Location:** Factory local network
- **File:** `raspberry_pi_opcua_client.py`
- **Purpose:** OPC UA data collection, push to cloud

### 3. Admin UI (Web)
- **Route:** `/opcua-admin`
- **Purpose:** Configuration, device management, variable selection

### 4. Monitor UI (Web/Tablet)
- **Route:** `/opcua-monitor`
- **Purpose:** Real-time equipment monitoring dashboard

---

## MongoDB Schema

### Database Structure
Each customer has their own database (e.g., "KSG")

```
KSG (Database)
├── deviceInfo (existing)
├── masterDB (existing)
├── submittedDB (existing)
├── users (existing)
├── opcua_config (NEW)
├── opcua_equipment (NEW)
├── opcua_datapoints (NEW)
└── opcua_realtime (NEW)
```

---

## Collection Schemas

### **opcua_config**
Configuration for each Raspberry Pi device

```javascript
{
  _id: ObjectId,
  raspberryId: "6C10F6",           // Links to masterUsers.devices.uniqueId
  raspberryName: "KSG2",           // Display name
  company: "KSG",                  // Owner company
  opcua_server_ip: "192.168.1.50", // OPC UA server IP
  opcua_server_port: 4840,         // OPC UA server port
  connection_timeout: 60000,       // Connection timeout (ms)
  poll_interval: 5000,             // Data polling interval (ms)
  enabled: true,                   // Enable/disable monitoring
  status: "online",                // online, offline, error
  lastSync: "2025-11-05T10:30:00Z",// Last successful sync
  lastHeartbeat: "2025-11-05T10:35:00Z",
  createdAt: "2025-11-05T08:00:00Z",
  updatedAt: "2025-11-05T10:35:00Z"
}
```

**Indexes:**
- `raspberryId` (unique)
- `company`

---

### **opcua_equipment**
Equipment groups/machines being monitored

```javascript
{
  _id: ObjectId,
  raspberryId: "6C10F6",           // Which Raspberry Pi monitors this
  equipmentId: "W312_2",           // Unique equipment identifier
  displayName: "W312-#2",          // Display name for UI
  description: "Wire processing machine #2",
  category: "wire_machine",        // Equipment category
  location: "Building A, Line 2",  // Physical location
  sortOrder: 1,                    // Display order in UI
  enabled: true,                   // Enable/disable equipment
  createdAt: "2025-11-05T08:00:00Z",
  updatedAt: "2025-11-05T10:00:00Z"
}
```

**Indexes:**
- `raspberryId, equipmentId` (compound, unique)
- `raspberryId, sortOrder`

---

### **opcua_datapoints**
Individual OPC UA variables/nodes to monitor

```javascript
{
  _id: ObjectId,
  raspberryId: "6C10F6",           // Which Raspberry Pi
  equipmentId: "W312_2",           // Which equipment
  opcNodeId: "ns=4;s=W312_2_Kadou1", // OPC UA node identifier
  label: "稼働時間(時)",            // Display label
  description: "Operating hours",   // English description
  dataType: "UINT",                // OPC UA data type
  unit: "時",                       // Unit of measurement
  displayFormat: "number",         // number, time, boolean, string
  sortOrder: 1,                    // Display order
  enabled: true,                   // Monitor this datapoint
  alertEnabled: false,             // Enable alerts
  alertCondition: null,            // Alert condition (e.g., "> 100")
  createdAt: "2025-11-05T08:00:00Z",
  updatedAt: "2025-11-05T10:00:00Z"
}
```

**Indexes:**
- `raspberryId, enabled`
- `equipmentId`
- `opcNodeId`

---

### **opcua_realtime**
Current/latest values from OPC UA (cache for fast access)

```javascript
{
  _id: ObjectId,
  raspberryId: "6C10F6",
  equipmentId: "W312_2",
  datapointId: ObjectId("..."),    // Links to opcua_datapoints
  opcNodeId: "ns=4;s=W312_2_Kadou1",
  value: 125,                      // Current value
  valueString: "125",              // String representation
  quality: "Good",                 // OPC UA quality: Good, Bad, Uncertain
  sourceTimestamp: "2025-11-05T10:35:00Z", // From OPC UA server
  serverTimestamp: "2025-11-05T10:35:01Z",
  receivedAt: "2025-11-05T10:35:02Z",      // When we received it
  updatedAt: "2025-11-05T10:35:02Z"
}
```

**Indexes:**
- `raspberryId, equipmentId` (compound)
- `datapointId` (unique)
- `updatedAt` (for cleanup of old data)

---

## API Endpoints

### Authentication
All endpoints validate `raspberryId` or `username` against `masterUsers` collection.

### **Raspberry Pi Endpoints** (Python client)

```
GET  /api/opcua/config/:raspberryId
     → Get configuration for Raspberry Pi
     
POST /api/opcua/heartbeat
     Body: { raspberryId, status, timestamp }
     → Update Raspberry Pi heartbeat
     
POST /api/opcua/data
     Body: { raspberryId, data: [...] }
     → Push real-time data to cloud
     
GET  /api/opcua/datapoints/:raspberryId
     → Get list of datapoints to monitor
```

### **Admin Endpoints** (Web UI)

```
GET    /api/opcua/admin/raspberries
       → List all Raspberry Pis for logged-in user
       
POST   /api/opcua/admin/raspberry
       → Add/update Raspberry Pi configuration
       
DELETE /api/opcua/admin/raspberry/:raspberryId
       → Remove Raspberry Pi
       
POST   /api/opcua/admin/discover
       Body: { raspberryId, opcua_ip, opcua_port }
       → Discover all OPC UA nodes (proxied through Raspberry Pi)
       
GET    /api/opcua/admin/equipment/:raspberryId
       → Get equipment list
       
POST   /api/opcua/admin/equipment
       → Add/update equipment
       
DELETE /api/opcua/admin/equipment/:equipmentId
       → Remove equipment
       
GET    /api/opcua/admin/datapoints/:equipmentId
       → Get datapoints for equipment
       
POST   /api/opcua/admin/datapoints
       → Add/update datapoint
       
PUT    /api/opcua/admin/datapoints/:id/toggle
       → Enable/disable datapoint
```

### **Monitor Endpoints** (Tablet UI)

```
GET /api/opcua/monitor/dashboard
    → Get all equipment + current values for user
    
WS  /ws/opcua/realtime
    → WebSocket for real-time data updates
```

---

## Data Flow

### Setup Flow (Admin)
1. Admin logs in as masterUser "kasugai"
2. Admin adds Raspberry Pi "KSG2" (uniqueId: 6C10F6)
3. Admin sets OPC UA IP: 192.168.1.50
4. Admin clicks "Discover Variables"
5. System proxies request to Raspberry Pi (or admin enters manually)
6. Shows 40+ discovered nodes
7. Admin selects 15 nodes to monitor
8. Saves configuration to MongoDB

### Runtime Flow (Raspberry Pi)
1. Python script boots with hardcoded uniqueId: "6C10F6"
2. Calls: GET /api/opcua/config/6C10F6
3. API validates uniqueId exists in masterUsers.devices
4. Returns: { opcua_ip, datapoints: [...] }
5. Python connects to OPC UA server
6. Polls selected datapoints every 5 seconds
7. Pushes data: POST /api/opcua/data
8. Sends heartbeat every 30 seconds

### Monitor Flow (Tablet)
1. User opens /opcua-monitor
2. Optional: Login or PIN
3. Loads: GET /api/opcua/monitor/dashboard
4. Connects: WS /ws/opcua/realtime
5. Displays equipment grid with live data
6. Auto-updates via WebSocket

---

## Security

### Authentication Levels

1. **Raspberry Pi**: Validated by uniqueId in masterUsers.devices
2. **Admin**: Requires masterUser login
3. **Monitor**: Optional PIN or public (read-only)

### Data Access Control

- Each customer only sees their own data
- Based on `company` field in masterUsers
- Raspberry Pi can only access config for its own uniqueId

---

## Tech Stack

### Backend
- Node.js + Express.js
- MongoDB (Atlas)
- Socket.IO (WebSocket)

### Raspberry Pi
- Python 3.x
- opcua library
- requests (HTTP client)

### Frontend
- React.js (or Vanilla JS)
- Tailwind CSS
- WebSocket client

---

## Development Phases

### Phase 1: Backend API ✅
- MongoDB collections setup
- API endpoints implementation
- Authentication middleware

### Phase 2: Raspberry Pi Client 🚧
- Python script with OPC UA client
- Config fetching
- Data pushing

### Phase 3: Admin UI 🔜
- Raspberry Pi management
- Variable discovery & selection
- Equipment mapping

### Phase 4: Monitor UI 🔜
- Real-time dashboard
- WebSocket integration
- Tablet optimization

---

## File Structure

```
KSG/
├── old_data/              # Previous project files
├── ksgServer.js           # Main Node.js server (updated)
├── package.json           # Node dependencies
├── raspberry_pi/
│   ├── opcua_client.py    # Raspberry Pi Python script
│   └── requirements.txt   # Python dependencies
├── public/
│   ├── opcua-admin.html   # Admin UI
│   ├── opcua-monitor.html # Monitor UI
│   ├── css/
│   │   └── opcua-styles.css
│   └── js/
│       ├── opcua-admin.js
│       └── opcua-monitor.js
└── OPCUA_SYSTEM_DESIGN.md # This file
```

---

## Next Steps

1. ✅ Design complete
2. 🚧 Implement API endpoints in ksgServer.js
3. 🔜 Create Raspberry Pi Python client
4. 🔜 Build Admin UI
5. 🔜 Build Monitor UI
6. 🔜 Testing & deployment
