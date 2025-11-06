/*
 * ESP32 Socket.IO Fix - Updated configuration for stable connection
 * 
 * Key changes:
 * 1. Use EIO=3 (better Arduino library compatibility)
 * 2. Longer ping intervals
 * 3. Better error handling
 * 4. Proper event format for Arduino SocketIOclient
 */

// Updated setupSocketIO function
void setupSocketIO() {
    Serial.println("🔌 Setting up Socket.IO connection...");
    Serial.printf("🔗 Connecting to: %s:%d/socket.io/\n", SERVER_HOST, SERVER_PORT);
    
    // � Use EIO=3 for better Arduino library compatibility
    Serial.println("🔄 Attempting Socket.IO connection with EIO=3...");
    
    // Connect with EIO=3 and longer timeouts
    socketIO.begin(SERVER_HOST, SERVER_PORT, "/socket.io/?EIO=3");
    
    // � Configure connection parameters for stability
    socketIO.setReconnectInterval(5000);   // 5 second reconnect interval
    
    // Event handlers with improved debugging
    socketIO.onEvent([](socketIOmessageType_t type, uint8_t * payload, size_t length) {
        String payloadStr = "";
        if (payload && length > 0) {
            payloadStr = String((char*)payload).substring(0, length);
        }
        
        switch(type) {
            case sIOtype_DISCONNECT:
                Serial.println("🔌 Socket.IO Disconnected");
                serverConnected = false;
                displayDeviceInfo(); // Update display immediately
                break;
                
            case sIOtype_CONNECT:
                Serial.println("🔌 Socket.IO Connected successfully!");
                serverConnected = true;
                displayDeviceInfo(); // Update display immediately
                
                // � Send device info using proper JSON message format
                sendDeviceOnlineMessage();
                break;
                
            case sIOtype_EVENT:
                {
                    Serial.println("📨 Received event: " + payloadStr);
                    
                    // Parse JSON response
                    DynamicJsonDocument doc(512);
                    DeserializationError error = deserializeJson(doc, payloadStr);
                    
                    if (!error) {
                        String eventType = doc[0]; // First element is usually event name
                        
                        if (eventType == "reset_counter") {
                            productionCounter = 0;
                            Serial.println("🔄 Counter reset by server command");
                            displayDeviceInfo();
                        } else if (eventType == "device_registered") {
                            Serial.println("✅ Device registration confirmed by server");
                        }
                    }
                }
                break;
                
            case sIOtype_ERROR:
                Serial.printf("❌ Socket.IO Error: %s\n", payloadStr.c_str());
                serverConnected = false;
                displayDeviceInfo();
                break;
                
            case sIOtype_ACK:
                Serial.printf("✅ Socket.IO ACK: %s\n", payloadStr.c_str());
                break;
                
            default:
                Serial.printf("❓ Unknown Socket.IO event type: %d, payload: %s\n", type, payloadStr.c_str());
                break;
        }
    });
}

// � Separate function to send device online message in proper format
void sendDeviceOnlineMessage() {
    DynamicJsonDocument doc(300);
    doc["type"] = "device_online";
    doc["device_id"] = DEVICE_ID;
    doc["device_name"] = DEVICE_NAME;
    doc["ip"] = localIP;
    doc["timestamp"] = millis();
    
    String message;
    serializeJson(doc, message);
    
    // � Send as 'message' event (what server expects)
    socketIO.emit("message", message);
    Serial.println("📤 Sent device online message: " + message);
}

// � Updated button press handler with better Socket.IO messaging
void handleButtonPress() {
    currentGPIOState = digitalRead(GPIO_INPUT_PIN);
    
    // Detect falling edge (button press) with debounce
    if (lastGPIOState == HIGH && currentGPIOState == LOW) {
        unsigned long currentTime = millis();
        
        if (currentTime - lastButtonPress > DEBOUNCE_DELAY) {
            // Valid button press detected
            productionCounter++;
            lastButtonPress = currentTime;
            
            Serial.printf("🔘 Button pressed! Counter: %d\n", productionCounter);
            
            // Light up LED briefly
            digitalWrite(GPIO_LED_PIN, LOW);  // LED on (active low)
            
            // Update display
            displayDeviceInfo();
            
            // � Send to web interface via Socket.IO with proper message format
            if (serverConnected) {
                DynamicJsonDocument doc(300);
                doc["type"] = "production_count";
                doc["device_id"] = DEVICE_ID;
                doc["count"] = productionCounter;
                doc["timestamp"] = currentTime;
                
                String message;
                serializeJson(doc, message);
                
                // � Send as 'message' event (what server expects)
                socketIO.emit("message", message);
                Serial.println("📤 Sent count update: " + message);
            } else {
                Serial.println("⚠️ Socket.IO not connected - count update not sent");
            }
            
            // Turn off LED after 200ms
            delay(200);
            digitalWrite(GPIO_LED_PIN, HIGH);  // LED off
        }
    }
    
    lastGPIOState = currentGPIOState;
}