import { getPrefix, escapeHtml } from "../lib/helpers.js";
import data, { setTheme, setAccent } from "../api/data.js";
import { ACCENTS, THEMES } from "../constants/themes.js";

const radios = (name, list) =>
  list
    .map(
      (item) => `
    <li>
      <label>
        <input type="radio" name="${name}" value="${escapeHtml(item.id)}">
        <span>${escapeHtml(item.label)}</span>
      </label>
    </li>`,
    )
    .join("");

// Settings > Theme. The radios mirror data.theme / data.accent.
customElements.define(
  getPrefix("settings-theme"),
  class extends HTMLElement {
    #initialized = false;

    #template = `
      <p>Theme</p>
      <ul class="themes">${radios("theme", THEMES)}</ul>

      <p>Accent</p>
      <ul class="themes">${radios("accent", ACCENTS)}</ul>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.addEventListener("change", (e) => {
        if (e.target.name === "theme") setTheme(e.target.value);
        if (e.target.name === "accent") setAccent(e.target.value);
      });
      document.addEventListener("pb-theme-change", () => this.#render());
      document.addEventListener("pb-accent-change", () => this.#render());
      this.#render();
    }

    #render() {
      const current = { theme: data.theme, accent: data.accent };
      for (const radio of this.querySelectorAll("input[type=radio]")) {
        radio.checked = radio.value === current[radio.name];
      }
    }
  },
);
