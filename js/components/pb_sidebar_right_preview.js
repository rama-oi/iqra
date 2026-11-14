import { getPrefix, escapeHtml } from "../lib/helpers.js";
import data, { setFile, isSelectedFile } from "../api/data.js";

// First line is the subject, whatever follows the first blank line is the body.
function splitMessage(message) {
  const [subject, ...rest] = String(message ?? "").split("\n");
  return { subject, body: rest.join("\n").trim() };
}

function formatWhen(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return `${time} @ ${date}`;
}

customElements.define(
  getPrefix("sidebar-right-preview"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
      <div class="pb-wrapper">
        <p class="pb-hash"></p>

        <div class="pb-user">
          <pb-avatar class="pb-large"></pb-avatar>
          <div class="pb-details">
            <p class="pb-name"></p>
            <p><time></time></p>
          </div>
        </div>

        <input type="text" class="pb-subject" />
        <textarea rows="6" class="pb-body"></textarea>

        <button class="pb-commit-btn pb-btn" type="button">update message</button>
      </div>

      <details class="pb-files" open>
        <summary>Changed Files</summary>
        <ul class="pb-content"></ul>
      </details>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $hash: $(".pb-hash"),
        $avatar: $("pb-avatar"),
        $name: $(".pb-name"),
        $time: $("time"),
        $subject: $(".pb-subject"),
        $body: $(".pb-body"),
        $files: $(".pb-files .pb-content"),
      };

      document.addEventListener("pb-commit-select", () => this.#render());
      document.addEventListener("pb-file-select", () => this.#markSelected());

      // Click a changed file to see its diff in this commit; click again to close it.
      this.#html.$files.addEventListener("click", (e) => {
        const index = e.target.closest("button[data-index]")?.dataset.index;
        const f = data.commit?.files?.[index];
        if (!f) return;
        const file = { path: f.path, status: f.status, commit: data.commit.hash };
        setFile(isSelectedFile(file) ? null : file);
      });
      this.#render();
    }

    #render() {
      const commit = data.commit;
      if (!commit) return;
      const h = this.#html;

      h.$hash.textContent = commit.hash;
      h.$avatar.setAttribute("name", commit.author.name);
      h.$avatar.setAttribute("src", commit.author.avatarUrl ?? "");
      h.$name.textContent = commit.author.name;
      h.$time.dateTime = commit.committedAt;
      h.$time.textContent = formatWhen(commit.committedAt);

      const { subject, body } = splitMessage(commit.message);
      h.$subject.value = subject;
      h.$body.value = body;

      const files = commit.files ?? [];
      h.$files.innerHTML = files.length
        ? files
            .map(
              (f, i) => `
            <li><button type="button" class="pb-file" data-index="${i}" title="${escapeHtml(f.path)}">
              <span class="pb-file-status" data-status="${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
              <span class="pb-file-path">${escapeHtml(f.path)}</span>
            </button></li>`,
            )
            .join("")
        : `<li class="pb-empty">No file information.</li>`;
      this.#markSelected();
    }

    #markSelected() {
      const commit = data.commit;
      for (const btn of this.querySelectorAll("button[data-index]")) {
        const f = commit?.files?.[btn.dataset.index];
        const active = !!f && isSelectedFile({ path: f.path, status: f.status, commit: commit.hash });
        btn.classList.toggle("pb-active", active);
        btn.setAttribute("aria-pressed", String(active));
      }
    }
  },
);
