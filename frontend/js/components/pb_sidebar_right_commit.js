import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import { createCommit } from "../api/commits.js";
import { fetchStatus } from "../api/changes.js";
import { stage, unstage } from "../api/git.js";
import { toast } from "../lib/toast.js";
import data, { setFile, isSelectedFile } from "../api/data.js";

customElements.define(
  getPrefix("sidebar-right-commit"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;
    #loadId = 0;
    #files = { staged: [], unstaged: [] };

    #html = {};

    #template = `
      <details class="pb-unstaged" open>
        <summary>Unstaged Files <span class="pb-count"></span>
          <button type="button" class="pb-file-action pb-all" data-action="move" data-group="unstaged" title="Stage all" aria-label="Stage all files">${icon("plus")}</button>
        </summary>
        <ul class="pb-content"></ul>
      </details>

      <details class="pb-staged" open>
        <summary>Staged Files <span class="pb-count"></span>
          <button type="button" class="pb-file-action pb-all" data-action="move" data-group="staged" title="Unstage all" aria-label="Unstage all files">${icon("minus")}</button>
        </summary>
        <ul class="pb-content"></ul>
      </details>

      <div class="pb-wrapper">
        <p>Commit</p>
        <input type="text" class="pb-subject" placeholder="Summary" />
        <textarea rows="6" class="pb-body" placeholder="Description"></textarea>
        <div class="pb-actions">
          <button class="pb-commit-btn pb-btn" type="button">commit</button>
          <button class="pb-amend-btn pb-btn pb-btn-outline" type="button"
            title="Add the staged files to the last commit. Leave the message empty to keep it.">amend</button>
        </div>
        <p class="pb-status" role="status" hidden></p>
      </div>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $subject: $(".pb-subject"),
        $body: $(".pb-body"),
        $commit: $(".pb-commit-btn"),
        $amend: $(".pb-amend-btn"),
        $status: $(".pb-status"),
      };

      this.#html.$commit.addEventListener("click", () => this.#submit({ amend: false }));
      this.#html.$amend.addEventListener("click", () => this.#submit({ amend: true }));

      // Click a file to see its diff; click it again to close the diff.
      this.addEventListener("click", (e) => {
        const action = e.target.closest("button[data-action]");
        if (action) {
          e.preventDefault(); // the "all" buttons sit inside a <summary>
          return this.#move(action);
        }
        const btn = e.target.closest("button.pb-file[data-group]");
        if (!btn) return;
        const staged = btn.dataset.group === "staged";
        const { path, status } = this.#files[btn.dataset.group][btn.dataset.index];
        const file = { path, status, staged };
        setFile(isSelectedFile(file) ? null : file);
      });
      document.addEventListener("pb-file-select", () => this.#markSelected());

      for (const type of ["pb-repository-change", "pb-branch-change", "pb-history-change", "pb-changes-change"]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    // Stage or unstage one file (its button) or a whole group (the "all" button).
    async #move(btn) {
      if (!data.repository) return;
      const group = btn.dataset.group;
      const files = this.#files[group];
      const paths = btn.dataset.index === undefined ? files.map((f) => f.path) : [files[btn.dataset.index]?.path];
      if (!paths.length || paths[0] === undefined) return;
      try {
        await (group === "staged" ? unstage : stage)({ repo: data.repository, paths });
      } catch (err) {
        console.error(err);
        toast(err.message || "Something went wrong, try again.", { error: true });
      }
      document.dispatchEvent(new CustomEvent("pb-changes-change"));
    }

    async #load() {
      const loadId = ++this.#loadId;
      if (!data.repository) {
        this.#files = { staged: [], unstaged: [] };
        for (const group of ["unstaged", "staged"]) this.#renderGroup(group);
        return;
      }
      try {
        const files = await fetchStatus({ repo: data.repository });
        if (loadId !== this.#loadId) return;
        this.#files = files;
        for (const group of ["unstaged", "staged"]) this.#renderGroup(group);
        this.#markSelected();

        // The open diff follows its file to the other list when it was staged or
        // unstaged, and closes when the file is no longer a change (it was committed).
        const open = data.file;
        if (open && !open.commit) {
          const here = files[open.staged ? "staged" : "unstaged"].some((f) => f.path === open.path);
          const there = files[open.staged ? "unstaged" : "staged"].find((f) => f.path === open.path);
          if (!here) setFile(there ? { path: there.path, status: there.status, staged: !open.staged } : null);
        }
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        this.querySelector(".pb-unstaged .pb-content").innerHTML = `<li class="pb-error">Could not load changes.</li>`;
      }
    }

    #renderGroup(group) {
      const files = this.#files[group];
      const $details = this.querySelector(`.pb-${group}`);
      $details.querySelector(".pb-count").textContent = files.length ? `(${files.length})` : "";
      $details.querySelector(".pb-all").hidden = !files.length;
      $details.querySelector(".pb-content").innerHTML = files.length
        ? files
            .map(
              (f, i) => `
            <li class="pb-file-row"><button type="button" class="pb-file" data-group="${group}" data-index="${i}" title="${escapeHtml(f.path)}">
              <span class="pb-file-status" data-status="${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
              <span class="pb-file-path">${escapeHtml(f.path)}</span>
            </button><button type="button" class="pb-file-action" data-action="move" data-group="${group}" data-index="${i}"
              aria-label="${group === "staged" ? "Unstage" : "Stage"} ${escapeHtml(f.path)}"
              title="${group === "staged" ? "Unstage" : "Stage"}">${icon(group === "staged" ? "minus" : "plus")}</button></li>`,
            )
            .join("")
        : `<li class="pb-empty">No files.</li>`;
    }

    #markSelected() {
      for (const btn of this.querySelectorAll("button.pb-file[data-group]")) {
        const { path, status } = this.#files[btn.dataset.group][btn.dataset.index];
        const active = isSelectedFile({ path, status, staged: btn.dataset.group === "staged" });
        btn.classList.toggle("pb-active", active);
        btn.setAttribute("aria-pressed", String(active));
      }
    }

    #setStatus(text, isError = false) {
      const { $status } = this.#html;
      $status.textContent = text;
      $status.hidden = !text;
      $status.classList.toggle("pb-error", isError);
    }

    #setBusy(busy) {
      this.#busy = busy;
      this.#html.$commit.disabled = busy;
      this.#html.$amend.disabled = busy;
    }

    async #submit({ amend }) {
      if (this.#busy || !data.repository) return;
      const { $subject, $body } = this.#html;
      const subject = $subject.value.trim();
      const body = $body.value.trim();

      // a new commit needs a message; an amend can keep the previous one
      if (!subject && (!amend || body)) {
        return this.#setStatus("Write a summary first.", true);
      }
      const message = subject ? (body ? `${subject}\n\n${body}` : subject) : "";

      this.#setStatus("");
      this.#setBusy(true);
      try {
        const commit = await createCommit({
          repo: data.repository,
          branch: data.branch,
          message,
          amend,
        });
        $subject.value = "";
        $body.value = "";
        this.#setStatus(`${amend ? "Amended" : "Committed"} ${commit.hash.slice(0, 7)}.`);
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        console.error(err);
        this.#setStatus(err.message || "Something went wrong, try again.", true);
      } finally {
        this.#setBusy(false);
      }
    }
  },
);
