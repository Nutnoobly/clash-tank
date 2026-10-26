import test from 'node:test';
import assert from 'node:assert/strict';
import { directionAt } from '../src/lib/joystick.js';

const bounds = { left: 24, top: 100, width: 326, height: 326 };
const at = (x, y) => directionAt(bounds.left + x, bounds.top + y, bounds);

test('center has a forgiving circular stop area, including its boundary', () => {
  assert.equal(at(163, 163), 'neutral');
  assert.equal(at(215, 163), 'neutral');
  assert.equal(at(163, 111), 'neutral');
  assert.equal(at(216, 163), 'right');
  assert.equal(at(163, 110), 'forward');
});

test('directions and diagonal gestures snap to the nearest cardinal axis', () => {
  assert.equal(at(163, 20), 'forward');
  assert.equal(at(163, 306), 'backward');
  assert.equal(at(20, 163), 'left');
  assert.equal(at(306, 163), 'right');
  assert.equal(at(40, 20), 'forward');
  assert.equal(at(20, 40), 'left');
  assert.equal(at(306, 306), 'backward');
});

test('touch mapping scales with the pad and remains usable outside its bounds during a drag', () => {
  const small = { left: 20, top: 50, width: 200, height: 200 };
  assert.equal(directionAt(120, 150, small), 'neutral');
  assert.equal(directionAt(150, 150, small), 'neutral');
  assert.equal(directionAt(154, 150, small), 'right');
  assert.equal(directionAt(120, -100, small), 'forward');
  assert.equal(directionAt(120, 150, { ...small, width: 0 }), 'neutral');
});
