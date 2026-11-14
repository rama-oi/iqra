import { getPrefix, escapeHtml } from "../lib/helpers.js";
import data, { setBranch } from "../api/data.js";
import { fetchBranches } from "../api/projects.js";
import { fetchStashes } from "../api/stashes.js";

// Decorative pixel icons (the iqra font maps these emoji to its own glyphs).
const ICON_BRANCH = `<span class="pb-icon" aria-hidden="true">🌱</span>`;
const ICON_ARCHIVE = `<span class="pb-icon" aria-hidden="true">🗃</span>`;

customElements.define(
  getPrefix("sidebar-left"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #branches = [];
    #stashes = [];
    #repository = data.repository;

    #template = `
      <div class="pb-panel-content">
        <details class="pb-local" open>
          <summary>Local</summary>
          <ul class="pb-content"></ul>
        </details>

        <details class="pb-remote" open>
          <summary>Remote</summary>
          <ul class="pb-content">
            <li><button type="button">${ICON_BRANCH}v10</button></li>
          </ul>
        </details>

        <details class="pb-stashes" open>
          <summary>Stashes</summary>
          <ul class="pb-content"></ul>
        </details>

        <details class="pb-submodules" open>
          <summary>Sub Modules</summary>
          <ul class="pb-content">
            <li><button type="button">${ICON_ARCHIVE}v10</button></li>
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
        this.querySelector(".pb-local .pb-content").addEventListener("click", (e) => {
          const name = e.target.closest("button[data-branch]")?.dataset.branch;
          if (name) setBranch(name);
        });
        for (const type of ["pb-repository-change", "pb-branch-change"]) {
          document.addEventListener(type, () => this.#render());
        }
        this.#load();
      }
    }

    // Branches and stashes only change with the project, so fetch once per project.
    async #load() {
      const loadId = ++this.#loadId;
      const repo = data.repository;
      const [branches, stashes] = repo
        ? await Promise.all([fetchBranches(repo).catch(() => []), fetchStashes(repo).catch(() => [])])
        : [[], []];
      if (loadId !== this.#loadId) return;
      this.#branches = branches;
      this.#stashes = stashes;
      this.#render();
    }

    #render() {
      if (this.#repository !== data.repository) {
        this.#repository = data.repository;
        return this.#load();
      }
      this.querySelector(".pb-local .pb-content").innerHTML = this.#branches
        .map(
          (b) =>
            `<li><button type="button" data-branch="${escapeHtml(b.name)}"${b.name === data.branch ? ' class="pb-active"' : ""}>${ICON_BRANCH}${escapeHtml(b.name)}</button></li>`,
        )
        .join("");

      this.querySelector(".pb-stashes .pb-content").innerHTML = this.#stashes.length
        ? this.#stashes
            .map(
              (st) =>
                `<li><button type="button" title="${escapeHtml(`${st.id} on ${st.branch}`)}">${ICON_ARCHIVE}${escapeHtml(st.message)}</button></li>`,
            )
            .join("")
        : `<li class="pb-empty">No stashes.</li>`;
    }

  },
);
