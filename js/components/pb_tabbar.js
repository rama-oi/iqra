import { getPrefix } from "../_helpers.js";
import "./pb_tab.js";
import "./pb_tab_add.js";
import data from "../data.js";

customElements.define(
  getPrefix("tabbar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $logo: undefined
    };

    #template = `
      <div class="logo"></div>
      <pb-tab label="fikret"></pb-tab>
      <pb-tab-add></pb-tab-add>
      <span class="flex-separator"></span>
      <pb-menu>
        <pb-menu-config>
          <button class="config" type="button">C</button>
        </pb-menu-config>
        <pb-menu-user>
          <button class="config" type="button">U</button>
        </pb-menu-user>
      </pb-menu>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }

      this.#html.$logo = this.querySelector('.logo');

      this.#html.$logo.innerText = data.appName;
    }
  },
);
