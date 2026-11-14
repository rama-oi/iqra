// The only file that touches localStorage. Values are JSON under one prefix.
// Storage can be blocked or full, so every call is guarded: a failed read gives
// the fallback and a failed write is ignored (the value still works this session).
const PREFIX = "iqra:";

// Bump when the shape of a stored value changes; older data is then ignored.
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
  } catch {
    // not persisted
  }
}

// Run once at startup, before anything is loaded. `migrate` receives the old
// version (0 when nothing was stored yet) and may read/remove old keys.
export function upgrade(migrate) {
  try {
    const old = Number(localStorage.getItem(VERSION_KEY) ?? 0);
    if (old === VERSION) return;
    migrate(old, { load, save });
    localStorage.setItem(VERSION_KEY, String(VERSION));
  } catch {
    // storage unavailable
  }
}

// For migrations that need to read keys from before the prefix existed.
export function takeLegacy(key) {
  try {
    const value = localStorage.getItem(key);
    localStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
