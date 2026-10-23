"""Validated wire protocol shared by the voice worker and offline tests."""

import json
import math
import re

SESSION = re.compile(r"[A-Za-z0-9_-]{1,64}")
ACTIONS = {"FORWARD", "BACKWARD", "TURN_LEFT", "TURN_RIGHT", "STOP", "ATTACK", "DEFENSE"}


def parse_voice_request(payload, now_ms):
    request = json.loads(payload)
    if not isinstance(request, dict):
        raise ValueError("Expected an object")
    session = request.get("session")
    if not isinstance(session, str) or not SESSION.fullmatch(session) or type(request.get("seq")) is not int or request["seq"] != 1:
        raise ValueError("Missing or invalid control session")
    timestamp = request.get("timestamp")
    if type(timestamp) not in (int, float) or not math.isfinite(timestamp) or not -1000 <= now_ms - timestamp <= 5000:
        raise ValueError("Stale or invalid timestamp")
    confidence = request.get("confidence", 1)
    if type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0.5 <= confidence <= 1:
        raise ValueError("Invalid confidence")
    text = request.get("text")
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1000:
        raise ValueError("Empty or oversized text")
    return {"text": text.strip(), "session": session, "seq": 1}


def build_voice_response(request, model_json):
    result = json.loads(model_json)
    commands = result.get("commands") if isinstance(result, dict) else None
    if not isinstance(commands, list) or not 1 <= len(commands) <= 10:
        raise ValueError("Expected 1–10 commands")
    clean = []
    for command in commands:
        if not isinstance(command, dict) or not isinstance(command.get("action"), str) or command["action"] not in ACTIONS:
            raise ValueError("Invalid action")
        action = command["action"]
        duration = command.get("duration")
        if type(duration) is not int:
            raise ValueError("Invalid duration")
        if action == "STOP":
            duration = 1
        elif not 1 <= duration <= 60000:
            raise ValueError("Duration must be 1–60000 ms")
        clean.append({"action": action, "duration": duration})
    # Never trust model-generated routing/session fields.
    return {"type": "voice", "source": "voice", "session": request["session"], "seq": request["seq"], "commands": clean}
