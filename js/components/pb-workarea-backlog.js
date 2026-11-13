import { getPrefix, escapeHtml } from "../_helpers.js";
import { fetchIssues } from "../api/issues.js";
import data from "../data.js";
import { matches } from "../filter.js";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Every issue of the current project. Each one is a <details>: the summary
// shows the essentials, expanding it reveals the full text.
customElements.define(
  getPrefix("workarea-backlog"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #issues = [];

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
        const issues = await fetchIssues({ repo: data.repository });
        if (loadId !== this.#loadId) return;

        this.#issues = issues;
        list.innerHTML = issues.length
          ? issues.map((issue, i) => this.#renderIssue(issue, i)).join("") +
            `<p class="pb-status pb-no-match" hidden>No issues match.</p>`
          : `<p class="pb-status">No issues in ${escapeHtml(data.repository)}.</p>`;
        this.#applyFilter();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        list.innerHTML = `<p class="pb-error">Could not load issues.</p>`;
      }
    }

    // Hide non-matching issues in place, so the ones already expanded stay expanded.
    #applyFilter() {
      const issues = this.#issues;
      if (!issues.length) return;
      let shown = 0;
      for (const el of this.querySelectorAll(".pb-issue")) {
        const i = issues[el.dataset.index];
        const hit = matches(
          data.filter, `#${i.number}`, i.number, i.title, i.body, i.labels, i.author, i.assignee, i.state,
        );
        el.hidden = !hit;
        if (hit) shown++;
      }
      this.querySelector(".pb-no-match").hidden = shown > 0;

      const open = issues.filter((i) => i.state === "open").length;
      this.querySelector(".pb-count").textContent = data.filter
        ? `${shown} of ${issues.length} shown`
        : `${open} open · ${issues.length - open} closed`;
    }

    #renderIssue(issue, index) {
      const labels = (issue.labels ?? [])
        .map((l) => `<span class="pb-label">${escapeHtml(l)}</span>`)
        .join("");
      const assignee = issue.assignee ? ` · assigned to ${escapeHtml(issue.assignee)}` : "";

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
