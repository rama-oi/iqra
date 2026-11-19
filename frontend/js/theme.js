import data, { setTheme, setAccent } from "./api/data.js";
import { THEMES, ACCENTS } from "./constants/themes.js";

export { THEMES, ACCENTS, setTheme, setAccent };

export const getTheme = () => data.theme;
export const getAccent = () => data.accent;

function apply() {
  for (const t of THEMES) document.body.classList.toggle(`pb-theme-${t.id}`, t.id === data.theme);
  for (const a of ACCENTS) document.body.classList.toggle(`pb-accent-${a.id}`, a.id === data.accent);
}

export function initTheme() {
  document.addEventListener("pb-theme-change", apply);
  document.addEventListener("pb-accent-change", apply);
  apply();
}
