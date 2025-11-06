# OPC UA Monitoring System - Setup Checklist

## 🎯 Complete Setup Guide

Follow these steps in order to deploy the OPC UA monitoring system.

---

## Phase 1: Backend Deployment

### ✅ Step 1: MongoDB Setup

- [ ] Create MongoDB Atlas account (if not exists)
- [ ] Get connection string
- [ ] Verify `masterUsers` collection exists with structure:
  ```json
  {
    "username": "kasugai",
    "company": "KSG",
    "dbName": "KSG",
    "devices": [
      {
        "name": "KSG1",
        "uniqueId": "4Y02SX"
      }
    ]
  }
  ```

### ✅ Step 2: Deploy Node.js Server to Render.com

- [ ] Push code to GitHub
- [ ] Create new Web Service on Render.com
- [ ] Connect GitHub repository
- [ ] Set environment variables:
  - `MONGODB_URI` = (your MongoDB connection string)
  - `PORT` = 3000
- [ ] Deploy and wait for build
- [ ] Test: Visit `https://your-app.onrender.com/ping`
- [ ] Expected response: `{"success": true, ...}`

### ✅ Step 3: Test API Endpoints

- [ ] Admin UI loads: `https://your-app.onrender.com/opcua-admin`
- [ ] Monitor UI loads: `https://your-app.onrender.com/opcua-monitor`
- [ ] Test API: `curl https://your-app.onrender.com/api/status`

---

## Phase 2: Admin Configuration

### ✅ Step 4: Add Raspberry Pi Device

1. [ ] Open Admin UI: `https://your-app.onrender.com/opcua-admin`
2. [ ] Enter your username (e.g., "kasugai")
3. [ ] Click "Raspberry Pis" tab
4. [ ] Click "+ Add Raspberry Pi"
5. [ ] Fill in form:
   - **Unique ID**: `6C10F6` (must match device in MongoDB)
   - **Display Name**: `KSG2`
   - **OPC UA Server IP**: `192.168.1.50` (your KV-8000 IP)
   - **OPC UA Server Port**: `4840`
   - **Poll Interval**: `5000` (ms)
   - **Enable Monitoring**: ✅ Checked
6. [ ] Click "Save"
7. [ ] Verify Raspberry Pi appears in list

### ✅ Step 5: Add Equipment

1. [ ] Click "Equipment" tab
2. [ ] Select Raspberry Pi from dropdown: `KSG2`
3. [ ] Click "+ Add Equipment"
4. [ ] Fill in form:
   - **Equipment ID**: `W312_2` (internal identifier)
   - **Display Name**: `W312-#2` (shown in UI)
   - **Description**: `Wire processing machine #2`
   - **Category**: `wire_machine`
   - **Location**: `Building A, Line 2`
   - **Display Order**: `1`
   - **Enable Equipment**: ✅ Checked
5. [ ] Click "Save"
6. [ ] Repeat for all equipment (W312_1, 670B_2, etc.)

### ✅ Step 6: Add Data Points

1. [ ] Click "Data Points" tab
2. [ ] Select Equipment from dropdown: `W312-#2`
3. [ ] Click "+ Add Data Point"
4. [ ] Fill in form for first variable:
   - **OPC UA Node ID**: `ns=4;s=W312_2_Kadou1`
   - **Label**: `稼働時間(時)`
   - **Description**: `Operating hours`
   - **Data Type**: `UINT`
   - **Unit**: `時`
   - **Display Format**: `number`
   - **Display Order**: `1`
   - **Enable Monitoring**: ✅ Checked
5. [ ] Click "Save"
6. [ ] Repeat for second variable:
   - **OPC UA Node ID**: `ns=4;s=W312_2_Kadou2`
   - **Label**: `稼働時間(分)`
   - **Unit**: `分`
7. [ ] Add all 40+ variables for each equipment

---

## Phase 3: Raspberry Pi Deployment

### ✅ Step 7: Prepare Raspberry Pi Hardware

- [ ] Raspberry Pi 4 (2GB+ RAM recommended)
- [ ] MicroSD card (16GB+) with Raspberry Pi OS
- [ ] Power supply
- [ ] Network connection (Ethernet or WiFi)
- [ ] Physical access to factory network

### ✅ Step 8: Install Software

1. [ ] SSH into Raspberry Pi: `ssh pi@raspberry-pi-ip`
2. [ ] Clone repository:
   ```bash
   cd ~
   git clone https://github.com/karlsome/KSG.git
   cd KSG/raspberry_pi
   ```
3. [ ] Install Python dependencies:
   ```bash
   pip3 install -r requirements.txt
   ```

### ✅ Step 9: Configure Raspberry Pi Client

1. [ ] Edit `opcua_client.py`:
   ```bash
   nano opcua_client.py
   ```
2. [ ] Set your unique ID (line ~18):
   ```python
   RASPBERRY_ID = "6C10F6"  # Change to YOUR device's uniqueId
   ```
3. [ ] Verify API URL (line ~21):
   ```python
   API_BASE_URL = "https://ksg-lu47.onrender.com"
   ```
4. [ ] Save and exit: `Ctrl+X`, `Y`, `Enter`

### ✅ Step 10: Test Raspberry Pi Client

1. [ ] Run the client manually:
   ```bash
   python3 opcua_client.py
   ```
2. [ ] Expected output:
   ```
   📡 Fetching configuration for Raspberry Pi: 6C10F6
   ✅ Configuration loaded
   🔗 Connecting to OPC UA server: opc.tcp://192.168.1.50:4840
   ✅ Connected to OPC UA server
   📤 Pushed 2 datapoints to cloud
   ```
3. [ ] Verify in Admin UI:
   - Status should show "online"
   - Last Heartbeat should update
4. [ ] Stop with: `Ctrl+C`

### ✅ Step 11: Setup Auto-start Service

1. [ ] Create systemd service:
   ```bash
   sudo nano /etc/systemd/system/opcua-monitor.service
   ```
2. [ ] Paste this content:
   ```ini
   [Unit]
   Description=OPC UA Monitoring Client
   After=network.target

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/KSG/raspberry_pi
   ExecStart=/usr/bin/python3 /home/pi/KSG/raspberry_pi/opcua_client.py
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```
3. [ ] Enable and start service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable opcua-monitor.service
   sudo systemctl start opcua-monitor.service
   ```
4. [ ] Check status:
   ```bash
   sudo systemctl status opcua-monitor.service
   ```
5. [ ] View logs:
   ```bash
   sudo journalctl -u opcua-monitor.service -f
   ```

---

## Phase 4: Monitor UI Testing

### ✅ Step 12: Test Monitor Dashboard

1. [ ] Open Monitor UI on iPad: `https://your-app.onrender.com/opcua-monitor`
2. [ ] Select company: `KSG`
3. [ ] Verify equipment cards appear:
   - ✅ W312-#2
   - ✅ W312-#1
   - ✅ 670B-#2 (if configured)
4. [ ] Verify data displays:
   - ✅ 稼働時間(時): Shows number
   - ✅ 稼働時間(分): Shows number
5. [ ] Verify real-time updates:
   - Status indicator shows green (online)
   - Values update automatically
   - Last update timestamp changes

---

## Phase 5: Production Verification

### ✅ Step 13: System Health Checks

- [ ] **Backend Health:**
  - API responds: `GET /api/status`
  - MongoDB connected
  - No errors in Render.com logs

- [ ] **Raspberry Pi Health:**
  - Service running: `systemctl status opcua-monitor`
  - Logs show no errors
  - Heartbeat updating in Admin UI

- [ ] **OPC UA Connection:**
  - Client connected to KV-8000
  - Data reading successfully
  - No connection errors

- [ ] **Web Interfaces:**
  - Admin UI loads and functional
  - Monitor UI shows real-time data
  - WebSocket connected (green indicator)

### ✅ Step 14: Test Failure Scenarios

- [ ] **Network Interruption:**
  - Disconnect Raspberry Pi from network
  - Verify it reconnects automatically
  - Check logs show retry attempts

- [ ] **OPC UA Server Down:**
  - Stop KV-8000 (if possible)
  - Verify Raspberry Pi retries connection
  - Restart KV-8000 and verify recovery

- [ ] **Backend Restart:**
  - Restart Render.com service
  - Verify Raspberry Pi reconnects
  - Verify Monitor UI reconnects

---

## 🎉 Deployment Complete!

Once all checkboxes are complete, your system is production-ready.

### Next Steps:

1. **Train Users:**
   - Show factory operators how to use Monitor UI
   - Train admins on configuration changes

2. **Monitor Performance:**
   - Watch system logs for first week
   - Check data accuracy
   - Adjust poll intervals if needed

3. **Scale Out:**
   - Add more Raspberry Pis for additional KV-8000s
   - Add more equipment and datapoints
   - Deploy to additional factories

---

## 📞 Support Contacts

**Technical Issues:**
- Check logs first
- Review troubleshooting in README.md
- Contact: [Your email/phone]

**System Status:**
- Render.com dashboard
- MongoDB Atlas monitoring
- Raspberry Pi logs: `journalctl -u opcua-monitor`

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Verified By:** _____________  
**Status:** ⬜ In Progress  ⬜ Complete ✅
