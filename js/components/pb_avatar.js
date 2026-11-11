import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("avatar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <img class="avatar" />
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
