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
      <button type="button" class="pb-restore">R</button>
      <button type="button" class="pb-redo">Y</button>
      <button type="button" class="pb-pull">P</button>
      <button type="button" class="pb-push">S</button>
      <button type="button" class="pb-branch">B</button>
      <button type="button" class="pb-stash">T</button>
      <button type="button" class="pb-pop">O</button>
      <button type="button" class="pb-terminal">M</button>
      
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
