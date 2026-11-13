import { getPrefix, escapeHtml } from "../_helpers.js";
import { fetchIssues } from "../api/issues.js";
import data from "../data.js";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Every issue of the current project. Each one is a <details>: the summary
// shows the essentials, expanding it reveals the full text.
customElements.define(
  getPrefix("workarea-backlog"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;

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
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      const list = this.querySelector(".pb-issues");
      const $count = this.querySelector(".pb-count");
      list.innerHTML = `<p class="pb-status">Loading…</p>`;
      $count.textContent = "";

      try {
        const issues = await fetchIssues({ repo: data.repository });
        if (loadId !== this.#loadId) return;

        const open = issues.filter((i) => i.state === "open").length;
        $count.textContent = `${open} open · ${issues.length - open} closed`;
        list.innerHTML = issues.length
          ? issues.map((issue) => this.#renderIssue(issue)).join("")
          : `<p class="pb-status">No issues in ${escapeHtml(data.repository)}.</p>`;
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        list.innerHTML = `<p class="pb-error">Could not load issues.</p>`;
      }
    }

    #renderIssue(issue) {
      const labels = (issue.labels ?? [])
        .map((l) => `<span class="pb-label">${escapeHtml(l)}</span>`)
        .join("");
      const assignee = issue.assignee ? ` · assigned to ${escapeHtml(issue.assignee)}` : "";

      return `
      <details class="pb-issue pb-${escapeHtml(issue.state)}">
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
