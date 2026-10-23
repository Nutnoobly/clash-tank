import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleControl } from '../src/lib/vehicle.js';

function fixture() {
  let time = 0, id = 0, callback;
  const packets = [], voices = [], errors = [];
  const transport = {
    sendCommand(packet) { packets.push(packet); return Promise.resolve(packet); },
    send(text, confidence, context) { voices.push({ text, confidence, ...context }); return Promise.resolve({ text }); },
  };
  const control = createVehicleControl(transport, e => errors.push(e.message), {
    now: () => time, newSession: () => `session-${++id}`,
    schedule(fn, ms) { assert.equal(ms, 150); callback = fn; return 1; },
    cancel() { callback = null; },
  });
  return { control, transport, packets, voices, errors,
    tick(ms = 150) { time += ms; callback?.(); },
    get ticking() { return callback !== null && callback !== undefined; },
  };
}

test('direct control claims a session, refreshes every 150 ms, and stops without another motion packet', async () => {
  const f = fixture();
  await f.control.move('forward');
  assert.equal(f.packets[0].type, 'control');
  assert.equal(f.packets[0].mode, 'joystick');
  assert.deepEqual(f.packets[1], { type: 'joystick', source: 'web', session: 'session-1', seq: 1, action: 'FORWARD', duration: 500 });
  f.tick(); f.tick();
  assert.deepEqual(f.packets.slice(1).map(p => p.seq), [1, 2, 3]);
  assert.equal(f.voices.length, 0);
  await f.control.move('neutral');
  const count = f.packets.length;
  f.tick();
  assert.equal(f.packets.length, count);
  assert.deepEqual(f.packets.at(-1), { action: 'STOP' });
});

test('changing direction or mode retires the old session and clears its heartbeat', async () => {
  const f = fixture();
  await f.control.move('left');
  await f.control.move('right');
  assert.equal(f.packets.at(-1).session, 'session-2');
  assert.equal(f.packets.at(-1).action, 'TURN_RIGHT');
  await f.control.setMode('voice');
  assert.equal(f.ticking, false);
  assert.deepEqual(f.packets.at(-1), { type: 'control', source: 'web', session: 'session-3', mode: 'voice' });
  await f.control.sendVoice('เดินหน้า', .9);
  assert.equal(f.voices[0].session, 'session-4');
});

test('a frozen event loop disarms the session instead of resuming motion on its next tick', async () => {
  const f = fixture();
  await f.control.move('backward');
  f.tick(500);
  assert.equal(f.packets.at(-1).type, 'stop');
  assert.equal(f.errors.length, 1);
  assert.equal(f.ticking, false);
  const count = f.packets.length;
  f.tick();
  assert.equal(f.packets.length, count);
  await f.control.move('backward');
  assert.equal(f.packets.at(-1).session, 'session-2');
});

test('late claim callbacks and errors cannot resurrect or cancel a newer selection', async () => {
  const f = fixture();
  const original = f.transport.sendCommand;
  let reject;
  f.transport.sendCommand = packet => packet.session === 'session-1'
    ? new Promise((_, fail) => { reject = fail; }) : original(packet);
  const old = f.control.move('forward');
  await f.control.move('left');
  reject(new Error('old failure'));
  await old;
  assert.equal(f.errors.length, 0);
  assert.equal(f.packets.at(-1).action, 'TURN_LEFT');
  assert.equal(f.ticking, true);
});

test('stopping before a pending claim completes never sends its motion command', async () => {
  const f = fixture();
  let complete;
  const original = f.transport.sendCommand;
  f.transport.sendCommand = packet => packet.type === 'control' ? new Promise(resolve => { complete = resolve; }) : original(packet);
  const move = f.control.move('forward');
  await f.control.stop();
  complete();
  await move;
  assert.ok(f.packets.every(p => p.type !== 'joystick'));
  assert.equal(f.ticking, false);
});

test('publish failure disarms and attempts STOP, while an idle forced stop bypasses the LLM', async () => {
  const f = fixture();
  const original = f.transport.sendCommand;
  f.transport.sendCommand = packet => packet.type === 'joystick' ? Promise.reject(new Error('write failed')) : original(packet);
  await f.control.move('forward');
  await Promise.resolve();
  assert.equal(f.errors[0], 'write failed');
  assert.equal(f.ticking, false);
  assert.equal(f.packets.at(-1).type, 'stop');
  await f.control.stop(true);
  assert.deepEqual(f.packets.at(-1), { action: 'STOP' });
  assert.equal(f.voices.length, 0);
});
