import RPi.GPIO as GPIO
import time
import datetime
import os
import sys
import traceback
import threading
import collections

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

# --- Utility Functions ---

def get_jst_timestamp_ms():
    """Returns current JST time formatted as HH:MM:SS.ms"""
    jst_offset_seconds = 9 * 3600 # JST is UTC+9
    utc_now = datetime.datetime.utcnow()
    jst_now = utc_now + datetime.timedelta(seconds=jst_offset_seconds)
    return jst_now.strftime('%H:%M:%S.%f')[:-3]

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

# --- Main execution block ---
if __name__ == '__main__':
    print(f"[{get_jst_timestamp_ms()}] System: Initializing Production Monitoring System...")

    # Create and start threads for GPIO monitoring and Flask web server
    gpio_thread = threading.Thread(target=run_gpio_loop, name="GPIOMonitorThread")
    flask_thread = threading.Thread(target=run_flask_app, name="FlaskAppThread")

    gpio_thread.start()
    flask_thread.start()

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
        print(f"[{get_jst_timestamp_ms()}] System: All threads attempted to join/terminate. Program Exited.")