#ifndef CLASH_TANK_CONTROL_SESSION_H
#define CLASH_TANK_CONTROL_SESSION_H

#include <stdint.h>
#include <string.h>

// Pure protocol state, shared by both boards and host-tested without Arduino.
class ControlSession {
 public:
  static const uint32_t TIMEOUT_MS = 500;

  bool begin(const char* id, bool joystick, uint32_t now) {
    if (!validId(id) || strcmp(id, session_) == 0) return false;
    strcpy(session_, id);
    joystick_ = joystick;
    active_ = true;
    voiceUsed_ = false;
    sequence_ = 0;
    lastSeen_ = now;
    return true;
  }

  bool acceptJoystick(const char* id, uint32_t sequence, uint32_t now) {
    expire(now);
    if (!matches(id) || !joystick_ || sequence <= sequence_) return false;
    sequence_ = sequence;
    lastSeen_ = now;
    return true;
  }

  bool acceptVoice(const char* id, uint32_t sequence) {
    if (!matches(id) || joystick_ || voiceUsed_ || sequence != 1) return false;
    voiceUsed_ = true;
    return true;
  }

  bool acceptStop(const char* id, uint32_t sequence) {
    if (!matches(id) || sequence <= sequence_) return false;
    sequence_ = sequence;
    invalidate();
    return true;
  }

  bool expire(uint32_t now) {
    if (!active_ || !joystick_ || uint32_t(now - lastSeen_) < TIMEOUT_MS) return false;
    invalidate();
    return true;
  }

  void invalidate() { active_ = false; }
  bool manual() const { return active_ && joystick_; }

  static bool validId(const char* id) {
    if (!id) return false;
    size_t length = 0;
    for (; id[length]; ++length) {
      const char c = id[length];
      if (length >= 64 || !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '_')) return false;
    }
    return length > 0;
  }

 private:
  bool matches(const char* id) const { return active_ && id && strcmp(id, session_) == 0; }
  char session_[65] = "";
  bool active_ = false;
  bool joystick_ = false;
  bool voiceUsed_ = false;
  uint32_t sequence_ = 0;
  uint32_t lastSeen_ = 0;
};

#endif
