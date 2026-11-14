import { getPrefix } from "../lib/helpers.js";
import { createCommit } from "../api/commits.js";
import data from "../api/data.js";

customElements.define(
  getPrefix("sidebar-right-commit"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    #html = {};

    #template = `
      <details class="unstaged" open>
        <summary>Unstaged Files</summary>
        <ul class="content">
          <li><button type="button">file 1</button></li>
        </ul>
      </details>

      <details class="staged" open>
        <summary>Staged Files</summary>
        <ul class="content">
          <li><button type="button">file 1</button></li>
        </ul>
      </details>

      <div class="pb-wrapper">
        <p>Commit</p>
        <input type="text" class="subject" placeholder="Summary" />
        <textarea rows="6" class="body" placeholder="Description"></textarea>
        <div class="pb-actions">
          <button class="commit-btn pb-btn" type="button">commit</button>
          <button class="amend-btn pb-btn pb-btn-outline" type="button"
            title="Add the staged files to the last commit. Leave the message empty to keep it.">amend</button>
        </div>
        <p class="pb-status" role="status" hidden></p>
      </div>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $subject: $(".subject"),
        $body: $(".body"),
        $commit: $(".commit-btn"),
        $amend: $(".amend-btn"),
        $status: $(".pb-status"),
      };

      this.#html.$commit.addEventListener("click", () => this.#submit({ amend: false }));
      this.#html.$amend.addEventListener("click", () => this.#submit({ amend: true }));
    }

    #setStatus(text, isError = false) {
      const { $status } = this.#html;
      $status.textContent = text;
      $status.hidden = !text;
      $status.classList.toggle("pb-error", isError);
    }

    #setBusy(busy) {
      this.#busy = busy;
      this.#html.$commit.disabled = busy;
      this.#html.$amend.disabled = busy;
    }

    async #submit({ amend }) {
      if (this.#busy || !data.repository) return;
      const { $subject, $body } = this.#html;
      const subject = $subject.value.trim();
      const body = $body.value.trim();

      // a new commit needs a message; an amend can keep the previous one
      if (!subject && (!amend || body)) {
        return this.#setStatus("Write a summary first.", true);
      }
      const message = subject ? (body ? `${subject}\n\n${body}` : subject) : "";

      this.#setStatus("");
      this.#setBusy(true);
      try {
        const commit = await createCommit({
          repo: data.repository,
          branch: data.branch,
          message,
          amend,
        });
        $subject.value = "";
        $body.value = "";
        this.#setStatus(`${amend ? "Amended" : "Committed"} ${commit.hash.slice(0, 7)}.`);
        document.dispatchEvent(new CustomEvent("pb-history-change"));
      } catch (err) {
        console.error(err);
        this.#setStatus(err.message || "Something went wrong, try again.", true);
      } finally {
        this.#setBusy(false);
      }
    }
  },
);
