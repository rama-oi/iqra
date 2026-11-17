import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { fetchCommits } from "../api/commits.js";
import { fetchStatus } from "../api/changes.js";
import { layoutGraph } from "../graph/layout.js";
import { renderGraphRow, avatarStyle, LANE_W } from "../graph/render-row.js";
import data, { setCommit, refreshCommit } from "../api/data.js";
import { matches } from "../lib/filter.js";

// The working tree is the first row, drawn as a commit on top of HEAD. Selecting it shows
// the commit form (data.commit === null), which is why it has no hash of its own.
const WORKING = "working-changes";

customElements.define(
  getPrefix("workarea-tree"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #commits = new Map();
    #changes = null; // number of changed files, null when unknown

    #template = `
    <section class="pb-table-header">
      <div class="pb-row">
        <div class="pb-column-branch">
          Branch
        </div>
        <div class="pb-column-graph">
          Graph
        </div>
        <div class="pb-column-message">
          Message
        </div>
      </div>
    </section>
    <section class="pb-table-body"></section>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      // Click a commit to preview it; click it again (or the working changes) to go back.
      this.querySelector(".pb-table-body").addEventListener("click", (e) => {
        if (e.target.closest(".pb-row[data-working]")) return setCommit(null);
        const hash = e.target.closest(".pb-row[data-hash]")?.dataset.hash;
        if (!hash) return;
        setCommit(data.commit?.hash === hash ? null : this.#commits.get(hash));
      });
      document.addEventListener("pb-commit-select", () => this.#markSelected());
      document.addEventListener("pb-filter-change", () => this.#applyFilter());

      for (const type of ["pb-repository-change", "pb-branch-change", "pb-history-change"]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      const body = this.querySelector(".pb-table-body");
      if (!data.repository) return;
      try {
        const [{ commits }, status] = await Promise.all([
          fetchCommits({ repo: data.repository, branch: data.branch }),
          fetchStatus({ repo: data.repository }).catch(() => null), // only the count needs it
        ]);
        if (loadId !== this.#loadId) return; // a newer load superseded this one
        const head = commits.find((c) => c.refs.some((r) => r.isHead)) ?? commits[0];
        const working = { hash: WORKING, parents: head ? [head.hash] : [], refs: [], isWorking: true };
        this.#changes = status ? status.staged.length + status.unstaged.length : null;
        const { rows, laneCount } = layoutGraph([working, ...commits]);
        this.#commits = new Map(commits.map((c) => [c.hash, c]));

        // The selected commit may be gone (history rewritten elsewhere) or relabelled.
        if (data.commit) {
          const fresh = this.#commits.get(data.commit.hash);
          if (fresh) refreshCommit(fresh);
          else setCommit(null);
        }

        this.style.setProperty("--column-graph-width", `${laneCount * LANE_W}px`);
        body.innerHTML = rows.map((row) => this.#renderRow(row, laneCount)).join("");
        this.#markSelected();
        this.#applyFilter();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        body.innerHTML = `<p class="pb-error">Could not load commits.</p>`;
      }
    }

    // Rows that don't match are dimmed rather than removed, so the graph stays connected.
    #applyFilter() {
      for (const row of this.querySelectorAll(".pb-table-body .pb-row")) {
        const c = this.#commits.get(row.dataset.hash);
        const hit =
          !c ||
          matches(data.filter, c.message, c.hash, c.author.name, c.author.email, c.refs.map((r) => r.name));
        row.classList.toggle("pb-dimmed", !hit);
      }
    }

    #markSelected() {
      for (const row of this.querySelectorAll(".pb-table-body .pb-row")) {
        const selected = "working" in row.dataset ? !data.commit : row.dataset.hash === data.commit?.hash;
        row.classList.toggle("pb-selected", selected);
        row.setAttribute("aria-pressed", String(selected));
      }
    }

    #renderWorkingRow(row, laneCount) {
      const n = this.#changes;
      const summary = n === null ? "" : n === 0 ? "No changes" : n === 1 ? "1 file" : `${n} files`;
      return `
      <button type="button" class="pb-row pb-working" data-working>
        <div class="pb-column-branch"></div>
        <div class="pb-column-graph">
          ${renderGraphRow(row, laneCount)}
          <span class="pb-node pb-node-working pb-lane-${row.color}" style="${avatarStyle(row.lane)}" aria-hidden="true"></span>
        </div>
        <div class="pb-column-message">
          <span class="pb-message-text">Working changes</span>
          ${summary ? `<span class="pb-count">${summary}</span>` : ""}
        </div>
      </button>`;
    }

    #renderRow(row, laneCount) {
      if (row.commit.isWorking) return this.#renderWorkingRow(row, laneCount);
      const { commit, color } = row;
      const refs = commit.refs
        .map(
          (ref) => `<span class="pb-ref pb-lane-${color} pb-ref-${ref.type}${ref.isHead ? " pb-head" : ""}" title="${escapeHtml(ref.name)}">${
            ref.isHead ? "✓ " : ""
          }${escapeHtml(ref.name)}</span>`,
        )
        .join("");

      return `
      <button type="button" class="pb-row" data-hash="${escapeHtml(commit.hash)}">
        <div class="pb-column-branch">${refs}</div>
        <div class="pb-column-graph">
          ${renderGraphRow(row, laneCount)}
          ${
            row.isMerge
              ? ""
              : `<pb-avatar class="pb-small pb-node pb-lane-${color}" style="${avatarStyle(row.lane)}" name="${escapeHtml(commit.author.name)}" src="${escapeHtml(commit.author.avatarUrl ?? "")}"></pb-avatar>`
          }
        </div>
        <div class="pb-column-message"><span class="pb-message-text">${escapeHtml(commit.message)}</span></div>
      </button>`;
    }
  },
);
