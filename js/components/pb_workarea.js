import { getPrefix } from "../lib/helpers.js";
import "./pb_workarea_empty.js";
import "./pb_workarea_tree.js";
import "./pb_workarea_diffs.js";
import "./pb_workarea_merge.js";
import "./pb_workarea_backlog.js";
import "./pb_workarea_contributors.js";
import data, { getView } from "../api/data.js";

customElements.define(
  getPrefix("workarea"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    // Which child shows is decided in CSS from data-view (see getView in data.js).
    #template = `
      <pb-workarea-empty></pb-workarea-empty>
      <pb-workarea-tree></pb-workarea-tree>
      <pb-workarea-diffs></pb-workarea-diffs>
      <pb-workarea-merge></pb-workarea-merge>
      <pb-workarea-backlog></pb-workarea-backlog>
      <pb-workarea-contributors></pb-workarea-contributors>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;

        // which child shows is decided in CSS from this one attribute
        const sync = () => (this.dataset.view = getView());
        for (const type of ["pb-area-change", "pb-repository-change", "pb-file-select"]) {
          document.addEventListener(type, sync);
        }
        sync();
      }
    }
  },
);
