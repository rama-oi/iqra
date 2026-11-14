import { getPrefix } from "../lib/helpers.js";
import "./pb_view_switcher.js";

customElements.define(
  getPrefix("toolbar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <pb-view-switcher></pb-view-switcher>
      <button type="button" class="pb-restore">
        <span class="pb-icon">⬅</span>
      </button>
      <button type="button" class="pb-redo">
        <span class="pb-icon">➡</span>
      </button>
      <button type="button" class="pb-pull">
        <span class="pb-icon">🔽</span>
      </button>
      <button type="button" class="pb-push">
        <span class="pb-icon">🔼</span>
      </button>
      <button type="button" class="pb-branch">
        <span class="pb-icon">🌱</span>
      </button>
      <button type="button" class="pb-stash">
        <span class="pb-icon">⬇</span>
      </button>
      <button type="button" class="pb-pop">
        <span class="pb-icon">⬆</span>
      </button>
      <button type="button" class="pb-terminal">
        <span class="pb-icon">🖥</span>
      </button>
      
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
