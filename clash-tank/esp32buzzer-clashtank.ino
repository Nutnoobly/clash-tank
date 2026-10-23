#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ========== WiFi ==========
const char* ssid = "iPhone";
const char* password = "12345679";

// ========== MQTT ==========
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* topic = "n8q4x2m7v9p3k6t1r5z0/command_out";

// ========== Buzzer ==========
const int BUZZER_PIN = 23;
const int DUTY = 255;  // 8-bit duty: 0-255

// ========== MQTT Objects ==========
WiFiClient espClient;
PubSubClient client(espClient);

// ========== Defense State ==========
bool defenseRequested = false;
bool defenseRunning = false;

unsigned long defenseDuration = 10000;

// --------------------------------------------------
// Play DEFENSE sound for the requested duration
// --------------------------------------------------

void playDefenseSound(unsigned long duration) {
  defenseRunning = true;

  Serial.println();
  Serial.println("========== DEFENSE ==========");
  Serial.print("Duration: ");
  Serial.print(duration);
  Serial.println(" ms");

  unsigned long startTime = millis();

  int hz = 0;
  int direction = 100;

  while (millis() - startTime < duration) {

    if (hz <= 0) {
      hz = 0;
      ledcWrite(BUZZER_PIN, 0);  // Silence at 0 Hz
    } else {
      ledcWriteTone(BUZZER_PIN, hz);
      ledcWrite(BUZZER_PIN, DUTY);
    }

    Serial.print("Frequency: ");
    Serial.print(hz);
    Serial.println(" Hz");

    delay(10);  // Faster frequency sweep

    hz += direction;

    if (hz >= 5000) {
      hz = 5000;
      direction = -100;
    } else if (hz <= 0) {
      hz = 0;
      direction = 100;
    }
  }

  ledcWrite(BUZZER_PIN, 0);
  ledcWriteTone(BUZZER_PIN, 0);

  Serial.println("Buzzer OFF");
  Serial.println("Defense sound completed.");
  Serial.println("=============================");

  defenseRunning = false;
}


// --------------------------------------------------
// MQTT callback
// --------------------------------------------------
void callback(char* receivedTopic, byte* payload, unsigned int length) {
  Serial.println();
  Serial.println("========== MQTT RECEIVED ==========");

  Serial.print("Topic: ");
  Serial.println(receivedTopic);

  Serial.print("Message: ");
  for (unsigned int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();

  if (strcmp(receivedTopic, topic) != 0) {
    Serial.println("Ignored: incorrect topic.");
    return;
  }

  // Parse JSON
  JsonDocument doc;

  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.print("JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  // Display message metadata
  const char* type = doc["type"] | "";
  const char* source = doc["source"] | "";
  const char* session = doc["session"] | "";
  int seq = doc["seq"] | 0;

  Serial.print("Type: ");
  Serial.println(type);

  Serial.print("Source: ");
  Serial.println(source);

  Serial.print("Session: ");
  Serial.println(session);

  Serial.print("Sequence: ");
  Serial.println(seq);

  // Read commands array
  JsonArray commands = doc["commands"].as<JsonArray>();

  if (commands.isNull()) {
    Serial.println("ERROR: commands array not found.");
    return;
  }

  for (JsonObject command : commands) {
    const char* action = command["action"] | "";

    // แก้ไขตรงนี้: ใช้ defenseDuration เป็นค่าสำรอง (ถ้าใน JSON ไม่ได้ส่ง duration มา จะคงค่า 10000 ไว้)
    unsigned long duration = command["duration"] | defenseDuration;

    Serial.print("Action: ");
    Serial.println(action);

    Serial.print("Duration: ");
    Serial.print(duration);
    Serial.println(" ms");

    if (strcmp(action, "DEFENSE") == 0) {
      if (!defenseRunning && !defenseRequested) {
        defenseDuration = duration;
        defenseRequested = true;

        Serial.println("DEFENSE queued successfully!");
      } else {
        Serial.println("DEFENSE already running/queued.");
      }
    } else {
      Serial.println("Unknown action.");
    }
  }

  Serial.println("===================================");
}

// --------------------------------------------------
// Connect to WiFi
// --------------------------------------------------
void setupWiFi() {
  Serial.print("Connecting to WiFi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

// --------------------------------------------------
// Reconnect to MQTT
// --------------------------------------------------
void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Connecting to MQTT...");

    String clientId = "ESP32-Buzzer-";
    clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("connected!");

      if (client.subscribe(topic)) {
        Serial.print("Subscribed to: ");
        Serial.println(topic);
      } else {
        Serial.println("Subscribe failed!");
      }
    } else {
      Serial.print("Failed, MQTT state = ");
      Serial.println(client.state());

      delay(2000);
    }
  }
}

// --------------------------------------------------
// Setup
// --------------------------------------------------
void setup() {
  Serial.begin(115200);

  // ESP32 Arduino Core 3.x LEDC API
  if (!ledcAttach(BUZZER_PIN, 1000, 8)) {
    Serial.println("ERROR: LEDC attach failed!");
  }

  ledcWrite(BUZZER_PIN, 0);

  setupWiFi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setBufferSize(1024);

  Serial.println();
  Serial.println("ESP32 MQTT Buzzer Ready");
  Serial.print("Listening on: ");
  Serial.println(topic);
}

// --------------------------------------------------
// Main loop
// --------------------------------------------------
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }

  if (!client.connected()) {
    reconnectMQTT();
  }

  client.loop();

  // Play DEFENSE using duration from MQTT
  if (defenseRequested && !defenseRunning) {
    defenseRequested = false;
    playDefenseSound(defenseDuration);
  }
}