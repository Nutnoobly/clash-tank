export const JOYSTICK_LABELS = {
  neutral: 'หยุด',
  forward: 'เดินหน้า',
  backward: 'ถอยหลัง',
  left: 'หมุนซ้าย',
  right: 'หมุนขวา',
};

// Coordinates are relative to the pad, so the center dead zone scales with it.
export function directionAt(clientX, clientY, bounds) {
  if (bounds.width <= 0 || bounds.height <= 0) return 'neutral';
  const x = (clientX - bounds.left - bounds.width / 2) / bounds.width;
  const y = (clientY - bounds.top - bounds.height / 2) / bounds.height;
  if (Math.hypot(x, y) <= 52 / 326) return 'neutral';
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'forward' : 'backward';
}
