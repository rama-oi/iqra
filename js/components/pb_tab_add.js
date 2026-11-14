import { getPrefix } from "../lib/helpers.js";

customElements.define(
  getPrefix("tab-add"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $addBtn: undefined,
    };

    #template = `
      <button class="pb-add pb-success" type="button" aria-label="Clone repository" title="Clone repository">+</button>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        this.#html.$addBtn = this.querySelector(".pb-add");
        this.#html.$addBtn.addEventListener("click", () =>
          document.dispatchEvent(new CustomEvent("pb-open-clone")),
        );
      }
    }
  },
);
