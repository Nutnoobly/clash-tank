import { createVoicePayload, validateSettings, mqttErrorMessage } from './commands.js';

// One explicit connection, no reconnect queue and no retained motion commands.
export function createTransport(connect, onState) {
  let client = null;
  let active = false;
  let settings = null;
  const pending = new Set();

  function disconnect() {
    active = false;
    for (const fail of [...pending]) fail(new Error('การเชื่อมต่อสิ้นสุดแล้ว กรุณาส่งใหม่เมื่อพร้อม'));
    const previous = client;
    client = null;
    if (previous) {
      previous.removeAllListeners();
      previous.on('error', () => {});
      previous.end(true);
    }
  }

  return {
    open(value) {
      const errors = validateSettings(value);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      disconnect();
      settings = { ...value, voiceTopic: value.voiceTopic.trim() };
      active = true;
      onState('connecting', '');
      try {
        const options = {
          clientId: `clash-web-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
          clean: true,
          reconnectPeriod: 0,
          connectTimeout: 10000,
          queueQoSZero: false,
          resubscribe: false,
        };
        if (value.username.trim()) {
          options.username = value.username.trim();
          options.password = value.password || '';
        }
        const next = connect(value.brokerUrl.trim(), options);
        client = next;
        next.on('connect', () => { if (active && client === next) onState('connected', ''); });
        next.on('error', error => {
          if (!active || client !== next) return;
          const message = mqttErrorMessage(error);
          disconnect();
          onState('error', message);
        });
        next.on('close', () => {
          if (!active || client !== next) return;
          disconnect();
          onState('offline', 'การเชื่อมต่อขาด คำสั่งที่ยังไม่ส่งจะไม่ถูกส่งย้อนหลัง');
        });
      } catch {
        disconnect();
        onState('error', 'เปิดการเชื่อมต่อไม่ได้ ตรวจ WSS URL แล้วลองอีกครั้ง');
      }
    },
    send(text, confidence) {
      if (!active || !client?.connected || client.disconnecting) {
        return Promise.reject(new Error('ยังไม่ได้เชื่อมต่อ กรุณาเชื่อมต่อก่อนส่งคำสั่ง'));
      }
      const payload = createVoicePayload(text, confidence);
      const current = client;
      return new Promise((resolve, reject) => {
        let finished = false;
        let timeout;
        const finish = error => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          pending.delete(finish);
          if (error) reject(error); else resolve(payload);
        };
        pending.add(finish);
        timeout = setTimeout(() => finish(new Error('ยังยืนยันการส่งไม่ได้ ตรวจการเชื่อมต่อก่อนลองใหม่')), 5000);
        try {
          current.publish(settings.voiceTopic, JSON.stringify(payload), { qos: 0, retain: false }, finish);
        } catch {
          finish(new Error('ส่งข้อความไม่ได้ กรุณาเชื่อมต่อใหม่'));
        }
      });
    },
    close() { disconnect(); },
  };
}
