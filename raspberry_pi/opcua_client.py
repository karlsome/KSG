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

# ==========================================
# CONFIGURATION - EDIT THIS
# ==========================================

# !!! IMPORTANT: Set your Raspberry Pi's unique ID here !!!
# This must match the uniqueId in masterUsers.devices
RASPBERRY_ID = "6C10F6"  # Example: Change to your device's uniqueId

# API Configuration
API_BASE_URL = "https://ksg-lu47.onrender.com"  # Change if using different server
CONFIG_ENDPOINT = f"{API_BASE_URL}/api/opcua/config/{RASPBERRY_ID}"
DATA_ENDPOINT = f"{API_BASE_URL}/api/opcua/data"
HEARTBEAT_ENDPOINT = f"{API_BASE_URL}/api/opcua/heartbeat"

# Timing Configuration
HEARTBEAT_INTERVAL = 30  # Send heartbeat every 30 seconds
RETRY_INTERVAL = 60      # Retry connection every 60 seconds on failure

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

# ==========================================
# FUNCTIONS
# ==========================================

def fetch_config():
    """Fetch configuration from API"""
    global config, datapoints
    
    try:
        logger.info(f"📡 Fetching configuration for Raspberry Pi: {RASPBERRY_ID}")
        
        headers = {'X-Raspberry-ID': RASPBERRY_ID}
        response = requests.get(CONFIG_ENDPOINT, headers=headers, timeout=10)
        
        if response.status_code == 403:
            logger.error("❌ Unauthorized: This Raspberry Pi is not registered in the system")
            logger.error(f"   Check that uniqueId '{RASPBERRY_ID}' exists in masterUsers.devices")
            return False
        
        if response.status_code == 404:
            logger.error("❌ Configuration not found. Please configure this device in admin panel.")
            return False
        
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            logger.error(f"❌ API returned error: {data.get('error')}")
            return False
        
        config = data['config']
        datapoints = data['datapoints']
        
        logger.info(f"✅ Configuration loaded:")
        logger.info(f"   Raspberry Pi: {config['raspberryName']}")
        logger.info(f"   OPC UA Server: {config['opcua_server_ip']}:{config['opcua_server_port']}")
        logger.info(f"   Poll Interval: {config['poll_interval']}ms")
        logger.info(f"   Datapoints to monitor: {len(datapoints)}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to fetch config: {e}")
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
        opcua_client.set_session_timeout(config.get('connection_timeout', 60000))
        opcua_client.connect()
        
        logger.info(f"✅ Connected to OPC UA server: {config['opcua_server_ip']}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to connect to OPC UA server: {e}")
        opcua_client = None
        return False

def disconnect_opcua():
    """Disconnect from OPC UA server"""
    global opcua_client
    
    if opcua_client:
        try:
            opcua_client.disconnect()
            logger.info("🔌 Disconnected from OPC UA server")
        except:
            pass
        opcua_client = None

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

def push_data(data):
    """Push data to cloud API"""
    try:
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
        if result.get('success'):
            logger.info(f"📤 Pushed {result.get('received', 0)} datapoints to cloud")
            return True
        else:
            logger.error(f"❌ Failed to push data: {result.get('error')}")
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to push data: {e}")
        return False

def send_heartbeat(status='online'):
    """Send heartbeat to cloud API"""
    try:
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
        
    except:
        return False

def main_loop():
    """Main monitoring loop"""
    global last_heartbeat, last_config_fetch
    
    logger.info("=" * 60)
    logger.info("🏭 OPC UA Monitoring Client Starting")
    logger.info(f"📱 Raspberry Pi ID: {RASPBERRY_ID}")
    logger.info(f"🌐 API Server: {API_BASE_URL}")
    logger.info("=" * 60)
    
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
                else:
                    logger.error(f"❌ Config fetch failed. Retrying in {RETRY_INTERVAL} seconds...")
                    time.sleep(RETRY_INTERVAL)
                    continue
            
            # Ensure OPC UA connection
            if not opcua_client:
                if not connect_opcua():
                    logger.error(f"❌ OPC UA connection failed. Retrying in {RETRY_INTERVAL} seconds...")
                    time.sleep(RETRY_INTERVAL)
                    continue
            
            # Read datapoints
            data = read_datapoints()
            
            if data:
                # Push data to cloud
                push_data(data)
            
            # Send heartbeat
            if (current_time - last_heartbeat) > HEARTBEAT_INTERVAL:
                if send_heartbeat('online'):
                    logger.debug("💓 Heartbeat sent")
                last_heartbeat = current_time
            
            # Wait for next poll
            poll_interval_sec = config.get('poll_interval', 5000) / 1000.0
            time.sleep(poll_interval_sec)
            
        except KeyboardInterrupt:
            logger.info("\n⚠️  Shutdown signal received...")
            break
            
        except Exception as e:
            logger.error(f"❌ Unexpected error in main loop: {e}")
            disconnect_opcua()
            time.sleep(RETRY_INTERVAL)
    
    # Cleanup
    disconnect_opcua()
    send_heartbeat('offline')
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
