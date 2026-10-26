#ifndef CLASH_TANK_BUZZER_EFFECTS_H
#define CLASH_TANK_BUZZER_EFFECTS_H
#include <stdint.h>

// Hardware-independent timing; MQTT can continue while either sound plays.
class BuzzerEffects {
 public:
  bool defense(uint32_t now) {
    frequency(now);
    if (effect_ != NONE) return false;
    effect_ = DEFENSE; startedAt_ = now;
    return true;
  }
  bool hit(uint32_t now) {
    frequency(now);
    if (effect_ == HIT) return false;  // Do not extend an active one-second hit.
    effect_ = HIT; startedAt_ = now;  // A hit interrupts defense immediately.
    return true;
  }
  int frequency(uint32_t now) {
    const uint32_t elapsed = now - startedAt_;
    if (effect_ == NONE) return 0;
    if (elapsed >= (effect_ == HIT ? 1000U : 5000U)) { effect_ = NONE; return 0; }
    if (effect_ == HIT) return 2500;
    const uint32_t step = (elapsed / 10) % 100;
    return int(step <= 50 ? step : 100 - step) * 100;
  }
 private:
  enum Effect { NONE, DEFENSE, HIT };
  Effect effect_ = NONE;
  uint32_t startedAt_ = 0;
};
#endif
