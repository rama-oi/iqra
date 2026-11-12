import { getPrefix } from "../_helpers.js";
import "./pb_sidebar_right_commit.js";
import "./pb_sidebar_right_preview.js";
// import data from "../data.js";

customElements.define(
  getPrefix("sidebar-right"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
    <pb-collapse-btn class="pb-start"></pb-collapse-btn>
    <div class="pb-panel-content">
      <pb-sidebar-right-preview></pb-sidebar-right-preview>
      <pb-sidebar-right-commit class="pb-hidden-section"></pb-sidebar-right-commit>
    </div>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }
    }
  },
);
