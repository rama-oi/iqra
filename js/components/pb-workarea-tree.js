import { getPrefix, escapeHtml } from "../_helpers.js";
import { fetchCommits } from "../api/commits.js";
import { layoutGraph } from "../graph/layout.js";
import { renderGraphRow, avatarStyle, LANE_W } from "../graph/render-row.js";
import data, { setCommit } from "../data.js";

customElements.define(
  getPrefix("workarea-tree"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #commits = new Map();

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

      // Click a commit to preview it; click it again to go back.
      this.querySelector(".pb-table-body").addEventListener("click", (e) => {
        const hash = e.target.closest(".pb-row[data-hash]")?.dataset.hash;
        if (!hash) return;
        setCommit(data.commit?.hash === hash ? null : this.#commits.get(hash));
      });
      document.addEventListener("pb-commit-select", () => this.#markSelected());

      for (const type of ["pb-repository-change", "pb-branch-change"]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      const body = this.querySelector(".pb-table-body");
      try {
        const { commits } = await fetchCommits({ repo: data.repository, branch: data.branch });
        if (loadId !== this.#loadId) return; // a newer load superseded this one
        const { rows, laneCount } = layoutGraph(commits);
        this.#commits = new Map(commits.map((c) => [c.hash, c]));

        this.style.setProperty("--column-graph-width", `${laneCount * LANE_W}px`);
        body.innerHTML = rows.map((row) => this.#renderRow(row, laneCount)).join("");
        this.#markSelected();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        body.innerHTML = `<p class="pb-error">Could not load commits.</p>`;
      }
    }

    #markSelected() {
      for (const row of this.querySelectorAll(".pb-table-body .pb-row")) {
        const selected = row.dataset.hash === data.commit?.hash;
        row.classList.toggle("pb-selected", selected);
        row.setAttribute("aria-pressed", String(selected));
      }
    }

    #renderRow(row, laneCount) {
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
