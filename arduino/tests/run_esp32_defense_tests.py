"""Host-test actual UNO IR publishing, ESP32 callback, and sound timing.

No board or MQTT connection is used. Pass --arduinojson for its library directory.
"""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--arduinojson', type=Path, default=Path.home() / 'Documents/Arduino/libraries/ArduinoJson')
args = parser.parse_args()
compiler = shutil.which('g++') or ('C:/msys64/ucrt64/bin/g++.exe' if os.name == 'nt' else None)
if not compiler or not (args.arduinojson / 'src/ArduinoJson.h').exists():
    raise SystemExit('Requires g++ and ArduinoJson 7; specify --arduinojson <library directory>.')
source = (root / 'esp32buzzer-clashtank/esp32buzzer-clashtank.ino').read_text(encoding='utf-8')

def function(name):
    start = re.search(r'void ' + name + r'\([^)]*\)\s*\{', source)
    if not start:
        raise AssertionError(f'Missing firmware function: {name}')
    depth, end = 1, start.end()
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start.start():end]

harness = r'''
#include <ArduinoJson.h>
#include "BuzzerEffects.h"
#include "ProximityTrigger.h"
#include <cassert>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>
using byte = unsigned char;
struct Logger {
  template<class T> void print(const T&) {}
  template<class T> void println(const T&) {}
  void println() {}
} Serial;
const char* topic = "test/command_out";
const int BUZZER_PIN = 23, DUTY = 128, IR_SENSOR_PIN = 0, LOW = 0;
BuzzerEffects buzzerEffects;
ProximityTrigger irTrigger;
uint32_t clockMs = 0;
int lastDuty = -1, lastTone = -1;
int sensorLevel = 1;
bool online = true;
unsigned long millis() { return clockMs; }
void delay(unsigned long ms) { clockMs += ms; }
int digitalRead(int) { return sensorLevel; }
bool wifiConnected() { return online; }
void logMessage(const char*) {}
struct Client {
  std::vector<std::string> packets;
  bool connected() { return online; }
  bool publish(const char* t, const char* message, bool retained) {
    assert(strcmp(t, topic) == 0 && !retained);
    packets.emplace_back(message); return true;
  }
} client;
void ledcWriteTone(int, int tone) { lastTone = tone; }
void ledcWrite(int, int duty) { lastDuty = duty; }
'''
harness += '\n' + '\n'.join(function(n) for n in ['updateBuzzer', 'waitWithBuzzer', 'requestDefense', 'requestHitSound', 'callback'])
source = (root / 'clashtank/clashtank.ino').read_text(encoding='utf-8')
harness += '\n' + '\n'.join(function(n) for n in ['pollIRHit', 'attackDelay'])
harness += r'''
void send(const char* json, const char* receivedTopic = "test/command_out") {
  callback(const_cast<char*>(receivedTopic), reinterpret_cast<byte*>(const_cast<char*>(json)), strlen(json));
}
void checkDefense(const char* json) {
  buzzerEffects = BuzzerEffects();
  send(json);
  const auto start = clockMs;
  clockMs = start + 100; updateBuzzer(); assert(lastTone > 0 && lastDuty == DUTY);
  clockMs = start + 4990; updateBuzzer(); assert(lastTone > 0);
  clockMs = start + 5000; updateBuzzer();
  assert(lastDuty == 0 && lastTone == 0);
}
int main() {
  checkDefense(R"({"type":"joystick","source":"web","session":"joy-A","seq":1,"action":"DEFENSE","duration":500})");
  checkDefense(R"({"type":"joystick","source":"web","action":"DEFENSE","duration":60000})");
  checkDefense(R"({"type":"joystick","source":"web","action":"DEFENSE","duration":0})");
  checkDefense(R"({"type":"voice","source":"voice","commands":[{"action":"DEFENSE","duration":1000}]})");
  checkDefense(R"({"commands":[{"action":"DEFENSE","duration":60000}]})");
  checkDefense(R"({"commands":[{"action":"DEFENSE"},{"action":"DEFENSE","duration":"invalid"}]})");
  send(R"({"type":"joystick","source":"web","action":"ATTACK"})"); updateBuzzer(); assert(lastTone == 0);
  send(R"({"type":"joystick","source":"wrong","action":"DEFENSE"})"); updateBuzzer(); assert(lastTone == 0);
  send(R"({"commands":[{"action":"DEFENSE"}]})", "wrong/topic"); updateBuzzer(); assert(lastTone == 0);
  send("invalid JSON"); updateBuzzer(); assert(lastTone == 0);
  send(R"({"type":"event","source":"web","action":"Being_Attacked"})"); updateBuzzer(); assert(lastTone == 0);
  ProximityTrigger bounce;
  assert(!bounce.update(true, 0)); assert(!bounce.update(false, 10));
  assert(!bounce.update(true, 20)); assert(!bounce.update(true, 49));
  assert(bounce.update(true, 50));
  // Actual UNO publisher: LOW for 30 ms, held object, and high-to-low rearm.
  clockMs = 0; pollIRHit(); sensorLevel = LOW; pollIRHit();
  clockMs = 29; pollIRHit(); assert(client.packets.empty());
  clockMs = 30; pollIRHit(); assert(client.packets.size() == 1);
  clockMs = 100; pollIRHit(); assert(client.packets.size() == 1);
  // Replay the actual UNO JSON through the actual ESP32 callback.
  send(client.packets[0].c_str()); updateBuzzer(); assert(lastTone == 2500);
  clockMs = 600; send(client.packets[0].c_str()); // Duplicate cannot extend sound.
  clockMs = 1099; updateBuzzer(); assert(lastTone == 2500);
  clockMs = 1100; updateBuzzer(); assert(lastTone == 0 && lastDuty == 0);
  send(client.packets[0].c_str()); updateBuzzer(); assert(lastTone == 2500);
  waitWithBuzzer(1000); updateBuzzer(); assert(lastTone == 0);
  requestDefense(); clockMs += 200; updateBuzzer(); assert(lastTone > 0);
  send(client.packets[0].c_str()); updateBuzzer(); assert(lastTone == 2500);
  requestDefense(); // Defense cannot replace an active hit.
  clockMs += 1000; updateBuzzer(); assert(lastTone == 0);
  sensorLevel = 1; pollIRHit(); clockMs += 30; pollIRHit();
  sensorLevel = LOW; pollIRHit(); clockMs += 30; pollIRHit(); assert(client.packets.size() == 2);
  sensorLevel = 1; pollIRHit(); clockMs += 30; pollIRHit();
  online = false; sensorLevel = LOW; pollIRHit(); clockMs += 30; pollIRHit();
  online = true; clockMs += 100; pollIRHit(); assert(client.packets.size() == 2);
  // Poll the sensor during the servo's existing delays as well.
  sensorLevel = 1; pollIRHit(); attackDelay(31);
  sensorLevel = LOW; attackDelay(31); assert(client.packets.size() == 3);
  BuzzerEffects wrap; wrap.hit(0xfffffff0U); assert(wrap.frequency(0x10U) == 2500);
  assert(wrap.frequency(uint32_t(0xfffffff0U + 1000U)) == 0);
  ProximityTrigger edge; assert(!edge.update(true, 0xfffffff0U)); assert(edge.update(true, 0x10U));
  std::cout << "PASS: UNO active-low A0 -> non-retained Being_Attacked -> ESP32 1000 ms; debounce/rearm/offline/servo polling; defense 5000 ms; hit priority; duplicate suppression; timer wrap\n";
}
'''
build = root / '.build/esp32-defense-tests'
build.mkdir(parents=True, exist_ok=True)
cpp = build / 'defense_test.cpp'
binary = build / ('defense_test.exe' if os.name == 'nt' else 'defense_test')
cpp.write_text(harness, encoding='utf-8')
subprocess.run([compiler, '-std=c++17', '-I' + str(args.arduinojson / 'src'),
                '-I' + str(root / 'esp32buzzer-clashtank'), '-I' + str(root / 'clashtank'),
                str(cpp), '-o', str(binary)], check=True)
subprocess.run([str(binary)], check=True)
