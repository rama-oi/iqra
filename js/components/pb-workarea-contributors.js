import { getPrefix, escapeHtml } from "../_helpers.js";
import { fetchCommits } from "../api/commits.js";
import data from "../data.js";

// Who committed to the current project. For now derived from the commit list;
// a dedicated endpoint can replace this later.
customElements.define(
  getPrefix("workarea-contributors"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;

    #template = `
      <section class="pb-table-header">
        <div class="pb-backlog-title">Contributors</div>
      </section>
      <ul class="pb-contributors"></ul>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      for (const type of ["pb-repository-change", "pb-branch-change"]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    async #load() {
      const loadId = ++this.#loadId;
      const list = this.querySelector(".pb-contributors");
      try {
        const { commits } = await fetchCommits({ repo: data.repository, branch: data.branch });
        if (loadId !== this.#loadId) return;

        const byEmail = new Map();
        for (const { author } of commits) {
          const entry = byEmail.get(author.email) ?? { author, count: 0 };
          entry.count++;
          byEmail.set(author.email, entry);
        }

        list.innerHTML = [...byEmail.values()]
          .sort((a, b) => b.count - a.count)
          .map(
            ({ author, count }) => `
            <li>
              <pb-avatar class="pb-medium" name="${escapeHtml(author.name)}" src="${escapeHtml(author.avatarUrl ?? "")}"></pb-avatar>
              <span class="pb-name">${escapeHtml(author.name)}</span>
              <span class="pb-email">${escapeHtml(author.email)}</span>
              <span class="pb-commits">${count} commit${count === 1 ? "" : "s"}</span>
            </li>`,
          )
          .join("");
      } catch (err) {
        if (loadId !== this.#loadId) return;
        console.error(err);
        list.innerHTML = `<li class="pb-error">Could not load contributors.</li>`;
      }
    }
  },
);
