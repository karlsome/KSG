# OPC UA Event Logging & Health Monitoring Implementation

**Implementation Date:** December 19, 2025  
**Status:** ✅ Complete - Ready for Testing

## Overview

This implementation adds industry-standard OPC UA resilience and comprehensive audit logging to the KSG monitoring system. It follows best practices from major SCADA platforms (Siemens WinCC, Ignition, Wonderware) by:

1. **Retaining last known values** when OPC UA disconnects (not setting to null)
2. **Propagating quality flags** (Good/Bad/Uncertain) with all data
3. **Logging all events** for troubleshooting and compliance
4. **Batching event uploads** for performance optimization

## Architecture

### Event Flow
```
OPC UA Server → Raspberry Pi Client → Event Buffer → Backend API → MongoDB
                                           ↓
                                   (Flush every 10s or 100 events)
```

### Quality Status Propagation
```
OPC UA StatusCode → Good/Bad/Uncertain → WebSocket → Frontend UI
                                              ↓
                                    (Red text for Bad quality)
```

## Key Features

### 1. Connection Health Monitoring
- **Interval:** 30 seconds
- **Method:** Checks OPC UA ServerState node (ns=0;i=2259)
- **Failure Detection:** Catches exceptions and marks connection as Disconnected
- **Event Logging:** Logs `connection_lost` and `connection_restored` events

### 2. Event Batching System
- **Buffer Size:** Max 1000 events
- **Flush Triggers:**
  - Every 10 seconds (configurable)
  - When 100 events accumulated (configurable)
  - Immediately for critical events (connection_lost/restored)
- **Overflow Handling:** Drops oldest events when buffer full

### 3. Value Change Detection
- **Tracking:** Maintains `last_values` dictionary with previous values
- **Logging:** Records old value → new value transitions
- **Quality Status:** Logs quality degradation events separately
- **Metadata:** Includes dataType, equipmentId, datapointId

### 4. Quality Status Integration
- **Data Pushes:** All data includes quality field (Good/Bad/Uncertain)
- **Retained Values:** Last known value kept with Bad quality on disconnect
- **OPC UA Standard:** Uses StatusCode.is_good() and StatusCode.is_uncertain()

## Implementation Details

### Raspberry Pi Client (opcua_client.py)

#### New Global Variables
```python
# Event logging configuration
EVENT_BUFFER_MAX = 1000
EVENT_FLUSH_INTERVAL = 10  # seconds
EVENT_FLUSH_COUNT = 100
EVENT_LOG_ENDPOINT = f"{API_BASE_URL}/api/opcua/event-log"

# Event logging state
event_buffer = []  # Buffer for event logs
last_values = {}  # Track previous values
last_event_flush = 0
opcua_connection_status = 'Unknown'  # Unknown, Connected, Disconnected
last_connection_check = 0
CONNECTION_CHECK_INTERVAL = 30  # seconds
```

#### New Functions

**`log_event(event_type, opc_node_id, variable_name, old_value, new_value, quality, message, metadata)`**
- Adds events to buffer
- Triggers immediate flush for critical events
- Handles buffer overflow

**`flush_event_buffer(force=False)`**
- Sends batched events to backend
- Retries on failure (re-buffers events)
- Logs flush statistics

**`check_connection_health()`**
- Checks OPC UA server availability
- Detects disconnections
- Logs connection state changes
- Updates `opcua_connection_status` global variable

#### Updated Functions

**`DataChangeHandler.datachange_notification()`**
- Now tracks previous values in `last_values` dict
- Logs value_change or quality_degraded events
- Includes quality status in changed_data
- Records old_value → new_value transitions

**`connect_opcua()`**
- Logs `connection_restored` event on success
- Logs `connection_lost` event on failure
- Updates `opcua_connection_status`

**`main_loop()`**
- Calls `check_connection_health()` every 30 seconds
- Calls `flush_event_buffer()` every iteration
- Maintains connection monitoring

### Backend Server (ksgServer.js)

#### New Endpoint: POST /api/opcua/event-log

**URL:** `/api/opcua/event-log`  
**Method:** POST  
**Auth:** Requires valid Raspberry Pi ID (via `validateRaspberryPi` middleware)  
**Rate Limit:** None (batched uploads already optimize traffic)

**Request Body:**
```json
{
  "raspberryId": "6C10F6",
  "events": [
    {
      "device_id": "6C10F6",
      "company": "KSG",
      "eventType": "value_change",
      "opcNodeId": "ns=4;s=example5",
      "variableName": "kanban1",
      "oldValue": 0,
      "newValue": 1,
      "quality": "Good",
      "message": "Value changed from 0 to 1",
      "timestamp": "2025-12-19T10:30:00.000Z",
      "metadata": {
        "dataType": "int",
        "equipmentId": "EQUIP001",
        "datapointId": "DP001"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "inserted": 1
}
```

**Features:**
- Batch inserts all events in single MongoDB operation
- Adds `receivedAt` timestamp for server processing time
- Converts ISO timestamp strings to Date objects
- Returns count of inserted documents

#### New Function: setupEventLogTTLIndex()

**Purpose:** Creates TTL index on `opcua_event_log` collection for automatic cleanup

**Details:**
- **Retention Period:** 2 years (63,072,000 seconds)
- **Index Name:** `event_log_ttl_idx`
- **Background:** Creates index without blocking operations
- **Scope:** Runs on all customer databases (all `masterUser` dbName values)
- **Error Handling:** Gracefully handles existing indexes (code 85)

**Execution:**
- Called during server startup after MongoDB connection
- Logs success/failure for each database
- Reports total databases configured

## Database Schema

### Collection: opcua_event_log

**Indexes:**
- `timestamp: 1` (TTL index, expires after 2 years)

**Document Structure:**
```javascript
{
  _id: ObjectId("..."),
  device_id: "6C10F6",           // Raspberry Pi ID
  company: "KSG",                 // Company name (for multi-tenancy)
  eventType: "value_change",      // Event type (see below)
  opcNodeId: "ns=4;s=example5",   // OPC UA node identifier
  variableName: "kanban1",        // Human-readable name
  oldValue: 0,                    // Previous value (for changes)
  newValue: 1,                    // Current value
  quality: "Good",                // Good | Bad | Uncertain
  message: "Value changed from 0 to 1",  // Description
  timestamp: ISODate("2025-12-19T..."),  // Event timestamp (from Pi)
  receivedAt: ISODate("2025-12-19T..."), // Server received timestamp
  metadata: {                     // Additional context
    dataType: "uint16",
    equipmentId: "EQUIP001",
    datapointId: "DP001",
    namespace: 4,
    arrayIndex: 2
  }
}
```

### Event Types

| Event Type | Description | Trigger |
|------------|-------------|---------|
| `value_change` | Normal value change with Good quality | DataChangeHandler when value changes |
| `quality_degraded` | Value change with Bad/Uncertain quality | DataChangeHandler when quality is not Good |
| `node_discovered` | New OPC UA node found | Daily node discovery (7am) |
| `connection_lost` | OPC UA server connection lost | Health check failure or connection error |
| `connection_restored` | OPC UA server connection re-established | Successful connection or health check |

## Configuration

### Raspberry Pi Client

**File:** `/raspberry_pi/opcua_client.py`

```python
# Event buffer configuration
EVENT_BUFFER_MAX = 1000        # Max events in memory
EVENT_FLUSH_INTERVAL = 10      # Flush every N seconds
EVENT_FLUSH_COUNT = 100        # Or when N events accumulated

# Connection monitoring
CONNECTION_CHECK_INTERVAL = 30 # Health check every N seconds
```

### Backend Server

**File:** `ksgServer.js`

```javascript
// TTL Index configuration
expireAfterSeconds: 63072000   // 2 years retention
```

## Usage Examples

### Querying Event Logs

**Get all events for a device:**
```javascript
db.opcua_event_log.find({ device_id: "6C10F6" }).sort({ timestamp: -1 })
```

**Get connection events:**
```javascript
db.opcua_event_log.find({ 
  eventType: { $in: ["connection_lost", "connection_restored"] } 
}).sort({ timestamp: -1 })
```

**Get value changes for specific variable:**
```javascript
db.opcua_event_log.find({ 
  eventType: "value_change",
  variableName: "kanban1"
}).sort({ timestamp: -1 })
```

**Get quality degradation events:**
```javascript
db.opcua_event_log.find({ 
  quality: { $in: ["Bad", "Uncertain"] } 
}).sort({ timestamp: -1 })
```

### Monitoring Event Log Size

**Check document count:**
```javascript
db.opcua_event_log.countDocuments()
```

**Check storage size:**
```javascript
db.opcua_event_log.stats()
```

**Verify TTL index:**
```javascript
db.opcua_event_log.getIndexes()
```

## Testing Procedures

### 1. Normal Operation Test
**Objective:** Verify events are logged during normal operation

**Steps:**
1. Start Raspberry Pi client
2. Observe connection_restored event
3. Change OPC UA values
4. Verify value_change events in MongoDB
5. Check that events flush every 10 seconds

**Expected Results:**
- Connection events logged on startup
- Value changes logged with old → new transitions
- Event buffer flushes automatically
- All events include quality status

### 2. Disconnection Test
**Objective:** Verify behavior when OPC UA server goes down

**Steps:**
1. Start Raspberry Pi client with normal operation
2. Stop OPC UA server
3. Wait for health check (30 seconds)
4. Verify connection_lost event
5. Check that last values are retained
6. Restart OPC UA server
7. Verify connection_restored event

**Expected Results:**
- connection_lost logged within 30 seconds
- Last values retained with Bad quality
- connection_restored logged on reconnection
- Immediate flush for critical events

### 3. Event Buffering Test
**Objective:** Verify batch flushing works correctly

**Steps:**
1. Configure very fast value changes (< 10s)
2. Generate > 100 value changes quickly
3. Observe buffer flush when count reaches 100

**Expected Results:**
- Buffer flushes at 100 events (before 10s timer)
- No events lost
- Backend receives batched inserts

### 4. TTL Index Test
**Objective:** Verify automatic cleanup (requires 2-year wait or manual testing)

**Manual Test:**
```javascript
// Insert test document with old timestamp
db.opcua_event_log.insertOne({
  device_id: "TEST",
  company: "KSG",
  eventType: "value_change",
  timestamp: new Date("2023-01-01"),  // 2 years ago
  quality: "Good",
  message: "Test old event"
})

// Wait for TTL background task (runs every 60 seconds)
// Document should be automatically deleted
```

### 5. Quality Status Test
**Objective:** Verify quality flags propagate correctly

**Steps:**
1. Normal operation → check quality: "Good"
2. Disconnect server → check quality: "Bad"
3. Simulate uncertain data → check quality: "Uncertain"
4. Verify frontend displays red text for Bad quality

**Expected Results:**
- Quality field present in all data pushes
- WebSocket emits include quality
- Frontend receives quality status

## Performance Considerations

### Memory Usage
- **Event Buffer:** Max 1000 events × ~500 bytes = ~500 KB
- **Last Values Dict:** ~100 nodes × ~100 bytes = ~10 KB
- **Total Overhead:** < 1 MB additional memory

### Network Traffic
- **Batch Uploads:** 100 events every 10 seconds = ~10 events/second average
- **Event Size:** ~300-500 bytes per event
- **Bandwidth:** ~3-5 KB/second for event logs (negligible)

### Database Storage
- **Events Per Day:** ~8,640 events (assuming 1 event/10 seconds)
- **Annual Storage:** ~3.15 million events/year
- **2-Year Storage:** ~6.3 million events (auto-cleaned by TTL)
- **Estimated Size:** ~3 GB/year (with indexes)

### Optimization Notes
- Event batching reduces MongoDB write operations by 100x
- TTL index prevents unbounded growth
- Background index creation doesn't block operations
- Connection health checks only every 30s (minimal overhead)

## Troubleshooting

### Events Not Appearing in MongoDB

**Check:**
1. Verify Raspberry Pi client is running
2. Check backend endpoint logs: `📝 Flushed X events to log`
3. Verify MongoDB connection
4. Check event buffer status in Pi logs

**Solution:**
```bash
# On Raspberry Pi
grep "Flushed.*events" /var/log/opcua_client.log

# On Backend
grep "event-log" /var/log/ksgServer.log
```

### TTL Index Not Working

**Check:**
```javascript
// Verify index exists
db.opcua_event_log.getIndexes()

// Should see:
{
  "key": { "timestamp": 1 },
  "name": "event_log_ttl_idx",
  "expireAfterSeconds": 63072000
}
```

**Solution:**
- TTL background task runs every 60 seconds
- Documents only deleted when timestamp + expireAfterSeconds < now
- Check MongoDB server version (TTL requires 2.2+)

### Connection Health Check Failing

**Symptoms:**
- Constant connection_lost events
- No connection_restored events

**Check:**
1. OPC UA server actually running
2. Network connectivity
3. Server state node accessible (ns=0;i=2259)

**Solution:**
```python
# Test connection manually
from opcua import Client
client = Client("opc.tcp://192.168.24.31:4840")
client.connect()
node = client.get_node("ns=0;i=2259")
print(node.get_value())  # Should return server state
client.disconnect()
```

### Event Buffer Overflow

**Symptoms:**
- Log message: "Event buffer full, dropping oldest event"
- Events missing from database

**Root Cause:**
- Backend not reachable
- Network issues preventing flush
- Backend processing too slow

**Solution:**
1. Increase `EVENT_BUFFER_MAX` (default: 1000)
2. Check backend availability
3. Monitor flush success rate

## Future Enhancements

### Phase 1 - UI Integration (Recommended Next)
- [ ] Display quality status in opcManagement.html
- [ ] Add red text styling for Bad quality values
- [ ] Show warning icons (⚠️) for Uncertain quality
- [ ] Display connection status banner
- [ ] Show data age timestamps

### Phase 2 - Event Log Viewer (Optional)
- [ ] Create event log viewer page
- [ ] Filter by device, event type, date range
- [ ] Export events to CSV
- [ ] Real-time event stream (WebSocket)
- [ ] Alerting for critical events

### Phase 3 - Advanced Analytics (Future)
- [ ] Downtime analysis dashboard
- [ ] Value change frequency statistics
- [ ] Connection reliability metrics
- [ ] Quality degradation trending
- [ ] Automated anomaly detection

## References

### Industry Standards
- **ISA-95:** Manufacturing operations management
- **OPC UA Specification:** StatusCode enumeration
- **IEC 62541:** OPC Unified Architecture standard

### SCADA Platforms (Inspiration)
- **Siemens WinCC:** Process historian with quality codes
- **Ignition:** Tag historian with good/bad/uncertain
- **Wonderware:** InTouch quality status system

### MongoDB Documentation
- [TTL Indexes](https://docs.mongodb.com/manual/core/index-ttl/)
- [Bulk Write Operations](https://docs.mongodb.com/manual/core/bulk-write-operations/)
- [Background Index Builds](https://docs.mongodb.com/manual/core/index-creation/)

## Change Log

### Version 1.0 (December 19, 2025)
- ✅ Connection health monitoring (30s interval)
- ✅ Event batching system (10s / 100 events)
- ✅ Value change detection and logging
- ✅ Quality status propagation (Good/Bad/Uncertain)
- ✅ Backend event log endpoint
- ✅ TTL index for 2-year retention
- ✅ Immediate flush for critical events
- ✅ Comprehensive event metadata

## Support

For questions or issues:
- **Documentation:** This file
- **Code Location:** 
  - Raspberry Pi: `/raspberry_pi/opcua_client.py`
  - Backend: `ksgServer.js` (lines 2490-2525 for endpoint)
- **Database:** Collection `opcua_event_log` in customer databases

---

**Implementation Complete** ✅  
Ready for testing and deployment.
