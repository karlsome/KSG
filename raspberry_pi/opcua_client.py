"""
OPC UA Monitoring Client for Raspberry Pi
==========================================

This script runs on a Raspberry Pi to:
1. Fetch configuration from cloud API
2. Connect to OPC UA server
3. Monitor selected datapoints
4. Push real-time data back to cloud

IMPORTANT: Set your Raspberry Pi's unique ID below
"""

import time
import requests
import json
from datetime import datetime
from opcua import Client
import sys
import logging
from apscheduler.schedulers.background import BackgroundScheduler
import socket
import socketio
import threading

# ==========================================
# CONFIGURATION - EDIT THIS
# ==========================================

# !!! IMPORTANT: Set your Raspberry Pi's unique ID here !!!
# This must match the uniqueId in masterUsers.devices
RASPBERRY_ID = "6C10F6"  # Example: Change to your device's uniqueId

# API Configuration
API_BASE_URL = "http://192.168.24.31:3000"  # Change if using different server
CONFIG_ENDPOINT = f"{API_BASE_URL}/api/opcua/config/{RASPBERRY_ID}"
DATA_ENDPOINT = f"{API_BASE_URL}/api/opcua/data"
HEARTBEAT_ENDPOINT = f"{API_BASE_URL}/api/opcua/heartbeat"
DISCOVERED_NODES_ENDPOINT = f"{API_BASE_URL}/api/opcua/discovered-nodes"
DEVICE_INFO_ENDPOINT = f"{API_BASE_URL}/api/opcua/device-info"

# Device Configuration
COMPANY_NAME = "KSG"
DEVICE_OWNER = "kasugai"
DEVICE_TYPE = "Raspberry Pi"
DEVICE_BRAND = "Raspberry Pi"

# Timing Configuration
HEARTBEAT_INTERVAL = 30  # Send heartbeat every 30 seconds
RETRY_INTERVAL = 60      # Retry connection every 60 seconds on failure
NODE_DISCOVERY_TIME = "07:00"  # Daily discovery at 7am
SUBSCRIPTION_INTERVAL = 100  # Check for data changes every 100ms

# Retry Configuration
MAX_RETRY_ATTEMPTS = 3
RETRY_DELAYS = [30, 60, 120]  # Exponential backoff: 30s, 1min, 2min

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==========================================
# GLOBAL VARIABLES
# ==========================================

opcua_client = None
config = None
datapoints = []
last_heartbeat = 0
last_config_fetch = 0
CONFIG_REFRESH_INTERVAL = 300  # Refresh config every 5 minutes

# Subscription management
subscription = None
subscription_handles = []
changed_data_buffer = []  # Buffer for changed values

# WebSocket connection
sio = socketio.Client(reconnection=True, reconnection_attempts=0, reconnection_delay=5)
websocket_connected = False

# Pending operations for retry
pending_discovered_nodes = None
pending_data_queue = []
device_info_uploaded = False  # Track if device info has been uploaded

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def retry_with_backoff(func, *args, **kwargs):
    """
    Retry a function with exponential backoff
    Returns (success: bool, result: any)
    """
    for attempt in range(MAX_RETRY_ATTEMPTS):
        try:
            result = func(*args, **kwargs)
            return True, result
        except Exception as e:
            if attempt < MAX_RETRY_ATTEMPTS - 1:
                delay = RETRY_DELAYS[attempt]
                logger.warning(f"⚠️  Attempt {attempt + 1} failed: {e}")
                logger.info(f"🔄 Retrying in {delay} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"❌ All {MAX_RETRY_ATTEMPTS} attempts failed: {e}")
                return False, None
    return False, None

def get_local_ip():
    """Get local IP address"""
    try:
        # Create a socket to find local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

def get_device_info():
    """Collect device information"""
    try:
        hostname = socket.gethostname()
        local_ip = get_local_ip()
        
        return {
            "device_id": RASPBERRY_ID,
            "company": COMPANY_NAME,
            "device_name": hostname,
            "device_brand": DEVICE_BRAND,
            "owner": DEVICE_OWNER,
            "local_ip": local_ip,
            "local_port": 0,  # Not applicable for OPC UA client
            "device_type": DEVICE_TYPE
            # Note: registered_at and authorized_until are set by server
        }
    except Exception as e:
        logger.error(f"❌ Failed to collect device info: {e}")
        return None

def upload_device_info():
    """Upload device information to cloud"""
    global device_info_uploaded
    
    try:
        logger.info("📤 Collecting device information...")
        device_info = get_device_info()
        if not device_info:
            logger.error("❌ Failed to collect device info")
            return False
        
        logger.info(f"📤 Uploading device info to {DEVICE_INFO_ENDPOINT}")
        logger.info(f"   Device: {device_info['device_name']}")
        logger.info(f"   IP: {device_info['local_ip']}")
        
        headers = {
            'X-Raspberry-ID': RASPBERRY_ID,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(DEVICE_INFO_ENDPOINT, json=device_info, headers=headers, timeout=10)
        logger.info(f"   Response status: {response.status_code}")
        
        if response.status_code == 503:
            logger.warning(f"⚠️  Server database not ready yet. Will retry later.")
            return False
        
        response.raise_for_status()
        
        result = response.json()
        logger.info(f"   Response: {result}")
        
        if result.get('success'):
            logger.info(f"✅ Device info uploaded successfully!")
            device_info_uploaded = True
            return True
        else:
            logger.warning(f"⚠️  Device info upload failed: {result.get('error')}")
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Network error uploading device info: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error uploading device info: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

# ==========================================
# WEBSOCKET HANDLERS
# ==========================================

@sio.event
def connect():
    """WebSocket connected"""
    global websocket_connected
    websocket_connected = True
    logger.info(f"🔌 WebSocket connected to {API_BASE_URL}")
    
    # Send initial device info
    sio.emit('raspberry_register', {
        'raspberryId': RASPBERRY_ID,
        'status': 'online',
        'timestamp': datetime.utcnow().isoformat()
    })

@sio.event
def disconnect():
    """WebSocket disconnected"""
    global websocket_connected
    websocket_connected = False
    logger.warning("⚠️  WebSocket disconnected")

@sio.event
def connect_error(data):
    """WebSocket connection error"""
    logger.error(f"❌ WebSocket connection error: {data}")

@sio.event
def raspberry_status_update(data):
    """Receive status update from server"""
    logger.debug(f"📡 Status update from server: {data}")

def start_websocket():
    """Start WebSocket connection in background thread"""
    def connect_websocket():
        try:
            logger.info(f"🔄 Connecting WebSocket to {API_BASE_URL}...")
            sio.connect(API_BASE_URL, 
                       auth={'raspberryId': RASPBERRY_ID},
                       transports=['websocket', 'polling'])
        except Exception as e:
            logger.error(f"❌ WebSocket connection failed: {e}")
    
    ws_thread = threading.Thread(target=connect_websocket, daemon=True)
    ws_thread.start()

def stop_websocket():
    """Stop WebSocket connection"""
    try:
        if sio.connected:
            sio.emit('raspberry_register', {
                'raspberryId': RASPBERRY_ID,
                'status': 'offline',
                'timestamp': datetime.utcnow().isoformat()
            })
            sio.disconnect()
            logger.info("🔌 WebSocket disconnected gracefully")
    except Exception as e:
        logger.debug(f"Error disconnecting WebSocket: {e}")

# ==========================================
# SUBSCRIPTION HANDLER
# ==========================================

class DataChangeHandler:
    """
    Handler for OPC UA subscription data changes.
    Only triggers when values actually change.
    """
    def __init__(self):
        self.datapoint_map = {}  # Maps monitored item handle to datapoint info
    
    def datachange_notification(self, node, val, data):
        """Called when subscribed node value changes"""
        try:
            # Find which datapoint this belongs to
            node_id = node.nodeid.to_string()
            
            # Find the matching datapoint
            for dp in datapoints:
                if dp['opcNodeId'] == node_id:
                    changed_data = {
                        'datapointId': str(dp['id']),
                        'equipmentId': dp['equipmentId'],
                        'opcNodeId': dp['opcNodeId'],
                        'value': val,
                        'quality': 'Good' if data.monitored_item.Value.StatusCode.is_good() else 'Bad',
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    
                    # Add to buffer for batch upload
                    changed_data_buffer.append(changed_data)
                    
                    logger.info(f"📊 Value changed: {dp.get('label', node_id)} = {val}")
                    break
                    
        except Exception as e:
            logger.error(f"❌ Error in datachange_notification: {e}")

# ==========================================
# FUNCTIONS
# ==========================================

def _fetch_config_request():
    """Internal function to fetch config (used by retry mechanism)"""
    headers = {'X-Raspberry-ID': RASPBERRY_ID}
    response = requests.get(CONFIG_ENDPOINT, headers=headers, timeout=10)
    
    if response.status_code == 403:
        raise Exception("Unauthorized: Raspberry Pi not registered in system")
    
    if response.status_code == 404:
        raise Exception("Configuration not found. Please configure device in admin panel")
    
    response.raise_for_status()
    data = response.json()
    
    if not data.get('success'):
        raise Exception(data.get('error', 'Unknown error'))
    
    return data

def fetch_config():
    """Fetch configuration from API with retry"""
    global config, datapoints
    
    logger.info(f"📡 Fetching configuration for Raspberry Pi: {RASPBERRY_ID}")
    
    success, data = retry_with_backoff(_fetch_config_request)
    
    if success:
        config = data['config']
        datapoints = data['datapoints']
        
        logger.info(f"✅ Configuration loaded:")
        logger.info(f"   Raspberry Pi: {config['raspberryName']}")
        logger.info(f"   OPC UA Server: {config['opcua_server_ip']}:{config['opcua_server_port']}")
        logger.info(f"   Poll Interval: {config['poll_interval']}ms")
        logger.info(f"   Datapoints to monitor: {len(datapoints)}")
        
        return True
    else:
        logger.error("❌ Failed to fetch config after all retries")
        return False

def connect_opcua():
    """Connect to OPC UA server"""
    global opcua_client
    
    try:
        if not config:
            logger.error("❌ No configuration loaded. Cannot connect to OPC UA server.")
            return False
        
        opcua_url = f"opc.tcp://{config['opcua_server_ip']}:{config['opcua_server_port']}"
        logger.info(f"🔗 Connecting to OPC UA server: {opcua_url}")
        
        opcua_client = Client(opcua_url)
        
        # Set timeout if the method exists (newer versions)
        if hasattr(opcua_client, 'set_session_timeout'):
            opcua_client.set_session_timeout(config.get('connection_timeout', 60000))
        
        opcua_client.connect()
        
        logger.info(f"✅ Connected to OPC UA server: {config['opcua_server_ip']}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to connect to OPC UA server: {e}")
        opcua_client = None
        return False

def disconnect_opcua():
    """Disconnect from OPC UA server and clean up subscriptions"""
    global opcua_client, subscription, subscription_handles
    
    # Clean up subscriptions first
    if subscription:
        try:
            subscription.delete()
            logger.info("🗑️  Deleted OPC UA subscription")
        except Exception as e:
            logger.debug(f"Error deleting subscription: {e}")
        finally:
            subscription = None
            subscription_handles = []
    
    # Disconnect client
    if opcua_client:
        try:
            opcua_client.disconnect()
            logger.info("🔌 Disconnected from OPC UA server")
        except Exception as e:
            logger.error(f"Error disconnecting: {e}")
        finally:
            opcua_client = None

def setup_subscriptions():
    """Setup OPC UA subscriptions for all configured datapoints"""
    global subscription, subscription_handles
    
    try:
        if not opcua_client or not datapoints:
            logger.warning("⚠️  Cannot setup subscriptions: No client or datapoints")
            return False
        
        # Create subscription with handler
        handler = DataChangeHandler()
        subscription = opcua_client.create_subscription(SUBSCRIPTION_INTERVAL, handler)
        
        logger.info(f"📡 Creating subscription (interval: {SUBSCRIPTION_INTERVAL}ms)")
        
        # Subscribe to each datapoint
        subscription_handles = []
        for dp in datapoints:
            try:
                node = opcua_client.get_node(dp['opcNodeId'])
                handle = subscription.subscribe_data_change(node)
                subscription_handles.append(handle)
                
                logger.info(f"   ✓ Subscribed: {dp.get('label', dp['opcNodeId'])}")
                
            except Exception as e:
                logger.error(f"   ✗ Failed to subscribe to {dp['opcNodeId']}: {e}")
        
        logger.info(f"✅ Subscribed to {len(subscription_handles)}/{len(datapoints)} datapoints")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to setup subscriptions: {e}")
        return False

def read_datapoints():
    """Read all configured datapoints from OPC UA server"""
    if not opcua_client or not datapoints:
        return []
    
    data = []
    
    for dp in datapoints:
        try:
            node = opcua_client.get_node(dp['opcNodeId'])
            value = node.get_data_value()
            
            data.append({
                'datapointId': str(dp['id']),
                'equipmentId': dp['equipmentId'],
                'opcNodeId': dp['opcNodeId'],
                'value': value.Value.Value,
                'quality': 'Good' if value.StatusCode.is_good() else 'Bad',
                'timestamp': value.SourceTimestamp.isoformat() if value.SourceTimestamp else datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            logger.warning(f"⚠️  Failed to read {dp['opcNodeId']}: {e}")
            data.append({
                'datapointId': str(dp['id']),
                'equipmentId': dp['equipmentId'],
                'opcNodeId': dp['opcNodeId'],
                'value': None,
                'quality': 'Bad',
                'timestamp': datetime.utcnow().isoformat()
            })
    
    return data

def _upload_data(data):
    """Internal function to upload data (used by retry mechanism)"""
    headers = {
        'X-Raspberry-ID': RASPBERRY_ID,
        'Content-Type': 'application/json'
    }
    
    payload = {
        'raspberryId': RASPBERRY_ID,
        'data': data
    }
    
    response = requests.post(DATA_ENDPOINT, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    
    result = response.json()
    if not result.get('success'):
        raise Exception(result.get('error', 'Unknown error'))
    
    return result

def push_data_websocket(data):
    """Push data via WebSocket (primary method)"""
    try:
        if not websocket_connected or not sio.connected:
            return False
        
        # Group data by equipmentId for efficient broadcasting
        equipment_data = {}
        for item in data:
            eq_id = item['equipmentId']
            if eq_id not in equipment_data:
                equipment_data[eq_id] = []
            equipment_data[eq_id].append(item)
        
        # Emit for each equipment group
        for equipment_id, items in equipment_data.items():
            sio.emit('opcua_data_change', {
                'raspberryId': RASPBERRY_ID,
                'equipmentId': equipment_id,
                'data': items
            })
        
        logger.info(f"📤 Pushed {len(data)} datapoints via WebSocket")
        return True
        
    except Exception as e:
        logger.error(f"❌ WebSocket push failed: {e}")
        return False

def push_data(data):
    """Push data to cloud (WebSocket first, HTTP fallback)"""
    global pending_data_queue
    
    # Try to upload pending data first via HTTP
    if pending_data_queue:
        logger.info(f"🔄 Attempting to upload {len(pending_data_queue)} pending data batches...")
        uploaded_count = 0
        failed_batches = []
        
        for batch in pending_data_queue:
            success, _ = retry_with_backoff(_upload_data, batch)
            if success:
                uploaded_count += 1
            else:
                failed_batches.append(batch)
        
        if uploaded_count > 0:
            logger.info(f"✅ Successfully uploaded {uploaded_count} pending batches")
        
        pending_data_queue = failed_batches
    
    # Try to push current data
    if data:
        # Try WebSocket first
        ws_success = push_data_websocket(data)
        
        if ws_success:
            return True
        else:
            # Fallback to HTTP POST
            logger.info("⚠️  WebSocket unavailable, falling back to HTTP POST")
            success, result = retry_with_backoff(_upload_data, data)
            
            if success:
                logger.info(f"📤 Pushed {result.get('received', 0)} datapoints via HTTP")
                return True
            else:
                # Add to pending queue (limit queue size to prevent memory issues)
                if len(pending_data_queue) < 100:  # Max 100 pending batches
                    pending_data_queue.append(data)
                    logger.warning(f"⚠️  Added data to pending queue ({len(pending_data_queue)} batches pending)")
                else:
                    logger.error("❌ Pending queue full, dropping oldest data")
                    pending_data_queue.pop(0)
                    pending_data_queue.append(data)
                return False
    
    return True

def _send_heartbeat_request(status):
    """Internal function to send heartbeat (used by retry mechanism)"""
    headers = {
        'X-Raspberry-ID': RASPBERRY_ID,
        'Content-Type': 'application/json'
    }
    
    payload = {
        'raspberryId': RASPBERRY_ID,
        'status': status,
        'timestamp': datetime.utcnow().isoformat()
    }
    
    response = requests.post(HEARTBEAT_ENDPOINT, json=payload, headers=headers, timeout=5)
    response.raise_for_status()
    return True

def send_heartbeat(status='online'):
    """Send heartbeat to cloud API with retry"""
    # Heartbeat is less critical, only 1 retry with shorter delay
    for attempt in range(2):  # Try twice
        try:
            return _send_heartbeat_request(status)
        except Exception as e:
            if attempt == 0:
                logger.debug(f"Heartbeat attempt {attempt + 1} failed: {e}")
                time.sleep(5)  # Short 5s retry
            else:
                logger.debug(f"Heartbeat failed after 2 attempts")
                return False
    return False

def discover_nodes():
    """Discover all available OPC UA nodes"""
    try:
        if not opcua_client or not config:
            logger.warning("⚠️  Cannot discover nodes: Not connected to OPC UA server")
            return []
        
        logger.info("🔍 Starting node discovery...")
        discovered = []
        seen_node_ids = set()  # Track discovered nodes to prevent duplicates
        
        # Get the Objects node (standard OPC UA starting point)
        objects_node = opcua_client.get_objects_node()
        
        # Browse recursively to find all variables
        def browse_node(node, depth=0, max_depth=10):
            if depth > max_depth:
                return
            
            try:
                for child in node.get_children():
                    try:
                        # Get node info
                        node_id = child.nodeid.to_string()
                        browse_name = child.get_browse_name().Name
                        
                        # Check if it's a variable
                        node_class = child.get_node_class()
                        if node_class.name == 'Variable':
                            try:
                                # Try to read the value
                                data_value = child.get_data_value()
                                value = data_value.Value.Value
                                data_type = type(value).__name__
                                
                                # Extract variable name (remove namespace prefix)
                                if ';s=' in node_id:
                                    variable_name = node_id.split(';s=')[1]
                                elif ';i=' in node_id:
                                    variable_name = f"Identifier_{node_id.split(';i=')[1]}"
                                else:
                                    variable_name = browse_name
                                
                                # Extract namespace
                                namespace = node_id.split(';')[0].replace('ns=', '')
                                
                                # Determine type (list, number, string, boolean)
                                value_type = 'unknown'
                                actual_value = value
                                
                                if isinstance(value, list):
                                    value_type = 'list'
                                    actual_value = value  # Keep full array
                                elif isinstance(value, (int, float)):
                                    value_type = 'number'
                                elif isinstance(value, bool):
                                    value_type = 'boolean'
                                elif isinstance(value, str):
                                    value_type = 'string'
                                
                                # Check for duplicates using node_id
                                if node_id not in seen_node_ids:
                                    seen_node_ids.add(node_id)
                                    discovered.append({
                                        'namespace': int(namespace),
                                        'variableName': variable_name,
                                        'browseName': browse_name,
                                        'opcNodeId': node_id,
                                        'dataType': data_type,
                                        'type': value_type,
                                        'value': actual_value,  # Full value including arrays
                                        'currentValue': str(value)[:100]  # String preview
                                    })
                                
                            except Exception as e:
                                logger.debug(f"Could not read value for {browse_name}: {e}")
                        
                        # Recursively browse child nodes
                        if node_class.name in ['Object', 'Folder']:
                            browse_node(child, depth + 1, max_depth)
                            
                    except Exception as e:
                        logger.debug(f"Error browsing node: {e}")
                        
            except Exception as e:
                logger.debug(f"Error getting children: {e}")
        
        # Start browsing from Objects node
        browse_node(objects_node)
        
        logger.info(f"✅ Discovered {len(discovered)} nodes")
        return discovered
        
    except Exception as e:
        logger.error(f"❌ Node discovery failed: {e}")
        return []

def _upload_discovered_nodes(nodes):
    """Internal function to upload nodes (used by retry mechanism)"""
    headers = {
        'X-Raspberry-ID': RASPBERRY_ID,
        'Content-Type': 'application/json'
    }
    
    payload = {
        'raspberryId': RASPBERRY_ID,
        'nodes': nodes,
        'timestamp': datetime.utcnow().isoformat()
    }
    
    response = requests.post(DISCOVERED_NODES_ENDPOINT, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    
    result = response.json()
    if not result.get('success'):
        raise Exception(result.get('error', 'Unknown error'))
    
    return result

def save_discovered_nodes():
    """Discover nodes and save to cloud with retry"""
    global pending_discovered_nodes
    
    try:
        # Try to upload pending nodes first if any
        if pending_discovered_nodes:
            logger.info("� Attempting to upload pending discovered nodes...")
            success, _ = retry_with_backoff(_upload_discovered_nodes, pending_discovered_nodes)
            if success:
                logger.info(f"✅ Successfully uploaded {len(pending_discovered_nodes)} pending nodes")
                pending_discovered_nodes = None
            else:
                logger.warning("⚠️  Still unable to upload pending nodes, will retry later")
        
        # Discover new nodes
        nodes = discover_nodes()
        
        if not nodes:
            logger.warning("⚠️  No nodes discovered")
            return False
        
        # Try to upload with retry
        success, result = retry_with_backoff(_upload_discovered_nodes, nodes)
        
        if success:
            logger.info(f"📤 Saved {len(nodes)} discovered nodes to cloud")
            return True
        else:
            # Save to pending for later retry
            pending_discovered_nodes = nodes
            logger.warning(f"⚠️  Saved {len(nodes)} nodes to pending queue for later upload")
            return False
            
    except Exception as e:
        logger.error(f"❌ Unexpected error in save_discovered_nodes: {e}")
        return False

def main_loop():
    """Main monitoring loop"""
    global last_heartbeat, last_config_fetch
    
    logger.info("=" * 60)
    logger.info("🏭 OPC UA Monitoring Client Starting")
    logger.info(f"📱 Raspberry Pi ID: {RASPBERRY_ID}")
    logger.info(f"🌐 API Server: {API_BASE_URL}")
    logger.info("=" * 60)
    
    # Upload device info on startup
    logger.info("📤 Uploading device information...")
    upload_device_info()
    
    # Start WebSocket connection for real-time status
    logger.info("🔌 Starting WebSocket connection...")
    start_websocket()
    
    # Setup daily node discovery scheduler
    scheduler = BackgroundScheduler()
    scheduler.add_job(save_discovered_nodes, 'cron', hour=7, minute=0)  # Daily at 7am
    scheduler.start()
    logger.info(f"⏰ Scheduled daily node discovery at {NODE_DISCOVERY_TIME}")
    
    # Track if initial discovery has been done
    initial_discovery_done = False
    
    while True:
        try:
            current_time = time.time()
            
            # Fetch or refresh config
            if not config or (current_time - last_config_fetch) > CONFIG_REFRESH_INTERVAL:
                if fetch_config():
                    last_config_fetch = current_time
                    # Reconnect to OPC UA if config changed
                    disconnect_opcua()
                    if not connect_opcua():
                        logger.error(f"❌ Retrying in {RETRY_INTERVAL} seconds...")
                        time.sleep(RETRY_INTERVAL)
                        continue
                    
                    # Run initial node discovery after first successful connection
                    if not initial_discovery_done:
                        logger.info("🔍 Running initial node discovery...")
                        save_discovered_nodes()
                        initial_discovery_done = True
                        
                else:
                    logger.error(f"❌ Config fetch failed. Retrying in {RETRY_INTERVAL} seconds...")
                    time.sleep(RETRY_INTERVAL)
                    continue
            
            # Ensure OPC UA connection and subscriptions
            if not opcua_client:
                if not connect_opcua():
                    logger.error(f"❌ OPC UA connection failed. Retrying in {RETRY_INTERVAL} seconds...")
                    time.sleep(RETRY_INTERVAL)
                    continue
            
            # Setup subscriptions if not already done
            if not subscription and datapoints:
                if not setup_subscriptions():
                    logger.error(f"❌ Failed to setup subscriptions. Retrying in {RETRY_INTERVAL} seconds...")
                    time.sleep(RETRY_INTERVAL)
                    continue
            
            # Check if any data has changed (buffered by subscription handler)
            if changed_data_buffer:
                # Get all changed data and clear buffer
                data_to_upload = changed_data_buffer.copy()
                changed_data_buffer.clear()
                
                logger.info(f"📦 Uploading {len(data_to_upload)} changed datapoint(s)")
                push_data(data_to_upload)
            
            # Try to upload pending data even if no new data
            if pending_data_queue:
                push_data([])  # Empty data triggers pending queue retry
            
            # Send heartbeat
            if (current_time - last_heartbeat) > HEARTBEAT_INTERVAL:
                if send_heartbeat('online'):
                    logger.debug("💓 Heartbeat sent")
                last_heartbeat = current_time
            
            # Retry device info upload if not yet uploaded
            if not device_info_uploaded and (current_time - last_config_fetch) > 60:
                logger.info("🔄 Retrying device info upload...")
                upload_device_info()
            
            # Retry pending discovered nodes periodically
            if pending_discovered_nodes and (current_time - last_config_fetch) > 60:
                logger.info("🔄 Retrying pending discovered nodes upload...")
                save_discovered_nodes()
            
            # Short sleep to prevent tight loop (subscriptions handle timing)
            time.sleep(1)
            
        except KeyboardInterrupt:
            logger.info("\n⚠️  Shutdown signal received...")
            break
            
        except Exception as e:
            logger.error(f"❌ Unexpected error in main loop: {e}")
            disconnect_opcua()
            time.sleep(RETRY_INTERVAL)
    
    # Cleanup
    logger.info("🛑 Shutting down...")
    scheduler.shutdown()
    disconnect_opcua()
    send_heartbeat('offline')
    stop_websocket()
    
    # Log pending operations
    if pending_discovered_nodes:
        logger.warning(f"⚠️  {len(pending_discovered_nodes)} discovered nodes not uploaded")
    if pending_data_queue:
        logger.warning(f"⚠️  {len(pending_data_queue)} data batches not uploaded")
    
    logger.info("👋 OPC UA Monitoring Client stopped")

# ==========================================
# ENTRY POINT
# ==========================================

if __name__ == "__main__":
    # Validate configuration
    if RASPBERRY_ID == "6C10F6":
        logger.warning("⚠️  WARNING: Using default RASPBERRY_ID!")
        logger.warning("   Please edit this file and set your unique Raspberry Pi ID")
        logger.warning("   The ID must match the uniqueId in masterUsers.devices collection")
        print("\n")
        response = input("Continue anyway? (y/N): ")
        if response.lower() != 'y':
            logger.info("Exiting...")
            sys.exit(0)
    
    try:
        main_loop()
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        sys.exit(1)
