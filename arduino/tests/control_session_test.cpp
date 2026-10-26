#include "../clashtank/ControlSession.h"
#include <assert.h>
#include <iostream>

int main() {
  ControlSession s;
  assert(!s.acceptJoystick("unknown", 1, 0));
  assert(!s.begin("bad/session", true, 0));
  assert(s.begin("voice-A", false, 0));
  assert(s.acceptVoice("voice-A", 1));
  assert(!s.acceptVoice("voice-A", 1));
  assert(s.begin("joystick-B", true, 10));
  assert(!s.acceptVoice("voice-A", 1));
  assert(!s.acceptVoice("joystick-B", 1));
  assert(s.acceptJoystick("joystick-B", 1, 20));
  assert(!s.acceptJoystick("joystick-B", 1, 100));
  assert(!s.acceptJoystick("joystick-B", 0, 100));
  assert(s.acceptJoystick("joystick-B", 2, 170));
  assert(!s.expire(669));
  assert(s.expire(670));
  assert(!s.manual());
  assert(!s.acceptJoystick("joystick-B", 3, 671));
  assert(!s.begin("joystick-B", true, 672));
  assert(s.begin("joystick-C", true, 700));
  assert(!s.acceptStop("joystick-B", 5));
  assert(s.acceptJoystick("joystick-C", 1, 710));
  assert(s.acceptStop("joystick-C", 2));
  assert(!s.acceptJoystick("joystick-C", 3, 711));
  assert(s.begin("voice-D", false, 800));
  assert(!s.acceptVoice("voice-A", 1));
  assert(!s.acceptVoice("voice-D", 0));
  assert(s.acceptStop("voice-D", 1));
  assert(!s.acceptVoice("voice-D", 1));
  assert(s.begin("joystick-E", true, 900));
  assert(!s.acceptJoystick("joystick-E", 1, 1400));
  assert(s.begin("joystick-F", true, UINT32_MAX - 100));
  assert(s.acceptJoystick("joystick-F", 1, UINT32_MAX - 50));
  assert(!s.expire(448));
  assert(s.expire(449));
  assert(s.begin("joystick-G", true, 500));
  s.invalidate();
  assert(!s.acceptJoystick("joystick-G", 1, 501));
  assert(!s.begin("joystick-G", true, 501));
  std::cout << "ControlSession: ownership, sequence, stop, timeout, reconnect and millis wrap PASS\n";
}
