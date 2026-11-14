import { getPrefix, escapeHtml } from "../lib/helpers.js";
import data, { closeTab, selectTab } from "../api/data.js";
import "./pb_tab.js";
import "./pb_tab_add.js";
import "./pb_menu.js";

customElements.define(
  getPrefix("tabbar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $tabs: undefined,
    };

    #template = `
      <pb-tab-add></pb-tab-add>
      <div class="pb-tabs"></div>
      <span class="pb-flex-separator"></span>
      <pb-menu></pb-menu>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
        this.#html.$tabs = this.querySelector(".pb-tabs");

        this.#html.$tabs.addEventListener("pb-tab-select", (e) => selectTab(e.detail));
        this.#html.$tabs.addEventListener("pb-tab-close", (e) => closeTab(e.detail));
        for (const type of ["pb-tabs-change", "pb-repository-change"]) {
          document.addEventListener(type, () => this.#render());
        }
        this.#render();
      }
    }

    #render() {
      this.#html.$tabs.innerHTML = data.tabs
        .map(
          (tab) =>
            `<pb-tab label="${escapeHtml(tab.name)}"${tab.name === data.repository ? ' class="pb-active"' : ""}></pb-tab>`,
        )
        .join("");
    }
  },
);
