import { getPrefix } from "../lib/helpers.js";

// Placeholder: registered so the element is a real component, but it renders
// nothing yet. Fill #template and wire it to the data it needs.
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
