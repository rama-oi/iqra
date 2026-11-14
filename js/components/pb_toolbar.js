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
      <button type="button" class="restore">R</button>
      <button type="button" class="redo">Y</button>
      <button type="button" class="pull">P</button>
      <button type="button" class="push">S</button>
      <button type="button" class="branch">B</button>
      <button type="button" class="stash">T</button>
      <button type="button" class="pop">O</button>
      <button type="button" class="terminal">M</button>
      
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
