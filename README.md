# Clash Tank

Thai/English voice and joystick tank controller using React, MQTT, a Python/Ollama translator, Arduino UNO R4 WiFi motors, and an ESP32 buzzer.

**[Open the web controller](https://clash-tank.vercel.app/)** — hosted on Vercel. The Python backend and ESP32 run separately; the website does not host them.

## Use the controller

1. Open the website on your phone. It connects automatically using saved settings; the default broker is `wss://broker.hivemq.com:8884/mqtt`.
2. The dark “กำลังเชื่อมต่อ” modal blocks touch and keyboard controls until MQTT connects. Failed or lost connections retry after 2.5 seconds; returning online triggers an immediate attempt. Reconnecting never replays motion commands.
3. Select Thai or English and tap the microphone. A completed utterance sends automatically; low-confidence speech requires editing or repeating. Tap **พิมพ์คำสั่ง** for text entry, then **ส่งคำสั่ง**.

While connected, **Settings** lets you save a different broker WSS URL, credentials, voice topic, and command topic. Python and both boards must use the same broker and matching topics.

Settings and the last three submitted messages stay in browser-local storage; passwords stay in memory only. Offline messages are not queued. **ส่งแล้ว** means submitted, not executed by the vehicle.

### Direct joystick control

The controller opens in **เสียง** (voice) mode. After automatic connection, select **จอย** in the header. Tap or drag to select forward, backward, rotate left, or rotate right. Releasing keeps that direction selected; tap or drag into the center to stop. Arrow keys also select directions; Escape or Home returns to center.

Microphone, language/mode switches, and joystick use the approved dark neumorphic Figma design. **โจมตี** sends one direct `ATTACK` packet after claiming a fresh joystick session, cancels movement heartbeats, and centers the joystick. The browser waits 2.5 seconds before accepting another attack or direction, allowing for the UNO's approximately 2.2-second blocking servo cycle. Submission is not hardware acknowledgement. Movement never resumes automatically; select a new direction afterward. The UNO must have the firmware supporting joystick `ATTACK` uploaded. **ป้องกัน** remains disabled because the ESP32 does not yet accept direct joystick defense packets.

Joystick commands publish directly to `n8q4x2m7v9p3k6t1r5z0/command_out`, bypassing Python/LLM. Motion refreshes every 150 ms with a fixed 500 ms lease. The UNO stops and invalidates the joystick session when its lease expires. Refreshing the same direction does not stop/restart the motors. Switching modes, opening settings, hiding the page, losing focus in joystick mode, or disconnecting cancels the heartbeat and attempts STOP. Reconnecting always starts centered and requires a new selection. A frozen browser timer also disarms instead of resuming automatically.

**หยุดรถ** and the joystick center now send STOP directly on `command_out`, without Python/LLM. The UI reports broker connection and local submission, not vehicle acknowledgement. The 500 ms joystick watchdog is checked by the firmware loop, not a hardware real-time timer; blocking Wi-Fi/MQTT operations can delay it (MQTT socket reads use a 1-second timeout). Voice queues still use their per-command durations. See [CONTROL_PROTOCOL.md](CONTROL_PROTOCOL.md) for packet formats and hardware validation steps.

## Run locally

### Web controller

Requires Node.js 22.12+.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/`. Phone microphone access requires HTTPS with a trusted certificate; use the hosted controller instead of a LAN HTTP address.

```bash
npm test          # Controller logic tests
npm run build    # Production files in dist/
npm run preview  # Preview the build
python -m unittest discover -s tests -p 'test_*.py'
python tests/run_firmware_tests.py  # Requires g++ or clang++
```

Deploy only `dist/` to a static host. Never deploy `.env` or backend credentials.

### Python translator

Install Ollama, download the configured model, and keep the Ollama service running (`ollama serve` if not already running):

```bash
ollama pull qwen2.5:3b
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Set the broker, credentials, topics, and Ollama settings in `.env`, then run:

```bash
python server.py
```

The backend rejects retained, untagged, stale, low-confidence, and empty requests. Valid text goes to Ollama; trusted request session metadata is copied onto validated output. Motion durations must be 1–60000 ms. The command topic has a default even if `TOPIC_COMMANDS` is missing from an existing `.env`. Restart the updated worker with the updated firmware; legacy untagged movement packets are intentionally rejected by the boards.

### Physical boards

- **UNO R4 WiFi:** `clash-tank/clashtank/clashtank.ino` plus its adjacent `ControlSession.h`. Uses `WiFiS3`, `PubSubClient`, ArduinoJson 7, `LiquidCrystal_I2C`, and `Servo` (tested with 1.3.0). The attack servo signal connects to pin 11.
- **ESP32 buzzer:** `clash-tank/esp32buzzer-clashtank.ino` plus the same header. Uses ESP32 Arduino Core 3.x, `PubSubClient`, and ArduinoJson 7. It ignores joystick refreshes and gates voice effects by session.
- Put each board's `.ino` in its **own sketch directory**, with the same name as that directory, and copy `ControlSession.h` next to it. Do not compile both board sketches together from `clash-tank/`.
- Configure Wi-Fi/broker settings in the selected sketch before uploading. Existing motor pin assignments and speeds are preserved; verify wiring before energizing motors. ENA=2 and ENB=7 are not the PWM pins listed in the sketch's UNO R4 comment, so do not assume variable-speed PWM without checking the wiring/pin selection.

Connect the controller, motor driver, and battery grounds together. Never power motors directly from microcontroller pins.

## Project layout and current limits

- `src/`, `index.html`, `controller.html` — React UI, browser speech recognition, MQTT over WSS, and local storage.
- `server.py` — MQTT → Ollama → MQTT bridge; `voice_protocol.py` — validated envelopes; `systemprompt.py` — bilingual parsing instructions.
- `tests/` — browser control logic, Python protocol, and portable firmware session tests; `clash-tank/` — board sketches and the shared session gate.
- Voice payload: `{"text":"...","timestamp":<epoch milliseconds>,"session":"...","seq":1,"confidence":<optional score>}`.
- One active operator is supported. Sessions are stale-command guards, not authentication or a multi-controller ownership service. No vehicle acknowledgement/status topic is implemented. The ESP32 buzzer retains its existing blocking sound playback.
- **Known schema mismatch:** the prompt includes `SPIN` and `duration_ms`, but the current Python schema omits `SPIN` and uses `duration`. Align these before hardware integration. Prompt instructions reduce guessing but do not guarantee correct interpretation.
