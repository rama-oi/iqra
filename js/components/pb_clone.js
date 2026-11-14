import { getPrefix } from "../lib/helpers.js";
import { cloneProject } from "../api/projects.js";
import { openProject } from "../api/data.js";

// "https://host/user/repo.git" and "git@host:user/repo.git" both give "repo".
function deriveName(url) {
  const cleaned = url.trim().replace(/[\/\\]+$/, "").replace(/\.git$/i, "");
  return cleaned.split(/[\/:\\]/).pop() ?? "";
}

customElements.define(
  getPrefix("clone"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    #html = {
      $dialog: undefined,
      $form: undefined,
      $url: undefined,
      $name: undefined,
      $submit: undefined,
      $error: undefined,
    };

    #template = `
      <dialog>
        <header>
          <h2>Clone repository</h2>
          <button type="button" class="close pb-danger" aria-label="Close">x</button>
        </header>
        <form>
          <label>
            <span>Repository URL</span>
            <input type="text" name="url" required autocomplete="off" spellcheck="false"
              placeholder="https://github.com/user/repo.git" autofocus />
          </label>
          <label>
            <span>Name</span>
            <input type="text" name="name" autocomplete="off" spellcheck="false" />
          </label>
          <p class="pb-error" role="alert" hidden></p>
          <button type="submit" class="pb-btn">clone</button>
        </form>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $dialog: $("dialog"),
        $form: $("form"),
        $url: $('input[name="url"]'),
        $name: $('input[name="name"]'),
        $submit: $('button[type="submit"]'),
        $error: $(".pb-error"),
      };
      const { $dialog, $form, $url, $name } = this.#html;

      document.addEventListener("pb-open-clone", () => this.open());
      $dialog.addEventListener("click", (e) => {
        if (this.#busy) return;
        if (e.target === $dialog || e.target.closest(".close")) $dialog.close();
      });
      // Esc must not abandon a clone that is already running
      $dialog.addEventListener("cancel", (e) => this.#busy && e.preventDefault());
      $form.addEventListener("submit", (e) => this.#onSubmit(e));
      $url.addEventListener("input", () => {
        $name.placeholder = deriveName($url.value) || "taken from the URL";
      });
      $name.placeholder = "taken from the URL";
    }

    open() {
      const { $dialog, $form, $name } = this.#html;
      if ($dialog.open) return;
      $form.reset();
      $name.placeholder = "taken from the URL";
      this.#setError("");
      $dialog.showModal();
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
    }

    async #onSubmit(e) {
      e.preventDefault();
      if (this.#busy) return;
      const url = this.#html.$url.value.trim();
      const name = this.#html.$name.value.trim() || deriveName(url);
      if (!url) return;
      if (!name) return this.#setError("Could not work out a name, please enter one.");

      this.#setError("");
      this.#setBusy(true);
      try {
        const project = await cloneProject({ url, name });
        this.#setBusy(false);
        this.#html.$dialog.close();
        openProject(project);
      } catch (err) {
        console.error(err);
        this.#setBusy(false);
        this.#setError(err.message || "Something went wrong, try again.");
      }
    }
  },
);
