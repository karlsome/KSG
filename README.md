# KSG OPC UA Monitoring System

A comprehensive multi-tenant OPC UA monitoring system for factory equipment across multiple locations.

## 🏗️ System Architecture

```
┌─────────────────┐
│  Web Interfaces │
│  (Admin/Monitor)│
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│   Node.js API   │
│ (Render.com)    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐      ┌──────────────────┐
│  MongoDB Atlas  │←────→│  Raspberry Pi    │
│  (Cloud DB)     │      │  (Factory Local) │
└─────────────────┘      └────────┬─────────┘
                                  │ OPC UA
                                  ↓
                         ┌──────────────────┐
                         │  KV-8000 PLC     │
                         │  (Equipment)     │
                         └──────────────────┘
```

## 📦 Components

### 1. Node.js Backend (`ksgServer.js`)
- **Location:** Render.com cloud hosting
- **Purpose:** REST API, authentication, data management
- **Features:**
  - Multi-tenant support
  - Device authentication by uniqueId
  - Real-time WebSocket updates
  - MongoDB integration

### 2. Raspberry Pi Client (`raspberry_pi/opcua_client.py`)
- **Location:** Factory local network
- **Purpose:** OPC UA data collection
- **Features:**
  - Connects to KV-8000 PLC via OPC UA
  - Polls configured datapoints
  - Pushes data to cloud API
  - Auto-reconnection & heartbeat

### 3. Admin UI (`public/opcua-admin.html`)
- **Purpose:** System configuration & management
- **Users:** Administrators, masterUsers
- **Features:**
  - Raspberry Pi device management
  - Equipment configuration
  - Datapoint selection (40+ variables)
  - Real-time status monitoring

### 4. Monitor UI (`public/opcua-monitor.html`)
- **Purpose:** Real-time equipment monitoring
- **Users:** Factory operators
- **Device:** iPad/Tablet optimized
- **Features:**
  - Live equipment grid display
  - Auto-updating datapoints
  - WebSocket real-time updates
  - Touch-friendly interface

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Python 3.7+ (for Raspberry Pi)
- MongoDB Atlas account
- Render.com account (or any Node.js hosting)

### Backend Setup (Node.js)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create `.env` file:
   ```env
   MONGODB_URI=mongodb+srv://your-connection-string
   PORT=3000
   ```

3. **Start server:**
   ```bash
   npm start
   ```

4. **Deploy to Render.com:**
   - Connect your GitHub repository
   - Set environment variables
   - Deploy automatically

### Raspberry Pi Setup

1. **Navigate to raspberry_pi folder:**
   ```bash
   cd raspberry_pi
   ```

2. **Install Python dependencies:**
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Configure your device:**
   Edit `opcua_client.py`:
   ```python
   RASPBERRY_ID = "YOUR_UNIQUE_ID"  # e.g., "6C10F6"
   ```

4. **Run the client:**
   ```bash
   python3 opcua_client.py
   ```

5. **Setup as service (optional):**
   See `raspberry_pi/README.md` for systemd service setup

## 📊 MongoDB Collections

Each customer has their own database (e.g., "KSG") with collections:

### `opcua_config`
Raspberry Pi configuration (IP, port, intervals)

### `opcua_equipment`
Equipment definitions (machines, lines)

### `opcua_datapoints`
OPC UA node mappings (40+ variables per equipment)

### `opcua_realtime`
Current values cache for fast dashboard access

## 🔐 Authentication

### Raspberry Pi Authentication
- Uses `uniqueId` hardcoded in Python script
- Must match `masterUsers.devices.uniqueId` in MongoDB
- Validated on every API call

### Admin Authentication
- Uses `masterUser` credentials
- Login via web interface
- Access to configuration and management

### Monitor View
- Optional company selection
- Read-only public access (or PIN-protected)

## 🌐 API Endpoints

### Raspberry Pi Endpoints
```
GET  /api/opcua/config/:raspberryId          # Get configuration
POST /api/opcua/heartbeat                    # Update heartbeat
POST /api/opcua/data                         # Push real-time data
GET  /api/opcua/datapoints/:raspberryId     # Get monitored datapoints
```

### Admin Endpoints
```
GET    /api/opcua/admin/raspberries         # List all Raspberry Pis
POST   /api/opcua/admin/raspberry           # Add/update Raspberry Pi
DELETE /api/opcua/admin/raspberry/:id       # Delete Raspberry Pi
GET    /api/opcua/admin/equipment/:id       # List equipment
POST   /api/opcua/admin/equipment           # Add/update equipment
GET    /api/opcua/admin/datapoints/:id      # List datapoints
POST   /api/opcua/admin/datapoints          # Add/update datapoint
PUT    /api/opcua/admin/datapoints/:id/toggle  # Enable/disable
```

### Monitor Endpoints
```
GET /api/opcua/monitor/dashboard?company=KSG  # Get all equipment data
WS  /opcua                                    # WebSocket for real-time
```

## 🎨 Web Interfaces

### Admin Interface
**URL:** `https://ksg-lu47.onrender.com/opcua-admin`

**Features:**
- Manage Raspberry Pi devices
- Configure OPC UA connections
- Add/edit equipment
- Select which variables to monitor (checkboxes)
- Test connections
- View system status

### Monitor Interface
**URL:** `https://ksg-lu47.onrender.com/opcua-monitor`

**Features:**
- Real-time equipment dashboard
- Grid layout with equipment cards
- Live data updates via WebSocket
- Color-coded status indicators
- iPad/tablet optimized
- Auto-refresh

## 📝 Configuration Workflow

### Initial Setup (Admin)

1. **Add Raspberry Pi Device:**
   - Open Admin UI
   - Click "Add Raspberry Pi"
   - Enter uniqueId (e.g., "6C10F6")
   - Enter display name (e.g., "KSG2")
   - Set OPC UA server IP (e.g., "192.168.1.50")
   - Save

2. **Add Equipment:**
   - Select Raspberry Pi from dropdown
   - Click "Add Equipment"
   - Enter equipment ID (e.g., "W312_2")
   - Enter display name (e.g., "W312-#2")
   - Add description and location
   - Save

3. **Add Data Points:**
   - Select equipment from dropdown
   - Click "Add Data Point"
   - Enter OPC UA node ID (e.g., "ns=4;s=W312_2_Kadou1")
   - Enter label (e.g., "稼働時間(時)")
   - Select data type and unit
   - Enable monitoring
   - Save

4. **Deploy Raspberry Pi:**
   - Configure Python script with uniqueId
   - Start the client
   - Verify connection in Admin UI
   - Monitor real-time data

### Daily Operation (Operators)

1. Open Monitor UI on iPad
2. Select company from dropdown
3. View real-time equipment status
4. Data updates automatically

## 🔧 Customization

### Adding New Customers

1. Add masterUser in MongoDB `masterUsers` collection
2. Add device entries with unique uniqueIds
3. Configure Raspberry Pis with those uniqueIds
4. System automatically handles multi-tenancy

### Adding More Equipment

- Use Admin UI to add equipment and datapoints
- No code changes required
- Raspberry Pi automatically picks up new configuration

### Changing Poll Intervals

- Adjust in Admin UI per Raspberry Pi
- Default: 5000ms (5 seconds)
- Range: 1000ms - 60000ms recommended

## 📚 Documentation

- [System Design](OPCUA_SYSTEM_DESIGN.md) - Detailed architecture
- [Raspberry Pi Setup](raspberry_pi/README.md) - Deployment guide
- [API Reference](OPCUA_SYSTEM_DESIGN.md#api-endpoints) - Complete API docs

## 🛠️ Troubleshooting

### Raspberry Pi Can't Connect

1. Check uniqueId matches MongoDB
2. Verify network connectivity
3. Check OPC UA server IP/port
4. View logs: `python3 opcua_client.py`

### Data Not Updating

1. Check Raspberry Pi status in Admin UI
2. Verify datapoints are enabled
3. Check OPC UA server is running
4. Inspect WebSocket connection

### Admin UI Not Loading

1. Check Node.js server is running
2. Verify MongoDB connection
3. Check browser console for errors
4. Ensure correct authentication

## 📈 Future Enhancements

- [ ] Auto-discovery of OPC UA nodes
- [ ] Historical data charts and analytics
- [ ] Alert/notification system
- [ ] Mobile app (iOS/Android)
- [ ] Multi-language support
- [ ] Export data to CSV/Excel
- [ ] Equipment maintenance scheduling

## 📄 License

Proprietary - KSG Internal Use Only

## 👥 Support

For issues or questions:
- Check documentation first
- Review system logs
- Contact: [Your contact info]

---

**Version:** 1.0.0  
**Last Updated:** November 5, 2025  
**Status:** Production Ready ✅
