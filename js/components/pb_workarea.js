import { getPrefix } from "../_helpers.js";
// import data from "../data.js";

customElements.define(
  getPrefix("workarea"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <pb-workarea-empty></pb-workarea-empty>
      <pb-workarea-tree></pb-workarea-tree>
      <pb-workarea-diffs></pb-workarea-diffs>
      <pb-workarea-merge></pb-workarea-merge>
      <pb-workarea-backlog></pb-workarea-backlog>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
