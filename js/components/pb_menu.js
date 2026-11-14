import { getPrefix } from "../lib/helpers.js";
import data from "../api/data.js";

// The corner of the tab bar: the active identity's avatar, opens the settings.
customElements.define(
  getPrefix("menu"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $avatar: undefined,
    };

    #template = `
      <button class="config" type="button" aria-label="Settings" title="Settings">
        <pb-avatar class="pb-medium"></pb-avatar>
      </button>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.#html.$avatar = this.querySelector("pb-avatar");
      this.querySelector(".config").addEventListener("click", () =>
        document.dispatchEvent(new CustomEvent("pb-open-settings")),
      );
      document.addEventListener("pb-identity-change", () => this.#render());
      this.#render();
    }

    #render() {
      const { $avatar } = this.#html;
      $avatar.setAttribute("name", data.identity?.name ?? "");
      $avatar.setAttribute("src", data.identity?.avatarUrl ?? "");
    }
  },
);
