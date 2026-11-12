import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("collapse-btn"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <button type="button"></button>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
