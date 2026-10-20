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

---

## 📁 Repository Structure

```
clash-tank/
│
├── .env.example               # Template for Python server environment variables
├── requirements.txt           # Python dependencies for server.py
├── controller.html            # Web Speech API + mqtt.js (WSS :8884) mobile interface
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

1. Serve `controller.html` over HTTPS or `localhost` (browsers require a secure context for the Web Speech API):
   ```bash
   python -m http.server 8000
   ```
2. Open `http://localhost:8000/controller.html` on your browser or mobile device.
3. Configure your HiveMQ Cloud credentials in the settings drawer.
4. Tap the microphone button and issue commands in Thai or English (e.g., *"เดินหน้า 2 วินาที"* or *"Forward 2 seconds"*).
