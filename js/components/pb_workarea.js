import { getPrefix } from "../lib/helpers.js";
import "./pb_workarea_empty.js";
import "./pb_workarea_tree.js";
import "./pb_workarea_diffs.js";
import "./pb_workarea_merge.js";
import "./pb_workarea_backlog.js";
import "./pb_workarea_contributors.js";
import data from "../api/data.js";

customElements.define(
  getPrefix("workarea"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    // Which children show is decided in CSS from the data-area attribute.
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

        this.dataset.area = data.area;
        document.addEventListener("pb-area-change", () => {
          this.dataset.area = data.area;
        });

        // with every tab closed only the empty message shows
        const syncEmpty = () => this.toggleAttribute("data-empty", !data.repository);
        document.addEventListener("pb-repository-change", syncEmpty);
        syncEmpty();
      }
    }
  },
);
