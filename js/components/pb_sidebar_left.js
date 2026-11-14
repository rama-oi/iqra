import { getPrefix, escapeHtml } from "../lib/helpers.js";
import data, { setBranch } from "../api/data.js";
import { fetchBranches } from "../api/projects.js";

customElements.define(
  getPrefix("sidebar-left"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #branches = [];
    #repository = data.repository;

    #template = `
      <div class="pb-panel-content">
        <details class="local" open>
          <summary>Local</summary>
          <ul class="content"></ul>
        </details>

        <details class="remote" open>
          <summary>Remote</summary>
          <ul class="content">
            <li><button type="button">v10</button></li>
          </ul>
        </details>

        <details class="submodules" open>
          <summary>Sub Modules</summary>
          <ul class="content">
            <li><button type="button">v10</button></li>
          </ul>
        </details>
      </div>

      <pb-collapse-btn class="pb-end"></pb-collapse-btn>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        // Click a local branch to switch to it.
        this.querySelector(".local .content").addEventListener("click", (e) => {
          const name = e.target.closest("button[data-branch]")?.dataset.branch;
          if (name) setBranch(name);
        });
        for (const type of ["pb-repository-change", "pb-branch-change"]) {
          document.addEventListener(type, () => this.#render());
        }
        this.#load();
      }
    }

    // Branches only change with the project, so fetch once per project.
    async #load() {
      const loadId = ++this.#loadId;
      this.#branches = data.repository ? await fetchBranches(data.repository).catch(() => []) : [];
      if (loadId === this.#loadId) this.#render();
    }

    #render() {
      if (this.#repository !== data.repository) {
        this.#repository = data.repository;
        return this.#load();
      }
      this.querySelector(".local .content").innerHTML = this.#branches
        .map(
          (b) =>
            `<li><button type="button" data-branch="${escapeHtml(b.name)}"${b.name === data.branch ? ' class="pb-active"' : ""}>${escapeHtml(b.name)}</button></li>`,
        )
        .join("");
    }

  },
);
