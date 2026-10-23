# Clash Tank

Thai/English voice-controlled tank project using a React controller, MQTT, a Python/Ollama translator, and ESP32 hardware.

**[Open the web controller](https://clash-tank.vercel.app/)** — hosted on Vercel. The Python backend and ESP32 run separately; the website does not host them.

## Use the controller

1. Open the website on your phone and allow microphone access, or use text entry.
2. In **Settings**, configure the broker WSS URL, credentials if required, and voice topic to match the backend's `TOPIC_VOICE`. The default is the public HiveMQ broker (`wss://broker.hivemq.com:8884/mqtt`); ensure the backend uses the same broker.
3. Save and connect, select Thai or English, speak, review/edit the transcript, then send.

Settings and the last three submitted messages stay in browser-local storage; passwords stay in memory only. Offline messages are not queued. **ส่งแล้ว** means submitted, not executed by the vehicle.

### Joystick UI preview

The controller opens in **เสียง** (voice) mode. Select **จอย** in the header to try the portrait, one-handed joystick. Tap or drag to select forward, backward, rotate left, or rotate right. Releasing keeps that direction selected; tap or drag into the center to stop. Arrow keys also select directions; Escape or Home returns to center.

The joystick is currently a **UI preview and does not publish vehicle commands**. It can be tried before connecting to a broker. Switching modes, opening settings, hiding the page, or losing the connection resets the selection. After connection loss, the pad is disabled until reconnection. Vehicle command delivery and the agreed heartbeat/expiry failsafe remain future integration work; resetting this preview does not stop physical hardware.

**Stop is not an emergency stop:** **หยุดรถ** sends `STOP` through the same Python/LLM pipeline, without review. There is no vehicle acknowledgement. Do not use a public broker for private or safety-critical control.

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

The backend rejects retained messages, stale timestamps (over 5000 ms), low confidence, and empty text; valid text goes to Ollama with a Pydantic output schema. Empty command batches are not published. Duration clamping is intentionally not enabled.

### ESP32

**Firmware is currently an empty placeholder, not a working tank controller.** `clash-tank/config.h.example` provides the Wi-Fi/broker/pin configuration template for implementation. Use Arduino IDE with ESP32 support, `PubSubClient`, and `ArduinoJson` when developing the firmware.

Connect ESP32, motor driver, and battery grounds together. Never power motors directly from ESP32 pins.

## Project layout and current limits

- `src/`, `index.html`, `controller.html` — React UI, browser speech recognition, MQTT over WSS, and local storage.
- `server.py` — MQTT → Ollama → MQTT bridge; `systemprompt.py` — bilingual parsing instructions.
- `tests/` — controller tests; `clash-tank/` — firmware placeholder and configuration template.
- Voice payload: `{"text":"...","timestamp":<epoch milliseconds>,"confidence":<optional score>}`. Topics are configured in `.env` and controller settings.
- **Known schema mismatch:** the prompt includes `SPIN` and `duration_ms`, but the current Python schema omits `SPIN` and uses `duration`. Align these before hardware integration. Prompt instructions reduce guessing but do not guarantee correct interpretation.
