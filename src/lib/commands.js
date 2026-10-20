export const MAX_TEXT_LENGTH = 1000;

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
  const topic = settings.voiceTopic.trim();
  if (!topic || /[+#\u0000]/u.test(topic) || new TextEncoder().encode(topic).length > 65535) {
    errors.voiceTopic = 'กรอก topic ให้ตรงกับเซิร์ฟเวอร์ โดยไม่ใช้ + หรือ #';
  }
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
