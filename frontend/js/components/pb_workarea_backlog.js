import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { fetchIssues } from "../api/issues.js";
import data from "../api/data.js";
import { matches } from "../lib/filter.js";
import { toast } from "../lib/toast.js";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

customElements.define(
  getPrefix("workarea-backlog"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #issues = [];
    #next = null; // page of GitHub issues to ask for next, or null at the end
    #more = false; // a page is on its way

    #template = `
      <section class="pb-table-header">
        <div class="pb-backlog-title">
          <span>Backlog</span>
          <span class="pb-count"></span>
        </div>
      </section>
      <section class="pb-issues"></section>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      document.addEventListener("pb-repository-change", () => this.#load());
      document.addEventListener("pb-filter-change", () => this.#applyFilter());

      // The work area scrolls, not this view: ask for the next page near its bottom.
      const scroller = this.closest("pb-workarea") ?? this.parentElement;
      scroller?.addEventListener("scroll", () => this.#maybeLoadMore(), {
        passive: true,
      });
      this.addEventListener("click", (e) => {
        if (e.target.closest(".pb-load-more")) this.#loadMore();
      });
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      const list = this.querySelector(".pb-issues");
      const $count = this.querySelector(".pb-count");
      if (!data.repository) return;
      list.innerHTML = `<p class="pb-status">Loading…</p>`;
      $count.textContent = "";

      try {
        const { issues, note, nextPage } = await fetchIssues({
          repo: data.repository,
        });
        if (loadId !== this.#loadId) return;

        this.#issues = issues;
        this.#next = nextPage;
        list.innerHTML = issues.length
          ? issues.map((issue, i) => this.#renderIssue(issue, i)).join("") +
            `<p class="pb-status pb-no-match" hidden>No issues match.</p>` +
            this.#footer()
          : `<p class="pb-status">${escapeHtml(note || `No issues in ${data.repository}.`)}</p>`;
        this.#applyFilter();
        this.#maybeLoadMore();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        list.innerHTML = `<p class="pb-error">${escapeHtml(err.message || "Could not load issues.")}</p>`;
      }
    }

    // "Load more" is the way on when the filter hides everything and nothing scrolls.
    #footer() {
      return this.#next
        ? `<p class="pb-status pb-more"><button type="button" class="pb-load-more">Load more issues</button></p>`
        : "";
    }

    #maybeLoadMore() {
      const scroller = this.closest("pb-workarea") ?? this.parentElement;
      if (!this.#next || !scroller) return;
      if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 600) return;
      // with a filter on, most of what arrives is hidden: only the button or a scroll asks
      if (data.filter && !scroller.scrollTop) return;
      this.#loadMore();
    }

    async #loadMore() {
      if (this.#more || !this.#next) return;
      this.#more = true;
      const loadId = this.#loadId;
      const repo = data.repository;
      const $btn = this.querySelector(".pb-load-more");
      if ($btn) $btn.textContent = "Loading…";
      try {
        const { issues, nextPage } = await fetchIssues({ repo, page: this.#next });
        if (loadId !== this.#loadId || repo !== data.repository) return;

        const seen = new Set(this.#issues.map((i) => i.number));
        const fresh = issues.filter((i) => !seen.has(i.number));
        const start = this.#issues.length;
        this.#issues = this.#issues.concat(fresh);
        this.#next = nextPage;
        this.querySelector(".pb-no-match").insertAdjacentHTML(
          "beforebegin",
          fresh.map((issue, i) => this.#renderIssue(issue, start + i)).join(""),
        );
        this.querySelector(".pb-more")?.remove();
        this.querySelector(".pb-issues").insertAdjacentHTML("beforeend", this.#footer());
        this.#applyFilter();
      } catch (err) {
        console.error(err);
        this.#next = null;
        this.querySelector(".pb-more")?.remove();
        toast(err.message || "Could not load more issues.", { error: true });
      } finally {
        this.#more = false;
      }
      this.#maybeLoadMore();
    }

    #applyFilter() {
      const issues = this.#issues;
      if (!issues.length) return;
      let shown = 0;
      for (const el of this.querySelectorAll(".pb-issue")) {
        const i = issues[el.dataset.index];
        const hit = matches(
          data.filter,
          `#${i.number}`,
          i.number,
          i.title,
          i.body,
          i.labels,
          i.author,
          i.assignee,
          i.state,
        );
        el.hidden = !hit;
        if (hit) shown++;
      }
      this.querySelector(".pb-no-match").hidden = shown > 0;

      const open = issues.filter((i) => i.state === "open").length;
      const more = this.#next ? "+" : "";
      this.querySelector(".pb-count").textContent = data.filter
        ? `${shown} of ${issues.length}${more} shown`
        : `${open}${more} open · ${issues.length - open}${more} closed`;
    }

    #renderIssue(issue, index) {
      const labels = (issue.labels ?? [])
        .map((l) => `<span class="pb-label">${escapeHtml(l)}</span>`)
        .join("");
      const assignee = issue.assignee
        ? ` · assigned to ${escapeHtml(issue.assignee)}`
        : "";

      return `
      <details class="pb-issue pb-${escapeHtml(issue.state)}" data-index="${index}">
        <summary>
          <span class="pb-state">${issue.state === "open" ? "open" : "closed"}</span>
          <span class="pb-number">#${escapeHtml(issue.number)}</span>
          <span class="pb-issue-title">${escapeHtml(issue.title)}</span>
          ${labels}
        </summary>
        <div class="pb-issue-body">
          <p class="pb-meta">
            Opened by ${escapeHtml(issue.author)} on
            <time datetime="${escapeHtml(issue.createdAt)}">${escapeHtml(formatDate(issue.createdAt))}</time>${assignee}
          </p>
          <p class="pb-issue-text">${escapeHtml(issue.body || "No description.")}</p>
        </div>
      </details>`;
    }
  },
);
