import { getPrefix } from "../lib/helpers.js";
import "./pb-workarea-tree.js";
import "./pb-workarea-backlog.js";
import "./pb-workarea-contributors.js";
import data from "../api/data.js";

customElements.define(
  getPrefix("workarea"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    // Which children show is decided in CSS from the data-area attribute.
    #template = `
      <pb-workarea-empty>
        <p>No project open</p>
        <button type="button" class="pb-btn open-clone">clone a repository</button>
      </pb-workarea-empty>
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
        this.querySelector(".open-clone").addEventListener("click", () =>
          document.dispatchEvent(new CustomEvent("pb-open-clone")),
        );
      }
    }
  },
);
