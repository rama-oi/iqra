import { getPrefix } from "../_helpers.js";
// import data from "../data.js";

customElements.define(
  getPrefix("workarea-tree"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
    <section class="pb-table-header">
      <div class="pb-row">
        <div class="pb-column-branch">
          Branch
        </div>
        <div class="pb-column-graph">
          Graph
        </div>
        <div class="pb-column-message">
          Message
        </div>
      </div>
    </section>
    <section class="pb-table-body">
      
      <div class="pb-row">
        <div class="pb-column-branch">
          v10
        </div>
        <div class="pb-column-graph">
          <pb-avatar class="pb-small"></pb-avatar>
        </div>
        <div class="pb-column-message">
          Start Boilerplate
        </div>
      </div>

      <div class="pb-row">
        <div class="pb-column-branch">
          v10
        </div>
        <div class="pb-column-graph">
          ●─┐
        </div>
        <div class="pb-column-message">
          Start Boilerplate
        </div>
      </div>

      <div class="pb-row">
        <div class="pb-column-branch">
          v10
        </div>
        <div class="pb-column-graph">
          │&nbsp;<pb-avatar class="pb-small"></pb-avatar>
        </div>
        <div class="pb-column-message">
          Start Boilerplate
        </div>
      </div>

      <div class="pb-row">
        <div class="pb-column-branch">
          v10
        </div>
        <div class="pb-column-graph">
          <pb-avatar class="pb-small"></pb-avatar>┘
        </div>
        <div class="pb-column-message">
          Start Boilerplate
        </div>
      </div>

    </section>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
