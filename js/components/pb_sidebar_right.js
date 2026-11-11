import { getPrefix } from "../_helpers.js";
import "./pb_sidebar_right_commit.js";
// import data from "../data.js";

customElements.define(
  getPrefix("sidebar-right"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
      <pb-sidebar-right-commit></pb-sidebar-right-commit>
      <pb-sidebar-right-preview></pb-sidebar-right-preview>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }
    }
  },
);
