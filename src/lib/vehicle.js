import { CONTROL_TIMEOUT_MS, HEARTBEAT_MS, ATTACK_RECOVERY_MS } from './commands.js';

const ACTIONS = { forward: 'FORWARD', backward: 'BACKWARD', left: 'TURN_LEFT', right: 'TURN_RIGHT' };

// Owns sessions and the heartbeat independently of React renders and pointer events.
// A new explicit selection creates a fresh session; timed-out sessions never resume.
export function createVehicleControl(transport, onFailure, {
  now = () => performance.now(),
  newSession = () => globalThis.crypto?.randomUUID?.() ?? `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  schedule = setInterval,
  cancel = clearInterval,
} = {}) {
  let current = null;
  let timer = null;
  let combatPending = false;
  let attackReadyAt = 0;

  function clearTimer() { if (timer !== null) cancel(timer); timer = null; }

  function stop(force = false) {
    clearTimer();
    const previous = current;
    current = null;
    // Explicit center/stop must also work when local ownership is uncertain.
    if (force || !previous) return (force ? transport.sendCommand({ action: 'STOP' }) : Promise.resolve())
      .then(() => ({ text: 'STOP', timestamp: Date.now() }));
    return transport.sendCommand({ type: 'stop', source: 'web', session: previous.session, seq: ++previous.seq, action: 'STOP' })
      .then(() => ({ text: 'STOP', timestamp: Date.now() }));
  }

  function fail(record, error) {
    if (current !== record) return;
    stop().catch(() => {});
    onFailure(error);
  }

  async function activate(mode) {
    clearTimer();
    const record = { session: newSession(), seq: 0, mode, lastTick: now() };
    current = record;
    try {
      await transport.sendCommand({ type: 'control', source: 'web', session: record.session, mode });
    } catch (error) {
      if (current !== record) return null;
      fail(record, error);
      throw error;
    }
    return record;
  }

  function refresh(record, action) {
    if (current !== record) return;
    if (now() - record.lastTick >= CONTROL_TIMEOUT_MS) {
      fail(record, new Error('การส่งคำสั่งขาดช่วง จอยกลับกลางแล้ว กรุณาเลือกทิศทางใหม่'));
      return;
    }
    record.lastTick = now();
    transport.sendCommand({ type: 'joystick', source: 'web', session: record.session, seq: ++record.seq, action, duration: CONTROL_TIMEOUT_MS })
      .catch(error => fail(record, error));
  }

  async function sendCombat(action) {
    if (combatPending || now() < attackReadyAt) return false;
    combatPending = true;
    let record;
    try {
      // Retire motion, including pending claims; never heartbeat a combat action.
      record = await activate('joystick');
      if (!record || current !== record) return false;
      const packet = { type: 'joystick', source: 'web', session: record.session,
        seq: ++record.seq, action, duration: CONTROL_TIMEOUT_MS };
      await transport.sendCommand(packet);
      if (current !== record) return false;
      if (action === 'ATTACK') attackReadyAt = now() + ATTACK_RECOVERY_MS;
      return packet;
    } catch (error) {
      if (record) fail(record, error);
      throw error;
    } finally { combatPending = false; }
  }

  return {
    async setMode(mode) { await activate(mode); },
    async move(direction) {
      if (direction === 'neutral') return stop(true);
      if (combatPending || now() < attackReadyAt) throw new Error('รอรอบโจมตีหรือส่งคำสั่งให้เสร็จก่อนเลือกทิศทางใหม่');
      const action = ACTIONS[direction];
      if (!action) throw new Error('ทิศทางไม่ถูกต้อง');
      const record = await activate('joystick');
      if (!record || current !== record) return;
      refresh(record, action);
      if (current === record) timer = schedule(() => refresh(record, action), HEARTBEAT_MS);
    },
    attack() { return sendCombat('ATTACK'); },
    defense() { return sendCombat('DEFENSE'); },
    async sendVoice(text, confidence) {
      const record = await activate('voice');
      if (!record || current !== record) throw new Error('ยกเลิกคำสั่งจากโหมดก่อนหน้าแล้ว');
      return transport.send(text, confidence, { session: record.session });
    },
    stop,
    dispose() { stop().catch(() => {}); },
  };
}
