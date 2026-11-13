import { getPrefix, escapeHtml } from "../_helpers.js";
import data from "../data.js";

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
          <div class="details">
            <p class="name"></p>
            <p><time></time></p>
          </div>
        </div>

        <input type="text" class="subject" />
        <textarea rows="6" class="body"></textarea>

        <button class="commit-btn pb-btn" type="button">update message</button>
      </div>

      <details class="files" open>
        <summary>Changed Files</summary>
        <ul class="content"></ul>
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
        $name: $(".name"),
        $time: $("time"),
        $subject: $(".subject"),
        $body: $(".body"),
        $files: $(".files .content"),
      };

      document.addEventListener("pb-commit-select", () => this.#render());
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
        ? files.map((f) => `<li><button type="button">${escapeHtml(f)}</button></li>`).join("")
        : `<li class="pb-empty">No file information.</li>`;
    }
  },
);
