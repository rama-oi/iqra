import { getPrefix, escapeHtml } from "../_helpers.js";
import data, { closeTab, selectTab } from "../data.js";
import "./pb_tab.js";
import "./pb_tab_add.js";

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
        this.#html.$tabs = this.querySelector(".pb-tabs");

        const $avatar = this.querySelector('pb-avatar');
        this.querySelector('.config').addEventListener('click', () =>
          document.dispatchEvent(new CustomEvent('pb-open-settings')),
        );
        // the corner avatar always shows the active identity
        document.addEventListener('pb-identity-change', (e) => {
          const identity = e.detail;
          $avatar.setAttribute('name', identity?.name ?? '');
          $avatar.setAttribute('src', identity?.avatarUrl ?? '');
        });

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
