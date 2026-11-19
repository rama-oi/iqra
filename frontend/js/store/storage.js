const PREFIX = "iqra:";

const VERSION = 1;
const VERSION_KEY = `${PREFIX}version`;

export function load(key, fallback, isValid = () => true) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function upgrade(migrate) {
  try {
    const old = Number(localStorage.getItem(VERSION_KEY) ?? 0);
    if (old === VERSION) return;
    migrate(old, { load, save });
    localStorage.setItem(VERSION_KEY, String(VERSION));
  } catch {}
}

export function takeLegacy(key) {
  try {
    const value = localStorage.getItem(key);
    localStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
