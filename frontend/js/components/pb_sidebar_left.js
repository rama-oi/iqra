import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, { setBranch } from "../api/data.js";
import { fetchBranches, fetchRemoteBranches, deleteBranch } from "../api/projects.js";
import { toast } from "../lib/toast.js";
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
          const del = e.target.closest("button[data-delete]");
          if (del) this.#delete(del.dataset.delete);
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

    async #delete(name) {
      const repo = data.repository;
      if (!repo || !confirm(`Delete the branch "${name}"?`)) return;
      try {
        try {
          await deleteBranch({ repo, name });
        } catch (err) {
          if (!/not fully merged/i.test(err.message)) throw err;
          if (!confirm(`"${name}" has commits that are not merged anywhere else.\nDelete it anyway? They may be lost.`)) return;
          await deleteBranch({ repo, name, force: true });
        }
        toast(`Deleted ${name}.`);
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        toast(err.message || "Could not delete the branch.", { error: true });
      }
    }

    #render() {
      if (this.#repository !== data.repository) {
        this.#repository = data.repository;
        return this.#load();
      }
      this.querySelector(".pb-local .pb-content").innerHTML = this.#branches
        .map((b) => {
          const name = escapeHtml(b.name);
          const active = b.name === data.branch;
          // the delete button is a sibling of the switch button, never inside it
          const del =
            active || b.isDetached
              ? ""
              : `<button type="button" class="pb-delete-branch pb-danger" data-delete="${name}" title="Delete branch ${name}" aria-label="Delete branch ${name}">${icon("times")}</button>`;
          return `<li class="pb-branch"><button type="button" data-branch="${name}"${b.isDetached ? ' data-detached title="Detached HEAD: on this commit, not on a branch"' : ""}${active ? ' class="pb-active" aria-current="true"' : ""}>${ICON_BRANCH}${name}</button>${del}</li>`;
        })
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
