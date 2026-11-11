import { getPrefix } from "../_helpers.js";
// import data from "../data.js";

customElements.define(
  getPrefix("sidebar-left"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <details class="local">
        <summary>Local</summary>
        <ul class="content">
          <li><button type="button">v10 Local</button></li>
        </ul>
      </details>

      <details class="remote">
        <summary>Remote</summary>
        <ul class="content">
          <li><button type="button">v10</button></li>
        </ul>
      </details>

      <details class="submodules">
        <summary>Sub Modules</summary>
        <ul class="content">
          <li><button type="button">v10</button></li>
        </ul>
      </details>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }
    }
  },
);
