import { getPrefix } from "../lib/helpers.js";

customElements.define(
  getPrefix("workarea-merge"),
  class extends HTMLElement {
    #initialized = false;

    #template = ``;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;
    }
  },
);
