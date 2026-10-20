# Clash Tank 🚗💨

Clash Tank is an IoT voice-controlled robotic tank powered by an ESP32 microcontroller, HiveMQ Cloud MQTT broker, local edge LLM (`qwen2.5:3b` running on Ollama), and a mobile web speech controller supporting **Thai 🇹🇭** and **English 🇬🇧** voice commands.

> 📖 **Architectural Specification**: For complete technical details, state machine definitions, and data contracts, see [AGENT.md](AGENT.md).

---

## 🤖 AI Usage in the System

AI is integrated into Clash Tank across two distinct layers:

1. **Edge NLP / LLM Reasoning (`server.py` & `systemprompt.py`)**:
   - **Model**: Local Ollama running `qwen2.5:3b`.
   - **Role**: Ingests natural spoken phrases in Thai and English (e.g., *"เดินหน้า 2 วินาทีแล้วเลี้ยวซ้าย"*, *"Drive forward 2 seconds then turn left"*), maps valid intents (`FORWARD`, `BACKWARD`, `TURN_LEFT`, `TURN_RIGHT`, `SPIN`, `ATTACK`, `DEFENSE`, `STOP`), ignores unknown words (`{"commands": []}`) to prevent hallucination, and publishes Pydantic-structured JSON command batches to `car/commands`.
2. **Speech Recognition (`controller.html`)**:
   - **API**: Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
   - **Role**: On-device AI/neural speech-to-text engine transcribing continuous spoken Thai and English into text packets sent via MQTT.

---

## 📝 AI Agent Contribution & Usage Log

> [!IMPORTANT]
> **Mandatory Rule for AI Agents**:
> Every time an AI agent is used to generate code, refactor components, update documentation, or fix bugs in this repository, the agent **MUST** update this section. Append a new entry detailing the date, agent role/model, scope of changes, and files created or modified.

### Usage History

| Date | Agent / Model | Scope of Work | Files Created / Modified |
| :--- | :--- | :--- | :--- |
| **2026-10-12** | Antigravity Agent (Gemini 3.8 Flash High) | Executed `/grill-me` architectural review. Defined end-to-end design specifications, preemptive state machine rules, L298N skid-steer pinouts, Thai/English prompt specifications, environment templates, and repository governance rules. | [`AGENT.md`](AGENT.md), [`README.md`](README.md), [`.env.example`](.env.example), [`requirements.txt`](requirements.txt), [`clash-tank/config.h.example`](clash-tank/config.h.example), [`.gitignore`](.gitignore) |
| **2026-10-19** | Hermes Agent / gpt-6.1-sol | Completed only environment-variable assignments; removed agent-created receiver tests after scope clarification. | `server.py`, removed `test_server.py`, `README.md` |
| **2026-10-20** | Hermes Agent (Gemini 4 Argon Medium) | Updated `SYSTEM_PROMPT` to add `SPIN` and strict anti-hallucination rules ignoring unknown commands (`{"commands": []}`). | `systemprompt.py`, `README.md` |
| **2026-10-20** | Hermes Agent (Gemini 4 Argon Medium) | Updated architecture and setup documentation to reflect `server.py` and `systemprompt.py` implementation (`SPIN`, `ATTACK`, `DEFENSE`, anti-hallucination empty-batch filtering, and current non-clamped duration rules). | `AGENT.md`, `README.md` |
| **2026-10-20** | Codex / GPT-6 | Created then removed the duplicate contributor guide at the user's request; retained the existing `AGENT.md`. | `AGENTS.md` (removed), `README.md` |
| **2026-10-20** | Codex / GPT-6 | Researched mobile web speech-to-text feasibility, browser constraints, MQTT payload integration, and a device validation plan using primary sources. | `docs/mobile-speech-to-text.md`, `README.md` |
| **2026-10-20** | Codex / GPT-6 | Designed editable black/orange portrait mobile controller screens and prototype flows in the supplied Figma file; documented confirmed product requirements and UI handoff. | `PRODUCT.md`, `DESIGN.md`, `README.md`; Figma file `clashTank` |
| **2026-10-20** | Codex / GPT-6 | Ignored local product/design documents and the docs directory at the user's request. | `.gitignore`, `README.md` |
| **2026-10-20** | Codex / GPT-6 | Implemented the approved mobile controller in React/Vite with local settings/history, Thai/English speech review, MQTT over WSS, text fallback, stop submission, and transport/speech/storage tests. | `controller.html`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `src/`, `tests/`, `.gitignore`, `README.md`; local ignored `PRODUCT.md`, `DESIGN.md` |
| **2026-10-20** | Codex / GPT-6 | Reviewed duplicate font-detector findings and preserved the approved Figma wordmark with a narrow Inter font exception. | `.impeccable/config.json`, `README.md` |

---

## 📁 Repository Structure

```
clash-tank/
│
├── .env.example               # Template for Python server environment variables
├── requirements.txt           # Python dependencies for server.py
├── controller.html            # Alternate entry point for the React controller
├── index.html                 # Default React controller entry point
├── src/                       # Mobile UI, speech sessions, MQTT transport, local storage
├── tests/                     # Controller logic tests using Node's built-in test runner
├── package.json               # Frontend dependencies and npm scripts
├── vite.config.js             # React/Vite build with both HTML entry points
├── server.py                  # Python MQTT bridge with Ollama structured outputs
├── systemprompt.py            # Bilingual Thai/English system prompt & anti-hallucination rules
├── README.md                  # Quick-start setup and documentation
├── AGENT.md                   # Full system architecture specification
│
└── clash-tank/
    ├── clash-tank.ino         # ESP32 firmware for L298N motor driver & HiveMQ TLS
    └── config.h.example       # Template for ESP32 WiFi and HiveMQ credentials
```

---

## 🚀 Quick Start Setup

### 1. Prerequisites
- **HiveMQ Cloud Cluster**: Free cluster with TLS enabled (ports `8883` for TCP/TLS, `8884` for WSS).
- **Ollama**: Installed locally on the server machine with `qwen2.5:3b` pulled:
  ```bash
  ollama pull qwen2.5:3b
  ollama serve
  ```
- **Arduino IDE / PlatformIO**: With ESP32 board support, `PubSubClient`, and `ArduinoJson` installed.

---

### 2. Edge Server Setup (`server.py`)

1. Create a Python virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Linux/macOS:
   source venv/bin/activate
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and fill in your HiveMQ credentials:
   ```bash
   cp .env.example .env
   ```
4. Start the translation server:
   ```bash
   python server.py
   ```

---

### 3. ESP32 Firmware Setup (`clash-tank/`)

1. Open `clash-tank/clash-tank.ino` in Arduino IDE.
2. Copy `clash-tank/config.h.example` to `clash-tank/config.h`:
   ```bash
   cp clash-tank/config.h.example clash-tank/config.h
   ```
3. Edit `clash-tank/config.h` with your WiFi SSID, password, HiveMQ host, and credentials.
4. Connect your ESP32 via USB and flash the firmware.
5. Open Serial Monitor at **115200 baud** to verify WiFi and MQTT connections.

> ⚠️ **Important Hardware Rule**: Connect the **GND** of ESP32, L298N motor driver, and external battery together. Do not power DC motors directly from ESP32 pins.

---

### 4. Mobile Web Controller (`controller.html`)

Requires Node.js 22.12+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` (or `/controller.html`). The Vite server also listens on the local network. For phone microphone access, serve through **HTTPS with a trusted certificate**; the computer's LAN HTTP URL does not receive the phone's localhost exception. Try Safari on iPhone or Chrome on Android and grant microphone permission. Browser speech services may require internet access.

1. Open Settings and enter the broker's actual **WSS URL**, including its port and path. `wss://<cluster>:8884/mqtt` is a HiveMQ Cloud example, not a preconfigured connection.
2. Enter username/password only if the broker requires authentication. Set **Voice topic** to the backend's actual `TOPIC_VOICE`; the initial value matches `.env.example`.
3. Select **บันทึกและเชื่อมต่อ**. Connection is explicit; reloading never automatically sends or reconnects commands.
4. Select Thai or English, tap the microphone, and speak. Review/edit the final transcript, then select **ส่งคำสั่ง**. Typed commands also pass through review. Unsupported speech and denied permissions leave text entry available.
5. Local storage remembers URL, username, topic, language, and the last three successfully submitted messages. Passwords stay in memory and must be re-entered after reload. Stored data is specific to the browser and website origin.

The client sends `{ "text": "...", "timestamp": <epoch milliseconds>, "confidence": <optional score> }` to the configured voice topic with QoS 0 and `retain: false`. Only final speech enters review. Low positive confidence below 0.5 requires speaking again or editing the text; unavailable confidence is omitted. Edits discard the recognizer's old score. Offline messages are rejected rather than queued or replayed. **ส่งแล้ว** means the client submitted a message, not that the vehicle executed it; there is no vehicle feedback topic.

**Stop behavior:** the persistent **หยุดรถ** button aborts listening and immediately submits the text `STOP` to the same voice topic without review. It still passes through the current Python/Ollama pipeline. It is not a direct motor emergency stop, and no physical-stop acknowledgement exists. Firmware remains an empty placeholder; direct preemption and disconnect failsafes need backend/firmware work.

```bash
npm test         # Transport, speech lifecycle, payload and storage tests with test doubles
npm run build   # Production files in dist/
npm run preview # Preview the production build
```

Deploy only the contents of `dist/` to an HTTPS static host. Do not publish the repository root or backend `.env`. Python runs separately with its existing configuration; its credentials are not automatically exposed to the frontend.
