#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "BuzzerEffects.h"

// ========== WiFi ==========
const char* ssid = "iPhone";
const char* password = "12345679";

// ========== MQTT ==========
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* topic = "n8q4x2m7v9p3k6t1r5z0/command_out";

// ========== Buzzer ==========
const int BUZZER_PIN = 23;
const int DUTY = 128;  // 50% waveform; 255 holds the pin high instead of a tone.

// ========== MQTT Objects ==========
WiFiClient espClient;
PubSubClient client(espClient);

BuzzerEffects buzzerEffects;

void updateBuzzer() {
  static int lastFrequency = -1;
  const int hz = buzzerEffects.frequency(millis());
  if (hz == lastFrequency) return;
  lastFrequency = hz;
  if (hz > 0) {
    ledcWriteTone(BUZZER_PIN, hz);
    ledcWrite(BUZZER_PIN, DUTY);
  } else {
    ledcWrite(BUZZER_PIN, 0);
    ledcWriteTone(BUZZER_PIN, 0);
  }
}

void requestDefense() {
  if (buzzerEffects.defense(millis())) Serial.println("DEFENSE: fixed 5000 ms");
}

void waitWithBuzzer(unsigned long duration) {
  const unsigned long startedAt = millis();
  while (millis() - startedAt < duration) {
    updateBuzzer();
    delay(1);
  }
}

void requestHitSound() {
  if (buzzerEffects.hit(millis())) Serial.println("Being_Attacked: fixed 1000 ms");
}

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

  if (strcmp(doc["type"] | "", "event") == 0 &&
      strcmp(doc["source"] | "", "uno") == 0 &&
      strcmp(doc["action"] | "", "Being_Attacked") == 0) {
    requestHitSound();
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

  // The web joystick sends action at the root; its 500 ms duration is a
  // control-envelope lease and must not determine the buzzer playback time.
  if (strcmp(type, "joystick") == 0 && strcmp(source, "web") == 0) {
    if (strcmp(doc["action"] | "", "DEFENSE") == 0) requestDefense();
    return;
  }

  // Voice results contain a commands array. Every DEFENSE uses the same
  // fixed playback time, including legacy arrays with no duration field.
  JsonArray commands = doc["commands"].as<JsonArray>();

  if (commands.isNull()) {
    Serial.println("ERROR: commands array not found.");
    return;
  }

  for (JsonObject command : commands) {
    const char* action = command["action"] | "";

    Serial.print("Action: ");
    Serial.println(action);

    if (strcmp(action, "DEFENSE") == 0) {
      requestDefense();
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
    waitWithBuzzer(500);
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

      waitWithBuzzer(2000);
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
  client.setSocketTimeout(1);

  Serial.println();
  Serial.println("ESP32 MQTT Buzzer Ready");
  Serial.print("Listening on: ");
  Serial.println(topic);
}

// --------------------------------------------------
// Main loop
// --------------------------------------------------
void loop() {
  updateBuzzer();
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }

  if (!client.connected()) {
    reconnectMQTT();
  }

  client.loop();

  updateBuzzer();
}
