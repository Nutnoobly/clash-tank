#ifndef CLASH_TANK_PROXIMITY_TRIGGER_H
#define CLASH_TANK_PROXIMITY_TRIGGER_H
#include <stdint.h>

// Stable near edge only: a held object cannot repeatedly trigger hits.
class ProximityTrigger {
 public:
  bool update(bool near, uint32_t now) {
    if (near != candidate_) { candidate_ = near; changedAt_ = now; }
    if (candidate_ == stable_ || uint32_t(now - changedAt_) < 30) return false;
    stable_ = candidate_;
    return stable_;
  }
 private:
  bool candidate_ = false;
  bool stable_ = false;
  uint32_t changedAt_ = 0;
};
#endif
