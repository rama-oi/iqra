import { getPrefix } from "../lib/helpers.js";
import "./pb_sidebar_right_commit.js";
import "./pb_sidebar_right_preview.js";
import "./pb_sidebar_right_submodule.js";
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
      <pb-sidebar-right-submodule class="pb-hidden-section"></pb-sidebar-right-submodule>
      <pb-sidebar-right-commit></pb-sidebar-right-commit>
    </div>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        const $preview = this.querySelector("pb-sidebar-right-preview");
        const $submodule = this.querySelector("pb-sidebar-right-submodule");
        const $commit = this.querySelector("pb-sidebar-right-commit");
        const sync = () => {
          $preview.classList.toggle(
            "pb-hidden-section",
            !data.repository || !data.commit,
          );
          $submodule.classList.toggle(
            "pb-hidden-section",
            !data.repository || !!data.commit || !data.submodule,
          );
          $commit.classList.toggle(
            "pb-hidden-section",
            !data.repository || !!data.commit || !!data.submodule,
          );
        };
        document.addEventListener("pb-commit-select", sync);
        document.addEventListener("pb-submodule-select", sync);
        document.addEventListener("pb-repository-change", sync);
        sync();
      }
    }
  },
);
