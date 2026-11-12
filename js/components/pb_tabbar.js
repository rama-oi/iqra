import { getPrefix } from "../_helpers.js";
import "./pb_tab.js";
import "./pb_tab_add.js";

customElements.define(
  getPrefix("tabbar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $logo: undefined
    };

    #template = `
      <pb-tab label="fikret"></pb-tab>
      <pb-tab-add></pb-tab-add>
      <span class="pb-flex-separator"></span>
      <pb-menu>
        <button class="config" type="button">
          <pb-avatar class="pb-medium"></pb-avatar>
        </button>
      </pb-menu>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
        this.#html.$logo = this.querySelector('.logo');
      }
    }
  },
);
