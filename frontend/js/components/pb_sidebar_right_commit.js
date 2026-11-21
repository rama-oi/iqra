import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import { createCommit } from "../api/commits.js";
import { fetchStatus } from "../api/changes.js";
import { stage, unstage, discardChanges } from "../api/git.js";
import { confirmModal } from "./pb_modal.js";
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
      <div class="pb-wrapper">
        <button class="pb-btn pb-stage-all" type="button" title="Stage All files">
          Stage All
        </button>
        <button class="pb-btn pb-btn-outline pb-unstage-all" type="button" title="Unstage All files">
          Unstage All
        </button>
        <button class="pb-btn pb-btn-outline pb-discard-all" type="button"
          title="Throw away every unstaged change">
          Discard All
        </button>

        <hr>

      </div>

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

      this.#html.$commit.addEventListener("click", () =>
        this.#submit({ amend: false }),
      );
      this.#html.$amend.addEventListener("click", () =>
        this.#submit({ amend: true }),
      );

      this.querySelector(".pb-stage-all").addEventListener("click", () =>
        this.#moveAll("unstaged"),
      );
      this.querySelector(".pb-unstage-all").addEventListener("click", () =>
        this.#moveAll("staged"),
      );
      this.querySelector(".pb-discard-all").addEventListener("click", () =>
        this.#discard(null),
      );

      this.addEventListener("click", (e) => {
        const action = e.target.closest("button[data-action]");
        if (action?.dataset.action === "discard") {
          return this.#discard(
            this.#files.unstaged[action.dataset.index] ?? null,
          );
        }
        if (action) {
          return this.#move(action);
        }
        const btn = e.target.closest("button.pb-file[data-group]");
        if (!btn) return;
        const staged = btn.dataset.group === "staged";
        const { path, status } =
          this.#files[btn.dataset.group][btn.dataset.index];
        const file = { path, status, staged };
        setFile(isSelectedFile(file) ? null : file);
      });
      document.addEventListener("pb-file-select", () => this.#markSelected());

      for (const type of [
        "pb-repository-change",
        "pb-branch-change",
        "pb-history-change",
        "pb-changes-change",
      ]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    // Stage every unstaged file, or unstage every staged one.
    async #moveAll(group) {
      const paths = this.#files[group].map((f) => f.path);
      if (!data.repository || !paths.length) return;
      await this.#run(group, paths);
    }

    // One unstaged file, or (null) every one of them. Nothing here can be undone, so it
    // always asks first and says what will happen to new files.
    async #discard(file) {
      const repo = data.repository;
      const files = file ? [file] : this.#files.unstaged;
      if (!repo || !files.length) return;
      const fresh = files.filter((f) => f.status === "A").length;
      const conflicted = files.filter((f) => f.status === "U").length;
      const lines = file
        ? [
            file.status === "A"
              ? `Delete the new file "${file.path}"?`
              : `Discard the changes in "${file.path}"?`,
          ]
        : [
            `Discard the changes in all ${files.length} unstaged file${files.length === 1 ? "" : "s"}?`,
          ];
      if (fresh && !file) {
        lines.push(
          `${fresh} new file${fresh === 1 ? " is" : "s are"} not tracked by git and will be deleted.`,
        );
      }
      if (conflicted && !file) {
        lines.push(`${conflicted} conflicted file${conflicted === 1 ? "" : "s"} will be left alone.`);
      }
      lines.push("Staged changes are kept. This cannot be undone.");

      const done = await confirmModal({
        title: file ? "Discard changes" : "Discard all changes",
        message: lines.join("\n"),
        confirmLabel: file ? "Discard" : "Discard all",
        danger: true,
        action: () =>
          discardChanges(
            file ? { repo, paths: [file.path] } : { repo, all: true },
          ),
      });
      if (done) {
        toast(file ? `Discarded ${file.path}.` : "Discarded all unstaged changes.");
      }
      document.dispatchEvent(new CustomEvent("pb-changes-change"));
    }

    async #move(btn) {
      if (!data.repository) return;
      const group = btn.dataset.group;
      const path = this.#files[group][btn.dataset.index]?.path;
      if (path === undefined) return;
      await this.#run(group, [path]);
    }

    async #run(group, paths) {
      try {
        await (group === "staged" ? unstage : stage)({
          repo: data.repository,
          paths,
        });
      } catch (err) {
        console.error(err);
        toast(err.message || "Something went wrong, try again.", {
          error: true,
        });
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

        const open = data.file;
        if (open && !open.commit) {
          const here = files[open.staged ? "staged" : "unstaged"].some(
            (f) => f.path === open.path,
          );
          const there = files[open.staged ? "unstaged" : "staged"].find(
            (f) => f.path === open.path,
          );
          if (!here)
            setFile(
              there
                ? {
                    path: there.path,
                    status: there.status,
                    staged: !open.staged,
                  }
                : null,
            );
        }
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        this.querySelector(".pb-unstaged .pb-content").innerHTML =
          `<li class="pb-error">Could not load changes.</li>`;
      }
    }

    #renderGroup(group) {
      const files = this.#files[group];
      const $details = this.querySelector(`.pb-${group}`);
      $details.querySelector(".pb-count").textContent = files.length
        ? `(${files.length})`
        : "";
      $details.querySelector(".pb-content").innerHTML = files.length
        ? files
            .map(
              (f, i) => `
            <li class="pb-file-row"><button type="button" class="pb-file" data-group="${group}" data-index="${i}" title="${escapeHtml(f.path)}">
              <span class="pb-file-status" data-status="${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
              <span class="pb-file-path">${escapeHtml(f.path)}</span>
            </button><button type="button" class="pb-file-action" data-action="move" data-group="${group}" data-index="${i}"
              aria-label="${group === "staged" ? "Unstage" : "Stage"} ${escapeHtml(f.path)}"
              title="${group === "staged" ? "Unstage" : "Stage"}">${icon(group === "staged" ? "minus" : "plus")}</button>${
                group === "unstaged"
                  ? `<button type="button" class="pb-file-action pb-danger" data-action="discard" data-group="unstaged" data-index="${i}"
              aria-label="Discard ${escapeHtml(f.path)}" title="${f.status === "A" ? "Delete this new file" : "Discard the changes"}">${icon("trash")}</button>`
                  : ""
              }</li>`,
            )
            .join("")
        : `<li class="pb-empty">No files.</li>`;
      if (group === "unstaged") {
        this.querySelector(".pb-discard-all").disabled = !files.length;
      }
    }

    #markSelected() {
      for (const btn of this.querySelectorAll("button.pb-file[data-group]")) {
        const { path, status } =
          this.#files[btn.dataset.group][btn.dataset.index];
        const active = isSelectedFile({
          path,
          status,
          staged: btn.dataset.group === "staged",
        });
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

      if (!subject && (!amend || body)) {
        return this.#setStatus("Write a summary first.", true);
      }
      const message = subject ? (body ? `${subject}\n\n${body}` : subject) : "";

      this.#setStatus("");
      this.#setBusy(true);
      try {
        const commit = await createCommit({
          repo: data.repository,
          branch: data.detached ? undefined : data.branch,
          message,
          amend,
        });
        $subject.value = "";
        $body.value = "";
        this.#setStatus(
          `${amend ? "Amended" : "Committed"} ${commit.hash.slice(0, 7)}.`,
        );
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        console.error(err);
        this.#setStatus(
          err.message || "Something went wrong, try again.",
          true,
        );
      } finally {
        this.#setBusy(false);
      }
    }
  },
);
