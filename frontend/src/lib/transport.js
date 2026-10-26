import { createVoicePayload, validateSettings, mqttErrorMessage, DEFAULT_COMMAND_TOPIC, isSession, validateControlPayload } from './commands.js';

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

  function publish(topic, payload, timeoutMs) {
    if (!active || !client?.connected || client.disconnecting) return Promise.reject(new Error('ยังไม่ได้เชื่อมต่อ กรุณาเชื่อมต่อก่อนส่งคำสั่ง'));
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
      timeout = setTimeout(() => finish(new Error('ส่งคำสั่งไม่ทันเวลา จอยกลับกลางแล้ว กรุณาเลือกทิศทางใหม่')), timeoutMs);
      try { current.publish(topic, JSON.stringify(payload), { qos: 0, retain: false }, finish); }
      catch { finish(new Error('ส่งข้อความไม่ได้ กรุณาเชื่อมต่อใหม่')); }
    });
  }

  return {
    open(value) {
      const errors = validateSettings(value);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      disconnect();
      settings = { ...value, voiceTopic: value.voiceTopic.trim(), commandTopic: (value.commandTopic ?? DEFAULT_COMMAND_TOPIC).trim() };
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
    send(text, confidence, context) {
      const payload = createVoicePayload(text, confidence);
      if (context) {
        if (!isSession(context.session)) return Promise.reject(new Error('ข้อมูล session ไม่ถูกต้อง'));
        payload.session = context.session;
        payload.seq = 1;
      }
      return publish(settings?.voiceTopic, payload, 5000);
    },
    sendCommand(payload) {
      try { validateControlPayload(payload); } catch (error) { return Promise.reject(error); }
      return publish(settings?.commandTopic, payload, 300);
    },
    close() { disconnect(); },
  };
}
