
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "ControlSession.h"

// ========== WiFi ==========
const char* ssid = "iPhone";
const char* password = "12345679";

// ========== MQTT ==========
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* topic = "n8q4x2m7v9p3k6t1r5z0/command_out";

// ========== Buzzer ==========
const int BUZZER_PIN = 23;
const int DUTY = 50;  // 8-bit duty

// ========== MQTT Objects ==========
WiFiClient espClient;
PubSubClient client(espClient);

// ========== Defense State ==========
bool defenseRequested = false;
bool defenseRunning = false;
ControlSession controlSession;

// --------------------------------------------------
// Play buzzer sweep up and down exactly one cycle
// --------------------------------------------------
void playDefenseSound() {
  defenseRunning = true;

  Serial.println();
  Serial.println("========== DEFENSE ==========");
  Serial.println("Playing buzzer sweep UP");

  // Sweep frequency up: 100 -> 5000 Hz
  for (int hz = 100; hz <= 5000; hz += 100) {
    ledcWriteTone(BUZZER_PIN, hz);
    ledcWrite(BUZZER_PIN, DUTY);

    Serial.print("Frequency: ");
    Serial.print(hz);
    Serial.println(" Hz");

    delay(100);
  }

  Serial.println("Playing buzzer sweep DOWN");

  // Sweep frequency down: 5000 -> 100 Hz
  for (int hz = 5000; hz >= 100; hz -= 100) {
    ledcWriteTone(BUZZER_PIN, hz);
    ledcWrite(BUZZER_PIN, DUTY);

    Serial.print("Frequency: ");
    Serial.print(hz);
    Serial.println(" Hz");

    delay(100);
  }

  // Turn buzzer off
  ledcWrite(BUZZER_PIN, 0);
  ledcWriteTone(BUZZER_PIN, 0);

  Serial.println("Buzzer OFF");
  Serial.println("Defense sound completed.");
  Serial.println("=============================");

  defenseRunning = false;
}

// --------------------------------------------------
// MQTT callback: parse JSON commands
// --------------------------------------------------
void callback(char* receivedTopic, byte* payload,
              unsigned int length) {
  // Ignore messages from other topics
  if (strcmp(receivedTopic, topic) != 0) {
    return;
  }

  // Parse JSON
  JsonDocument doc;

  DeserializationError error =
      deserializeJson(doc, payload, length);

  if (error) {
    Serial.print("JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  const char* type = doc["type"] | "";
  const char* source = doc["source"] | "";
  const char* session = doc["session"] | "";
  if (!doc["type"].is<const char*>() && strcmp(doc["action"] | "", "STOP") == 0) {
    controlSession.invalidate();
    defenseRequested = false;
    return;
  }
  if (strcmp(type, "control") == 0 && strcmp(source, "web") == 0) {
    const char* mode = doc["mode"] | "";
    if ((strcmp(mode, "voice") == 0 || strcmp(mode, "joystick") == 0) &&
        controlSession.begin(session, strcmp(mode, "joystick") == 0, millis())) defenseRequested = false;
    return;
  }
  if (!doc["seq"].is<uint32_t>()) return;
  uint32_t sequence = doc["seq"].as<uint32_t>();
  if (strcmp(type, "stop") == 0 && strcmp(source, "web") == 0) {
    if (strcmp(doc["action"] | "", "STOP") == 0 && controlSession.acceptStop(session, sequence)) defenseRequested = false;
    return;
  }
  // Joystick refreshes share this topic; ignore them without flooding Serial.
  if (strcmp(type, "voice") != 0 || strcmp(source, "voice") != 0 ||
      !controlSession.acceptVoice(session, sequence)) return;

  // Read commands array
  JsonArray commands = doc["commands"].as<JsonArray>();

  if (commands.isNull()) {
    Serial.println("No commands array found.");
    return;
  }

  for (JsonObject command : commands) {
    const char* action = command["action"] | "";

    Serial.print("Action received: ");
    Serial.println(action);

    if (strcmp(action, "DEFENSE") == 0) {
      if (!defenseRunning && !defenseRequested) {
        defenseRequested = true;
        Serial.println("DEFENSE queued!");
      } else {
        Serial.println("DEFENSE already running/queued.");
      }
    }
  }
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
}

// --------------------------------------------------
// Main loop
// --------------------------------------------------
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    controlSession.invalidate();
    defenseRequested = false;
    setupWiFi();
  }

  if (!client.connected()) {
    controlSession.invalidate();
    defenseRequested = false;
    reconnectMQTT();
  }

  client.loop();

  // Play once for each received DEFENSE command
  if (defenseRequested && !defenseRunning) {
    defenseRequested = false;
    playDefenseSound();
  }
}
