import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, { setBranch } from "../api/data.js";
import {
  fetchBranches,
  fetchRemoteBranches,
  fetchSubmodules,
  deleteBranch,
  deleteRemoteBranch,
} from "../api/projects.js";
import { checkout } from "../api/commits.js";
import { toast } from "../lib/toast.js";
import { fetchStashes, dropStash } from "../api/stashes.js";

const ICON_BRANCH = icon("branch");
const ICON_ARCHIVE = icon("archive");

customElements.define(
  getPrefix("sidebar-left"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #branches = [];
    #stashes = [];
    #submodules = [];
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

        this.querySelector(".pb-local .pb-content").addEventListener(
          "click",
          (e) => {
            const btn = e.target.closest("button[data-branch]");
            if (btn && !("detached" in btn.dataset))
              this.#switchTo({ branch: btn.dataset.branch });
            const del = e.target.closest("button[data-delete]");
            if (del) this.#delete(del.dataset.delete);
          },
        );
        this.querySelector(".pb-remote .pb-content").addEventListener(
          "click",
          (e) => {
            const btn = e.target.closest("button[data-remote]");
            if (btn) this.#switchTo({ remote: btn.dataset.remote });
            const del = e.target.closest("button[data-delete-remote]");
            if (del) this.#deleteRemote(del.dataset.deleteRemote);
          },
        );
        this.querySelector(".pb-stashes .pb-content").addEventListener(
          "click",
          (e) => {
            const del = e.target.closest("button[data-drop]");
            if (del) this.#drop(del.dataset.drop, del.dataset.label);
          },
        );
        for (const type of ["pb-repository-change", "pb-branch-change"]) {
          document.addEventListener(type, () => this.#render());
        }

        document.addEventListener("pb-history-change", () => this.#load());
        this.#load();
      }
    }

    async #load() {
      const loadId = ++this.#loadId;
      const repo = data.repository;
      const [branches, stashes, remotes, submodules] = repo
        ? await Promise.all([
            fetchBranches(repo).catch(() => []),
            fetchStashes(repo).catch(() => []),
            fetchRemoteBranches(repo).catch(() => []),
            fetchSubmodules(repo).catch(() => []),
          ])
        : [[], [], [], []];
      if (loadId !== this.#loadId) return;
      this.#submodules = submodules;
      this.#branches = branches;
      this.#stashes = stashes;
      this.#remotes = remotes;
      this.#render();
    }

    async #switchTo({ branch, remote }) {
      const repo = data.repository;
      if (!repo || (branch && branch === data.branch && !data.detached)) return;
      try {
        const { currentBranch } = await checkout({ repo, branch, remote });
        setBranch(currentBranch ?? branch);
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        toast(err.message || "Could not switch branches.", { error: true });
      }
    }

    async #delete(name) {
      const repo = data.repository;
      if (!repo || !confirm(`Delete the branch "${name}"?`)) return;
      try {
        try {
          await deleteBranch({ repo, name });
        } catch (err) {
          if (!/not fully merged/i.test(err.message)) throw err;
          if (
            !confirm(
              `"${name}" has commits that are not merged anywhere else.\nDelete it anyway? They may be lost.`,
            )
          )
            return;
          await deleteBranch({ repo, name, force: true });
        }
        toast(`Deleted ${name}.`);
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        toast(err.message || "Could not delete the branch.", { error: true });
      }
    }

    async #deleteRemote(name) {
      const repo = data.repository;
      if (
        !repo ||
        !confirm(
          `Delete "${name}" on the remote?\nThis removes the branch for everyone who uses it.`,
        )
      )
        return;
      try {
        await deleteRemoteBranch({ repo, name });
        toast(`Deleted ${name}.`);
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        toast(err.message || "Could not delete the remote branch.", {
          error: true,
        });
      }
    }

    async #drop(id, label) {
      const repo = data.repository;
      if (
        !repo ||
        !confirm(
          `Drop the stash "${label}"?\nIts changes are discarded without being applied.`,
        )
      )
        return;
      try {
        await dropStash({ repo, id });
        toast("Stash dropped.");
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        toast(err.message || "Could not drop the stash.", { error: true });
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

          const del =
            active || b.isDetached
              ? ""
              : `<button type="button" class="pb-delete-branch pb-danger" data-delete="${name}" title="Delete branch ${name}" aria-label="Delete branch ${name}">${icon("trash")}</button>`;
          return `<li class="pb-branch"><button type="button" data-branch="${name}"${b.isDetached ? ' data-detached title="Detached HEAD: on this commit, not on a branch"' : ""}${active ? ' class="pb-active" aria-current="true"' : ""}>${ICON_BRANCH}${name}</button>${del}</li>`;
        })
        .join("");

      const x = (attr, value, what) =>
        `<button type="button" class="pb-delete-branch pb-danger" ${attr}="${escapeHtml(value)}" title="${escapeHtml(what)}" aria-label="${escapeHtml(what)}">${icon("trash")}</button>`;

      this.querySelector(".pb-remote .pb-content").innerHTML = this.#remotes
        .length
        ? this.#remotes
            .map(
              (b) =>
                `<li class="pb-branch"><button type="button" data-remote="${escapeHtml(b.name)}" title="Check out ${escapeHtml(b.name)}">${ICON_BRANCH}${escapeHtml(b.name)}</button>${x("data-delete-remote", b.name, `Delete ${b.name} on the remote`)}</li>`,
            )
            .join("")
        : `<li class="pb-empty">No remote branches.</li>`;

      this.querySelector(".pb-submodules .pb-content").innerHTML = this
        .#submodules.length
        ? this.#submodules
            .map(
              (m) =>
                `<li class="pb-ref" title="${escapeHtml(`${m.url}${m.initialized ? "" : " (not cloned)"}`)}">${ICON_BRANCH}${escapeHtml(m.path)}${m.initialized ? "" : ` <span class="pb-hint">not cloned</span>`}</li>`,
            )
            .join("")
        : `<li class="pb-empty">No submodules.</li>`;

      this.querySelector(".pb-stashes .pb-content").innerHTML = this.#stashes
        .length
        ? this.#stashes
            .map(
              (st) =>
                `<li class="pb-branch"><button type="button" title="${escapeHtml(`${st.id} on ${st.branch}`)}">${ICON_ARCHIVE}${escapeHtml(st.message)}</button>${x("data-drop", st.id, `Drop stash ${st.message}`).replace("<button ", `<button data-label="${escapeHtml(st.message)}" `)}</li>`,
            )
            .join("")
        : `<li class="pb-empty">No stashes.</li>`;
    }
  },
);
