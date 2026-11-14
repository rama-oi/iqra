import { getPrefix } from "../lib/helpers.js";

// Shown instead of every view while no project is open.
customElements.define(
  getPrefix("workarea-empty"),
  class extends HTMLElement {
    #initialized = false;

    #template = `
      <p>No project open</p>
      <button type="button" class="pb-btn open-clone">clone a repository</button>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.querySelector(".open-clone").addEventListener("click", () =>
        document.dispatchEvent(new CustomEvent("pb-open-clone")),
      );
    }
  },
);
