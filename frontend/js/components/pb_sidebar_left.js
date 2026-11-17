import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, { setBranch } from "../api/data.js";
import { fetchBranches, fetchRemoteBranches } from "../api/projects.js";
import { fetchStashes } from "../api/stashes.js";

const ICON_BRANCH = icon("branch");
const ICON_ARCHIVE = icon("archive");

customElements.define(
  getPrefix("sidebar-left"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #branches = [];
    #stashes = [];
    #remotes = [];
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
            <li class="pb-empty">No remote branches yet.</li>
          </ul>
        </details>

        <details class="pb-stashes" open>
          <summary>Stashes</summary>
          <ul class="pb-content"></ul>
        </details>

        <details class="pb-submodules" open>
          <summary>Sub Modules</summary>
          <ul class="pb-content">
            <li class="pb-empty">No submodules.</li>
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
          const btn = e.target.closest("button[data-branch]");
          if (btn) setBranch(btn.dataset.branch, { detached: "detached" in btn.dataset });
        });
        for (const type of ["pb-repository-change", "pb-branch-change"]) {
          document.addEventListener(type, () => this.#render());
        }
        // pull, stash, pop and commit move branches, remotes and stashes
        document.addEventListener("pb-history-change", () => this.#load());
        this.#load();
      }
    }

    // Fetched with the project and again after an action that changes them.
    async #load() {
      const loadId = ++this.#loadId;
      const repo = data.repository;
      const [branches, stashes, remotes] = repo
        ? await Promise.all([
            fetchBranches(repo).catch(() => []),
            fetchStashes(repo).catch(() => []),
            fetchRemoteBranches(repo).catch(() => []),
          ])
        : [[], [], []];
      if (loadId !== this.#loadId) return;
      this.#branches = branches;
      this.#stashes = stashes;
      this.#remotes = remotes;
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
            `<li><button type="button" data-branch="${escapeHtml(b.name)}"${b.isDetached ? ' data-detached title="Detached HEAD: on this commit, not on a branch"' : ""}${b.name === data.branch ? ' class="pb-active" aria-current="true"' : ""}>${ICON_BRANCH}${escapeHtml(b.name)}</button></li>`,
        )
        .join("");

      this.querySelector(".pb-remote .pb-content").innerHTML = this.#remotes.length
        ? this.#remotes.map((b) => `<li class="pb-ref" title="${escapeHtml(b.name)}">${ICON_BRANCH}${escapeHtml(b.name)}</li>`).join("")
        : `<li class="pb-empty">No remote branches.</li>`;

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
