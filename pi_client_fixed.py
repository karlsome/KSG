#!/usr/bin/env python3
"""
🍓 Raspberry Pi Client - Fixed Pin Configuration with Offline Support
Simplified version with pre-defined GPIO pins + offline functionality
No dynamic configuration - just works!
"""

import RPi.GPIO as GPIO
import requests
import time
import threading
import json
import hashlib
import os
from typing import Dict, Any

class SmartPiClient:
    def __init__(self):
        self.server_url = "http://192.168.0.38:3000"  # UPDATE THIS
        self.device_id = "4Y02SX"
        
        # ⏰ CONFIGURABLE UPDATE INTERVALS
        self.UPDATE_CHECK_INTERVAL = 60  # � CHECK FOR UPDATES EVERY 60 SECONDS (1 minute)
        self.OFFLINE_CACHE_FILE = "offline_functions.json"  # Local backup file
        
        # �📌 FIXED PIN CONFIGURATION - No more dynamic complexity!
        self.INPUT_PINS = {
            17: 'gpio17',   # GPIO17 - Pin 11
            27: 'gpio27',   # GPIO27 - Pin 13  
            22: 'gpio22',   # GPIO22 - Pin 15
            23: 'gpio23',   # GPIO23 - Pin 16
            24: 'gpio24',   # GPIO24 - Pin 18
            25: 'gpio25'    # GPIO25 - Pin 22
        }
        
        self.OUTPUT_PINS = {
            18: 'gpio18',   # GPIO18 - Pin 12 (PWM capable)
            19: 'gpio19',   # GPIO19 - Pin 35
            26: 'gpio26',   # GPIO26 - Pin 37
            16: 'gpio16',   # GPIO16 - Pin 36
            20: 'gpio20',   # GPIO20 - Pin 38
            21: 'gpio21'    # GPIO21 - Pin 40
        }
        
        # State tracking
        self.functions = {}
        self.function_hash = ""
        self.pin_states = {}
        self.pin_states_prev = {}
        self.running = True
        self.config_storage = {}
        self.offline_mode = False
        
        print("🍓 Smart Pi Client - Fixed Pin Edition with Offline Support")
        print(f"📍 Input pins: {list(self.INPUT_PINS.keys())}")
        print(f"📍 Output pins: {list(self.OUTPUT_PINS.keys())}")
        print(f"⏰ Update check interval: {self.UPDATE_CHECK_INTERVAL} seconds")
        print(f"💾 Offline cache: {self.OFFLINE_CACHE_FILE}")
        
    def save_functions_offline(self):
        """Save current functions to local file for offline use"""
        try:
            offline_data = {
                'functions': self.functions,
                'function_hash': self.function_hash,
                'saved_at': time.time(),
                'device_id': self.device_id,
                'config_storage': self.config_storage
            }
            
            with open(self.OFFLINE_CACHE_FILE, 'w') as f:
                json.dump(offline_data, f, indent=2)
            
            print(f"💾 Functions saved offline to {self.OFFLINE_CACHE_FILE}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to save offline functions: {e}")
            return False
    
    def load_functions_offline(self):
        """Load functions from local file when offline"""
        try:
            if not os.path.exists(self.OFFLINE_CACHE_FILE):
                print("⚠️  No offline cache found")
                return False
            
            with open(self.OFFLINE_CACHE_FILE, 'r') as f:
                offline_data = json.load(f)
            
            self.functions = offline_data.get('functions', {})
            self.function_hash = offline_data.get('function_hash', '')
            self.config_storage = offline_data.get('config_storage', {})
            
            saved_time = offline_data.get('saved_at', 0)
            age_hours = (time.time() - saved_time) / 3600
            
            print(f"📦 Loaded offline functions (cached {age_hours:.1f} hours ago)")
            print(f"🔑 Offline hash: {self.function_hash}")
            
            # Display available functions
            for func_name, func_data in self.functions.items():
                status = "✅" if func_data.get('enabled', False) else "❌"
                print(f"  {status} {func_name}: {func_data.get('description', 'No description')}")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to load offline functions: {e}")
            return False
    def setup_gpio(self):
        """Initialize all GPIO pins"""
        print("🔧 Setting up GPIO pins...")
        
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        
        # Setup input pins with pull-up resistors
        for pin_num, pin_name in self.INPUT_PINS.items():
            try:
                GPIO.setup(pin_num, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                self.pin_states[pin_name] = GPIO.input(pin_num)
                self.pin_states_prev[pin_name] = self.pin_states[pin_name]
                print(f"  ✅ GPIO{pin_num} ({pin_name}) configured as INPUT with pull-up")
            except Exception as e:
                print(f"  ❌ Failed to setup GPIO{pin_num}: {e}")
        
        # Setup output pins
        for pin_num, pin_name in self.OUTPUT_PINS.items():
            try:
                GPIO.setup(pin_num, GPIO.OUT)
                GPIO.output(pin_num, GPIO.HIGH)  # Start with all outputs HIGH (off for LEDs)
                print(f"  ✅ GPIO{pin_num} ({pin_name}) configured as OUTPUT (HIGH)")
            except Exception as e:
                print(f"  ❌ Failed to setup GPIO{pin_num}: {e}")
        
        print("🎯 GPIO setup complete!")
    
    def cleanup_gpio(self):
        """Clean up GPIO on exit"""
        print("🧹 Cleaning up GPIO...")
        GPIO.cleanup()
    
    def read_sensors(self) -> Dict[str, Any]:
        """Read all input pins and return sensor data"""
        sensors = {
            'timestamp': time.time(),
            'device_id': self.device_id
        }
        
        # Store previous states
        for pin_name in self.INPUT_PINS.values():
            self.pin_states_prev[pin_name] = self.pin_states.get(pin_name, 1)
        
        # Read current states
        for pin_num, pin_name in self.INPUT_PINS.items():
            try:
                current_state = GPIO.input(pin_num)
                self.pin_states[pin_name] = current_state
                sensors[pin_name] = current_state
                sensors[f"{pin_name}_prev"] = self.pin_states_prev[pin_name]
            except Exception as e:
                print(f"❌ Error reading GPIO{pin_num}: {e}")
                sensors[pin_name] = 1  # Default to HIGH (not pressed)
                sensors[f"{pin_name}_prev"] = 1
        
        return sensors
    
    def execute_command(self, command: Dict[str, Any]):
        """Execute GPIO output commands"""
        try:
            cmd_type = command.get('type', '')
            state = command.get('state', True)
            
            # Find the pin number for the command
            target_pin = None
            for pin_num, pin_name in self.OUTPUT_PINS.items():
                if pin_name == cmd_type:
                    target_pin = pin_num
                    break
            
            if target_pin is None:
                print(f"⚠️  Unknown command type: {cmd_type}")
                return
            
            # Convert boolean to GPIO level
            gpio_level = GPIO.LOW if state else GPIO.HIGH
            GPIO.output(target_pin, gpio_level)
            
            state_str = "LOW" if state else "HIGH"
            print(f"🎛️  GPIO{target_pin} ({cmd_type}) → {state_str}")
            
        except Exception as e:
            print(f"❌ Command execution error: {e}")
    
    def check_for_updates(self):
        """Check server for function updates"""
        try:
            url = f"{self.server_url}/api/functions/check/{self.function_hash}"
            params = {'device_id': self.device_id}
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('updateAvailable', False):
                    print(f"📥 Function update available: v{data.get('version')}")
                    self.functions = data.get('functions', {})
                    self.function_hash = data.get('hash', '')
                    print(f"🔄 Updated to {len(self.functions)} functions")
                    
                    # Save to offline cache when we get updates
                    self.save_functions_offline()
                    
                    # Exit offline mode if we were in it
                    if self.offline_mode:
                        self.offline_mode = False
                        print("🌐 Back online! Using server functions")
                    
                    return True
                else:
                    # Still connected, just no updates
                    if self.offline_mode:
                        self.offline_mode = False
                        print("🌐 Reconnected to server")
                    print("✅ Functions up to date")
                    return False
            else:
                print(f"⚠️  Server responded with status {response.status_code}")
                self.enter_offline_mode()
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"🌐 Network error: {e}")
            self.enter_offline_mode()
            return False
        except Exception as e:
            print(f"❌ Error checking updates: {e}")
            self.enter_offline_mode()
            return False
    
    def enter_offline_mode(self):
        """Switch to offline mode and load cached functions"""
        if not self.offline_mode:
            print("📡 ❌ Server unreachable - entering OFFLINE MODE")
            self.offline_mode = True
            
            # Try to load cached functions
            if not self.functions:  # Only load if we don't have any functions
                self.load_functions_offline()
    
    def download_initial_functions(self):
        """Download functions on startup - ALWAYS try server first"""
        print("🌐 Attempting to connect to server for latest functions...")
        
        try:
            url = f"{self.server_url}/api/functions/latest"
            params = {'device_id': self.device_id}
            
            response = requests.get(url, params=params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                self.functions = data.get('functions', {})
                self.function_hash = data.get('hash', '')
                
                print(f"✅ Successfully downloaded {len(self.functions)} functions from server")
                print(f"🔑 Latest hash: {self.function_hash}")
                
                # Save fresh functions to offline cache
                self.save_functions_offline()
                
                # Display available functions
                for func_name, func_data in self.functions.items():
                    status = "✅" if func_data.get('enabled', False) else "❌"
                    print(f"  {status} {func_name}: {func_data.get('description', 'No description')}")
                
                print("🟢 Starting in ONLINE mode with latest functions")
                self.offline_mode = False
                return True
            else:
                print(f"❌ Server error: HTTP {response.status_code}")
                return self._fallback_to_offline()
                
        except requests.exceptions.ConnectionError:
            print("🌐 Cannot connect to server (connection refused)")
            return self._fallback_to_offline()
        except requests.exceptions.Timeout:
            print("🌐 Server connection timeout")
            return self._fallback_to_offline()
        except requests.exceptions.RequestException as e:
            print(f"🌐 Network error: {e}")
            return self._fallback_to_offline()
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            return self._fallback_to_offline()
    
    def _fallback_to_offline(self):
        """Fallback to offline cache when server is unreachable"""
        print("🔄 Server unreachable - attempting to load offline cache...")
        
        if self.load_functions_offline():
            print("🔴 Starting in OFFLINE mode with cached functions")
            self.offline_mode = True
            return True
        else:
            print("❌ No offline cache available - starting with no functions")
            print("⏳ Will attempt to download when server becomes available...")
            self.offline_mode = True
            return False
    
    def execute_functions(self, sensors: Dict[str, Any]):
        """Execute all enabled functions"""
        if not self.functions:
            return
        
        for func_name, func_data in self.functions.items():
            if not func_data.get('enabled', False):
                continue
            
            try:
                # Get function configuration
                config = self.config_storage.setdefault(func_name, func_data.get('config', {}))
                
                # Create execution environment
                exec_globals = {
                    'sensors': sensors,
                    'config': config,
                    'executeCommand': self.execute_command,
                    'print': print,
                    'time': time
                }
                
                # Execute function logic
                logic = func_data.get('logic', '')
                if logic.strip():
                    exec(logic, exec_globals)
                
                # Update stored config
                self.config_storage[func_name] = config
                
            except Exception as e:
                print(f"❌ Error executing function '{func_name}': {e}")
    
    def main_loop(self):
        """Main execution loop - fast and responsive with offline support"""
        print("🚀 Starting main loop...")
        last_update_check = 0
        loop_count = 0
        
        while self.running:
            try:
                # Read all sensors
                sensors = self.read_sensors()
                
                # Execute functions (works online or offline)
                self.execute_functions(sensors)
                
                # Check for updates at configurable interval
                current_time = time.time()
                if current_time - last_update_check > self.UPDATE_CHECK_INTERVAL:
                    mode_status = "🔴 OFFLINE" if self.offline_mode else "🟢 ONLINE"
                    print(f"📡 {mode_status} - Checking for updates...")
                    self.check_for_updates()
                    last_update_check = current_time
                
                # Status update every 1000 loops
                loop_count += 1
                if loop_count % 1000 == 0:
                    active_inputs = [name for name, state in sensors.items() 
                                   if name.startswith('gpio') and not name.endswith('_prev') and state == 0]
                    mode_indicator = "🔴 OFFLINE" if self.offline_mode else "🟢 ONLINE"
                    if active_inputs:
                        print(f"📊 Loop {loop_count} {mode_indicator} - Active inputs: {active_inputs}")
                    else:
                        print(f"📊 Loop {loop_count} {mode_indicator} - Running normally")
                
                # Fast polling - 20ms = 50Hz refresh rate
                time.sleep(0.02)
                
            except KeyboardInterrupt:
                print("\n🛑 Shutting down...")
                self.running = False
                break
            except Exception as e:
                print(f"❌ Main loop error: {e}")
                time.sleep(1)  # Brief pause on error
    
    def run(self):
        """Start the Pi client with proper online-first startup logic"""
        try:
            # Setup hardware
            self.setup_gpio()
            
            # ALWAYS try server first on startup - this is the key fix!
            print("� Pi startup - checking server connection first...")
            startup_success = self.download_initial_functions()
            
            if not startup_success:
                print("⚠️  Starting with no functions - will retry server connection periodically")
            
            # Start main loop (works with or without functions)
            print("🔄 Entering main execution loop...")
            self.main_loop()
            
        except Exception as e:
            print(f"❌ Fatal error: {e}")
        finally:
            self.cleanup_gpio()
            print("👋 Goodbye!")

def main():
    """Entry point"""
    client = SmartPiClient()
    
    # Display current settings
    print("⚙️  CONFIGURATION:")
    print(f"   Server: {client.server_url}")
    print(f"   Update interval: {client.UPDATE_CHECK_INTERVAL} seconds")
    print(f"   Offline cache: {client.OFFLINE_CACHE_FILE}")
    print("")
    print("🔧 TO CHANGE UPDATE INTERVAL:")
    print("   Edit line ~17: self.UPDATE_CHECK_INTERVAL = 60  # seconds")
    print("")
    print("📋 STARTUP LOGIC:")
    print("   1️⃣ Try to connect to server first (get latest functions)")
    print("   2️⃣ If server available: download latest + update local cache")
    print("   3️⃣ If server unavailable: fallback to local cache")
    print("   4️⃣ Then use current functions until next update check")
    print("")
    
    client.run()

if __name__ == "__main__":
    main()
