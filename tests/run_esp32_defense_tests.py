"""Host-test the actual ESP32 callback and sound functions with ArduinoJson installed.

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
source = (root / 'clash-tank/esp32buzzer-clashtank.ino').read_text(encoding='utf-8')

def function(name):
    start = re.search(r'void ' + name + r'\([^)]*\)\s*\{', source)
    if not start:
        raise AssertionError(f'Missing firmware function: {name}')
    depth, end = 1, start.end()
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start.start():end]

constant = re.search(r'const unsigned long DEFENSE_DURATION_MS\s*=\s*\d+;', source).group()
harness = r'''
#include <ArduinoJson.h>
#include <cassert>
#include <cstring>
#include <iostream>
using byte = unsigned char;
struct Logger {
  template<class T> void print(const T&) {}
  template<class T> void println(const T&) {}
  void println() {}
} Serial;
const char* topic = "test/command_out";
const int BUZZER_PIN = 23, DUTY = 255;
bool defenseRequested = false, defenseRunning = false;
unsigned long clockMs = 0;
int lastDuty = -1, lastTone = -1;
bool injectDuplicate = false;
void requestDefense();
unsigned long millis() { return clockMs; }
void delay(unsigned long ms) {
  clockMs += ms;
  if (injectDuplicate) { injectDuplicate = false; requestDefense(); }
}
void ledcWriteTone(int, int tone) { lastTone = tone; }
void ledcWrite(int, int duty) { lastDuty = duty; }
'''
harness += '\n' + constant + '\n' + '\n'.join(function(n) for n in ['playDefenseSound', 'requestDefense', 'callback'])
harness += r'''
void send(const char* json, const char* receivedTopic = "test/command_out") {
  callback(const_cast<char*>(receivedTopic), reinterpret_cast<byte*>(const_cast<char*>(json)), strlen(json));
}
void checkDefense(const char* json) {
  defenseRequested = false; defenseRunning = false;
  send(json); assert(defenseRequested);
  defenseRequested = false;
  const auto start = clockMs;
  injectDuplicate = true;
  playDefenseSound();
  assert(clockMs - start == 5000);
  assert(!defenseRequested && !defenseRunning);
  assert(lastDuty == 0 && lastTone == 0);
}
int main() {
  checkDefense(R"({"type":"joystick","source":"web","session":"joy-A","seq":1,"action":"DEFENSE","duration":500})");
  checkDefense(R"({"type":"joystick","source":"web","action":"DEFENSE","duration":60000})");
  checkDefense(R"({"type":"joystick","source":"web","action":"DEFENSE","duration":0})");
  checkDefense(R"({"type":"voice","source":"voice","commands":[{"action":"DEFENSE","duration":1000}]})");
  checkDefense(R"({"commands":[{"action":"DEFENSE","duration":60000}]})");
  checkDefense(R"({"commands":[{"action":"DEFENSE"},{"action":"DEFENSE","duration":"invalid"}]})");
  defenseRequested = false;
  send(R"({"type":"joystick","source":"web","action":"ATTACK"})"); assert(!defenseRequested);
  send(R"({"type":"joystick","source":"wrong","action":"DEFENSE"})"); assert(!defenseRequested);
  send(R"({"commands":[{"action":"DEFENSE"}]})", "wrong/topic"); assert(!defenseRequested);
  send("invalid JSON"); assert(!defenseRequested);
  std::cout << "PASS: voice + joystick defense always 5000 ms; duration ignored; duplicates while busy ignored; buzzer off afterward; unrelated/invalid packets ignored\n";
}
'''
build = root / 'node_modules/.cache/esp32-defense-tests'
build.mkdir(parents=True, exist_ok=True)
cpp = build / 'defense_test.cpp'
binary = build / ('defense_test.exe' if os.name == 'nt' else 'defense_test')
cpp.write_text(harness, encoding='utf-8')
subprocess.run([compiler, '-std=c++17', '-I' + str(args.arduinojson / 'src'), str(cpp), '-o', str(binary)], check=True)
subprocess.run([str(binary)], check=True)
