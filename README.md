# Clash Tank

Thai/English voice and joystick tank controller using React, MQTT, a Python/Ollama translator, Arduino UNO R4 WiFi motors, and an ESP32 buzzer.

**[Open the web controller](https://clash-tank.vercel.app/)** — hosted on Vercel. The Python backend and ESP32 run separately; the website does not host them.

## Use the controller

1. Open the website on your phone and allow microphone access, or use text entry.
2. In **Settings**, configure the broker WSS URL, credentials if required, voice topic, and command topic. The default broker is `wss://broker.hivemq.com:8884/mqtt`. Python and both boards must use the same broker and matching topics.
3. Save and connect, select Thai or English, speak, review/edit the transcript, then send.

Settings and the last three submitted messages stay in browser-local storage; passwords stay in memory only. Offline messages are not queued. **ส่งแล้ว** means submitted, not executed by the vehicle.

### Direct joystick control

The controller opens in **เสียง** (voice) mode. Connect to MQTT, then select **จอย** in the header. Tap or drag to select forward, backward, rotate left, or rotate right. Releasing keeps that direction selected; tap or drag into the center to stop. Arrow keys also select directions; Escape or Home returns to center.

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

- **UNO R4 WiFi:** `clash-tank/clashtank.ino` plus `clash-tank/ControlSession.h`. Uses `WiFiS3`, `PubSubClient`, ArduinoJson 7, and `LiquidCrystal_I2C`.
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
