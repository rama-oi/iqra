import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { fetchCommits } from "../api/commits.js";
import data from "../api/data.js";
import { matches } from "../lib/filter.js";

// Who committed to the current project. For now derived from the commit list;
// a dedicated endpoint can replace this later.
customElements.define(
  getPrefix("workarea-contributors"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #people = [];

    #template = `
      <section class="pb-table-header">
        <div class="pb-backlog-title">Contributors</div>
      </section>
      <ul class="pb-contributors"></ul>
      <p class="pb-status pb-no-match" hidden>No contributors match.</p>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      for (const type of ["pb-repository-change", "pb-branch-change", "pb-history-change"]) {
        document.addEventListener(type, () => this.#load());
      }
      document.addEventListener("pb-filter-change", () => this.#applyFilter());
      this.#load();
    }

    #applyFilter() {
      let shown = 0;
      for (const li of this.querySelectorAll(".pb-contributors li[data-index]")) {
        const { author } = this.#people[li.dataset.index];
        li.hidden = !matches(data.filter, author.name, author.email);
        if (!li.hidden) shown++;
      }
      this.querySelector(".pb-no-match").hidden = shown > 0 || !this.#people.length;
    }

    async #load() {
      const loadId = ++this.#loadId;
      const list = this.querySelector(".pb-contributors");
      if (!data.repository) return;
      try {
        const { commits } = await fetchCommits({ repo: data.repository, branch: data.branch });
        if (loadId !== this.#loadId) return;

        const byEmail = new Map();
        for (const { author } of commits) {
          const entry = byEmail.get(author.email) ?? { author, count: 0 };
          entry.count++;
          byEmail.set(author.email, entry);
        }

        this.#people = [...byEmail.values()].sort((a, b) => b.count - a.count);
        list.innerHTML = this.#people
          .map(
            ({ author, count }, i) => `
            <li data-index="${i}">
              <pb-avatar class="pb-medium" name="${escapeHtml(author.name)}" src="${escapeHtml(author.avatarUrl ?? "")}"></pb-avatar>
              <span class="pb-name">${escapeHtml(author.name)}</span>
              <span class="pb-email">${escapeHtml(author.email)}</span>
              <span class="pb-commits">${count} commit${count === 1 ? "" : "s"}</span>
            </li>`,
          )
          .join("");
        this.#applyFilter();
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        list.innerHTML = `<li class="pb-error">Could not load contributors.</li>`;
      }
    }
  },
);
