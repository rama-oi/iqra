import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { createCommit } from "../api/commits.js";
import { fetchStatus } from "../api/changes.js";
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
        <summary>Unstaged Files <span class="pb-count"></span></summary>
        <ul class="pb-content"></ul>
      </details>

      <details class="pb-staged" open>
        <summary>Staged Files <span class="pb-count"></span></summary>
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
        const btn = e.target.closest("button[data-group]");
        if (!btn) return;
        const staged = btn.dataset.group === "staged";
        const { path, status } = this.#files[btn.dataset.group][btn.dataset.index];
        const file = { path, status, staged };
        setFile(isSelectedFile(file) ? null : file);
      });
      document.addEventListener("pb-file-select", () => this.#markSelected());

      for (const type of ["pb-repository-change", "pb-branch-change", "pb-history-change"]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      if (!data.repository) return;
      try {
        const files = await fetchStatus({ repo: data.repository });
        if (loadId !== this.#loadId) return;
        this.#files = files;
        for (const group of ["unstaged", "staged"]) this.#renderGroup(group);
        this.#markSelected();

        // the open diff belongs to a file that is no longer a change (it was committed)
        const open = data.file;
        if (open && !open.commit && !files[open.staged ? "staged" : "unstaged"].some((f) => f.path === open.path)) {
          setFile(null);
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
      $details.querySelector(".pb-content").innerHTML = files.length
        ? files
            .map(
              (f, i) => `
            <li><button type="button" class="pb-file" data-group="${group}" data-index="${i}" title="${escapeHtml(f.path)}">
              <span class="pb-file-status" data-status="${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
              <span class="pb-file-path">${escapeHtml(f.path)}</span>
            </button></li>`,
            )
            .join("")
        : `<li class="pb-empty">No files.</li>`;
    }

    #markSelected() {
      for (const btn of this.querySelectorAll("button[data-group]")) {
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
