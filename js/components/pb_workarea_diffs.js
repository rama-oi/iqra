import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { fetchDiff } from "../api/changes.js";
import { parseUnifiedDiff } from "../lib/diff.js";
import data, { setFile } from "../api/data.js";

const STATUS = { A: "added", M: "modified", D: "deleted" };

// The changes of one file as a unified diff. Opens when a file is selected in the
// commit panel (working tree) or in the preview panel (a commit); see getView().
customElements.define(
  getPrefix("workarea-diffs"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;

    #template = `
      <section class="pb-table-header">
        <div class="pb-diff-title">
          <span class="pb-file-status"></span>
          <span class="pb-diff-path"></span>
          <span class="pb-diff-where"></span>
          <button type="button" class="pb-btn pb-btn-outline pb-diff-close">close</button>
        </div>
      </section>
      <section class="pb-diff"></section>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.querySelector(".pb-diff-close").addEventListener("click", () => setFile(null));
      document.addEventListener("pb-file-select", () => this.#load());
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      const file = data.file;
      if (!file || !data.repository) return;

      const $status = this.querySelector(".pb-file-status");
      $status.textContent = file.status;
      $status.dataset.status = file.status;
      this.querySelector(".pb-diff-path").textContent = file.path;
      this.querySelector(".pb-diff-where").textContent = file.commit
        ? `in ${file.commit.slice(0, 7)}`
        : file.staged
          ? "staged"
          : "unstaged";

      const body = this.querySelector(".pb-diff");
      body.innerHTML = `<p class="pb-status">Loading…</p>`;
      try {
        const diff = await fetchDiff({
          repo: data.repository,
          path: file.path,
          staged: file.staged,
          commit: file.commit,
        });
        if (loadId !== this.#loadId) return;
        body.innerHTML = this.#render(diff);
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        body.innerHTML = `<p class="pb-error">Could not load the diff.</p>`;
      }
    }

    #render(diff) {
      if (diff.binary) return `<p class="pb-status">Binary file, no diff to show.</p>`;
      const hunks = parseUnifiedDiff(diff.patch);
      if (!hunks.length) {
        return `<p class="pb-status">No changes in this ${escapeHtml(STATUS[diff.status] ?? "")} file.</p>`;
      }
      return hunks
        .map(
          (hunk) => `
          <div class="pb-diff-hunk">${escapeHtml(hunk.header)}</div>
          ${hunk.lines
            .map(
              (l) => `
            <div class="pb-diff-line pb-${l.type}">
              <span class="pb-diff-no">${l.oldNo ?? ""}</span>
              <span class="pb-diff-no">${l.newNo ?? ""}</span>
              <span class="pb-diff-sign">${l.type === "add" ? "+" : l.type === "del" ? "-" : ""}</span>
              <code class="pb-diff-text">${escapeHtml(l.text)}</code>
            </div>`,
            )
            .join("")}`,
        )
        .join("");
    }
  },
);
