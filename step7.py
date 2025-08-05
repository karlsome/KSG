import RPi.GPIO as GPIO
import time
import datetime
import os
import sys
import traceback
import threading
import collections
import socket
import json
import requests
import subprocess
from urllib.parse import urlparse

# Flask imports
from flask import Flask, request, jsonify, render_template_string, send_from_directory

# --- Utility Functions ---

def get_jst_timestamp_ms():
    """Returns current JST time formatted as HH:MM:SS.ms"""
    jst_offset_seconds = 9 * 3600 # JST is UTC+9
    utc_now = datetime.datetime.utcnow()
    jst_now = utc_now + datetime.timedelta(seconds=jst_offset_seconds)
    return jst_now.strftime('%H:%M:%S.%f')[:-3]

def get_jst_datetime():
    """Returns current JST datetime object"""
    jst_offset_seconds = 9 * 3600
    utc_now = datetime.datetime.utcnow()
    return utc_now + datetime.timedelta(seconds=jst_offset_seconds)

# --- Global Variables and Constants ---

# Device identification (same as pi_client_fixed.py)
DEVICE_ID = "4Y02SX"
SERVER_URL = "http://192.168.0.25:3000"  # ksgServer.js URL
COMPANY = "KSG"

# GPIO numbering mode (BCM for Broadcom SoC channel numbers)
GPIO.setmode(GPIO.BCM)

# Pin mapping: BCM GPIO number to device signal name
PIN_MAPPING = {
    17: "0-X08_START_SWITCH",
    27: "0-X11_CLAMP_A",
    22: "0-X09_MACHINE_READY_A",
    5: "1-X13_CLAMP_B",
    6: "1-X09_CLAMP_C",
    16: "1-X12_MACHINE_READY_B",
    19: "1-X08_MACHINE_READY_C",
    26: "1-X15_PRODUCT_RELEASE",
    12: "1-X11_RESET_BUTTON"
}

# Assign specific pins to variables
START_SWITCH_PIN = 17
CLAMP_A_PIN = 27
MACHINE_READY_A_PIN = 22
CLAMP_B_PIN = 5
CLAMP_C_PIN = 6
MACHINE_READY_B_PIN = 16
MACHINE_READY_C_PIN = 19
PRODUCT_RELEASE_PIN = 26
RESET_BUTTON_PIN = 12

# Define the GPIO pins to monitor
GPIO_PINS = list(PIN_MAPPING.keys())

# Define states for process flow
STATE_WAITING_FOR_START = 0
STATE_CLAMPS_CLOSING = 1
STATE_MACHINE_READY = 2
STATE_PRODUCT_RELEASE = 3

# --- Process State and Data Variables ---
current_state = STATE_WAITING_FOR_START

initial_time_raw = None
initial_time_display = None
final_time_raw = None

# Timeout for clamp closing phase
CLAMP_CLOSING_TIMEOUT_SEC = 60
clamps_closing_start_time = None

current_hinban_being_processed = None
list_of_cycle_logs = []

# --- Threading and Flask Setup ---
data_lock = threading.Lock()
app = Flask(__name__)
FLASK_PORT = 5000

# --- Device Network Info ---
DEVICE_NAME = os.getenv("RPI_DEVICE_NAME", f"RaspberryPi_{DEVICE_ID}")
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    MY_IP_ADDRESS = s.getsockname()[0]
    s.close()
except Exception:
    MY_IP_ADDRESS = "127.0.0.1"

print(f"[{get_jst_timestamp_ms()}] System: Device {DEVICE_ID} at {MY_IP_ADDRESS}")

# --- Data Caching Variables ---
cached_products = {}  # masterDB products cache
cached_users = {}     # users cache
cached_auth_users = {} # authorized users (admin/masterUser only)
offline_submission_queue = []  # Queue for offline data submissions

# --- Webapp Update Variables ---
WEBAPP_UPDATE_INTERVAL = 24 * 3600  # 24 hours
WEBAPP_UPDATE_TIME = 4  # 4 AM JST
last_webapp_update = 0
WEBAPP_LOCAL_PATH = "/home/pi/webapp/"

# --- Data Sync Functions ---

def get_local_ip():
    """Get current local IP address"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except:
        return MY_IP_ADDRESS

def register_network_presence():
    """Register this device's network info with ksgServer.js"""
    try:
        local_ip = get_local_ip()
        registration_data = {
            'device_id': DEVICE_ID,
            'company': COMPANY,
            'device_name': DEVICE_NAME,
            'local_ip': local_ip,
            'local_port': FLASK_PORT,
            'capabilities': ['qr-processing', 'sensor-monitoring', 'webapp-hosting'],
            'last_seen': time.time(),
            'status': 'online'
        }
        
        response = requests.post(
            f"{SERVER_URL}/api/device/register-rpi",
            json=registration_data,
            headers={'X-Device-ID': DEVICE_ID},
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"📍 Registered RPi device: {local_ip}:{FLASK_PORT}")
            return True
        else:
            print(f"❌ RPi registration failed: HTTP {response.status_code}")
            if response.status_code != 404:  # Print response for debugging
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data.get('error', 'Unknown error')}")
                except:
                    print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Network registration error: {e}")
    
    return False

def sync_product_database():
    """Download KSG product database (masterDB) from MongoDB via ksgServer.js"""
    global cached_products
    try:
        response = requests.get(
            f"{SERVER_URL}/api/products/{COMPANY}",
            headers={'X-Device-ID': DEVICE_ID},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                cached_products = {product['品番']: product for product in data['products']}
                # Save to local cache file
                with open('/tmp/ksg_products_cache.json', 'w', encoding='utf-8') as f:
                    json.dump(cached_products, f, ensure_ascii=False, indent=2)
                print(f"✅ Synced {len(cached_products)} products from masterDB")
                return True
                
    except Exception as e:
        print(f"⚠️ Product sync failed, using cached data: {e}")
    
    # Load from local cache if sync failed
    try:
        with open('/tmp/ksg_products_cache.json', 'r', encoding='utf-8') as f:
            cached_products = json.load(f)
        print(f"💾 Loaded {len(cached_products)} products from cache")
        return True
    except:
        print("❌ No cached products available")
        return False

def sync_users_database():
    """Download KSG users from MongoDB via ksgServer.js"""
    global cached_users, cached_auth_users
    try:
        response = requests.get(
            f"{SERVER_URL}/api/users/{COMPANY}",
            headers={'X-Device-ID': DEVICE_ID},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                all_users = data['users']
                cached_users = {user['username']: user for user in all_users}
                # Filter authorized users (admin or masterUser only)
                cached_auth_users = {
                    user['username']: user 
                    for user in all_users 
                    if user.get('role') in ['admin', 'masterUser']
                }
                
                # Save to local cache
                with open('/tmp/ksg_users_cache.json', 'w', encoding='utf-8') as f:
                    json.dump({'all_users': cached_users, 'auth_users': cached_auth_users}, f, ensure_ascii=False, indent=2)
                
                print(f"✅ Synced {len(cached_users)} users, {len(cached_auth_users)} authorized")
                return True
                
    except Exception as e:
        print(f"⚠️ Users sync failed, using cached data: {e}")
    
    # Load from local cache if sync failed
    try:
        with open('/tmp/ksg_users_cache.json', 'r', encoding='utf-8') as f:
            cache_data = json.load(f)
            cached_users = cache_data.get('all_users', {})
            cached_auth_users = cache_data.get('auth_users', {})
        print(f"💾 Loaded {len(cached_users)} users from cache")
        return True
    except:
        print("❌ No cached users available, using fallback test users")
        # Fallback test users for development/testing
        fallback_users = [
            {
                'username': 'admin',
                'firstName': 'Admin',
                'lastName': 'User',
                'role': 'admin',
                'company': 'KSG'
            },
            {
                'username': 'testuser1',
                'firstName': '田中',
                'lastName': '太郎',
                'role': 'masterUser',
                'company': 'KSG'
            },
            {
                'username': 'testuser2',
                'firstName': '佐藤',
                'lastName': '花子',
                'role': 'masterUser',
                'company': 'KSG'
            }
        ]
        
        cached_users = {user['username']: user for user in fallback_users}
        cached_auth_users = {user['username']: user for user in fallback_users}
        
        print(f"✅ Using {len(fallback_users)} fallback test users")
        return True

def submit_data_to_mongodb(submission_data):
    """Submit production data to MongoDB via ksgServer.js"""
    try:
        response = requests.post(
            f"{SERVER_URL}/api/submit-production-data",
            json=submission_data,
            headers={'X-Device-ID': DEVICE_ID},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f"✅ Data submitted to MongoDB: {submission_data.get('品番')}")
                return True
        
        print(f"❌ Data submission failed: HTTP {response.status_code}")
        return False
        
    except Exception as e:
        print(f"❌ Data submission error: {e}")
        return False

def queue_offline_submission(submission_data):
    """Queue data for submission when back online"""
    global offline_submission_queue
    with data_lock:
        offline_submission_queue.append({
            'data': submission_data,
            'queued_at': time.time()
        })
    print(f"📝 Queued offline submission: {submission_data.get('品番')}")
    
    # Save queue to file
    try:
        with open('/tmp/offline_submission_queue.json', 'w', encoding='utf-8') as f:
            json.dump(offline_submission_queue, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Failed to save offline queue: {e}")

def process_offline_queue():
    """Process queued offline submissions"""
    global offline_submission_queue
    if not offline_submission_queue:
        return
    
    print(f"🔄 Processing {len(offline_submission_queue)} queued submissions...")
    
    with data_lock:
        queue_copy = offline_submission_queue.copy()
        offline_submission_queue.clear()
    
    successful_submissions = 0
    for queued_item in queue_copy:
        if submit_data_to_mongodb(queued_item['data']):
            successful_submissions += 1
        else:
            # Re-queue failed submissions
            with data_lock:
                offline_submission_queue.append(queued_item)
    
    print(f"✅ Processed {successful_submissions}/{len(queue_copy)} queued submissions")
    
    # Update saved queue
    try:
        with open('/tmp/offline_submission_queue.json', 'w', encoding='utf-8') as f:
            json.dump(offline_submission_queue, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Failed to update offline queue: {e}")

def load_offline_queue():
    """Load offline submission queue from file"""
    global offline_submission_queue
    try:
        with open('/tmp/offline_submission_queue.json', 'r', encoding='utf-8') as f:
            offline_submission_queue = json.load(f)
        print(f"💾 Loaded {len(offline_submission_queue)} queued submissions")
    except:
        offline_submission_queue = []

def update_webapp_from_github():
    """Update webapp files from GitHub repository"""
    try:
        print("🔄 Updating webapp from GitHub...")
        
        # Ensure webapp directory exists
        os.makedirs(WEBAPP_LOCAL_PATH, exist_ok=True)
        
        # Change to webapp directory and pull latest
        result = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=WEBAPP_LOCAL_PATH,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            print("✅ Webapp updated from GitHub")
            return True
        else:
            print(f"❌ Git pull failed: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print("⏰ GitHub update timed out")
        return False
    except Exception as e:
        print(f"❌ GitHub update error: {e}")
        return False

def check_webapp_update_schedule():
    """Check if it's time to update webapp (4 AM JST)"""
    global last_webapp_update
    
    current_time = get_jst_datetime()
    current_timestamp = time.time()
    
    # Check if it's 4 AM and we haven't updated today
    if (current_time.hour == WEBAPP_UPDATE_TIME and 
        current_timestamp - last_webapp_update > WEBAPP_UPDATE_INTERVAL):
        
        if update_webapp_from_github():
            last_webapp_update = current_timestamp
            return True
    
    return False

# --- Core Logic Functions (from step6.py) ---

def hancho():
    """Called if clamp closing times out"""
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] !!! Hancho: Clamp closing timed out. !!!")
    global current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time
    current_state = STATE_WAITING_FOR_START
    initial_time_raw = None
    initial_time_display = None
    final_time_raw = None
    clamps_closing_start_time = None
    print(f"[{timestamp}] Hancho: Cycle state reset due to timeout.")

def reset_current_cycle_only():
    """Reset current cycle state only"""
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] === Current Cycle Reset Initiated ===")
    try:
        with data_lock:
            global current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time
            current_state = STATE_WAITING_FOR_START
            initial_time_raw = None
            initial_time_display = None
            final_time_raw = None
            clamps_closing_start_time = None
        print(f"[{timestamp}] Current cycle reset complete.")
    except Exception as e:
        print(f"[{timestamp}] ERROR during cycle reset: {e}")
        traceback.print_exc()

def reset_all_production_data():
    """Reset all production data and state"""
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] === Full System Reset Initiated ===")
    try:
        with data_lock:
            global current_state, initial_time_raw, initial_time_display, final_time_raw, \
                    clamps_closing_start_time, current_hinban_being_processed, list_of_cycle_logs
            current_state = STATE_WAITING_FOR_START
            initial_time_raw = None
            initial_time_display = None
            final_time_raw = None
            clamps_closing_start_time = None
            current_hinban_being_processed = None
            list_of_cycle_logs.clear()
        print(f"[{timestamp}] All production data cleared.")
    except Exception as e:
        print(f"[{timestamp}] ERROR during full reset: {e}")
        traceback.print_exc()

# --- GPIO Event Callbacks ---

def start_switch_callback(channel):
    timestamp = get_jst_timestamp_ms()
    with data_lock:
        if current_state == STATE_WAITING_FOR_START:
            if current_hinban_being_processed is not None:
                global initial_time_raw, initial_time_display
                initial_time_raw = time.monotonic()
                initial_time_display = timestamp
                print(f"[{timestamp}] START_SWITCH activated for '{current_hinban_being_processed}'")
            else:
                print(f"[{timestamp}] START_SWITCH activated, but no hinban set. Ignoring.")
        else:
            print(f"[{timestamp}] START_SWITCH activated, but not in WAITING state. Ignoring.")

def reset_button_callback(channel):
    print(f"\n[{get_jst_timestamp_ms()}] HARDWARE RESET_BUTTON pressed.")
    reset_current_cycle_only()

# --- Flask API Endpoints ---

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

# --- Device Info and Discovery Endpoints ---

@app.route('/device-info')
def device_info():
    """Device information for discovery"""
    return jsonify({
        'device_id': DEVICE_ID,
        'device_name': DEVICE_NAME,
        'company': COMPANY,
        'local_ip': MY_IP_ADDRESS,
        'local_port': FLASK_PORT,
        'capabilities': ['qr-processing', 'sensor-monitoring', 'webapp-hosting'],
        'status': 'online',
        'pi_model': 'Raspberry Pi',
        'mac_address': DEVICE_ID  # Using device_id as identifier
    })

# --- Webapp Serving Endpoints ---

@app.route('/webapp')
def serve_webapp():
    """Serve the main webapp interface"""
    try:
        webapp_file = os.path.join(WEBAPP_LOCAL_PATH, 'index.html')
        if os.path.exists(webapp_file):
            with open(webapp_file, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            # Fallback to basic interface
            return render_basic_interface()
    except Exception as e:
        print(f"❌ Error serving webapp: {e}")
        return render_basic_interface()

@app.route('/webapp/<path:filename>')
def serve_webapp_assets(filename):
    """Serve webapp static files"""
    try:
        return send_from_directory(WEBAPP_LOCAL_PATH, filename)
    except Exception as e:
        print(f"❌ Error serving asset {filename}: {e}")
        return "File not found", 404

def render_basic_interface():
    """Basic fallback interface when webapp files not available"""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>KSG Production System - Offline Mode</title>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
            .online { background-color: #d4edda; border: 1px solid #c3e6cb; }
            .offline { background-color: #f8d7da; border: 1px solid #f5c6cb; }
            input, select, button { padding: 8px; margin: 5px; }
            button { background-color: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; }
            button:hover { background-color: #0056b3; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>KSG Production System</h1>
            <div class="status offline">
                <strong>Offline Mode</strong> - Limited functionality available
            </div>
            
            <h3>QR Code Input</h3>
            <input type="text" id="qrInput" placeholder="Scan or enter QR code" />
            <button onclick="processQR()">Process QR</button>
            
            <div id="productInfo" style="margin-top: 20px;"></div>
            
            <script>
                function processQR() {
                    const qrValue = document.getElementById('qrInput').value;
                    if (!qrValue) return;
                    
                    fetch('/set-current-hinban', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({hinban: qrValue})
                    })
                    .then(response => response.json())
                    .then(data => {
                        document.getElementById('productInfo').innerHTML = 
                            '<p>Product: ' + qrValue + '</p><p>Status: ' + data.message + '</p>';
                    })
                    .catch(error => {
                        document.getElementById('productInfo').innerHTML = 
                            '<p style="color: red;">Error: ' + error.message + '</p>';
                    });
                }
                
                // Allow Enter key in QR input
                document.getElementById('qrInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') processQR();
                });
            </script>
        </div>
    </body>
    </html>
    """

# --- Authentication and User Endpoints ---

@app.route('/api/auth/users')
def get_auth_users():
    """Get authorized users for login (admin/masterUser only)"""
    try:
        # Sync users if online, fallback to cache if offline
        sync_users_database()
        
        users_list = [
            {
                'username': user['username'],
                'firstName': user.get('firstName', ''),
                'lastName': user.get('lastName', ''),
                'role': user.get('role', '')
            }
            for user in cached_auth_users.values()
        ]
        
        return jsonify({
            'success': True,
            'users': users_list,
            'count': len(users_list)
        })
    except Exception as e:
        print(f"❌ Error getting auth users: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/workers')
def get_workers():
    """Get all KSG users for worker selection"""
    try:
        # Sync users if online, fallback to cache if offline
        sync_users_database()
        
        workers_list = [
            {
                'username': user['username'],
                'firstName': user.get('firstName', ''),
                'lastName': user.get('lastName', ''),
                'fullName': f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
            }
            for user in cached_users.values()
        ]
        
        return jsonify({
            'success': True,
            'workers': workers_list,
            'count': len(workers_list)
        })
    except Exception as e:
        print(f"❌ Error getting workers: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# --- Product Data Endpoints ---

@app.route('/api/product/<hinban>')
def get_product_info(hinban):
    """Get product information by hinban"""
    try:
        # Try to sync fresh data if online, fallback to cache
        sync_product_database()
        
        if hinban in cached_products:
            product = cached_products[hinban]
            return jsonify({
                'success': True,
                'product': product
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Product {hinban} not found'
            }), 404
            
    except Exception as e:
        print(f"❌ Error getting product info: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# --- Production Control Endpoints ---

@app.route('/set-current-hinban', methods=['POST'])
def set_hinban():
    """Set current hinban and sync product data"""
    data = request.get_json()
    hinban = data.get('hinban')
    timestamp = get_jst_timestamp_ms()

    if not hinban:
        print(f"[{timestamp}] API: set-current-hinban - Hinban missing")
        return jsonify({"status": "error", "message": "Hinban is required"}), 400

    # Sync product data to get latest info
    sync_product_database()

    with data_lock:
        global current_hinban_being_processed, list_of_cycle_logs, \
                current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time

        if hinban != current_hinban_being_processed:
            print(f"[{timestamp}] API: New hinban: '{hinban}'. Resetting state.")
            current_hinban_being_processed = hinban
            list_of_cycle_logs.clear()
            current_state = STATE_WAITING_FOR_START
            initial_time_raw = None
            initial_time_display = None
            final_time_raw = None
            clamps_closing_start_time = None
        else:
            print(f"[{timestamp}] API: Hinban '{hinban}' already active.")

    # Return product info if available
    product_info = cached_products.get(hinban, {})
    
    return jsonify({
        "status": "success", 
        "message": f"Hinban set to {hinban}",
        "product": product_info
    })

@app.route('/get-current-cycle-stats', methods=['GET'])
def get_cycle_stats():
    """Get current cycle statistics"""
    with data_lock:
        total_quantity = len(list_of_cycle_logs)
        first_initial_time = list_of_cycle_logs[0]['initial_time'] if list_of_cycle_logs else "N/A"
        last_final_time = list_of_cycle_logs[-1]['final_time'] if list_of_cycle_logs else "N/A"

        avg_cycle_time = 0.0
        if total_quantity > 0:
            total_cycle_sum = sum(log['cycle_time'] for log in list_of_cycle_logs)
            avg_cycle_time = total_cycle_sum / total_quantity

        current_pin_states = {PIN_MAPPING[pin]: GPIO.input(pin) for pin in GPIO_PINS}

        return jsonify({
            "status": "success",
            "hinban": current_hinban_being_processed,
            "quantity": total_quantity,
            "initial_time": first_initial_time,
            "final_time": last_final_time,
            "average_cycle_time": round(avg_cycle_time, 2),
            "current_gpio_state": current_state,
            "current_pin_states": current_pin_states
        })

@app.route('/get-all-cycle-logs-for-submission', methods=['GET'])
def get_all_cycle_logs():
    """Get all cycle logs for submission"""
    with data_lock:
        logs_to_return = list(list_of_cycle_logs)
        return jsonify({"status": "success", "logs": logs_to_return})

@app.route('/reset-all-data', methods=['POST'])
def web_reset_all_data():
    """Reset all production data"""
    timestamp = get_jst_timestamp_ms()
    print(f"[{timestamp}] API: Web reset request received.")
    reset_all_production_data()
    return jsonify({"status": "success", "message": "Full reset completed."})

# --- Data Submission Endpoint ---

@app.route('/api/submit-production-data', methods=['POST'])
def submit_production_data():
    """Submit production data to MongoDB via ksgServer.js"""
    try:
        submission_data = request.get_json()
        
        if not submission_data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        # Add device metadata
        submission_data['device_id'] = DEVICE_ID
        submission_data['submitted_from'] = MY_IP_ADDRESS
        
        # Add current cycle logs if not included
        if '生産ログ' not in submission_data:
            with data_lock:
                submission_data['生産ログ'] = list(list_of_cycle_logs)
        
        # Try online submission first
        if submit_data_to_mongodb(submission_data):
            # Process any queued offline submissions
            process_offline_queue()
            
            return jsonify({
                'success': True,
                'message': 'Data submitted successfully',
                'submitted_at': get_jst_datetime().isoformat()
            })
        else:
            # Queue for offline submission
            queue_offline_submission(submission_data)
            
            return jsonify({
                'success': True,
                'message': 'Data queued for submission (offline mode)',
                'queued': True
            })
            
    except Exception as e:
        print(f"❌ Error in data submission: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# --- System Status Endpoints ---

@app.route('/api/system/status')
def system_status():
    """Get system status information"""
    try:
        # Test online connectivity
        online_status = False
        try:
            response = requests.get(f"{SERVER_URL}/ping", timeout=3)
            online_status = response.status_code == 200
        except:
            pass
        
        with data_lock:
            return jsonify({
                'success': True,
                'device_id': DEVICE_ID,
                'device_name': DEVICE_NAME,
                'local_ip': MY_IP_ADDRESS,
                'online': online_status,
                'current_hinban': current_hinban_being_processed,
                'current_state': current_state,
                'cycle_logs_count': len(list_of_cycle_logs),
                'offline_queue_count': len(offline_submission_queue),
                'cached_products_count': len(cached_products),
                'cached_users_count': len(cached_users),
                'timestamp': get_jst_datetime().isoformat()
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# --- GPIO Loop Function ---

def run_gpio_loop():
    """Main GPIO monitoring loop and state machine"""
    global current_state, initial_time_raw, initial_time_display, final_time_raw, clamps_closing_start_time

    print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Starting setup.")
    try:
        # Setup GPIO pins
        for pin in GPIO_PINS:
            GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Pin {pin} setup as input.")

        # Add event detection
        GPIO.add_event_detect(START_SWITCH_PIN, GPIO.RISING, callback=start_switch_callback, bouncetime=200)
        GPIO.add_event_detect(RESET_BUTTON_PIN, GPIO.RISING, callback=reset_button_callback, bouncetime=200)
        
        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Monitoring {len(GPIO_PINS)} pins.")

        # Main state machine loop
        while True:
            with data_lock:
                if current_state == STATE_WAITING_FOR_START:
                    if initial_time_raw is not None and current_hinban_being_processed is not None:
                        current_state = STATE_CLAMPS_CLOSING
                        clamps_closing_start_time = time.monotonic()
                        print(f"[{get_jst_timestamp_ms()}] State: WAITING → CLAMPS_CLOSING")
                    elif initial_time_raw is not None and current_hinban_being_processed is None:
                        print(f"[{get_jst_timestamp_ms()}] START pressed but no hinban set. Resetting.")
                        initial_time_raw = None
                        initial_time_display = None

                elif current_state == STATE_CLAMPS_CLOSING:
                    current_time = time.monotonic()
                    if (current_time - clamps_closing_start_time) > CLAMP_CLOSING_TIMEOUT_SEC:
                        print(f"[{get_jst_timestamp_ms()}] Clamp closing timeout. Calling hancho.")
                        hancho()
                        continue

                    # Check clamp states
                    clamp_a_state = GPIO.input(CLAMP_A_PIN)
                    clamp_b_state = GPIO.input(CLAMP_B_PIN)
                    clamp_c_state = GPIO.input(CLAMP_C_PIN)

                    if clamp_a_state == 1 and clamp_b_state == 1 and clamp_c_state == 1:
                        print(f"[{get_jst_timestamp_ms()}] All clamps closed. State: CLAMPS_CLOSING → MACHINE_READY")
                        current_state = STATE_MACHINE_READY

                elif current_state == STATE_MACHINE_READY:
                    # Check machine ready states
                    mr_a_state = GPIO.input(MACHINE_READY_A_PIN)
                    mr_b_state = GPIO.input(MACHINE_READY_B_PIN)
                    mr_c_state = GPIO.input(MACHINE_READY_C_PIN)

                    if mr_a_state == 1 and mr_b_state == 1 and mr_c_state == 1:
                        print(f"[{get_jst_timestamp_ms()}] All machines ready. State: MACHINE_READY → PRODUCT_RELEASE")
                        current_state = STATE_PRODUCT_RELEASE

                elif current_state == STATE_PRODUCT_RELEASE:
                    # Check product release state
                    pr_state = GPIO.input(PRODUCT_RELEASE_PIN)

                    if pr_state == 1:
                        final_time_raw = time.monotonic()
                        final_time_display = get_jst_timestamp_ms()

                        if initial_time_raw is not None and current_hinban_being_processed is not None:
                            cycle_time = final_time_raw - initial_time_raw
                            print(f"[{final_time_display}] Product released. Cycle Time: {cycle_time:.2f}s")
                            
                            log_entry = {
                                'initial_time': initial_time_display,
                                'final_time': final_time_display,
                                'cycle_time': round(cycle_time, 3),
                                'hinban': current_hinban_being_processed
                            }
                            list_of_cycle_logs.append(log_entry)
                            print(f"[{get_jst_timestamp_ms()}] Cycle logged. Total: {len(list_of_cycle_logs)}")

                        # Reset for next cycle
                        current_state = STATE_WAITING_FOR_START
                        initial_time_raw = None
                        initial_time_display = None
                        final_time_raw = None
                        clamps_closing_start_time = None
                        print(f"[{get_jst_timestamp_ms()}] State reset for next cycle.")

            time.sleep(0.05)

    except KeyboardInterrupt:
        print(f"\n[{get_jst_timestamp_ms()}] GPIO Loop: Exiting due to Ctrl+C...")
    except Exception as e:
        print(f"\n[{get_jst_timestamp_ms()}] GPIO Loop: ERROR: {e}")
        traceback.print_exc()
    finally:
        print(f"[{get_jst_timestamp_ms()}] GPIO Loop: Cleaning up GPIO.")
        GPIO.cleanup()

# --- Data Sync Thread ---

def run_data_sync_loop():
    """Background thread for data synchronization and webapp updates"""
    print(f"[{get_jst_timestamp_ms()}] Data Sync: Starting sync loop.")
    
    # Initial setup
    register_network_presence()
    sync_product_database()
    sync_users_database()
    load_offline_queue()
    
    last_network_registration = time.time()
    last_data_sync = time.time()
    NETWORK_REGISTRATION_INTERVAL = 3600  # 1 hour
    DATA_SYNC_INTERVAL = 300  # 5 minutes
    
    try:
        while True:
            current_time = time.time()
            
            # Network registration (hourly)
            if current_time - last_network_registration > NETWORK_REGISTRATION_INTERVAL:
                register_network_presence()
                last_network_registration = current_time
            
            # Data sync (every 5 minutes)
            if current_time - last_data_sync > DATA_SYNC_INTERVAL:
                sync_product_database()
                sync_users_database()
                process_offline_queue()
                last_data_sync = current_time
            
            # Check webapp update schedule (daily at 4 AM)
            check_webapp_update_schedule()
            
            time.sleep(60)  # Check every minute
            
    except KeyboardInterrupt:
        print(f"\n[{get_jst_timestamp_ms()}] Data Sync: Exiting due to Ctrl+C...")
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Data Sync: ERROR: {e}")
        traceback.print_exc()

# --- Flask App Thread ---

def run_flask_app():
    """Run the Flask web server"""
    try:
        print(f"[{get_jst_timestamp_ms()}] Flask App: Starting on http://0.0.0.0:{FLASK_PORT}")
        app.run(host='0.0.0.0', port=FLASK_PORT, debug=False, use_reloader=False)
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] Flask App: ERROR: {e}")
        sys.exit(1)

# --- Main Execution ---

if __name__ == '__main__':
    print(f"[{get_jst_timestamp_ms()}] System: Initializing KSG Production System v7.0...")
    print(f"[{get_jst_timestamp_ms()}] Device: {DEVICE_ID} at {MY_IP_ADDRESS}:{FLASK_PORT}")

    # Initialize data caches
    print(f"[{get_jst_timestamp_ms()}] System: Loading users and products...")
    sync_users_database()
    sync_product_database()

    # Create and start threads
    gpio_thread = threading.Thread(target=run_gpio_loop, name="GPIOThread")
    flask_thread = threading.Thread(target=run_flask_app, name="FlaskThread")
    sync_thread = threading.Thread(target=run_data_sync_loop, name="DataSyncThread")

    gpio_thread.start()
    flask_thread.start()
    sync_thread.start()

    try:
        # Monitor threads
        while True:
            time.sleep(1)
            if not gpio_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: GPIO thread terminated! Exiting.")
                break
            if not flask_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: Flask thread terminated! Exiting.")
                break
            if not sync_thread.is_alive():
                print(f"[{get_jst_timestamp_ms()}] System: Sync thread terminated! Restarting...")
                sync_thread = threading.Thread(target=run_data_sync_loop, name="DataSyncThread")
                sync_thread.start()
                
    except KeyboardInterrupt:
        print(f"\n[{get_jst_timestamp_ms()}] System: Ctrl+C detected. Shutting down...")
    except Exception as e:
        print(f"[{get_jst_timestamp_ms()}] System: Unexpected error: {e}")
    finally:
        print(f"[{get_jst_timestamp_ms()}] System: Shutdown sequence initiated.")
        
        # Wait for threads to finish
        for thread in [gpio_thread, flask_thread, sync_thread]:
            if thread.is_alive():
                thread.join(timeout=2)
        
        print(f"[{get_jst_timestamp_ms()}] System: KSG Production System v7.0 shutdown complete.")
