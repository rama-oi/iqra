import { getPrefix, icon } from "../lib/helpers.js";
import "./pb_view_switcher.js";

customElements.define(
  getPrefix("toolbar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <pb-view-switcher></pb-view-switcher>
      <button type="button" class="pb-restore">
        ${icon("arrow-left")}
      </button>
      <button type="button" class="pb-redo">
        ${icon("arrow-right")}
      </button>
      <button type="button" class="pb-pull">
        ${icon("download-alt")}
      </button>
      <button type="button" class="pb-push">
        ${icon("upload-alt")}
      </button>
      <button type="button" class="pb-branch">
        ${icon("branch")}
      </button>
      <button type="button" class="pb-stash">
        ${icon("arrow-down")}
      </button>
      <button type="button" class="pb-pop">
        ${icon("arrow-up")}
      </button>
      <button type="button" class="pb-terminal">
        ${icon("code")}
      </button>
      
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
