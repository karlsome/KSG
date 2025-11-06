# ESP32 KSG Production Counter - Setup Guide

## Hardware Requirements
- **LilyGo T-Display ESP32-S3** (1.9" ST7789 170x320 display)
- Machine signal connection to **GPIO1** (active low)
- LED indicator connected to **GPIO2** (active low)

## Arduino IDE Setup

### 1. Install ESP32 Board Package
1. Open Arduino IDE
2. Go to **File** → **Preferences**
3. Add this URL to "Additional Boards Manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Go to **Tools** → **Board** → **Boards Manager**
5. Search for "ESP32" and install **"esp32 by Espressif Systems"**
6. Select **Board**: "ESP32S3 Dev Module"

### 2. Required Libraries
Install these libraries via **Tools** → **Manage Libraries** or **Sketch** → **Include Library** → **Manage Libraries**:

#### Core Libraries (Install via Library Manager):
- **ArduinoJson** by Benoit Blanchon (version 6.x)
- **SocketIOclient** by Markus Sattler
- **Arduino_GFX** by moononournation

#### ESP32 Built-in Libraries (Already included):
- WiFi
- WebServer
- HTTPClient
- SPI
- SPIFFS

### 3. Arduino_GFX Library
The Arduino_GFX library provides better performance and easier configuration:

- **No additional configuration needed** - the code includes the correct pin setup
- **Automatic display detection** for LilyGo T-Display ESP32-S3
- **Optimized for ESP32-S3** with hardware acceleration

The display configuration is handled automatically in the code:
```cpp
// LilyGo T-Display ESP32-S3 ST7789 configuration
Arduino_DataBus *bus = new Arduino_ESP32SPI(37 /* DC */, 34 /* CS */, 36 /* SCK */, 35 /* MOSI */, GFX_NOT_DEFINED /* MISO */, VSPI);
Arduino_GFX *gfx = new Arduino_ST7789(bus, 38 /* RST */, 1 /* rotation */, true /* IPS */, 170 /* width */, 320 /* height */);
```

### 4. Board Configuration
In Arduino IDE, set these board settings:
- **Board**: "ESP32S3 Dev Module"
- **USB CDC On Boot**: "Enabled"
- **CPU Frequency**: "240MHz (WiFi/BT)"
- **Flash Mode**: "QIO"
- **Flash Size**: "16MB (128Mb)"
- **Partition Scheme**: "Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)"
- **PSRAM**: "PSRAM"

## Configuration

### 1. Device Settings
Edit these variables in the code for each ESP32:

```cpp
const char* DEVICE_ID = "ESP01KSG";  // Unique ID for each device
const char* DEVICE_NAME = "ESP32_Production_Counter_01";  // Descriptive name
const char* SERVER_HOST = "192.168.3.209";  // Your ksgServer.js IP address
const int SERVER_PORT = 3000;
```

### 2. WiFi Networks
The code includes a predefined list of WiFi networks. Add/modify as needed:

```cpp
const char* ssidList[] = {
    "YourNetworkName",
    // ... existing networks
};

const char* passwordList[] = {
    "YourPassword",
    // ... existing passwords
};
```

### 3. GPIO Pin Configuration
Current configuration:
- **GPIO1**: Input (button/sensor, active low with pull-up)
- **GPIO2**: Output (LED indicator, active low)

## Features

### 🔧 Hardware Functions
- **GPIO1 Monitoring**: Detects active-low signals (GND = button press)
- **GPIO2 LED**: Provides visual feedback for button presses
- **ST7789 Display**: Shows device info, IP address, and connection status
- **Debouncing**: 50ms debounce delay prevents false triggers

### 🌐 Network Functions
- **Auto WiFi Connection**: Scans and connects to known networks
- **Device Registration**: Registers with MongoDB via ksgServer.js
- **Socket.IO Communication**: Real-time bidirectional communication
- **Web Server**: Hosts webapp on port 8080
- **File Download**: Auto-downloads webapp files from server

### 📊 Data Functions
- **Production Counter**: Increments on each GPIO1 trigger
- **Real-time Updates**: Sends count updates via Socket.IO
- **Web API**: REST endpoints for status and control
- **Display Updates**: Shows current count on TFT display

## Usage

### 1. Upload Code
1. Connect ESP32 via USB
2. Select correct COM port in Arduino IDE
3. Upload the code
4. Open Serial Monitor (115200 baud) to see debug output

### 2. Initial Setup
1. ESP32 will scan and connect to WiFi
2. Register with the server (ksgServer.js must be running)
3. Download webapp files automatically
4. Display device info on TFT screen

### 3. Operation
1. **Button Press**: Connect GPIO1 to GND
2. **LED Feedback**: GPIO2 LED lights up briefly
3. **Counter Update**: Production count increments
4. **Web Interface**: Access via `http://[ESP32_IP]:8080`
5. **Real-time Sync**: Updates sent to server immediately

### 4. Web Access
1. **Cloud Interface**: Users select device from cloud webpage
2. **Direct Access**: `http://[ESP32_IP]:8080` for local webapp
3. **API Endpoints**:
   - `GET /api/status` - Device status and counter
   - `POST /api/reset` - Reset production counter

## Troubleshooting

### Common Issues:

1. **WiFi Connection Failed**
   - Check SSID/password in the arrays
   - Ensure ESP32 is in range of WiFi network
   - Check Serial Monitor for connection attempts

2. **Display Not Working**
   - Verify Arduino_GFX library is installed correctly
   - Check backlight pin (GPIO38) connection
   - Ensure correct ESP32-S3 board selection

3. **Server Connection Failed**
   - Verify SERVER_HOST and SERVER_PORT settings
   - Ensure ksgServer.js is running
   - Check firewall settings

4. **Socket.IO Issues**
   - Check server Socket.IO version compatibility
   - Verify network connectivity
   - Check Serial Monitor for Socket.IO events

5. **GPIO Not Responding**
   - Verify GPIO1 wiring (active low)
   - Check pull-up resistor configuration
   - Test with multimeter

### Debug Output
Monitor the Serial output for detailed debug information:
- WiFi connection status
- Device registration results
- Button press detection
- Socket.IO events
- Counter updates

## File Structure
```
KSG/
├── ksgEsp32.ino          # Main ESP32 code
├── ksgServer.js          # Node.js server (existing)
└── webapp/               # Web files (downloaded automatically)
    ├── index.html
    ├── script.js
    └── style.css
```

## Next Steps
1. **Multiple Devices**: Change DEVICE_ID and DEVICE_NAME for each ESP32
2. **Additional GPIOs**: Extend GPIO monitoring for more inputs
3. **Custom Web Interface**: Modify webapp files for specific requirements
4. **Production Data**: Integrate with existing production data systems