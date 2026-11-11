
import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("tab-add"),
  class extends HTMLElement {

    #initialized = false;

    #html = {
      $addBtn: undefined,
    };

    #template = `
      <button class="add" type="button">+</button>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        this.#html.$addBtn = this.querySelector(".add");
      }
    }
  },
);
