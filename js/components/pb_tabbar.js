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
      <pb-tab-add></pb-tab-add>
      <pb-tab label="fikret"></pb-tab>
      <pb-tab label="mako zero" class="pb-active"></pb-tab>
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
      }
    }
  },
);
