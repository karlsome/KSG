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
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <Arduino_GFX_Library.h>
#include <SPI.h>
#include <FFat.h>  // FATFS backend (matches LilyGO partition)

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
WebSocketsClient webSocket;

// -------------------- Device configuration --------------------
const char* DEVICE_ID   = "6C10F6";
const char* DEVICE_NAME = "6C10F6";
const char* SERVER_HOST = "192.168.0.64";   // <-- your server IP/host
const int   SERVER_PORT = 3000;

// -------------------- GPIO --------------------
const int GPIO_INPUT_PIN = 1;   // Button input (active LOW, pull-up)
const int GPIO_LED_PIN   = 2;   // LED output (active LOW)

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

bool lastGPIOState     = HIGH;
bool currentGPIOState  = HIGH;
unsigned long lastButtonPress = 0;
const unsigned long DEBOUNCE_DELAY = 50;

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
void setupWebServer();
void setupSocketIO();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleButtonPress();
void registerDevice();
bool downloadFile(const String& url, const String& path);
void downloadWebAppFiles();
void downloadUserData();
void downloadProductData();

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
  gfx->printf("GPIO1: %s", digitalRead(GPIO_INPUT_PIN) ? "HIGH" : "LOW");

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
  http.begin(url);
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
    String url  = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/webapp/" + files[i];
    String path = "/" + String(files[i]);
    downloadFile(url, path);
  }
}

// Download and cache user data for offline use
void downloadUserData() {
  Serial.println("\n[DL] Downloading users data for offline backup...");
  if (!wifiConnected) { Serial.println("[DL] ❌ No WiFi for users data."); return; }
  
  HTTPClient http;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/users/KSG";
  Serial.printf("[DL] GET %s\n", url.c_str());
  
  http.begin(url);
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
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/products/KSG";
  Serial.printf("[DL] GET %s\n", url.c_str());
  
  http.begin(url);
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
    DynamicJsonDocument doc(512);
    doc["device_id"]        = DEVICE_ID;
    doc["device_name"]      = DEVICE_NAME;
    doc["ip"]               = localIP;
    doc["counter"]          = productionCounter;
    doc["gpio1_state"]      = (int)digitalRead(GPIO_INPUT_PIN);
    doc["wifi_connected"]   = wifiConnected;
    doc["server_connected"] = serverConnected;
    doc["ffat"]             = fsAvailable;
    doc["uptime_ms"]        = (uint32_t)millis();

    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
  });

  server.on("/api/reset", HTTP_POST, []() {
    productionCounter = 0;
    Serial.println("[API] Counter reset via HTTP");
    displayDeviceInfo();
    server.send(200, "application/json", "{\"status\":\"reset\",\"counter\":0}");
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

// -------------------- Button / Counter --------------------
void handleButtonPress() {
  currentGPIOState = digitalRead(GPIO_INPUT_PIN);

  if (lastGPIOState == HIGH && currentGPIOState == LOW) {
    unsigned long now = millis();
    if (now - lastButtonPress > DEBOUNCE_DELAY) {
      productionCounter++;
      lastButtonPress = now;

      Serial.printf("[BTN] Press detected. Counter = %d\n", productionCounter);
      digitalWrite(GPIO_LED_PIN, LOW);  // LED ON (active low)
      displayDeviceInfo();

      if (serverConnected) {
        DynamicJsonDocument doc(200);
        doc["type"]      = "production_count";
        doc["device_id"] = DEVICE_ID;
        doc["count"]     = productionCounter;
        doc["timestamp"] = (uint32_t)millis();

        String json;
        serializeJson(doc, json);
        String sio = "42[\"message\"," + json + "]";
        webSocket.sendTXT(sio);
        Serial.printf("[WS] Sent count update: %s\n", json.c_str());
      } else {
        Serial.println("[WS] (not connected) skip send");
      }

      delay(180);
      digitalWrite(GPIO_LED_PIN, HIGH); // LED OFF
    }
  }
  lastGPIOState = currentGPIOState;
}

// -------------------- REST Device Registration --------------------
void registerDevice() {
  if (!wifiConnected) return;

  Serial.println("\n[REG] Registering device with server...");
  displayMessage("Registering...", COLOR_YELLOW);

  HTTPClient http;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/device/register-rpi";
  http.begin(url);
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

// -------------------- WebSocket / Socket.IO --------------------
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
            if (type == "reset_counter") {
              productionCounter = 0;
              Serial.println("[WS] 🔄 Counter reset by server command");
              displayDeviceInfo();
            }
          } else {
            Serial.printf("[WS] JSON parse error: %s\n", err.c_str());
          }
        }
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

void setupSocketIO() {
  if (!wifiConnected) { Serial.println("[WS] Skipped (no WiFi)"); return; }

  Serial.printf("\n[WS] Connecting to ws://%s:%d/socket.io/?EIO=4&transport=websocket\n",
                SERVER_HOST, SERVER_PORT);

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/socket.io/?EIO=4&transport=websocket");
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

  // GPIO
  pinMode(GPIO_INPUT_PIN, INPUT_PULLUP);
  pinMode(GPIO_LED_PIN, OUTPUT);
  digitalWrite(GPIO_LED_PIN, HIGH); // LED off

  Serial.printf("[GPIO] Input GPIO%d (pull-up, active LOW)\n", GPIO_INPUT_PIN);
  Serial.printf("[GPIO] LED   GPIO%d (active LOW)\n", GPIO_LED_PIN);

  // WiFi + server
  connectToWiFi();

  if (wifiConnected) {
    registerDevice();
    setupSocketIO();
    downloadWebAppFiles();
    downloadUserData();    // Cache users for offline dropdown
    downloadProductData(); // Cache products for offline auto-fill
    setupWebServer();
  }

  displayDeviceInfo();
  logHeap("Setup done");
  Serial.println("[SYS] 🎯 Loop starting...");
}

void loop() {
  webSocket.loop();
  server.handleClient();
  handleButtonPress();

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