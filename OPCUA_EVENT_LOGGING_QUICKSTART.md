# Quick Start Testing Guide - OPC UA Event Logging

## Prerequisites
- Raspberry Pi with opcua_client.py running
- Backend server (ksgServer.js) running
- MongoDB connected
- OPC UA server running

## Test 1: Verify Event Logging is Active (2 minutes)

### Step 1: Restart Raspberry Pi Client
```bash
cd /Users/karlsome/Documents/GitHub/KSG/raspberry_pi
source ../.venv/bin/activate
python opcua_client.py
```

### Step 2: Look for Key Log Messages
You should see:
```
✅ Connected to OPC UA server: 192.168.24.31
📊 Value changed: kanban1 = 15 (quality: Good)
📝 Flushed 5 events to log
```

### Step 3: Check MongoDB
```javascript
// In MongoDB Compass or shell
use KSG_db  // or your database name

// Count events
db.opcua_event_log.countDocuments()
// Should return > 0

// View recent events
db.opcua_event_log.find().sort({ timestamp: -1 }).limit(5)
```

**✅ PASS:** You see events in database with timestamp, eventType, quality fields  
**❌ FAIL:** Empty collection or error - check backend logs

---

## Test 2: Connection Lost Detection (3 minutes)

### Step 1: Note Current Status
```javascript
// Check for connection events
db.opcua_event_log.find({ 
  eventType: { $in: ["connection_lost", "connection_restored"] } 
}).sort({ timestamp: -1 })
```

### Step 2: Stop OPC UA Server
```bash
# Stop your OPC UA server (method depends on your setup)
# Example: sudo systemctl stop opcua-server
```

### Step 3: Wait 30-40 Seconds
Watch Raspberry Pi logs:
```
❌ Connection health check: Server not responding
📝 Flushed 1 events to log  (immediate flush for critical event)
```

### Step 4: Verify Event
```javascript
db.opcua_event_log.findOne({ eventType: "connection_lost" })
// Should show:
{
  eventType: "connection_lost",
  quality: "Bad",
  message: "OPC UA server not responding: ...",
  timestamp: ISODate("...")
}
```

### Step 5: Restart Server
```bash
# Start your OPC UA server
```

Wait 30 seconds, verify `connection_restored` event appears.

**✅ PASS:** Both connection_lost and connection_restored logged  
**❌ FAIL:** No events - check CONNECTION_CHECK_INTERVAL setting

---

## Test 3: Value Change Logging (1 minute)

### Step 1: Change OPC UA Value
Use your OPC UA client to change a monitored variable value.

### Step 2: Check Immediate Logs
Raspberry Pi should show:
```
📊 Value changed: kanban1 = 20 (quality: Good)
```

### Step 3: Verify in Database (after 10 seconds)
```javascript
db.opcua_event_log.find({ 
  eventType: "value_change",
  variableName: "kanban1"
}).sort({ timestamp: -1 }).limit(1)

// Should show oldValue and newValue
{
  eventType: "value_change",
  variableName: "kanban1",
  oldValue: 15,
  newValue: 20,
  quality: "Good",
  message: "Value changed from 15 to 20"
}
```

**✅ PASS:** Event logged with old→new transition  
**❌ FAIL:** No event - check subscription setup

---

## Test 4: Batch Flushing (30 seconds)

### Step 1: Watch Logs for 15 Seconds
If values are changing:
```
📊 Value changed: sensor1 = 10
📊 Value changed: sensor2 = 20
📊 Value changed: sensor3 = 30
```

### Step 2: After 10 Seconds
Should see:
```
📝 Flushed 3 events to log
```

### Step 3: Verify Backend Received
Check backend logs:
```
📝 Logged 3 events from Raspberry Pi 6C10F6
```

**✅ PASS:** Events batched and flushed every 10 seconds  
**❌ FAIL:** No batch flush - check EVENT_FLUSH_INTERVAL

---

## Test 5: TTL Index Verification (30 seconds)

### Step 1: Check Index Exists
```javascript
db.opcua_event_log.getIndexes()
```

Should see:
```javascript
{
  "v": 2,
  "key": { "timestamp": 1 },
  "name": "event_log_ttl_idx",
  "expireAfterSeconds": 63072000,  // 2 years
  "background": true
}
```

### Step 2: Insert Test Old Document
```javascript
db.opcua_event_log.insertOne({
  device_id: "TEST",
  company: "KSG",
  eventType: "value_change",
  timestamp: new Date("2022-01-01"),  // > 2 years ago
  quality: "Good",
  message: "Test old event - should auto-delete"
})
```

### Step 3: Wait 60-90 Seconds
MongoDB TTL background task runs every 60 seconds.

### Step 4: Verify Deletion
```javascript
db.opcua_event_log.findOne({ device_id: "TEST" })
// Should return null (document deleted)
```

**✅ PASS:** TTL index working, old document deleted  
**❌ FAIL:** Document still exists - check MongoDB version (requires 2.2+)

---

## Test 6: Quality Status Propagation (1 minute)

### Step 1: Normal Operation
Check data push includes quality:
```javascript
db.opcua_realtime.findOne({ raspberryId: "6C10F6" })
// Should have quality field:
{
  value: 15,
  quality: "Good",  // ← NEW FIELD
  timestamp: "..."
}
```

### Step 2: During Disconnection
After stopping OPC UA server:
```javascript
db.opcua_realtime.findOne({ raspberryId: "6C10F6" })
// Should show:
{
  value: 15,        // ← RETAINED (not null)
  quality: "Bad",   // ← CHANGED to Bad
  timestamp: "..."
}
```

**✅ PASS:** Quality status propagates, values retained  
**❌ FAIL:** Quality always "Good" - check DataChangeHandler

---

## Quick Troubleshooting

### No Events Appearing
```bash
# Check Raspberry Pi is sending
tail -f /path/to/opcua_client.log | grep "Flushed"

# Check backend is receiving
tail -f /path/to/ksgServer.log | grep "event-log"

# Check MongoDB connection
mongo --eval "db.opcua_event_log.countDocuments()"
```

### Events Not Flushing
```python
# In opcua_client.py, temporarily reduce interval
EVENT_FLUSH_INTERVAL = 3  # 3 seconds instead of 10
EVENT_FLUSH_COUNT = 5     # 5 events instead of 100
```

### Connection Checks Not Running
```python
# Reduce check interval for testing
CONNECTION_CHECK_INTERVAL = 10  # 10 seconds instead of 30
```

---

## Success Criteria

All tests passing means:
- ✅ Events are being logged continuously
- ✅ Connection failures detected within 30 seconds
- ✅ Value changes tracked with old→new transitions
- ✅ Events batched and flushed every 10 seconds
- ✅ TTL index working (2-year auto-cleanup)
- ✅ Quality status propagating correctly
- ✅ Last values retained during disconnections

## Next Steps After Testing

1. **Deploy to Production**
   - Update all Raspberry Pi clients with new code
   - Restart all clients
   - Monitor for 24 hours

2. **Add Frontend UI** (Recommended)
   - Display quality status in opcManagement.html
   - Add red text for Bad quality
   - Show connection status banner
   - Create event log viewer page

3. **Monitor Performance**
   - Check database size growth
   - Verify TTL cleanup working
   - Monitor network bandwidth
   - Check memory usage on Pi

---

**Need Help?**
- Documentation: OPCUA_EVENT_LOGGING_IMPLEMENTATION.md
- Code: raspberry_pi/opcua_client.py and ksgServer.js
- Contact: System administrator
