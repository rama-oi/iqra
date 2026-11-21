import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { fetchDiff } from "../api/changes.js";
import { stageLines } from "../api/git.js";
import { toast } from "../lib/toast.js";
import { parseUnifiedDiff } from "../lib/diff.js";
import data, { setFile } from "../api/data.js";
import { load, save } from "../store/storage.js";
import MOCK from "../api/config.js";

const STATUS = { A: "added", M: "modified", D: "deleted" };

customElements.define(
  getPrefix("workarea-diffs"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #applyWrap = () => {};
    #diff = null;
    #selected = new Set();

    #template = `
      <section class="pb-table-header">
        <div class="pb-diff-title">
          <span class="pb-file-status"></span>
          <span class="pb-diff-path"></span>
          <span class="pb-diff-where"></span>
          <button type="button" class="pb-btn pb-btn-outline pb-diff-lines" hidden disabled></button>
          <button type="button" class="pb-btn pb-btn-outline pb-diff-wrap" aria-pressed="false" title="Break long lines instead of scrolling sideways">wrap</button>
          <button type="button" class="pb-btn pb-btn-outline pb-diff-close">close</button>
        </div>
      </section>
      <section class="pb-diff"></section>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.querySelector(".pb-diff-close").addEventListener("click", () =>
        setFile(null),
      );

      const $wrap = this.querySelector(".pb-diff-wrap");
      const applyWrap = (wrap) => {
        $wrap.setAttribute("aria-pressed", String(wrap));
        this.querySelector(".pb-diff").classList.toggle("pb-wrap", wrap);
      };
      this.#applyWrap = applyWrap;
      applyWrap(load("diffWrap", false, (v) => typeof v === "boolean"));
      $wrap.addEventListener("click", () => {
        const wrap = $wrap.getAttribute("aria-pressed") !== "true";
        save("diffWrap", wrap);
        applyWrap(wrap);
      });
      this.querySelector(".pb-diff-lines").addEventListener("click", () =>
        this.#applyLines(),
      );
      this.querySelector(".pb-diff").addEventListener("change", (e) => {
        const box = e.target.closest("input[type=checkbox]");
        if (!box) return;
        const hunk = box.dataset.hunk;
        const lines = hunk
          ? [
              ...this.querySelectorAll(
                `input[data-line][data-in-hunk="${hunk}"]`,
              ),
            ]
          : [box];
        for (const b of lines) {
          b.checked = box.checked;
          const n = Number(b.dataset.line);
          if (box.checked) this.#selected.add(n);
          else this.#selected.delete(n);
        }
        this.#syncLinesButton();
      });
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
      this.#diff = null;
      this.#selected = new Set();
      this.#syncLinesButton();
      body.innerHTML = `<p class="pb-status">Loading…</p>`;
      try {
        const diff = await fetchDiff({
          repo: data.repository,
          path: file.path,
          staged: file.staged,
          commit: file.commit,
        });
        if (loadId !== this.#loadId) return;
        // single lines can be picked in changes of the working copy, never in a commit
        const pickable =
          !file.commit &&
          !diff.binary &&
          !diff.truncated &&
          diff.status === "M" &&
          !MOCK.changes;
        this.#diff = pickable ? { file, patch: diff.patch } : null;
        body.innerHTML = this.#render(diff, pickable);
        this.#syncLinesButton();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        body.innerHTML = `<p class="pb-error">Could not load the diff.</p>`;
      }
    }

    #syncLinesButton() {
      const btn = this.querySelector(".pb-diff-lines");
      btn.hidden = !this.#diff;
      if (!this.#diff) return;
      const n = this.#selected.size;
      const staged = !!this.#diff.file.staged;
      btn.disabled = n === 0;
      btn.textContent = `${staged ? "Unstage" : "Stage"} ${n || ""} line${n === 1 ? "" : "s"}`.replace("  ", " ");
      btn.title = n
        ? `${staged ? "Take" : "Put"} the ticked lines ${staged ? "out of" : "into"} the next commit`
        : "Tick the changed lines you want first";
    }

    async #applyLines() {
      const ctx = this.#diff;
      if (!ctx || !this.#selected.size || !data.repository) return;
      const btn = this.querySelector(".pb-diff-lines");
      btn.disabled = true;
      try {
        await stageLines({
          repo: data.repository,
          path: ctx.file.path,
          staged: !!ctx.file.staged,
          patch: ctx.patch,
          lines: [...this.#selected].sort((a, b) => a - b),
        });
      } catch (err) {
        console.error(err);
        toast(err.message || "Could not apply those lines.");
        btn.disabled = false;
        return;
      }
      toast(ctx.file.staged ? "Lines unstaged." : "Lines staged.");
      document.dispatchEvent(new CustomEvent("pb-changes-change"));
      this.#load();
    }

    #render(diff, pickable = false) {
      if (diff.binary)
        return `<p class="pb-status">Binary file, no diff to show.</p>`;
      const hunks = parseUnifiedDiff(diff.patch);
      if (!hunks.length) {
        return `<p class="pb-status">No changes in this ${escapeHtml(STATUS[diff.status] ?? "")} file.</p>`;
      }
      let n = 0;
      return `<div class="pb-diff-rows${pickable ? " pb-pickable" : ""}">${hunks
        .map(
          (hunk, h) => `
          <div class="pb-diff-hunk">${pickable ? `<input type="checkbox" data-hunk="${h}" aria-label="Tick every changed line of this part" title="Tick every changed line of this part">` : ""}${escapeHtml(hunk.header)}</div>
          ${hunk.lines
            .map(
              (l) => `
            <div class="pb-diff-line pb-${l.type}">
              ${pickable ? (l.type === "add" || l.type === "del" ? `<input type="checkbox" data-line="${n++}" data-in-hunk="${h}" aria-label="Tick this line">` : "<span></span>") : ""}
              <span class="pb-diff-no">${l.oldNo ?? ""}</span>
              <span class="pb-diff-no">${l.newNo ?? ""}</span>
              <span class="pb-diff-sign">${l.type === "add" ? "+" : l.type === "del" ? "-" : ""}</span>
              <code class="pb-diff-text">${escapeHtml(l.text)}</code>
            </div>`,
            )
            .join("")}`,
        )
        .join("")}</div>`;
    }
  },
);
