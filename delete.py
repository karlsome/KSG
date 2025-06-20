# Import sys first for GPIO compatibility layer
import sys

# GPIO compatibility layer for development on non-Raspberry Pi systems
try:
    import RPi.GPIO as GPIO
except ImportError:
    # Use fake GPIO for development on non-Raspberry Pi systems
    try:
        import fake_rpi
        fake_rpi.toggle_print(False)  # Turn off fake_rpi debug messages
        sys.modules['RPi'] = fake_rpi.RPi     # Fake RPi (GPIO)
        sys.modules['RPi.GPIO'] = fake_rpi.RPi.GPIO  # Fake GPIO
        import RPi.GPIO as GPIO
        print("Using fake GPIO for development (not running on Raspberry Pi)")
    except ImportError:
        print("ERROR: Neither RPi.GPIO nor fake-rpi is available. Please install fake-rpi for development.")
        sys.exit(1)

import time
import datetime
import os
import traceback
import threading
import collections
import socket
import subprocess
import json
import requests
from urllib.parse import urlparse
import uuid

# Flask imports
from flask import Flask, request, jsonify

# --- Global Variables and Constants ---

# GPIO numbering mode (BCM for Broadcom SoC channel numbers)
GPIO.setmode(GPIO.BCM)
# Optionally suppress warnings, but be aware it hides potential issues.
# GPIO.setwarnings(False)

# Pin mapping: BCM GPIO number to device signal name
# IMPORTANT: These are the BCM GPIO numbers, not physical pin numbers.
# Ensure these physical connections are made with appropriate 24V-to-3.3V level shifters (optocouplers)
PIN_MAPPING = {
    17: "0-X08_START_SWITCH",
    27: "0-X11_CLAMP_A",
    22: "0-X09_MACHINE_READY_A",
    5: "1-X13_CLAMP_B",
    6: "1-X09_CLAMP_C",
    16: "1-X12_MACHINE_READY_B",
    19: "1-X08_MACHINE_READY_C",
    26: "1-X15_PRODUCT_RELEASE",
    12: "1-X11_RESET_BUTTON" # This is the dedicated reset button
}

# Assign specific pins to variables for clarity and easy reference
# This is crucial for avoiding hardcoded numbers and improving maintainability.
START_SWITCH_PIN = 17
CLAMP_A_PIN = 27
MACHINE_READY_A_PIN = 22
CLAMP_B_PIN = 5
CLAMP_C_PIN = 6
MACHINE_READY_B_PIN = 16
MACHINE_READY_C_PIN = 19
PRODUCT_RELEASE_PIN = 26
RESET_BUTTON_PIN = 12

# Define the GPIO pins to monitor (BCM numbers) - derived from PIN_MAPPING
GPIO_PINS = list(PIN_MAPPING.keys())

# Define states for our process flow (State Machine)
STATE_WAITING_FOR_START = 0
STATE_CLAMPS_CLOSING = 1
STATE_MACHINE_READY = 2
STATE_PRODUCT_RELEASE = 3

# --- Process State and Data Variables (Shared between threads) ---
# It's good practice to group shared mutable variables.
current_state = STATE_WAITING_FOR_START

initial_time_raw = None
initial_time_display = None
final_time_raw = None

# Timeout for clamp closing phase
CLAMP_CLOSING_TIMEOUT_SEC = 60

# Variable to track the start time of the CLAMPS_CLOSING phase
clamps_closing_start_time = None

current_hinban_being_processed = None # Stores the hinban (product number) set from the tablet
list_of_cycle_logs = [] # Stores completed cycle data for the current hinban

# --- Threading and Flask Setup ---
data_lock = threading.Lock() # Global lock for all shared data accessed by multiple threads

app = Flask(__name__)
FLASK_PORT = 5000

# --- Device Discovery Variables ---
# Generate unique device ID based on MAC address and hostname
DEVICE_ID = str(uuid.uuid4())[:8]  # Short unique ID
DEVICE_NAME = f"RaspberryPi-{socket.gethostname()}-{DEVICE_ID}"
SERVICE_TYPE = "production_monitor"
SERVICE_VERSION = "1.0"

# Dictionary to store discovered devices {device_id: device_info}
discovered_devices = {}
discovery_lock = threading.Lock()

# Discovery settings
BROADCAST_INTERVAL = 30  # Broadcast every 30 seconds
DISCOVERY_PORT = 5001  # UDP port for device discovery
DEVICE_TIMEOUT = 90  # Remove devices not seen for 90 seconds

# --- Utility Functions ---

def get_jst_timestamp_ms():
    """Returns current JST time formatted as HH:MM:SS.ms"""
    jst_offset_seconds = 9 * 3600 # JST is UTC+9
    utc_now = datetime.datetime.utcnow()
    jst_now = utc_now + datetime.timedelta(seconds=jst_offset_seconds)
    return jst_now.strftime('%H:%M:%S.%f')[:-3]

# --- Device Discovery Functions ---

def get_local_ip():
    """Get the local IP address of this device"""
    try:
        # Connect to a remote address to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Error getting local IP: {e}")
        return "unknown"

def get_device_info():
    """Get current device information"""
    try:
        # Get system information
        with open('/proc/cpuinfo', 'r') as f:
            cpuinfo = f.read()
        
        # Extract Raspberry Pi model information
        pi_model = "Unknown Raspberry Pi"
        for line in cpuinfo.split('\n'):
            if 'Model' in line:
                pi_model = line.split(':')[1].strip()
                break
        
        # Get memory info
        with open('/proc/meminfo', 'r') as f:
            meminfo = f.read()
        total_memory = "Unknown"
        for line in meminfo.split('\n'):
            if 'MemTotal' in line:
                total_memory = line.split()[1] + " kB"
                break
        
        device_info = {
            "device_id": DEVICE_ID,
            "device_name": DEVICE_NAME,
            "hostname": socket.gethostname(),
            "ip_address": get_local_ip(),
            "port": FLASK_PORT,
            "service_type": SERVICE_TYPE,
            "service_version": SERVICE_VERSION,
            "pi_model": pi_model,
            "total_memory": total_memory,
            "api_endpoints": [
                "/device-info",
                "/network-scan",
                "/discovered-devices",
                "/set-current-hinban",
                "/get-current-cycle-stats",
                "/reset-all-data"
            ],
            "status": "online",
            "last_seen": time.time(),
            "uptime": time.time() - start_time if 'start_time' in globals() else 0
        }
        return device_info
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Error getting device info: {e}")
        return {
            "device_id": DEVICE_ID,
            "device_name": DEVICE_NAME,
            "ip_address": get_local_ip(),
            "port": FLASK_PORT,
            "status": "online",
            "error": str(e)
        }

def broadcast_presence():
    """Broadcast this device's presence on the network"""
    try:
        device_info = get_device_info()
        message = json.dumps({
            "type": "device_announcement",
            "data": device_info
        })
        
        # Create UDP socket for broadcasting
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        
        # Broadcast to the network
        broadcast_ip = get_broadcast_address()
        sock.sendto(message.encode('utf-8'), (broadcast_ip, DISCOVERY_PORT))
        sock.close()
        
        print(f"[{get_jst_timestamp_ms()}] Device presence broadcasted to {broadcast_ip}:{DISCOVERY_PORT}")
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Error broadcasting presence: {e}")

def get_broadcast_address():
    """Get the broadcast address for the local network"""
    try:
        local_ip = get_local_ip()
        # Assume /24 subnet (most common)
        ip_parts = local_ip.split('.')
        broadcast_ip = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.255"
        return broadcast_ip
    except:
        return "255.255.255.255"  # Fallback to global broadcast

def listen_for_announcements():
    """Listen for device announcements from other Raspberry Pi devices"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('', DISCOVERY_PORT))
        sock.settimeout(1.0)  # 1 second timeout for non-blocking operation
        
        print(f"[{get_jst_timestamp_ms()}] Discovery: Listening for device announcements on port {DISCOVERY_PORT}")
        
        while True:
            try:
                data, addr = sock.recvfrom(1024)
                message = json.loads(data.decode('utf-8'))
                
                if message.get('type') == 'device_announcement':
                    device_data = message.get('data', {})
                    device_id = device_data.get('device_id')
                    
                    # Don't add ourselves to the discovered devices list
                    if device_id and device_id != DEVICE_ID:
                        with discovery_lock:
                            device_data['last_seen'] = time.time()
                            discovered_devices[device_id] = device_data
                            print(f"[{get_jst_timestamp_ms()}] Discovery: Found device {device_data.get('device_name', 'Unknown')} at {device_data.get('ip_address', 'Unknown IP')}")
                
            except socket.timeout:
                # Timeout is expected, continue listening
                continue
            except json.JSONDecodeError:
                # Invalid JSON received, ignore
                continue
            except Exception as e:
                print(f"[{get_jst_timestamp_ms()}] Discovery: Error processing announcement: {e}")
                
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Discovery: Error in announcement listener: {e}")

def cleanup_old_devices():
    """Remove devices that haven't been seen recently"""
    current_time = time.time()
    with discovery_lock:
        devices_to_remove = []
        for device_id, device_info in discovered_devices.items():
            last_seen = device_info.get('last_seen', 0)
            if current_time - last_seen > DEVICE_TIMEOUT:
                devices_to_remove.append(device_id)
        
        for device_id in devices_to_remove:
            device_name = discovered_devices[device_id].get('device_name', 'Unknown')
            del discovered_devices[device_id]
            print(f"[{get_jst_timestamp_ms()}] Discovery: Removed inactive device {device_name} (ID: {device_id})")

def scan_network_for_devices():
    """Active scan for devices on the network (backup method)"""
    try:
        local_ip = get_local_ip()
        network_base = '.'.join(local_ip.split('.')[:-1]) + '.'
        
        active_devices = []
        
        # Scan common IP range (last octet 1-254)
        for i in range(1, 255):
            target_ip = network_base + str(i)
            if target_ip == local_ip:
                continue  # Skip ourselves
                
            try:
                # Try to connect to the Flask port
                response = requests.get(f"http://{target_ip}:{FLASK_PORT}/device-info", timeout=2)
                if response.status_code == 200:
                    device_data = response.json()
                    if device_data.get('service_type') == SERVICE_TYPE:
                        active_devices.append(device_data)
                        print(f"[{get_jst_timestamp_ms()}] Network Scan: Found device at {target_ip}")
            except:
                # No device or not our service at this IP
                continue
        
        return active_devices
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Network scan error: {e}")
        return []

# --- Core Logic Functions (State Management & Resets) ---

def hancho():
    """
    Called if the clamp closing times out.
    This function should be called ONLY when `data_lock` is already held by the caller
    (e.g., from `run_gpio_loop`). It resets the *current* cycle state.
    """
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] !!! Hancho: Clamp closing timed out. !!!")
    # No 'with data_lock:' here, as the caller (run_gpio_loop) is expected to hold it.
    global current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time
    current_state = STATE_WAITING_FOR_START
    initial_time_raw = None
    initial_time_display = None
    final_time_raw = None
    clamps_closing_start_time = None
    print(f"[{timestamp}] Hancho: Cycle state reset due to timeout. Returning to WAITING_FOR_START.")

def reset_current_cycle_only():
    """
    Resets the state of the current in-progress cycle without clearing accumulated logs or hinban.
    Primarily called by the hardware reset button callback.
    This function *must* acquire the lock.
    """
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] === Current Cycle Reset Initiated (Hardware Button GPIO{RESET_BUTTON_PIN}) ===")
    try:
        with data_lock:
            global current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time
            current_state = STATE_WAITING_FOR_START
            initial_time_raw = None
            initial_time_display = None
            final_time_raw = None
            clamps_closing_start_time = None
        print(f"[{timestamp}] Current cycle data cleared and state reset to WAITING_FOR_START.")
    except Exception as e:
        print(f"[{timestamp}] ERROR during current cycle reset: {e}")
        traceback.print_exc()

def reset_all_production_data():
    """
    Resets the process state, current cycle data, and all accumulated production logs.
    Called by the tablet's web reset command.
    This function *must* acquire the lock.
    """
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] === Full System Reset Initiated (from Web API) ===")
    try:
        with data_lock: # It MUST acquire the lock here, as callers might not hold it.
            global current_state, initial_time_raw, initial_time_display, final_time_raw, \
                    clamps_closing_start_time, current_hinban_being_processed, list_of_cycle_logs
            current_state = STATE_WAITING_FOR_START
            initial_time_raw = None
            initial_time_display = None
            final_time_raw = None
            clamps_closing_start_time = None
            current_hinban_being_processed = None
            list_of_cycle_logs.clear()
        print(f"[{timestamp}] All production data cleared and state reset to WAITING_FOR_START.")
    except Exception as e:
        print(f"[{timestamp}] ERROR during full system reset: {e}")
        traceback.print_exc()

# --- GPIO Event Callbacks ---
# These functions are called asynchronously by the RPi.GPIO library.
# They must acquire `data_lock` before accessing or modifying shared global variables.

def start_switch_callback(channel):
    timestamp = get_jst_timestamp_ms()
    with data_lock: # Acquire lock to safely read and modify shared state variables
        if current_state == STATE_WAITING_FOR_START:
            # Check safety condition: GPIO 22, 16, and 19 must all be activated (HIGH) before allowing start
            machine_ready_a_state = GPIO.input(MACHINE_READY_A_PIN)  # GPIO 22
            machine_ready_b_state = GPIO.input(MACHINE_READY_B_PIN)  # GPIO 16
            machine_ready_c_state = GPIO.input(MACHINE_READY_C_PIN)  # GPIO 19
            
            if machine_ready_a_state == 1 and machine_ready_b_state == 1 and machine_ready_c_state == 1:
                # All safety conditions met, proceed with start sequence
                if current_hinban_being_processed is not None:
                    global initial_time_raw, initial_time_display # Declare as global to modify
                    initial_time_raw = time.monotonic()
                    initial_time_display = timestamp
                    print(f"[{timestamp}] CALLBACK: START_SWITCH (GPIO{channel}) activated for '{current_hinban_being_processed}'. Safety check passed (GPIO22:{machine_ready_a_state}, GPIO16:{machine_ready_b_state}, GPIO19:{machine_ready_c_state}). Initial time recorded.")
                else:
                    print(f"[{timestamp}] CALLBACK: START_SWITCH (GPIO{channel}) activated with safety check passed, but no hinban set. Ignoring cycle start.")
            else:
                # Safety condition not met - ignore start switch activation
                print(f"[{timestamp}] CALLBACK: START_SWITCH (GPIO{channel}) activated, but safety condition not met. Machine Ready states - GPIO22:{machine_ready_a_state}, GPIO16:{machine_ready_b_state}, GPIO19:{machine_ready_c_state}. All must be HIGH (1) to allow start. Ignoring activation.")
        else:
            print(f"[{timestamp}] CALLBACK: START_SWITCH (GPIO{channel}) activated, but not in WAITING_FOR_START state ({current_state}). Ignoring.")

def reset_button_callback(channel):
    print(f"\n[{get_jst_timestamp_ms()}] CALLBACK: HARDWARE RESET_BUTTON (GPIO{channel}) pressed.")
    reset_current_cycle_only() # This function will acquire its own lock


# --- Flask API Endpoints ---
# These functions run in the Flask thread and must acquire `data_lock`
# before accessing or modifying shared global variables.

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

# --- Device Discovery API Endpoints ---

@app.route('/device-info', methods=['GET'])
def get_device_info_endpoint():
    """Return information about this device"""
    try:
        device_info = get_device_info()
        return jsonify({
            "status": "success",
            "device_info": device_info
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to get device info: {str(e)}"
        }), 500

@app.route('/discovered-devices', methods=['GET'])
def get_discovered_devices():
    """Return list of all discovered devices on the network"""
    try:
        with discovery_lock:
            # Include this device in the response
            all_devices = dict(discovered_devices)
            this_device = get_device_info()
            all_devices[DEVICE_ID] = this_device
            
            # Convert to list for easier frontend handling
            device_list = list(all_devices.values())
            
        return jsonify({
            "status": "success",
            "devices": device_list,
            "total_devices": len(device_list),
            "discovery_info": {
                "broadcast_interval": BROADCAST_INTERVAL,
                "device_timeout": DEVICE_TIMEOUT,
                "discovery_port": DISCOVERY_PORT
            }
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to get discovered devices: {str(e)}"
        }), 500

@app.route('/network-scan', methods=['POST'])
def trigger_network_scan():
    """Trigger an active network scan for devices"""
    try:
        active_devices = scan_network_for_devices()
        
        # Update discovered devices with scan results
        with discovery_lock:
            for device in active_devices:
                device_id = device.get('device_id')
                if device_id and device_id != DEVICE_ID:
                    device['last_seen'] = time.time()
                    discovered_devices[device_id] = device
        
        return jsonify({
            "status": "success",
            "message": f"Network scan completed. Found {len(active_devices)} active devices.",
            "scanned_devices": active_devices
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Network scan failed: {str(e)}"
        }), 500

@app.route('/connect-test/<device_ip>', methods=['GET'])
def test_device_connection(device_ip):
    """Test connection to a specific device"""
    try:
        response = requests.get(f"http://{device_ip}:{FLASK_PORT}/device-info", timeout=5)
        if response.status_code == 200:
            device_data = response.json()
            return jsonify({
                "status": "success",
                "message": f"Successfully connected to device at {device_ip}",
                "device_info": device_data
            })
        else:
            return jsonify({
                "status": "error",
                "message": f"Device at {device_ip} returned status {response.status_code}"
            }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to connect to device at {device_ip}: {str(e)}"
        }), 500

@app.route('/set-current-hinban', methods=['POST'])
def set_hinban():
    data = request.get_json()
    hinban = data.get('hinban')
    timestamp = get_jst_timestamp_ms()

    if not hinban:
        print(f"[{timestamp}] API: set-current-hinban - Hinban is missing in request.")
        return jsonify({"status": "error", "message": "Hinban is required"}), 400

    with data_lock: # Acquire lock here, as this is an API call from another thread
        global current_hinban_being_processed, list_of_cycle_logs, \
                current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time

        if hinban != current_hinban_being_processed:
            print(f"[{timestamp}] API: Received new hinban: '{hinban}'. Clearing accumulated cycle logs and resetting GPIO state.")
            current_hinban_being_processed = hinban
            list_of_cycle_logs.clear()
            # Also reset the GPIO state machine to ensure a clean start for the new hinban
            current_state = STATE_WAITING_FOR_START
            initial_time_raw = None
            initial_time_display = None
            final_time_raw = None
            clamps_closing_start_time = None
        else:
            print(f"[{timestamp}] API: Hinban '{hinban}' already active. No log or GPIO state reset required.")

    return jsonify({"status": "success", "message": f"Hinban set to {hinban}"})

@app.route('/get-current-cycle-stats', methods=['GET'])
def get_cycle_stats():
    timestamp = get_jst_timestamp_ms()
    with data_lock: # Acquire lock here, as this is an API call from another thread
        total_quantity = len(list_of_cycle_logs)
        # Safely access list elements
        first_initial_time = list_of_cycle_logs[0]['initial_time'] if list_of_cycle_logs else "N/A"
        last_final_time = list_of_cycle_logs[-1]['final_time'] if list_of_cycle_logs else "N/A"

        avg_cycle_time = 0.0
        if total_quantity > 0:
            total_cycle_sum = sum(log['cycle_time'] for log in list_of_cycle_logs)
            avg_cycle_time = total_cycle_sum / total_quantity

        # You might also want to return the current state for UI feedback
        current_pin_states = {PIN_MAPPING[pin]: GPIO.input(pin) for pin in GPIO_PINS}

        return jsonify({
            "status": "success",
            "hinban": current_hinban_being_processed,
            "quantity": total_quantity,
            "initial_time": first_initial_time,
            "final_time": last_final_time,
            "average_cycle_time": round(avg_cycle_time, 2),
            "current_gpio_state": current_state, # Add current state for UI
            "current_pin_states": current_pin_states # Add live pin states for diagnostics on UI
        })

@app.route('/get-all-cycle-logs-for-submission', methods=['GET'])
def get_all_cycle_logs():
    timestamp = get_jst_timestamp_ms()
    with data_lock: # Acquire lock here, as this is an API call from another thread
        logs_to_return = list(list_of_cycle_logs) # Return a copy to prevent external modification
        print(f"[{timestamp}] API: get-all-cycle-logs-for-submission - Returning {len(logs_to_return)} logs.")
        return jsonify({"status": "success", "logs": logs_to_return})

@app.route('/reset-all-data', methods=['POST'])
def web_reset_all_data():
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] API: Received web reset request (Full System Reset).")
    reset_all_production_data() # This function will acquire its own lock
    return jsonify({"status": "success", "message": "Python side full reset initiated."})


# --- Thread Functions ---

def run_gpio_loop():
    """Function to run the main GPIO monitoring loop and state machine."""
    global current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time

    print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Starting setup.")
    try:
        # 1. Setup all defined pins as inputs with pull-up resistors
        # New Configuration: When sensor is INACTIVE, optocoupler pulls GPIO to LOW (0V).
        # When sensor is ACTIVE, optocoupler is inactive, and PUD_UP pulls GPIO to HIGH (3.3V).
        for pin in GPIO_PINS:
            GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Pin {pin} setup as input PUD_UP (ACTIVE = HIGH, INACTIVE = LOW).")
            # print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Initial state of Pin {pin}: {GPIO.input(pin)}") # Diagnostic line

        # 2. Add rising edge detection for start switch and reset button
        # bouncetime helps debounce physical button presses
        # GPIO.RISING (LOW to HIGH) correctly detects sensor activation with PUD_UP.
        GPIO.add_event_detect(START_SWITCH_PIN, GPIO.RISING, callback=start_switch_callback, bouncetime=200)
        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Added event detect for GPIO{START_SWITCH_PIN} (START_SWITCH).")
        GPIO.add_event_detect(RESET_BUTTON_PIN, GPIO.RISING, callback=reset_button_callback, bouncetime=200)
        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Added event detect for GPIO{RESET_BUTTON_PIN} (RESET_BUTTON).")

        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Monitoring {len(GPIO_PINS)} GPIO pins. Waiting for signals...")

        # 3. Main State Machine Loop
        while True:
            # Acquire lock once per loop iteration for all state modifications within the loop
            with data_lock:
                # Diagnostic prints for current state and variables (can be commented out for cleaner logs)
                # print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Current state check - State:{current_state}, RawTime:{initial_time_raw}, Hinban:'{current_hinban_being_processed}'")

                if current_state == STATE_WAITING_FOR_START:
                    if initial_time_raw is not None and current_hinban_being_processed is not None:
                        # Transition to next state if start condition met
                        current_state = STATE_CLAMPS_CLOSING
                        clamps_closing_start_time = time.monotonic()
                        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: State transition from WAITING_FOR_START to CLAMPS_CLOSING. Initial time raw: {initial_time_raw}")
                    elif initial_time_raw is not None and current_hinban_being_processed is None:
                            # This means start was pressed but hinban not set from tablet. Reset partial start.
                            print(f"[{get_jst_timestamp_ms()}] GPIO Loop: START_SWITCH pressed (GPIO{START_SWITCH_PIN}), but no hinban set yet. Resetting partial start. Waiting for tablet hinban.")
                            initial_time_raw = None
                            initial_time_display = None


                elif current_state == STATE_CLAMPS_CLOSING:
                    current_time = time.monotonic()
                    if (current_time - clamps_closing_start_time) > CLAMP_CLOSING_TIMEOUT_SEC:
                        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Clamp closing timeout detected ({current_time - clamps_closing_start_time:.2f}s). Calling hancho.")
                        hancho() # hancho() will reset current_state to WAITING_FOR_START (it does not acquire lock itself as this thread already holds it)
                        continue # Skip remaining checks in this loop iteration and restart from top

                    # Read clamp pin states
                    # With PUD_UP: 1 means active (closed), 0 means inactive (open)
                    clamp_a_state = GPIO.input(CLAMP_A_PIN)
                    clamp_b_state = GPIO.input(CLAMP_B_PIN)
                    clamp_c_state = GPIO.input(CLAMP_C_PIN)

                    # Diagnostic print for clamp states (commented out for cleaner logs unless needed)
                    # print(f"[{get_jst_timestamp_ms()}] GPIO Loop: CLAMPS_CLOSING - Clamp A:{clamp_a_state}, B:{clamp_b_state}, C:{clamp_c_state}")

                    if clamp_a_state == 1 and clamp_b_state == 1 and clamp_c_state == 1:
                        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: All clamps (GPIO{CLAMP_A_PIN}, {CLAMP_B_PIN}, {CLAMP_C_PIN}) detected HIGH. State transition to MACHINE_READY.")
                        current_state = STATE_MACHINE_READY
                    # else:
                        # print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Clamps not all HIGH. Retrying. Time left: {CLAMP_CLOSING_TIMEOUT_SEC - (current_time - clamps_closing_start_time):.1f}s")


                elif current_state == STATE_MACHINE_READY:
                    # Read machine ready pin states
                    # With PUD_UP: 1 means active (ready), 0 means inactive (not ready)
                    mr_a_state = GPIO.input(MACHINE_READY_A_PIN)
                    mr_b_state = GPIO.input(MACHINE_READY_B_PIN) # GPIO 16 is now active in checks
                    mr_c_state = GPIO.input(MACHINE_READY_C_PIN)

                    # Diagnostic print for machine ready states (commented out for cleaner logs unless needed)
                    # print(f"[{get_jst_timestamp_ms()}] GPIO Loop: MACHINE_READY - MR A:{mr_a_state}, B:{mr_b_state}, C:{mr_c_state}")

                    # All machine ready signals (A, B, and C) must now be HIGH
                    if mr_a_state == 1 and mr_b_state == 1 and mr_c_state == 1: # <--- CHANGED: Now includes mr_b_state
                        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: All machine ready signals (GPIO{MACHINE_READY_A_PIN}, GPIO{MACHINE_READY_B_PIN}, GPIO{MACHINE_READY_C_PIN}) detected HIGH. State transition to PRODUCT_RELEASE.") # <--- CHANGED: Updated print statement
                        current_state = STATE_PRODUCT_RELEASE
                    else:
                        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Machine Ready Signals: 0-X09:{mr_a_state}, 1-X12:{mr_b_state}, 1-X08:{mr_c_state}. Not all required signals HIGH.")


                elif current_state == STATE_PRODUCT_RELEASE:
                    # Read product release pin state
                    # With PUD_UP: 1 means active (released), 0 means inactive (not released)
                    pr_state = GPIO.input(PRODUCT_RELEASE_PIN)

                    # Diagnostic print for product release state (commented out for cleaner logs unless needed)
                    # print(f"[{get_jst_timestamp_ms()}] GPIO Loop: PRODUCT_RELEASE - PR:{pr_state}")

                    if pr_state == 1:
                        final_time_raw = time.monotonic()
                        final_time_display = get_jst_timestamp_ms()

                        if initial_time_raw is not None and current_hinban_being_processed is not None:
                            cycle_time = final_time_raw - initial_time_raw
                            print(f"[{final_time_display}] GPIO Loop: PRODUCT_RELEASE (GPIO{PRODUCT_RELEASE_PIN}) detected. Cycle Time: {cycle_time:.2f}s. Logging cycle.")
                            log_entry = {
                                'initial_time': initial_time_display,
                                'final_time': final_time_display,
                                'cycle_time': round(cycle_time, 3),
                                'hinban': current_hinban_being_processed # Store hinban with each log entry for clarity
                            }
                            list_of_cycle_logs.append(log_entry)
                            print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Logged cycle for '{current_hinban_being_processed}'. Total logs: {len(list_of_cycle_logs)}.")
                        else:
                            print(f"[{get_jst_timestamp_ms()}] GPIO Loop: PRODUCT_RELEASE (GPIO{PRODUCT_RELEASE_PIN}) detected but initial time or hinban missing. Skipping log.")

                        # Reset for next cycle
                        current_state = STATE_WAITING_FOR_START
                        initial_time_raw = None
                        initial_time_display = None
                        final_time_raw = None
                        clamps_closing_start_time = None
                        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Cycle processed. Resetting state for next product.")

            time.sleep(0.05) # Small delay to prevent excessive CPU usage

    except KeyboardInterrupt:
        print(f"\n[{get_jst_timestamp_ms()}] GPIO Loop: Exiting due to Ctrl+C...")
    except Exception as e:
        print(f"\n[{get_jst_timestamp_ms()}] GPIO Loop: !!! AN UNEXPECTED ERROR OCCURRED IN GPIO THREAD: {type(e).__name__}: {e} !!!")
        traceback.print_exc() # Print full traceback for debugging
    finally:
        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Cleaning up GPIO.")
        GPIO.cleanup()
        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: GPIO cleanup complete.")

def run_flask_app():
    """Function to run the Flask web server."""
    try:
        print(f"[{get_jst_timestamp_ms()}] Flask App: Starting on http://0.0.0.0:{FLASK_PORT}")
        # debug=False and use_reloader=False are crucial for threading environments
        app.run(host='0.0.0.0', port=FLASK_PORT, debug=False, use_reloader=False)
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Flask App: !!! ERROR STARTING FLASK APP: {type(e).__name__}: {e} !!!")
        sys.exit(1) # Exit the program if Flask fails to start

# --- Discovery Thread Functions ---

def run_discovery_broadcaster():
    """Function to run the device discovery broadcaster"""
    try:
        print(f"[{get_jst_timestamp_ms()}] Discovery Broadcaster: Starting...")
        while True:
            broadcast_presence()
            cleanup_old_devices()
            time.sleep(BROADCAST_INTERVAL)
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Discovery Broadcaster: !!! ERROR: {type(e).__name__}: {e} !!!")

def run_discovery_listener():
    """Function to run the device discovery listener"""
    try:
        print(f"[{get_jst_timestamp_ms()}] Discovery Listener: Starting...")
        listen_for_announcements()
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Discovery Listener: !!! ERROR: {type(e).__name__}: {e} !!!")

# --- Main execution block ---
if __name__ == '__main__':
    # Record start time for uptime calculation
    start_time = time.time()
    
    print(f"[{get_jst_timestamp_ms()}] System: Initializing Production Monitoring System...")
    print(f"[{get_jst_timestamp_ms()}] Device Info: {DEVICE_NAME} (ID: {DEVICE_ID}) at {get_local_ip()}:{FLASK_PORT}")

    # Create and start threads for GPIO monitoring, Flask web server, and device discovery
    gpio_thread = threading.Thread(target=run_gpio_loop, name="GPIOMonitorThread")
    flask_thread = threading.Thread(target=run_flask_app, name="FlaskAppThread")
    discovery_broadcaster_thread = threading.Thread(target=run_discovery_broadcaster, name="DiscoveryBroadcasterThread")
    discovery_listener_thread = threading.Thread(target=run_discovery_listener, name="DiscoveryListenerThread")

    # Start all threads
    gpio_thread.start()
    flask_thread.start()
    discovery_broadcaster_thread.start()
    discovery_listener_thread.start()

    try:
        # Keep the main thread alive, allowing it to monitor child threads
        while True:
            time.sleep(1) # Check thread status periodically
            if not gpio_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: GPIO thread has terminated unexpectedly! Monitoring stopped. Exiting system.")
                break # Exit main loop
            if not flask_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: Flask thread has terminated unexpectedly! API is down. Exiting system.")
                break # Exit main loop
            if not discovery_broadcaster_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: Discovery broadcaster thread has terminated. Restarting...")
                discovery_broadcaster_thread = threading.Thread(target=run_discovery_broadcaster, name="DiscoveryBroadcasterThread")
                discovery_broadcaster_thread.start()
            if not discovery_listener_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: Discovery listener thread has terminated. Restarting...")
                discovery_listener_thread = threading.Thread(target=run_discovery_listener, name="DiscoveryListenerThread")
                discovery_listener_thread.start()
    except KeyboardInterrupt:
        print(f"\n[{get_jst_timestamp_ms()}] System: Ctrl+C detected. Attempting graceful shutdown...")
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] System: An unexpected error occurred in main thread: {e}")
    finally:
        print(f"[{get_jst_timestamp_ms()}] System: Program termination sequence initiated.")
        # Attempt to join threads for graceful shutdown. Use a timeout.
        if gpio_thread.is_alive():
            print(f"[{get_jst_timestamp_ms()}] System: Waiting for GPIO thread to finish...")
            gpio_thread.join(timeout=2) # Give it 2 seconds to clean up
        if flask_thread.is_alive():
            print(f"[{get_jst_timestamp_ms()}] System: Waiting for Flask thread to finish...")
            flask_thread.join(timeout=2) # Give it 2 seconds to clean up
        if discovery_broadcaster_thread.is_alive():
            print(f"[{get_jst_timestamp_ms()}] System: Waiting for discovery broadcaster thread to finish...")
            discovery_broadcaster_thread.join(timeout=2)
        if discovery_listener_thread.is_alive():
            print(f"[{get_jst_timestamp_ms()}] System: Waiting for discovery listener thread to finish...")
            discovery_listener_thread.join(timeout=2)
        print(f"[{get_jst_timestamp_ms()}] System: All threads attempted to join/terminate. Program Exited.")