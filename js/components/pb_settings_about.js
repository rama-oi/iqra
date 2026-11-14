import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { APP } from "../constants/app.js";

// Settings > About
customElements.define(
  getPrefix("settings-about"),
  class extends HTMLElement {
    #initialized = false;

    #template = `
      <h2>${escapeHtml(APP.name)} v${escapeHtml(APP.version)}</h2>
      <p>${escapeHtml(APP.description)}</p>
      <ul class="claims">
        <li>GPL 3.0</li>
      </ul>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;
    }
  },
);
