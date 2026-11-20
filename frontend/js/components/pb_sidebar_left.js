import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, { setBranch, setCommit } from "../api/data.js";
import {
  fetchBranches,
  fetchRemoteBranches,
  fetchSubmodules,
  deleteBranch,
  deleteRemoteBranch,
} from "../api/projects.js";
import { checkout } from "../api/commits.js";
import { toast } from "../lib/toast.js";
import { confirmModal } from "./pb_modal.js";
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
            const view = e.target.closest("button[data-stash]");
            if (view) this.#previewStash(Number(view.dataset.stash));
            const del = e.target.closest("button[data-drop]");
            if (del) this.#drop(del.dataset.drop, del.dataset.label);
          },
        );
        for (const type of ["pb-repository-change", "pb-branch-change"]) {
          document.addEventListener(type, () => this.#render());
        }

        document.addEventListener("pb-history-change", () => this.#load());
        document.addEventListener("pb-commit-select", () => this.#markStash());
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
      // a stash that was dropped or applied cannot stay on show
      if (data.commit?.isStash && !stashes.some((st) => st.hash === data.commit.hash))
        setCommit(null);
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

    // Shows what a stash holds in the preview panel, like a commit: its files, and the
    // diff of each. Clicking it again closes the preview.
    #previewStash(index) {
      const st = this.#stashes[index];
      if (!st?.hash) return;
      if (data.commit?.hash === st.hash) return setCommit(null);
      setCommit({
        hash: st.hash,
        shortHash: st.shortHash,
        parents: [],
        refs: [],
        message: st.message,
        author: { name: `Stash on ${st.branch}`, avatarUrl: null },
        committedAt: st.createdAt,
        files: st.files ?? [],
        isStash: true,
        stashId: st.id,
      });
    }

    #markStash() {
      this.querySelectorAll(".pb-stashes button[data-stash]").forEach((btn) => {
        const st = this.#stashes[btn.dataset.stash];
        const active = !!st?.hash && st.hash === data.commit?.hash;
        btn.classList.toggle("pb-active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
    }

    #changed(message) {
      toast(message);
      document.dispatchEvent(new CustomEvent("pb-history-change"));
    }

    async #delete(name) {
      const repo = data.repository;
      if (!repo) return;
      let unmerged = false;
      const done = await confirmModal({
        title: "Delete branch",
        message: `Delete the branch "${name}"?`,
        confirmLabel: "Delete",
        danger: true,
        action: async () => {
          try {
            await deleteBranch({ repo, name });
          } catch (err) {
            // git keeps unmerged work unless told otherwise: ask again below
            if (!/not fully merged/i.test(err.message)) throw err;
            unmerged = true;
          }
        },
      });
      if (!done) return;
      if (!unmerged) return this.#changed(`Deleted ${name}.`);

      const forced = await confirmModal({
        title: "Delete unmerged branch",
        message: `"${name}" has commits that are not merged anywhere else.\nDelete it anyway? They may be lost.`,
        confirmLabel: "Delete anyway",
        danger: true,
        action: () => deleteBranch({ repo, name, force: true }),
      });
      if (forced) this.#changed(`Deleted ${name}.`);
    }

    async #deleteRemote(name) {
      const repo = data.repository;
      if (!repo) return;
      const done = await confirmModal({
        title: "Delete remote branch",
        message: `Delete "${name}" on the remote?\nThis removes the branch for everyone who uses it.`,
        confirmLabel: "Delete on remote",
        danger: true,
        action: () => deleteRemoteBranch({ repo, name }),
      });
      if (done) this.#changed(`Deleted ${name}.`);
    }

    async #drop(id, label) {
      const repo = data.repository;
      if (!repo) return;
      const done = await confirmModal({
        title: "Drop stash",
        message: `Drop the stash "${label}"?\nIts changes are discarded without being applied.`,
        confirmLabel: "Drop stash",
        danger: true,
        action: () => dropStash({ repo, id }),
      });
      if (done) this.#changed("Stash dropped.");
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
              (st, i) =>
                `<li class="pb-branch"><button type="button" data-stash="${i}"${st.hash && st.hash === data.commit?.hash ? ' class="pb-active" aria-pressed="true"' : ' aria-pressed="false"'} title="${escapeHtml(`${st.id} on ${st.branch}: show what it holds`)}">${ICON_ARCHIVE}${escapeHtml(st.message)}</button>${x("data-drop", st.id, `Drop stash ${st.message}`).replace("<button ", `<button data-label="${escapeHtml(st.message)}" `)}</li>`,
            )
            .join("")
        : `<li class="pb-empty">No stashes.</li>`;
    }
  },
);
