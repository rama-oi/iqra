export const THEMES = [
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato" },
  { id: "catppuccin-frappe", label: "Catppuccin Frappé" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" },
];

export const ACCENTS = [
  { id: "yellow", label: "Yellow" },
  { id: "mauve", label: "Mauve" },
  { id: "blue", label: "Blue" },
  { id: "red", label: "Red" },
  { id: "peach", label: "Peach" },
];

const STORAGE_KEY = "pb-theme";
const ACCENT_STORAGE_KEY = "pb-accent";

export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // storage can be blocked; fall through to the default
  }
  return THEMES[0].id;
}

export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  for (const t of THEMES) document.body.classList.toggle(t.id, t.id === id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // not persisted, still applied for this session
  }
}

export function getAccent() {
  try {
    const saved = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (ACCENTS.some((a) => a.id === saved)) return saved;
  } catch {
    // storage can be blocked; fall through to the default
  }
  return ACCENTS[0].id;
}

export function setAccent(id) {
  if (!ACCENTS.some((a) => a.id === id)) return;
  for (const a of ACCENTS) document.body.classList.toggle(`pb-accent-${a.id}`, a.id === id);
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, id);
  } catch {
    // not persisted, still applied for this session
  }
}

export function initTheme() {
  setTheme(getTheme());
  setAccent(getAccent());
}
