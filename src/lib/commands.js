export const MAX_TEXT_LENGTH = 1000;
export const DEFAULT_COMMAND_TOPIC = 'n8q4x2m7v9p3k6t1r5z0/command_out';
export const CONTROL_TIMEOUT_MS = 500;
export const HEARTBEAT_MS = 150;
// The UNO attack cycle blocks for about 2200 ms; leave a small recovery margin.
export const ATTACK_RECOVERY_MS = 2500;
export const isSession = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

export function validateControlPayload(payload) {
  if (payload?.action === 'STOP' && Object.keys(payload).length === 1) return;
  if (!payload || !isSession(payload.session) || payload.source !== 'web') throw new Error('ข้อมูล session ไม่ถูกต้อง');
  if (payload.type === 'control' && ['voice', 'joystick'].includes(payload.mode)) return;
  if (!Number.isInteger(payload.seq) || payload.seq < 1 || payload.seq > 0xffffffff) throw new Error('ลำดับคำสั่งไม่ถูกต้อง');
  if (payload.type === 'stop' && payload.action === 'STOP') return;
  if (payload.type === 'joystick' && ['FORWARD', 'BACKWARD', 'TURN_LEFT', 'TURN_RIGHT', 'ATTACK'].includes(payload.action)
    && payload.duration === CONTROL_TIMEOUT_MS) return;
  throw new Error('คำสั่งควบคุมรถไม่ถูกต้อง');
}

export function validateSettings(settings) {
  const errors = {};
  try {
    const url = new URL(settings.brokerUrl.trim());
    if (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.hash) {
      errors.brokerUrl = 'ใช้ URL แบบ wss:// โดยกรอกบัญชีในช่องด้านล่าง';
    }
  } catch {
    errors.brokerUrl = 'กรอก WSS URL เช่น wss://your-broker:8884/mqtt';
  }
  for (const [name, value] of [['voiceTopic', settings.voiceTopic], ['commandTopic', settings.commandTopic ?? DEFAULT_COMMAND_TOPIC]]) {
    const topic = typeof value === 'string' ? value.trim() : '';
    if (!topic || /[+#\u0000]/u.test(topic) || new TextEncoder().encode(topic).length > 65535) errors[name] = 'กรอก topic ให้ตรงกับระบบ โดยไม่ใช้ + หรือ #';
  }
  if (settings.voiceTopic?.trim() === (settings.commandTopic ?? DEFAULT_COMMAND_TOPIC).trim()) errors.commandTopic = 'Voice topic และ Command topic ต้องต่างกัน';
  if (settings.password && !settings.username.trim()) {
    errors.username = 'กรอกชื่อผู้ใช้เมื่อใช้รหัสผ่าน';
  }
  return errors;
}

export function createVoicePayload(text, confidence, now = Date.now()) {
  const clean = text.trim();
  if (!clean || clean.length > MAX_TEXT_LENGTH) throw new Error('ข้อความต้องมี 1–1,000 ตัวอักษร');
  const payload = { text: clean, timestamp: now };
  if (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) payload.confidence = confidence;
  return payload;
}

export function mqttErrorMessage(error) {
  if ([4, 5, 134, 135, 140].includes(error?.code)
      || /not authori[sz]ed|bad user|password|authentication/i.test(error?.message ?? '')) {
    return 'เชื่อมต่อไม่ได้ ตรวจชื่อผู้ใช้ รหัสผ่าน และสิทธิ์ของบัญชี';
  }
  return 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตและ WSS URL แล้วลองอีกครั้ง';
}
