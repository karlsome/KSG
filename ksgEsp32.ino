/*
 * KSG ESP32-S3 T-Display Production Counter (FFat edition)
 *
 * Board: LilyGo T-Display S3 (ESP32-S3, 1.9" ST7789 170x320)
 * Partition Scheme: 16M Flash (3MB APP / 9.9MB FATFS)  <-- LilyGO recommended
 *
 * Features:
 * - WiFi auto-connection (known SSIDs list)
 * - FATFS (FFat) for local web files (index.html / script.js / style.css)
 * - ST7789 via Arduino_GFX (parallel 8-bit)
 * - GPIO1 input (active LOW), GPIO2 LED (active LOW)
 * - Socket.IO client over WebSockets (EIO=4, transport=websocket)
 * - REST device registration
 * - Local web server on :8080 with /api/status and /api/reset
 * - Detailed Serial logs for debugging
 */

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>  // For HTTPS/WSS connections
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WebSocketsServer.h>  // For incoming WebSocket connections from webapp
#include <Arduino_GFX_Library.h>
#include <SPI.h>
#include <FFat.h>  // FATFS backend (matches LilyGO partition)
#include <time.h>  // For NTP time synchronization

// -------------------- Display (LilyGo T-Display S3) --------------------
#define PIN_POWER_ON 15
#define PIN_LCD_BL   38

#define GFX_EXTRA_PRE_INIT()              \
  {                                       \
    pinMode(PIN_POWER_ON, OUTPUT);        \
    digitalWrite(PIN_POWER_ON, HIGH);     \
  }

Arduino_DataBus *bus = new Arduino_ESP32PAR8Q(
  7 /* DC */, 6 /* CS */, 8 /* WR */, 9 /* RD */,
  39 /* D0 */, 40 /* D1 */, 41 /* D2 */, 42 /* D3 */,
  45 /* D4 */, 46 /* D5 */, 47 /* D6 */, 48 /* D7 */);

Arduino_GFX *gfx = new Arduino_ST7789(
  bus, 5 /* RST */, 1 /* rotation */, true /* IPS */,
  170 /* width */, 320 /* height */,
  35 /* col_off1 */, 0 /* row_off1 */, 35 /* col_off2 */, 0 /* row_off2 */);

// -------------------- Networking / Server --------------------
WebServer server(8080);
WebSocketsClient webSocket;     // Client for connecting TO the Node.js server
WebSocketsServer wsServer(81);  // Server for accepting connections FROM webapp

// -------------------- Device configuration --------------------
const char* DEVICE_ID   = "6C10F6";
const char* DEVICE_NAME = "6C10F6";

// Server URL configuration - easily switch between environments
// Just uncomment the one you want to use!
//const char* SERVER_URL = "https://ksg-lu47.onrender.com";  // Production (Render.com)
//const char* SERVER_URL = "http://localhost:3000";        // Local development
const char* SERVER_URL = "http://192.168.0.64:3000";     // Local network server


// -------------------- GPIO --------------------
const int GPIO_START_BUTTON = 1;   // Start button (active LOW, pull-up)
const int GPIO_LED_PIN      = 2;   // LED output (active LOW)
const int GPIO_END_BUTTON   = 3;   // End button (active LOW, pull-up)

// -------------------- NTP Time Configuration --------------------
const char* NTP_SERVER1 = "pool.ntp.org";
const char* NTP_SERVER2 = "time.nist.gov";
const char* NTP_SERVER3 = "ntp.jst.mfeed.ad.jp";  // Japan NTP server
const long GMT_OFFSET_SEC = 9 * 3600;  // JST is UTC+9
const int DAYLIGHT_OFFSET_SEC = 0;      // Japan doesn't use daylight saving

// -------------------- WiFi credentials --------------------
const char* ssidList[] = {
  
  "sasaki-host",
  "sasaki-host_EXT",
  "OZEKojo",
  "Sasaki_Hidase_2.4GHz",
  "Sasaki_Hidase_Guest_5G",
  "Sasaki-Coating",
  "HR02a-0A5D3E (2.4GHz)",
  "HR02b-0A5D3E (5GHz)",
  "HR02a-0A5D3E_EXT (2.4GHz)",
  "HR02b-0A5D3F_EXT (5GHz)",
  "HR02a-0A5D3E",
  "HR02a-0A5D3E_EXT",
  "TP-Link_30B8",
  "106F3F36FD33",
  "106F3F36FD33_5GEXT"
};

const char* passwordList[] = {
  
  "6B0B7AC380",
  "6B0B7AC380",
  "65057995",
  "58677728a",
  "Hidase1757",
  "SasAkic0aTinG",
  "SafxxmWt1F",
  "SafxxmWt1F",
  "SafxxmWt1F",
  "SafxxmWt1F",
  "SafxxmWt1F",
  "SafxxmWt1F",
  "93312585",
  "jdbxjrck1wggp",
  "jdbxjrck1wggp"
};

const int NUM_NETWORKS = sizeof(ssidList) / sizeof(ssidList[0]);

// -------------------- State --------------------
bool wifiConnected     = false;
bool serverConnected   = false;
bool fsAvailable       = false;
String localIP         = "";
int productionCounter  = 0;

// Production tracking state
bool lastStartButtonState = HIGH;
bool lastEndButtonState   = HIGH;
unsigned long lastStartButtonPress = 0;
unsigned long lastEndButtonPress   = 0;
const unsigned long DEBOUNCE_DELAY = 50;

// Cycle timing
unsigned long cycleStartTime = 0;
bool cycleInProgress = false;
String currentCycleStartTimeStr = "";  // Store actual start time string

// Production validation state
bool pendingValidation = false;
unsigned long validationRequestTime = 0;
const unsigned long VALIDATION_TIMEOUT = 5000; // 5 seconds timeout for validation
float totalCycleTime = 0.0;
int completedCycles = 0;
String firstCycleTime = "";
String lastCycleTime = "";

// Production log array (JSON string to save memory)
String productionLog = "[]";

// -------------------- Colors --------------------
#define COLOR_BLACK     0x0000
#define COLOR_WHITE     0xFFFF
#define COLOR_RED       0xF800
#define COLOR_GREEN     0x07E0
#define COLOR_BLUE      0x001F
#define COLOR_CYAN      0x07FF
#define COLOR_YELLOW    0xFFE0

// -------------------- Prototypes --------------------
void displayMessage(const char* message, uint16_t color);
void displayDeviceInfo();
void logHeap(const char* tag);
void connectToWiFi();
void mountFFat();
void initializeNTP();
void setupWebServer();
void setupSocketIO();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void webSocketServerEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
void setupWebSocketServer();
void handleStartButton();
void handleEndButton();
void startProductionCycle(unsigned long timestamp);
void blinkLED(int times = 1);
void updateProductionCount(int newCount);
void resetProductionData();
void addCycleToLog(float cycleTime, String startTime, String endTime);
String getCurrentTimeString();
void sendProductionUpdate();
void registerDevice();
bool downloadFile(const String& url, const String& path);
void downloadWebAppFiles();
void downloadUserData();
void downloadProductData();
void saveWebappVersion(const String& versionData);
String loadWebappVersion();
bool checkForWebappUpdates();
bool downloadWebappUpdates();
void checkAndUpdateWebapp();

// -------------------- Helpers --------------------
void displayMessage(const char* message, uint16_t color) {
  gfx->fillScreen(COLOR_BLACK);
  gfx->setTextColor(color);
  gfx->setTextSize(2);
  gfx->setCursor(14, 80);
  gfx->println(message);
}

void displayDeviceInfo() {
  gfx->fillScreen(COLOR_BLACK);
  gfx->setTextSize(1);

  gfx->setCursor(5, 10);  gfx->setTextColor(COLOR_CYAN);
  gfx->printf("Device: %s", DEVICE_NAME);

  gfx->setCursor(5, 25);  gfx->setTextColor(COLOR_GREEN);
  gfx->printf("IP: %s:8080", localIP.c_str());

  gfx->setCursor(5, 40);  gfx->setTextColor(serverConnected ? COLOR_GREEN : COLOR_RED);
  gfx->printf("Socket.IO: %s", serverConnected ? "OK" : "DISCONNECTED");

  gfx->setCursor(5, 60);  gfx->setTextColor(COLOR_WHITE); gfx->setTextSize(2);
  gfx->printf("Count: %d", productionCounter);

  gfx->setCursor(5, 90);  gfx->setTextSize(1); gfx->setTextColor(COLOR_YELLOW);
  gfx->printf("START: %s END: %s", 
              digitalRead(GPIO_START_BUTTON) ? "HIGH" : "LOW",
              digitalRead(GPIO_END_BUTTON) ? "HIGH" : "LOW");
  
  if (cycleInProgress) {
    gfx->setCursor(5, 105); gfx->setTextColor(COLOR_CYAN);
    gfx->printf("Cycle in progress...");
  } else if (completedCycles > 0) {
    float avgCycleTime = totalCycleTime / completedCycles;
    gfx->setCursor(5, 105); gfx->setTextColor(COLOR_GREEN);
    gfx->printf("Avg: %.2fs (%d cycles)", avgCycleTime, completedCycles);
  }

  gfx->setCursor(5, 105); gfx->setTextColor(wifiConnected ? COLOR_GREEN : COLOR_RED);
  gfx->printf("WiFi: %s", wifiConnected ? "Connected" : "Disconnected");

  gfx->setCursor(5, 120); gfx->setTextColor(fsAvailable ? COLOR_GREEN : COLOR_RED);
  gfx->printf("FFat: %s", fsAvailable ? "OK" : "Not Mounted");
}

void logHeap(const char* tag) {
  Serial.printf("[MEM] %s | Heap: %lu | PSRAM: %lu\n",
                tag, (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getFreePsram());
}

// -------------------- WiFi --------------------
void connectToWiFi() {
  Serial.println("\n[WiFi] Scanning + trying known networks...");
  displayMessage("Scanning WiFi...", COLOR_YELLOW);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(100);

  WiFi.scanNetworks(true);  // async scan
  delay(1500);

  for (int i = 0; i < NUM_NETWORKS; i++) {
    Serial.printf("[WiFi] Trying SSID %d/%d: %s\n", i + 1, NUM_NETWORKS, ssidList[i]);
    displayMessage(("Connecting:\n" + String(ssidList[i])).c_str(), COLOR_YELLOW);

    WiFi.begin(ssidList[i], passwordList[i]);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 24) { // ~12s
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      localIP = WiFi.localIP().toString();
      Serial.printf("[WiFi] ✅ Connected to %s | IP: %s\n", ssidList[i], localIP.c_str());
      displayMessage("WiFi Connected!", COLOR_GREEN);
      delay(1200);
      return;
    } else {
      Serial.printf("[WiFi] ❌ Failed: %s\n", ssidList[i]);
      WiFi.disconnect(true);
      delay(200);
    }
  }

  wifiConnected = false;
  Serial.println("[WiFi] ❌ No known networks reachable.");
  displayMessage("WiFi Failed", COLOR_RED);
}

// -------------------- FS (FFat) --------------------
void mountFFat() {
  Serial.println("\n[FFat] Mounting FATFS...");
  if (!FFat.begin(true)) {
    Serial.println("[FFat] ❌ Mount failed (partition missing or corrupted).");
    fsAvailable = false;
    return;
  }
  fsAvailable = true;

  size_t total = FFat.totalBytes();
  size_t used  = FFat.usedBytes();
  Serial.printf("[FFat] ✅ Mounted. Total: %u, Used: %u, Free: %u\n",
                (unsigned)total, (unsigned)used, (unsigned)(total - used));
}

// -------------------- Web file download --------------------
bool downloadFile(const String& url, const String& path) {
  if (!fsAvailable) {
    Serial.printf("[DL] FFat not available, skip save: %s\n", path.c_str());
    return false;
  }

  HTTPClient http;
  
  // Use appropriate client based on URL protocol
  if (isHTTPS(url)) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure();  // Skip certificate verification for simplicity
    http.begin(*client, url);
  } else {
    WiFiClient *client = new WiFiClient;
    http.begin(*client, url);
  }
  int code = http.GET();
  Serial.printf("[DL] GET %s --> %d\n", url.c_str(), code);

  if (code == HTTP_CODE_OK) {
    File f = FFat.open(path, "w");
    if (!f) {
      Serial.printf("[DL] ❌ Open for write failed: %s\n", path.c_str());
      http.end();
      return false;
    }
    size_t written = http.writeToStream(&f);
    f.close();
    Serial.printf("[DL] 💾 Saved %u bytes to %s\n", (unsigned)written, path.c_str());
    http.end();
    return true;
  } else {
    Serial.printf("[DL] ❌ HTTP error %d for %s\n", code, url.c_str());
  }
  http.end();
  return false;
}

void downloadWebAppFiles() {
  Serial.println("\n[DL] Downloading webapp files (index.html, script.js, style.css)...");
  if (!wifiConnected) { Serial.println("[DL] ❌ No WiFi."); return; }

  const char* files[] = { "index.html", "script.js", "style.css" };
  for (int i = 0; i < 3; i++) {
    String url  = String(SERVER_URL) + "/webapp/" + files[i];
    String path = "/" + String(files[i]);
    downloadFile(url, path);
  }
}

// Download and cache user data for offline use
void downloadUserData() {
  Serial.println("\n[DL] Downloading users data for offline backup...");
  if (!wifiConnected) { Serial.println("[DL] ❌ No WiFi for users data."); return; }
  
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/users/KSG";
  Serial.printf("[DL] GET %s\n", url.c_str());
  
  // Use appropriate client based on URL protocol
  if (isHTTPS(url)) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure();  // Skip certificate verification for simplicity
    http.begin(*client, url);
  } else {
    WiFiClient *client = new WiFiClient;
    http.begin(*client, url);
  }
  http.addHeader("X-Device-ID", DEVICE_ID);
  
  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    
    if (fsAvailable) {
      File f = FFat.open("/users.json", "w");
      if (f) {
        f.print(payload);
        f.close();
        Serial.println("[DL] ✅ Users data saved to /users.json");
      } else {
        Serial.println("[DL] ❌ Failed to open /users.json for writing");
      }
    }
  } else {
    Serial.printf("[DL] ❌ Users download failed: HTTP %d\n", httpCode);
  }
  http.end();
}

// Download and cache product data for offline use
void downloadProductData() {
  Serial.println("\n[DL] Downloading products data for offline backup...");
  if (!wifiConnected) { Serial.println("[DL] ❌ No WiFi for products data."); return; }
  
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/products/KSG";
  Serial.printf("[DL] GET %s\n", url.c_str());
  
  // Use appropriate client based on URL protocol
  if (isHTTPS(url)) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure();  // Skip certificate verification for simplicity
    http.begin(*client, url);
  } else {
    WiFiClient *client = new WiFiClient;
    http.begin(*client, url);
  }
  http.addHeader("X-Device-ID", DEVICE_ID);
  
  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    
    if (fsAvailable) {
      File f = FFat.open("/products.json", "w");
      if (f) {
        f.print(payload);
        f.close();
        Serial.println("[DL] ✅ Products data saved to /products.json");
      } else {
        Serial.println("[DL] ❌ Failed to open /products.json for writing");
      }
    }
  } else {
    Serial.printf("[DL] ❌ Products download failed: HTTP %d\n", httpCode);
  }
  http.end();
}

// -------------------- Smart Webapp Update System --------------------

// Store webapp version metadata
void saveWebappVersion(const String& versionData) {
  if (!fsAvailable) {
    Serial.println("[UPDATE] ❌ FFat not available for version storage");
    return;
  }
  
  File f = FFat.open("/webapp_version.json", "w");
  if (f) {
    f.print(versionData);
    f.close();
    Serial.println("[UPDATE] 💾 Webapp version metadata saved");
  } else {
    Serial.println("[UPDATE] ❌ Failed to save version metadata");
  }
}

// Load stored webapp version metadata
String loadWebappVersion() {
  if (!fsAvailable || !FFat.exists("/webapp_version.json")) {
    Serial.println("[UPDATE] 📁 No stored version metadata found");
    return "";
  }
  
  File f = FFat.open("/webapp_version.json", "r");
  if (!f) {
    Serial.println("[UPDATE] ❌ Failed to read version metadata");
    return "";
  }
  
  String version = f.readString();
  f.close();
  Serial.printf("[UPDATE] 📋 Loaded version metadata: %d bytes\n", version.length());
  Serial.printf("[UPDATE] 🔍 Raw stored data: %s\n", version.c_str());
  return version;
}

// Check server for webapp updates
bool checkForWebappUpdates() {
  if (!wifiConnected) {
    Serial.println("[UPDATE] ⚠️  No WiFi - skipping update check");
    return false;
  }
  
  Serial.println("\n[UPDATE] 🔍 Checking for webapp updates...");
  
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/webapp/version";
  
  // Use appropriate client based on URL protocol
  if (isHTTPS(url)) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure();  // Skip certificate verification for simplicity
    http.begin(*client, url);
  } else {
    WiFiClient *client = new WiFiClient;
    http.begin(*client, url);
  }
  http.setTimeout(10000); // 10 second timeout
  
  int httpCode = http.GET();
  Serial.printf("[UPDATE] Server version check response: HTTP %d\n", httpCode);
  
  if (httpCode != 200) {
    Serial.printf("[UPDATE] ❌ Server request failed: %d\n", httpCode);
    http.end();
    return false;
  }
  
  String serverVersion = http.getString();
  http.end();
  
  Serial.printf("[UPDATE] 🔍 Server response: %s\n", serverVersion.c_str());
  
  // Parse server response to extract version hash
  DynamicJsonDocument serverDoc(2048);
  deserializeJson(serverDoc, serverVersion);
  String serverVersionHash = serverDoc["version"] | "";
  
  Serial.printf("[UPDATE] 🔍 Extracted server hash: '%s'\n", serverVersionHash.c_str());
  
  // Load stored version for comparison
  String localVersionData = loadWebappVersion();
  DynamicJsonDocument localDoc(2048);
  deserializeJson(localDoc, localVersionData);
  String localVersionHash = localDoc["version"] | "";
  
  // Compare version hashes instead of full JSON
  bool updateNeeded = (serverVersionHash != localVersionHash) || (localVersionHash == "");
  
  Serial.printf("[UPDATE] Local version hash:  '%s' (len=%d)\n", 
                localVersionHash.length() > 0 ? localVersionHash.c_str() : "NONE", localVersionHash.length());
  Serial.printf("[UPDATE] Server version hash: '%s' (len=%d)\n", 
                serverVersionHash.c_str(), serverVersionHash.length());
  Serial.printf("[UPDATE] Hashes equal: %s\n", (serverVersionHash == localVersionHash) ? "YES" : "NO");
  Serial.printf("[UPDATE] Update needed: %s\n", updateNeeded ? "YES" : "NO");
  
  if (updateNeeded) {
    Serial.println("[UPDATE] 🆕 Updates available!");
    
    // Parse server response to see which files changed
    Serial.println("[UPDATE] 📄 Files to update:");
    if (serverVersion.indexOf("\"index.html\"") > -1) Serial.println("[UPDATE]   - index.html");
    if (serverVersion.indexOf("\"script.js\"") > -1) Serial.println("[UPDATE]   - script.js");
    if (serverVersion.indexOf("\"style.css\"") > -1) Serial.println("[UPDATE]   - style.css");
    
    // Store the new version info
    saveWebappVersion(serverVersion);
    
    return true;
  } else {
    Serial.println("[UPDATE] ✅ Webapp files are up to date");
    return false;
  }
}

// Download updated webapp files intelligently
bool downloadWebappUpdates() {
  Serial.println("\n[UPDATE] ⬇️  Downloading webapp updates...");
  
  if (!wifiConnected) {
    Serial.println("[UPDATE] ❌ No WiFi for updates");
    return false;
  }
  
  bool success = true;
  const char* files[] = { "index.html", "script.js", "style.css" };
  
  for (int i = 0; i < 3; i++) {
    Serial.printf("[UPDATE] 📥 Downloading %s...\n", files[i]);
    
    String url = String(SERVER_URL) + "/webapp/" + files[i];
    String tempPath = "/temp_" + String(files[i]);
    String finalPath = "/" + String(files[i]);
    
    // Download to temporary file first
    if (downloadFile(url, tempPath)) {
      // Verify file exists and has content
      if (FFat.exists(tempPath.c_str())) {
        File tempFile = FFat.open(tempPath.c_str(), "r");
        if (tempFile && tempFile.size() > 0) {
          tempFile.close();
          
          // Remove old file and rename temp file
          if (FFat.exists(finalPath.c_str())) {
            FFat.remove(finalPath.c_str());
          }
          
          if (FFat.rename(tempPath.c_str(), finalPath.c_str())) {
            Serial.printf("[UPDATE] ✅ %s updated successfully\n", files[i]);
          } else {
            Serial.printf("[UPDATE] ❌ Failed to replace %s\n", files[i]);
            success = false;
          }
        } else {
          Serial.printf("[UPDATE] ❌ %s download was empty\n", files[i]);
          success = false;
        }
      } else {
        Serial.printf("[UPDATE] ❌ %s temp file missing\n", files[i]);
        success = false;
      }
    } else {
      Serial.printf("[UPDATE] ❌ Failed to download %s\n", files[i]);
      success = false;
    }
    
    // Clean up temp file
    if (FFat.exists(tempPath.c_str())) {
      FFat.remove(tempPath.c_str());
    }
  }
  
  if (success) {
    Serial.println("[UPDATE] 🎉 All webapp files updated successfully!");
  } else {
    Serial.println("[UPDATE] ⚠️  Some webapp files failed to update");
  }
  
  return success;
}

// Background update check (non-blocking)
void checkAndUpdateWebapp() {
  static unsigned long lastUpdateCheck = 0;
  const unsigned long updateCheckInterval = 30 * 60 * 1000; // 30 minutes
  
  // Only check if enough time has passed
  if (millis() - lastUpdateCheck < updateCheckInterval) {
    return;
  }
  
  lastUpdateCheck = millis();
  
  Serial.println("\n[UPDATE] ⏰ Periodic webapp update check...");
  
  if (checkForWebappUpdates()) {
    // Updates available - download them
    if (downloadWebappUpdates()) {
      Serial.println("[UPDATE] 🔄 Webapp updated - restart browser to see changes");
    }
  }
}

// -------------------- Local Web Server --------------------
void setupWebServer() {
  Serial.println("\n[HTTP] Configuring web server...");

  server.on("/", HTTP_GET, []() {
    if (fsAvailable && FFat.exists("/index.html")) {
      File f = FFat.open("/index.html", "r");
      server.streamFile(f, "text/html"); f.close();
    } else {
      server.send(404, "text/plain", "index.html not found (FFat missing?)");
    }
  });

  server.on("/script.js", HTTP_GET, []() {
    if (fsAvailable && FFat.exists("/script.js")) {
      File f = FFat.open("/script.js", "r");
      server.streamFile(f, "application/javascript"); f.close();
    } else {
      server.send(404, "text/plain", "script.js not found");
    }
  });

  server.on("/style.css", HTTP_GET, []() {
    if (fsAvailable && FFat.exists("/style.css")) {
      File f = FFat.open("/style.css", "r");
      server.streamFile(f, "text/css"); f.close();
    } else {
      server.send(404, "text/plain", "style.css not found");
    }
  });

  server.on("/api/status", HTTP_GET, []() {
    DynamicJsonDocument doc(1024);
    doc["device_id"]          = DEVICE_ID;
    doc["device_name"]        = DEVICE_NAME;
    doc["ip"]                 = localIP;
    doc["good_count"]         = productionCounter;
    doc["completed_cycles"]   = completedCycles;
    doc["cycle_in_progress"]  = cycleInProgress;
    doc["average_cycle_time"] = completedCycles > 0 ? totalCycleTime / completedCycles : 0.0;
    doc["first_cycle_time"]   = firstCycleTime;
    doc["last_cycle_time"]    = lastCycleTime;
    doc["start_button_state"] = (int)digitalRead(GPIO_START_BUTTON);
    doc["end_button_state"]   = (int)digitalRead(GPIO_END_BUTTON);
    doc["wifi_connected"]     = wifiConnected;
    doc["server_connected"]   = serverConnected;
    doc["ffat"]               = fsAvailable;
    doc["uptime_ms"]          = (uint32_t)millis();

    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
  });

  server.on("/api/reset", HTTP_POST, []() {
    resetProductionData();
    Serial.println("[API] Production data reset via HTTP");
    server.send(200, "application/json", "{\"status\":\"reset\",\"counter\":0}");
  });
  
  // Get production statistics for webapp form submission
  server.on("/api/production/stats", HTTP_GET, []() {
    DynamicJsonDocument doc(2048);
    doc["good_count"]         = productionCounter;
    doc["completed_cycles"]   = completedCycles;
    doc["average_cycle_time"] = completedCycles > 0 ? totalCycleTime / completedCycles : 0.0;
    doc["first_cycle_time"]   = firstCycleTime;
    doc["last_cycle_time"]    = lastCycleTime;
    doc["cycle_in_progress"]  = cycleInProgress;
    
    // Parse production log JSON string into JSON array
    DynamicJsonDocument logDoc(2048);
    deserializeJson(logDoc, productionLog);
    doc["production_log"] = logDoc.as<JsonArray>();
    
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
  });

  // Check for webapp updates endpoint
  server.on("/api/webapp/check-updates", HTTP_GET, []() {
    Serial.println("[API] Webapp checking for updates...");
    
    DynamicJsonDocument doc(512);
    doc["checking"] = true;
    
    bool updatesAvailable = checkForWebappUpdates();
    doc["updates_available"] = updatesAvailable;
    doc["last_check"] = (uint32_t)millis();
    
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
    
    if (updatesAvailable) {
      Serial.println("[API] ✨ Updates available - webapp will be notified");
    } else {
      Serial.println("[API] ✅ No updates needed");
    }
  });

  // Apply webapp updates endpoint
  server.on("/api/webapp/update", HTTP_POST, []() {
    Serial.println("[API] Webapp requesting update application...");
    
    DynamicJsonDocument doc(512);
    bool success = downloadWebappUpdates();
    
    doc["success"] = success;
    doc["message"] = success ? "Updates applied successfully" : "Update failed";
    doc["timestamp"] = (uint32_t)millis();
    
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
    
    if (success) {
      Serial.println("[API] 🎉 Webapp updates applied - user should refresh browser");
    } else {
      Serial.println("[API] ❌ Webapp update failed");
    }
  });

  // Users data endpoint - serves cached user data for offline use
  server.on("/api/data/users", HTTP_GET, []() {
    if (fsAvailable && FFat.exists("/users.json")) {
      File f = FFat.open("/users.json", "r");
      server.streamFile(f, "application/json");
      f.close();
      Serial.println("[API] Served cached users data");
    } else {
      server.send(404, "application/json", "{\"success\":false,\"error\":\"Users data not available\"}");
    }
  });

  // Save users data endpoint
  server.on("/api/data/users", HTTP_POST, []() {
    if (fsAvailable) {
      String body = server.arg("plain");
      File f = FFat.open("/users.json", "w");
      if (f) {
        f.print("{\"success\":true,\"users\":");
        
        // Parse the incoming JSON to extract just the users array
        DynamicJsonDocument doc(4096);
        deserializeJson(doc, body);
        
        String usersJson;
        serializeJson(doc["users"], usersJson);
        f.print(usersJson);
        f.print("}");
        f.close();
        
        Serial.println("[API] Users data saved to /users.json");
        server.send(200, "application/json", "{\"success\":true,\"message\":\"Users saved\"}");
      } else {
        server.send(500, "application/json", "{\"success\":false,\"error\":\"Failed to save users\"}");
      }
    } else {
      server.send(503, "application/json", "{\"success\":false,\"error\":\"File system not available\"}");
    }
  });

  // Products data endpoint - serves cached product data for offline use  
  server.on("/api/data/products", HTTP_GET, []() {
    if (fsAvailable && FFat.exists("/products.json")) {
      File f = FFat.open("/products.json", "r");
      server.streamFile(f, "application/json");
      f.close();
      Serial.println("[API] Served cached products data");
    } else {
      server.send(404, "application/json", "{\"success\":false,\"error\":\"Products data not available\"}");
    }
  });

  // Save products data endpoint
  server.on("/api/data/products", HTTP_POST, []() {
    if (fsAvailable) {
      String body = server.arg("plain");
      File f = FFat.open("/products.json", "w");
      if (f) {
        f.print("{\"success\":true,\"products\":");
        
        // Parse the incoming JSON to extract just the products array
        DynamicJsonDocument doc(8192);
        deserializeJson(doc, body);
        
        String productsJson;
        serializeJson(doc["products"], productsJson);
        f.print(productsJson);
        f.print("}");
        f.close();
        
        Serial.println("[API] Products data saved to /products.json");
        server.send(200, "application/json", "{\"success\":true,\"message\":\"Products saved\"}");
      } else {
        server.send(500, "application/json", "{\"success\":false,\"error\":\"Failed to save products\"}");
      }
    } else {
      server.send(503, "application/json", "{\"success\":false,\"error\":\"File system not available\"}");
    }
  });

  server.enableCORS(true);
  server.begin();
  Serial.println("[HTTP] ✅ Web server started on port 8080");
}

// -------------------- Production Button Handlers --------------------

void handleStartButton() {
  bool currentState = digitalRead(GPIO_START_BUTTON);
  
  if (lastStartButtonState == HIGH && currentState == LOW) {
    unsigned long now = millis();
    if (now - lastStartButtonPress > DEBOUNCE_DELAY) {
      lastStartButtonPress = now;
      
      // Check if validation is pending
      if (pendingValidation) {
        Serial.println("[START] Validation already in progress, ignoring button press");
        return;
      }
      
      // Request validation from webapp first
      if (serverConnected) {
        Serial.println("[START] Requesting production validation from webapp...");
        String sio = "42[\"validate_production_start\",{}]";
        webSocket.sendTXT(sio);
        
        pendingValidation = true;
        validationRequestTime = now;
        
        // Blink LED once to show validation request
        blinkLED(1);
        
        // Update display to show validation status
        gfx->fillScreen(COLOR_BLACK);
        gfx->setTextColor(COLOR_WHITE);
        gfx->setTextSize(2);
        gfx->setCursor(10, 50);
        gfx->println("Validating...");
        gfx->setCursor(10, 80);
        gfx->println("品番 Check");
      } else {
        // No server connection - proceed anyway but warn
        Serial.println("[START] ⚠️ No server connection - starting without validation");
        startProductionCycle(now);
      }
    }
  }
  
  lastStartButtonState = currentState;
}

void handleEndButton() {
  bool currentState = digitalRead(GPIO_END_BUTTON);
  
  if (lastEndButtonState == HIGH && currentState == LOW) {
    unsigned long now = millis();
    if (now - lastEndButtonPress > DEBOUNCE_DELAY) {
      lastEndButtonPress = now;
      
      // Complete cycle if one was started
      if (cycleInProgress) {
        unsigned long cycleEndTime = now;
        float cycleTime = (cycleEndTime - cycleStartTime) / 1000.0; // Convert to seconds
        
        // Update counters
        productionCounter++;
        completedCycles++;
        totalCycleTime += cycleTime;
        cycleInProgress = false;
        
        // Get cycle times (start time was saved when cycle began)
        String startTime = currentCycleStartTimeStr;
        String endTime = getCurrentTimeString();
        
        // Update first/last cycle times for DB submission
        if (firstCycleTime == "") {
          firstCycleTime = startTime;
        }
        lastCycleTime = endTime;
        
        // Add to production log
        addCycleToLog(cycleTime, startTime, endTime);
        
        Serial.printf("[END] Cycle completed: %.2f seconds, Count: %d\n", cycleTime, productionCounter);
        blinkLED(3); // 3 blinks for end
        displayDeviceInfo();
        
        // Send update to webapp via WebSocket
        sendProductionUpdate();
      } else {
        Serial.println("[END] Button pressed but no active cycle");
        blinkLED(1); // 1 blink for invalid end
      }
    }
  }
  
  lastEndButtonState = currentState;
}

void startProductionCycle(unsigned long timestamp) {
  // Start new cycle
  cycleStartTime = timestamp;
  cycleInProgress = true;
  currentCycleStartTimeStr = getCurrentTimeString();  // Capture Japan time at start
  
  // Reset validation state
  pendingValidation = false;
  validationRequestTime = 0;
  
  Serial.printf("[START] Cycle started at %lu ms (JST: %s)\n", cycleStartTime, currentCycleStartTimeStr.c_str());
  blinkLED(2); // 2 blinks for start
  displayDeviceInfo();
}

void blinkLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(GPIO_LED_PIN, LOW);  // LED ON (active low)
    delay(100);
    digitalWrite(GPIO_LED_PIN, HIGH); // LED OFF
    delay(100);
  }
}

void sendProductionUpdate() {
  // Send to Node.js server via Socket.IO
  if (serverConnected) {
    float avgCycleTime = completedCycles > 0 ? totalCycleTime / completedCycles : 0.0;
    
    DynamicJsonDocument doc(1024);
    doc["type"]              = "production_update";
    doc["device_id"]         = DEVICE_ID;
    doc["good_count"]        = productionCounter;
    doc["average_cycle_time"] = avgCycleTime;
    doc["completed_cycles"]  = completedCycles;
    doc["first_cycle_time"]  = firstCycleTime;
    doc["last_cycle_time"]   = lastCycleTime;
    doc["timestamp"]         = (uint32_t)millis();
    
    String json;
    serializeJson(doc, json);
    String sio = "42[\"message\"," + json + "]";
    webSocket.sendTXT(sio);
    Serial.printf("[WS] Sent production update to server: count=%d, avg=%.2fs\n", productionCounter, avgCycleTime);
  }
  
  // Also broadcast to webapp clients via WebSocket server
  DynamicJsonDocument wsDoc(1024);
  wsDoc["type"] = "production_update";
  wsDoc["device_id"] = DEVICE_ID;
  wsDoc["good_count"] = productionCounter;
  wsDoc["completed_cycles"] = completedCycles;
  wsDoc["cycle_in_progress"] = cycleInProgress;
  wsDoc["average_cycle_time"] = completedCycles > 0 ? totalCycleTime / completedCycles : 0.0;
  wsDoc["first_cycle_time"] = firstCycleTime;
  wsDoc["last_cycle_time"] = lastCycleTime;
  wsDoc["timestamp"] = (uint32_t)millis();
  
  String wsMessage;
  serializeJson(wsDoc, wsMessage);
  wsServer.broadcastTXT(wsMessage);
  Serial.printf("[WSS] Broadcast production update to webapp clients: count=%d\n", productionCounter);
}

void addCycleToLog(float cycleTime, String startTime, String endTime) {
  // Parse existing log
  DynamicJsonDocument logDoc(2048);
  deserializeJson(logDoc, productionLog);
  
  // Add new cycle
  JsonObject cycle = logDoc.createNestedObject();
  cycle["cycle_time"] = cycleTime;
  cycle["initial_time"] = startTime;
  cycle["final_time"] = endTime;
  
  // Serialize back to string
  productionLog = "";
  serializeJson(logDoc, productionLog);
}

// Initialize NTP time synchronization
void initializeNTP() {
  Serial.println("\n[NTP] Initializing time synchronization...");
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER1, NTP_SERVER2, NTP_SERVER3);
  
  // Wait for time synchronization
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 10) {
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  
  if (getLocalTime(&timeinfo)) {
    Serial.println("\n[NTP] ✅ Time synchronized successfully");
    Serial.printf("[NTP] Current Japan time: %02d:%02d:%02d\n", 
                  timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  } else {
    Serial.println("\n[NTP] ❌ Failed to synchronize time");
  }
}

String getCurrentTimeString() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    // Fallback to millis-based time if NTP fails
    unsigned long now = millis();
    int hours = (now / 3600000) % 24;
    int minutes = (now / 60000) % 60;
    int seconds = (now / 1000) % 60;
    
    char timeStr[16];
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", hours, minutes, seconds);
    return String(timeStr);
  }
  
  // Return Japan Standard Time in HH:MM:SS format
  char timeStr[16];
  snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", 
           timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  return String(timeStr);
}

void resetProductionData() {
  productionCounter = 0;
  completedCycles = 0;
  totalCycleTime = 0.0;
  cycleInProgress = false;
  cycleStartTime = 0;
  currentCycleStartTimeStr = "";
  firstCycleTime = "";
  lastCycleTime = "";
  productionLog = "[]";
  
  Serial.println("[RESET] Production data cleared");
  displayDeviceInfo();
  
  // Notify webapp of reset
  sendProductionUpdate();
}

// -------------------- REST Device Registration --------------------
void registerDevice() {
  if (!wifiConnected) return;

  Serial.println("\n[REG] Registering device with server...");
  displayMessage("Registering...", COLOR_YELLOW);

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/device/register-rpi";
  
  // Use appropriate client based on URL protocol
  if (isHTTPS(url)) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure();  // Skip certificate verification for simplicity
    http.begin(*client, url);
  } else {
    WiFiClient *client = new WiFiClient;
    http.begin(*client, url);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-ID", DEVICE_ID);

  DynamicJsonDocument doc(1024);
  doc["device_id"]   = DEVICE_ID;
  doc["company"]     = "KSG";
  doc["device_name"] = DEVICE_NAME;
  doc["device_brand"]= "ESP32";
  doc["owner"]       = "kasugai";
  doc["local_ip"]    = localIP;
  doc["local_port"]  = 8080;
  doc["device_type"] = "esp32_s3";
  doc["status"]      = "online";

  JsonArray caps = doc.createNestedArray("capabilities");
  caps.add("gpio-monitoring");
  caps.add("production-counting");
  caps.add("webapp-hosting");
  caps.add("real-time-updates");

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("[REG] POST %s -> %d\n", url.c_str(), code);
  if (code > 0) {
    String resp = http.getString();
    Serial.printf("[REG] Response: %s\n", resp.c_str());
  }
  http.end();
}

// -------------------- WebSocket Server for Webapp --------------------
void webSocketServerEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WSS] Client #%u disconnected\n", num);
      break;

    case WStype_CONNECTED: {
      IPAddress ip = wsServer.remoteIP(num);
      Serial.printf("[WSS] Client #%u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      
      // Send current status to new client
      DynamicJsonDocument doc(1024);
      doc["type"] = "status_update";
      doc["device_id"] = DEVICE_ID;
      doc["good_count"] = productionCounter;
      doc["completed_cycles"] = completedCycles;
      doc["cycle_in_progress"] = cycleInProgress;
      doc["average_cycle_time"] = completedCycles > 0 ? totalCycleTime / completedCycles : 0.0;
      doc["timestamp"] = (uint32_t)millis();
      
      String message;
      serializeJson(doc, message);
      wsServer.sendTXT(num, message);
      Serial.printf("[WSS] Sent status to client #%u: count=%d\n", num, productionCounter);
      break;
    }

    case WStype_TEXT: {
      String msg = String((char*)payload);
      Serial.printf("[WSS] Client #%u sent: %s\n", num, msg.c_str());
      
      // Parse incoming commands from webapp
      DynamicJsonDocument doc(512);
      DeserializationError error = deserializeJson(doc, msg);
      if (!error) {
        String command = doc["command"] | "";
        
        if (command == "reset_production") {
          resetProductionData();
          Serial.printf("[WSS] Production reset by webapp client #%u\n", num);
          
          // Broadcast reset to all connected clients
          DynamicJsonDocument response(512);
          response["type"] = "production_reset";
          response["device_id"] = DEVICE_ID;
          response["timestamp"] = (uint32_t)millis();
          
          String resetMsg;
          serializeJson(response, resetMsg);
          wsServer.broadcastTXT(resetMsg);
        }
        else if (command == "get_status") {
          // Send current status
          DynamicJsonDocument response(1024);
          response["type"] = "status_update";
          response["device_id"] = DEVICE_ID;
          response["good_count"] = productionCounter;
          response["completed_cycles"] = completedCycles;
          response["cycle_in_progress"] = cycleInProgress;
          response["average_cycle_time"] = completedCycles > 0 ? totalCycleTime / completedCycles : 0.0;
          response["timestamp"] = (uint32_t)millis();
          
          String statusMsg;
          serializeJson(response, statusMsg);
          wsServer.sendTXT(num, statusMsg);
        }
      }
      break;
    }

    case WStype_PING:
      Serial.printf("[WSS] Client #%u ping\n", num);
      break;

    case WStype_PONG:
      Serial.printf("[WSS] Client #%u pong\n", num);
      break;

    default:
      break;
  }
}

void setupWebSocketServer() {
  Serial.println("\n[WSS] Starting WebSocket server on port 81...");
  wsServer.begin();
  wsServer.onEvent(webSocketServerEvent);
  wsServer.enableHeartbeat(15000, 3000, 2);  // ping every 15s, timeout after 3s, 2 missed pings = disconnect
  Serial.println("[WSS] ✅ WebSocket server ready for webapp connections");
}

// -------------------- WebSocket Client / Socket.IO --------------------
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] ❌ Disconnected");
      serverConnected = false;
      displayDeviceInfo();
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] ✅ Connected to: %s\n", (payload ? (char*)payload : ""));
      Serial.println("[WS] Sending Socket.IO connect packet (40)...");
      webSocket.sendTXT("40");
      break;

    case WStype_TEXT: {
      String msg((char*)payload, length);
      Serial.printf("[WS] RX: %s\n", msg.substring(0, min(160, (int)msg.length())).c_str());

      if (msg.startsWith("0{")) { // handshake info
        Serial.println("[WS] Handshake '0{...}' acknowledged");
        return;
      }

      if (msg.startsWith("40")) {
        serverConnected = true;
        Serial.println("[WS] 🔗 Socket.IO connected");
        displayDeviceInfo();

        DynamicJsonDocument jd(300);
        jd["type"]       = "device_online";
        jd["device_id"]  = DEVICE_ID;
        jd["device_name"]= DEVICE_NAME;
        jd["ip"]         = localIP;
        jd["timestamp"]  = (uint32_t)millis();

        String j;
        serializeJson(jd, j);
        String sio = "42[\"message\"," + j + "]";
        webSocket.sendTXT(sio);
        Serial.printf("[WS] Sent device_online: %s\n", j.c_str());
        return;
      }

      if (msg.startsWith("42[\"")) {
        int firstComma  = msg.indexOf(',');
        int lastBracket = msg.lastIndexOf(']');
        if (firstComma > 0 && lastBracket > firstComma) {
          String jsonData = msg.substring(firstComma + 1, lastBracket);
          Serial.printf("[WS] Event payload: %s\n", jsonData.c_str());

          DynamicJsonDocument jd(512);
          DeserializationError err = deserializeJson(jd, jsonData);
          if (!err) {
            String type = jd["type"] | "";
            String command = jd["command"] | "";
            
            if (type == "validation_response") {
              if (pendingValidation) {
                bool isValid = jd["valid"] | false;
                String message = jd["message"] | "";
                
                // Webapp now handles all validation - ESP32 always proceeds with production
                Serial.printf("[VALIDATION] Response: %s (message: %s)\n", 
                              isValid ? "APPROVED" : "WARNING_SHOWN_IN_WEBAPP", message.c_str());
                startProductionCycle(millis());
              }
            } else if (type == "reset_counter") {
              productionCounter = 0;
              Serial.println("[WS] 🔄 Counter reset by server command");
              displayDeviceInfo();
            } else if (command == "reset_all") {
              resetProductionData();
              Serial.println("[WS] 🔄 Production data reset by server command");
            } else if (type == "request_status_sync") {
              Serial.println("[WS] 📊 Status sync request received - sending current production data");
              sendProductionUpdate();
            }
          } else {
            Serial.printf("[WS] JSON parse error: %s\n", err.c_str());
          }
        }
      }

      // Handle direct reset_production events
      if (msg.startsWith("42[\"reset_production\"")) {
        Serial.println("[WS] 🔄 Direct reset_production event received");
        resetProductionData();
        return;
      }

      if (msg == "2") {         // ping
        webSocket.sendTXT("3"); // pong
        Serial.println("[WS] 💓 ping -> pong");
      }
      break;
    }

    case WStype_ERROR:
      Serial.println("[WS] ❌ Error event");
      serverConnected = false;
      break;

    case WStype_PING:
      Serial.println("[WS] (low-level) PING");
      break;

    case WStype_PONG:
      Serial.println("[WS] (low-level) PONG");
      break;

    default:
      break;
  }
}

// -------------------- URL Helper Functions --------------------
String extractHostFromURL(const String& url) {
  String host = url;
  
  // Remove protocol
  if (host.startsWith("https://")) {
    host = host.substring(8);
  } else if (host.startsWith("http://")) {
    host = host.substring(7);
  }
  
  // Remove path if any
  int pathIndex = host.indexOf('/');
  if (pathIndex > 0) {
    host = host.substring(0, pathIndex);
  }
  
  // Remove port if specified in host part
  int portIndex = host.indexOf(':');
  if (portIndex > 0) {
    host = host.substring(0, portIndex);
  }
  
  return host;
}

int extractPortFromURL(const String& url) {
  // Check if port is explicitly specified
  String temp = url;
  
  // Remove protocol
  if (temp.startsWith("https://")) {
    temp = temp.substring(8);
    // Default HTTPS port if no port specified
    int portIndex = temp.indexOf(':');
    if (portIndex > 0) {
      int pathIndex = temp.indexOf('/', portIndex);
      String portStr = (pathIndex > 0) ? temp.substring(portIndex + 1, pathIndex) : temp.substring(portIndex + 1);
      return portStr.toInt();
    }
    return 443; // Default HTTPS port
  } else if (temp.startsWith("http://")) {
    temp = temp.substring(7);
    // Default HTTP port if no port specified
    int portIndex = temp.indexOf(':');
    if (portIndex > 0) {
      int pathIndex = temp.indexOf('/', portIndex);
      String portStr = (pathIndex > 0) ? temp.substring(portIndex + 1, pathIndex) : temp.substring(portIndex + 1);
      return portStr.toInt();
    }
    return 80; // Default HTTP port
  }
  
  return 80; // Default fallback
}

bool isHTTPS(const String& url) {
  return url.startsWith("https://");
}

void setupSocketIO() {
  if (!wifiConnected) { Serial.println("[WS] Skipped (no WiFi)"); return; }

  String host = extractHostFromURL(SERVER_URL);
  int port = extractPortFromURL(SERVER_URL);
  bool useSSL = isHTTPS(SERVER_URL);
  
  Serial.printf("\n[WS] Connecting to %s://%s:%d/socket.io/?EIO=4&transport=websocket\n",
                useSSL ? "wss" : "ws", host.c_str(), port);

  if (useSSL) {
    webSocket.beginSSL(host, port, "/socket.io/?EIO=4&transport=websocket");
  } else {
    webSocket.begin(host, port, "/socket.io/?EIO=4&transport=websocket");
  }
  webSocket.onEvent(webSocketEvent);

  webSocket.setReconnectInterval(5000);        // retry every 5s on drop
  webSocket.enableHeartbeat(15000, 3000, 2);   // ping 15s, wait 3s, 2 misses -> reconnect
  Serial.println("[WS] Client configured");
}

// -------------------- Arduino setup/loop --------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n==============================");
  Serial.println("🚀 KSG ESP32-S3 Production Counter (FFat)");
  Serial.println("==============================");

  logHeap("Boot");

  // Display power + backlight
  GFX_EXTRA_PRE_INIT();
  pinMode(PIN_LCD_BL, OUTPUT);
  digitalWrite(PIN_LCD_BL, HIGH);

  if (!gfx->begin()) {
    Serial.println("[GFX] ❌ init failed");
  } else {
    Serial.println("[GFX] ✅ init ok");
  }
  displayMessage("Initializing...", COLOR_CYAN);
  delay(600);

  // FS
  mountFFat();

  // GPIO for production buttons and LED
  pinMode(GPIO_START_BUTTON, INPUT_PULLUP);
  pinMode(GPIO_END_BUTTON, INPUT_PULLUP);
  pinMode(GPIO_LED_PIN, OUTPUT);
  digitalWrite(GPIO_LED_PIN, HIGH); // LED off

  Serial.printf("[GPIO] Start Button GPIO%d (pull-up, active LOW)\n", GPIO_START_BUTTON);
  Serial.printf("[GPIO] End Button   GPIO%d (pull-up, active LOW)\n", GPIO_END_BUTTON);
  Serial.printf("[GPIO] LED          GPIO%d (active LOW)\n", GPIO_LED_PIN);

  // WiFi + server
  connectToWiFi();

  if (wifiConnected) {
    // Initialize NTP time synchronization
    initializeNTP();
    
    registerDevice();
    setupSocketIO();
    setupWebSocketServer();  // Start WebSocket server for webapp connections
    
    // Smart webapp update system - only download if changed
    Serial.println("\n[SETUP] 🔄 Initializing smart webapp update system...");
    if (checkForWebappUpdates()) {
      downloadWebappUpdates();
    } else {
      // If no updates needed, ensure we still have the files
      bool hasFiles = FFat.exists("/index.html") && FFat.exists("/script.js") && FFat.exists("/style.css");
      if (!hasFiles) {
        Serial.println("[SETUP] 📥 Missing webapp files - downloading initial set...");
        downloadWebAppFiles();
        // Store version info after initial download
        checkForWebappUpdates();
      }
    }
    
    downloadUserData();    // Cache users for offline dropdown
    downloadProductData(); // Cache products for offline auto-fill
    setupWebServer();
  }

  displayDeviceInfo();
  logHeap("Setup done");
  Serial.println("[SYS] 🎯 Loop starting...");
}

void loop() {
  webSocket.loop();     // Handle Socket.IO client connection to server
  wsServer.loop();      // Handle WebSocket server for webapp connections
  server.handleClient();
  
  // Handle production buttons
  handleStartButton();
  handleEndButton();

  // Check for validation timeout
  if (pendingValidation && (millis() - validationRequestTime > VALIDATION_TIMEOUT)) {
    Serial.println("[VALIDATION] Timeout - proceeding without validation");
    pendingValidation = false;
    startProductionCycle(millis());
  }

  // Periodic webapp update check (every 30 minutes)
  checkAndUpdateWebapp();

  // Periodic WiFi check
  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 30000) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] ⚠️ Lost connection, reconnecting...");
      wifiConnected = false;
      connectToWiFi();
      if (wifiConnected && !serverConnected) setupSocketIO();
    }
    lastWiFiCheck = millis();
  }

  // Periodic WS reconnect attempt (in case)
  static unsigned long lastWSCheck = 0;
  if (millis() - lastWSCheck > 15000) {
    if (!serverConnected && wifiConnected) {
      Serial.println("[WS] Reconnect tick...");
      setupSocketIO();
    }
    lastWSCheck = millis();
  }

  delay(8);
}