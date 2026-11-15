import { getPrefix } from "../lib/helpers.js";
import { toSshUrl, repoName } from "../lib/git_url.js";
import { cloneProject } from "../api/projects.js";
import { openProject } from "../api/data.js";

const NAME_HINT = "taken from the URL";

// Clone > a remote repository. Everything goes over SSH: when an http(s) URL is
// typed, the SSH URL it becomes is shown under it (never swapped silently) and
// that one is cloned.
customElements.define(
  getPrefix("clone-url"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    #html = {};

    #template = `
      <form>
        <label>
          <span>Repository URL</span>
          <input type="text" name="url" required autocomplete="off" spellcheck="false"
            placeholder="git@github.com:rama-oi/iqra.git" />
        </label>
        <p class="pb-ssh-note" aria-live="polite" hidden>
          <span class="pb-ssh-note-label"></span>
          <code class="pb-ssh-url"></code>
        </p>
        <label>
          <span>Name</span>
          <input type="text" name="name" autocomplete="off" spellcheck="false" />
        </label>
        <p class="pb-error" role="alert" hidden></p>
        <button type="submit" class="pb-btn">clone</button>
      </form>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $form: $("form"),
        $url: $('input[name="url"]'),
        $name: $('input[name="name"]'),
        $submit: $('button[type="submit"]'),
        $error: $(".pb-error"),
        $note: $(".pb-ssh-note"),
        $noteLabel: $(".pb-ssh-note-label"),
        $noteUrl: $(".pb-ssh-url"),
      };

      this.#html.$form.addEventListener("submit", (e) => this.#onSubmit(e));
      this.#html.$url.addEventListener("input", () => this.#onInput());
      this.reset();
    }

    reset() {
      this.#html.$form.reset();
      this.#setError("");
      this.#onInput();
    }

    // The URL that will be cloned: what was typed, or its SSH conversion.
    #onInput() {
      const { $url, $name, $note, $noteLabel, $noteUrl } = this.#html;
      const result = toSshUrl($url.value);

      $name.placeholder = (result?.ok && repoName(result.url)) || NAME_HINT;

      $note.hidden = !(result && (result.converted || !result.ok));
      $note.classList.toggle("pb-error", !!result && !result.ok);
      if (!result || (result.ok && !result.converted)) return;
      $noteLabel.textContent = result.ok ? "Will be cloned over SSH:" : result.message;
      $noteUrl.textContent = result.ok ? result.url : "";
    }

    #setError(text) {
      const { $error } = this.#html;
      $error.textContent = text;
      $error.hidden = !text;
    }

    #setBusy(busy) {
      this.#busy = busy;
      const { $submit, $url, $name } = this.#html;
      $submit.disabled = busy;
      $url.disabled = busy;
      $name.disabled = busy;
      $submit.textContent = busy ? "cloning…" : "clone";
      this.dispatchEvent(new CustomEvent("pb-clone-busy", { bubbles: true, detail: busy }));
    }

    async #onSubmit(e) {
      e.preventDefault();
      if (this.#busy) return;

      const result = toSshUrl(this.#html.$url.value);
      if (!result) return;
      if (!result.ok) return this.#setError(result.message);

      const name = this.#html.$name.value.trim() || repoName(result.url);
      if (!name) return this.#setError("Could not work out a name, please enter one.");

      this.#setError("");
      this.#setBusy(true);
      try {
        const project = await cloneProject({ url: result.url, name });
        this.#setBusy(false);
        this.dispatchEvent(new CustomEvent("pb-clone-done", { bubbles: true }));
        openProject(project);
      } catch (err) {
        console.error(err);
        this.#setBusy(false);
        this.#setError(err.message || "Something went wrong, try again.");
      }
    }
  },
);
