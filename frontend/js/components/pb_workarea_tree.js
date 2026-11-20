import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { fetchCommits } from "../api/commits.js";
import { fetchStatus } from "../api/changes.js";
import { layoutGraph } from "../graph/layout.js";
import { renderGraphRow, avatarStyle, LANE_W } from "../graph/render-row.js";
import data, { setCommit, refreshCommit } from "../api/data.js";
import { matches } from "../lib/filter.js";

const WORKING = "working-changes";

customElements.define(
  getPrefix("workarea-tree"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #revealHead = false;
    #commits = new Map();
    #list = [];
    #next = null;
    #repo = null;
    #more = false;
    #changes = null;

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

      this.querySelector(".pb-table-body").addEventListener("click", (e) => {
        if (e.target.closest(".pb-row[data-working]")) return setCommit(null);
        const hash = e.target.closest(".pb-row[data-hash]")?.dataset.hash;
        if (!hash) return;
        setCommit(data.commit?.hash === hash ? null : this.#commits.get(hash));
      });
      document.addEventListener("pb-commit-select", () => this.#markSelected());
      document.addEventListener("pb-filter-change", () => this.#applyFilter());

      const scroller = this.closest("pb-workarea") ?? this.parentElement;
      scroller?.addEventListener(
        "scroll",
        () => this.#maybeLoadMore(scroller),
        { passive: true },
      );

      for (const type of ["pb-repository-change", "pb-branch-change"]) {
        document.addEventListener(type, () => this.#load({ revealHead: true }));
      }
      document.addEventListener("pb-history-change", () => this.#load());
      this.#load({ revealHead: true });
    }

    async #fetchPages(wanted) {
      let { commits, nextCursor } = await fetchCommits({
        repo: data.repository,
        branch: data.branch,
      });
      let list = commits;
      while (nextCursor && list.length < wanted) {
        const page = await fetchCommits({
          repo: data.repository,
          branch: data.branch,
          cursor: nextCursor,
        });
        list = list.concat(page.commits);
        nextCursor = page.nextCursor;
      }
      return { list, next: nextCursor ?? null };
    }

    async #load({ revealHead = false } = {}) {
      this.#revealHead ||= revealHead;
      const loadId = ++this.#loadId;
      const body = this.querySelector(".pb-table-body");
      if (!data.repository) return;
      if (this.#repo !== data.repository) {
        this.#repo = data.repository;
        this.#list = [];
        this.#next = null;
      }
      try {
        const [{ list, next }, status] = await Promise.all([
          this.#fetchPages(this.#list.length),
          fetchStatus({ repo: data.repository }).catch(() => null),
        ]);
        if (loadId !== this.#loadId) return;
        this.#list = list;
        this.#next = next;
        this.#changes = status
          ? status.staged.length + status.unstaged.length
          : null;
        this.#draw(body);
        if (this.#revealHead) {
          this.#revealHead = false;
          body
            .querySelector(".pb-row.pb-current")
            ?.scrollIntoView({ block: "nearest" });
        }
        this.#maybeLoadMore();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        body.innerHTML = `<p class="pb-error">Could not load commits.</p>`;
      }
    }

    #draw(body) {
      const commits = this.#list;
      const head =
        commits.find((c) => c.refs.some((r) => r.isHead)) ?? commits[0];
      const working = {
        hash: WORKING,
        parents: head ? [head.hash] : [],
        refs: [],
        isWorking: true,
      };
      const { rows, laneCount } = layoutGraph([working, ...commits]);
      this.#commits = new Map(commits.map((c) => [c.hash, c]));

      if (data.commit) {
        const fresh = this.#commits.get(data.commit.hash);
        if (fresh) refreshCommit(fresh);
        else if (!this.#next && !data.commit.isStash) setCommit(null);
      }

      this.style.setProperty("--column-graph-width", `${laneCount * LANE_W}px`);
      body.innerHTML = rows
        .map((row) => this.#renderRow(row, laneCount))
        .join("");
      if (this.#next)
        body.insertAdjacentHTML(
          "beforeend",
          `<p class="pb-more" role="status">Loading more commits…</p>`,
        );
      this.#markSelected();
      this.#applyFilter();
    }

    async #maybeLoadMore(
      scroller = this.closest("pb-workarea") ?? this.parentElement,
    ) {
      if (this.#more || !this.#next || !scroller) return;
      if (
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight >
        600
      )
        return;
      this.#more = true;
      const loadId = this.#loadId;
      const repo = data.repository;
      try {
        const page = await fetchCommits({
          repo,
          branch: data.branch,
          cursor: this.#next,
        });
        if (loadId !== this.#loadId || repo !== data.repository) return;
        this.#list = this.#list.concat(page.commits);
        this.#next = page.nextCursor ?? null;
        this.#draw(this.querySelector(".pb-table-body"));
      } catch (err) {
        console.error(err);
        this.#next = null;
        this.querySelector(".pb-more")?.remove();
      } finally {
        this.#more = false;
      }
      this.#maybeLoadMore(scroller);
    }

    #applyFilter() {
      for (const row of this.querySelectorAll(".pb-table-body .pb-row")) {
        const c = this.#commits.get(row.dataset.hash);
        const hit =
          !c ||
          matches(
            data.filter,
            c.message,
            c.hash,
            c.author.name,
            c.author.email,
            c.refs.map((r) => r.name),
          );
        row.classList.toggle("pb-dimmed", !hit);
      }
    }

    #markSelected() {
      for (const row of this.querySelectorAll(".pb-table-body .pb-row")) {
        const selected =
          "working" in row.dataset
            ? !data.commit
            : row.dataset.hash === data.commit?.hash;
        row.classList.toggle("pb-selected", selected);
        row.setAttribute("aria-pressed", String(selected));
      }
    }

    #renderWorkingRow(row, laneCount) {
      const n = this.#changes;
      const summary =
        n === null
          ? ""
          : n === 0
            ? "No changes"
            : n === 1
              ? "1 file"
              : `${n} files`;
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
          (ref) =>
            `<span class="pb-ref pb-lane-${color} pb-ref-${ref.type}${ref.isHead ? " pb-head" : ""}" title="${escapeHtml(ref.name)}">${
              ref.isHead ? "✓ " : ""
            }${escapeHtml(ref.name)}</span>`,
        )
        .join("");

      const current = commit.refs.some((r) => r.isHead);
      return `
      <button type="button" class="pb-row${current ? " pb-current" : ""}"${current ? ' data-current aria-current="true"' : ""} data-hash="${escapeHtml(commit.hash)}">
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
