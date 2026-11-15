import { getPrefix } from "../lib/helpers.js";
import "./pb_sidebar_right_commit.js";
import "./pb_sidebar_right_preview.js";
import data from "../api/data.js";

customElements.define(
  getPrefix("sidebar-right"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
    <pb-collapse-btn class="pb-start"></pb-collapse-btn>
    <div class="pb-panel-content">
      <pb-sidebar-right-preview class="pb-hidden-section"></pb-sidebar-right-preview>
      <pb-sidebar-right-commit></pb-sidebar-right-commit>
    </div>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        // A selected commit shows its preview, otherwise the commit form.
        const $preview = this.querySelector("pb-sidebar-right-preview");
        const $commit = this.querySelector("pb-sidebar-right-commit");
        const sync = () => {
          $preview.classList.toggle("pb-hidden-section", !data.commit);
          $commit.classList.toggle("pb-hidden-section", !!data.commit);
        };
        document.addEventListener("pb-commit-select", sync);
        sync();
      }
    }
  },
);
