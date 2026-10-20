import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTransport } from '../src/lib/transport.js';
import { createVoicePayload, validateSettings, mqttErrorMessage } from '../src/lib/commands.js';
import { readStored, saveSettings, sanitizeHistory, writeStored, STORAGE_KEYS } from '../src/lib/storage.js';
import { createSpeechSession } from '../src/lib/speech.js';

const config = { brokerUrl: 'wss://example.invalid:8884/mqtt', username: '', password: '', voiceTopic: 'test/voice' };

class FakeClient extends EventEmitter {
  connected = false;
  published = [];
  end() { this.connected = false; this.ended = true; }
  publish(topic, data, options, callback) {
    this.published.push({ topic, payload: JSON.parse(data), options });
    if (!this.holdPublish) callback(); else this.completePublish = callback;
  }
}

function fixture() {
  const clients = [], options = [], states = [];
  const transport = createTransport((url, value) => {
    const client = new FakeClient();
    clients.push(client); options.push({ url, ...value }); return client;
  }, (...args) => states.push(args));
  return { clients, options, states, transport, connect() { transport.open(config); clients.at(-1).connected = true; clients.at(-1).emit('connect'); } };
}

test('settings require a credential-free WSS URL and a publish topic', () => {
  assert.deepEqual(validateSettings(config), {});
  for (const url of ['ws://example.invalid/mqtt', 'https://example.invalid', 'wss://user:pass@example.invalid/mqtt', 'invalid']) {
    assert.ok(validateSettings({ ...config, brokerUrl: url }).brokerUrl);
  }
  assert.ok(validateSettings({ ...config, voiceTopic: 'car/#' }).voiceTopic);
  assert.ok(validateSettings({ ...config, voiceTopic: 'car/+' }).voiceTopic);
  assert.ok(validateSettings({ ...config, password: 'test' }).username);
});

test('payload matches Python text contract, with fresh milliseconds and optional genuine confidence', () => {
  assert.deepEqual(createVoicePayload('  เดินหน้า 2 วินาที  ', 0.85, 123), { text: 'เดินหน้า 2 วินาที', timestamp: 123, confidence: 0.85 });
  assert.deepEqual(createVoicePayload('STOP', undefined, 124), { text: 'STOP', timestamp: 124 });
  assert.throws(() => createVoicePayload('  '));
  assert.throws(() => createVoicePayload('x'.repeat(1001)));
});

test('offline commands are rejected, never queued or replayed after connecting', async () => {
  const f = fixture();
  await assert.rejects(f.transport.send('FORWARD'), /ยังไม่ได้เชื่อมต่อ/);
  f.connect();
  assert.equal(f.clients[0].published.length, 0);
  assert.equal(f.options[0].queueQoSZero, false);
  assert.equal(f.options[0].reconnectPeriod, 0);
  assert.equal('username' in f.options[0], false);
  await f.transport.send('STOP');
  assert.deepEqual(f.clients[0].published[0].options, { qos: 0, retain: false });
  assert.equal(f.clients[0].published[0].topic, config.voiceTopic);
  f.transport.close();
});

test('normal commands and STOP use the same backend voice topic', async () => {
  const f = fixture(); f.connect();
  await f.transport.send('เดินหน้า', 0.9);
  await f.transport.send('STOP');
  assert.deepEqual(f.clients[0].published.map(item => item.payload.text), ['เดินหน้า', 'STOP']);
  assert.equal(f.clients[0].published[0].payload.confidence, 0.9);
  assert.equal('confidence' in f.clients[0].published[1].payload, false);
  f.transport.close();
});

test('connection loss rejects an in-flight publish and does not record a later callback as success', async () => {
  const f = fixture(); f.connect();
  f.clients[0].holdPublish = true;
  const sending = f.transport.send('เดินหน้า');
  f.clients[0].emit('close');
  await assert.rejects(sending, /การเชื่อมต่อสิ้นสุด/);
  f.clients[0].completePublish();
  assert.equal(f.states.at(-1)[0], 'offline');
  await assert.rejects(f.transport.send('เดินหน้า'));
});

test('replacing a connection closes the previous client and ignores its events', () => {
  const f = fixture(); f.connect(); const first = f.clients[0];
  f.transport.open({ ...config, username: 'operator', password: 'test-password' });
  assert.equal(first.ended, true);
  first.emit('connect');
  assert.equal(f.states.at(-1)[0], 'connecting');
  assert.equal(f.options[1].username, 'operator');
  assert.equal(f.options[1].password, 'test-password');
  f.transport.close();
});

test('authentication errors stop the connection and show an actionable message', () => {
  const f = fixture(); f.transport.open(config);
  f.clients[0].emit('error', Object.assign(new Error('Not authorized'), { code: 5 }));
  assert.equal(f.clients[0].ended, true);
  assert.equal(f.states.at(-1)[0], 'error');
  assert.match(f.states.at(-1)[1], /ชื่อผู้ใช้/);
  assert.match(mqttErrorMessage({ code: 135 }), /ชื่อผู้ใช้/);
});

test('storage persists settings without ever serializing the password', () => {
  let saved;
  assert.equal(saveSettings({ ...config, password: 'not-for-storage' }, { setItem(key, value) { saved = [key, value]; } }), true);
  assert.equal(saved[0], STORAGE_KEYS.settings);
  assert.equal(saved[1].includes('not-for-storage'), false);
  assert.equal('password' in JSON.parse(saved[1]), false);
});

test('corrupt, unavailable, and full storage does not break the app', () => {
  assert.deepEqual(readStored('key', [], { getItem() { return '{'; } }), []);
  assert.equal(readStored('key', 'default', { getItem() { throw Error(); } }), 'default');
  assert.equal(writeStored('key', {}, { setItem() { throw Error('quota'); } }), false);
  assert.deepEqual(sanitizeHistory([{ text: 'bad', timestamp: 'yesterday' }, null, { text: 'STOP', timestamp: 123 }]), [{ text: 'STOP', timestamp: 123, stop: false }]);
  assert.equal(sanitizeHistory(Array.from({ length: 10 }, () => ({ text: 'test', timestamp: 123 }))).length, 3);
});

class FakeRecognition {
  static latest;
  constructor() { FakeRecognition.latest = this; }
  start() {}
  stop() {}
  abort() {}
}

function speechFixture() {
  const results = [], errors = [], previews = [];
  const session = createSpeechSession(FakeRecognition, 'th-TH', {
    onInterim: text => previews.push(text), onFinal: (...args) => results.push(args), onError: (...args) => errors.push(args),
  });
  return { session, recognition: FakeRecognition.latest, results, errors, previews };
}
function result(text, confidence, isFinal) {
  return Object.assign([{ transcript: text, confidence }], { isFinal });
}

test('speech ignores interim text for submission and deduplicates repeated final events', () => {
  const f = speechFixture(); f.session.start();
  f.recognition.onresult({ results: [result('เดิน', 0.8, false)] });
  assert.equal(f.results.length, 0);
  f.recognition.onresult({ results: [result('เดินหน้า', 0.9, true)] });
  f.recognition.onresult({ results: [result('เดินหน้า', 0.9, true)] });
  f.recognition.onend(); f.recognition.onend();
  assert.deepEqual(f.results, [['เดินหน้า', 0.9]]);
  assert.equal(f.recognition.continuous, false);
  assert.equal(f.recognition.lang, 'th-TH');
});

test('unavailable confidence is omitted; low positive confidence is preserved for review', () => {
  for (const score of [0, undefined, 0.2]) {
    const f = speechFixture();
    f.recognition.onresult({ results: [result('หยุด', score, true)] }); f.recognition.onend();
    assert.equal(f.results[0][1], score === 0.2 ? 0.2 : undefined);
  }
});

test('aborting speech discards late results and permission errors allow text fallback', () => {
  const f = speechFixture(); f.session.abort();
  f.recognition.onresult({ results: [result('เดินหน้า', 1, true)] }); f.recognition.onend();
  assert.equal(f.results.length, 0);
  const denied = speechFixture(); denied.recognition.onerror({ error: 'not-allowed' }); denied.recognition.onend();
  assert.equal(denied.results.length, 0);
  assert.equal(denied.errors.length, 1);
  assert.match(denied.errors[0][1], /พิมพ์คำสั่งแทน/);
});

test('a session ending without a final result never turns interim speech into a command', () => {
  const f = speechFixture();
  f.recognition.onresult({ results: [result('เดินหน้า', 0.8, false)] }); f.recognition.onend();
  assert.equal(f.results.length, 0);
  assert.equal(f.errors[0][0], 'no-speech');
});
