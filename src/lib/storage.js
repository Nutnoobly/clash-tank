export const DEFAULT_SETTINGS = Object.freeze({
  brokerUrl: '',
  username: '',
  voiceTopic: 'n8q4x2m7v9p3k6t1r5z0/voice_in',
});

export const STORAGE_KEYS = Object.freeze({
  settings: 'clash-tank.settings.v1',
  language: 'clash-tank.language.v1',
  history: 'clash-tank.history.v1',
});

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readStored(key, fallback, storage = browserStorage()) {
  try {
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}

export function writeStored(key, value, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function sanitizeSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [
    key, typeof input[key] === 'string' ? input[key].slice(0, 2048) : fallback,
  ]));
}

export function loadSettings() {
  return sanitizeSettings(readStored(STORAGE_KEYS.settings, DEFAULT_SETTINGS));
}

export function saveSettings(value, storage = browserStorage()) {
  // Deliberately allowlist fields: passwords never enter localStorage.
  return writeStored(STORAGE_KEYS.settings, sanitizeSettings(value), storage);
}

export function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item.text === 'string'
    && item.text.trim() && item.text.length <= 1000
    && Number.isFinite(item.timestamp) && item.timestamp > 0
    && item.timestamp < 8.64e15)
    .slice(0, 3)
    .map(({ text, timestamp, stop }) => ({ text, timestamp, stop: stop === true }));
}

export function loadHistory() {
  return sanitizeHistory(readStored(STORAGE_KEYS.history, []));
}

export function loadLanguage() {
  return readStored(STORAGE_KEYS.language, 'th-TH') === 'en-US' ? 'en-US' : 'th-TH';
}
