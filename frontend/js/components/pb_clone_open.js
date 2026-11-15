import { getPrefix } from "../lib/helpers.js";
import { openLocalProject, folderName } from "../api/projects.js";
import { openProject } from "../api/data.js";
import "./pb_file_picker.js";

const NAME_HINT = "taken from the folder";

// Open > a git repository that is already in a folder (on the machine running the
// backend), chosen with the folder picker or typed in.
customElements.define(
  getPrefix("clone-open"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    #html = {};

    #template = `
      <form>
        <label>
          <span>Folder</span>
          <pb-file-picker name="path" mode="folder" title="Open a repository" required></pb-file-picker>
        </label>
        <label>
          <span>Name</span>
          <input type="text" name="name" autocomplete="off" spellcheck="false" />
        </label>
        <p class="pb-error" role="alert" hidden></p>
        <button type="submit" class="pb-btn">open</button>
      </form>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $form: $("form"),
        $picker: $("pb-file-picker"),
        $path: $('input[name="path"]'),
        $name: $('input[name="name"]'),
        $submit: $('button[type="submit"]'),
        $error: $(".pb-error"),
      };

      this.#html.$form.addEventListener("submit", (e) => this.#onSubmit(e));
      this.#html.$path.addEventListener("input", () => {
        this.#html.$name.placeholder = folderName(this.#html.$path.value) || NAME_HINT;
      });
      this.reset();
    }

    reset() {
      this.#html.$form.reset();
      this.#html.$name.placeholder = NAME_HINT;
      this.#setError("");
    }

    #setError(text) {
      const { $error } = this.#html;
      $error.textContent = text;
      $error.hidden = !text;
    }

    #setBusy(busy) {
      this.#busy = busy;
      const { $submit, $picker, $name } = this.#html;
      $submit.disabled = busy;
      $picker.disabled = busy;
      $name.disabled = busy;
      $submit.textContent = busy ? "opening…" : "open";
      this.dispatchEvent(new CustomEvent("pb-clone-busy", { bubbles: true, detail: busy }));
    }

    async #onSubmit(e) {
      e.preventDefault();
      if (this.#busy) return;

      const path = this.#html.$path.value.trim();
      if (!path) return;
      const name = this.#html.$name.value.trim() || folderName(path);
      if (!name) return this.#setError("Could not work out a name, please enter one.");

      this.#setError("");
      this.#setBusy(true);
      try {
        const project = await openLocalProject({ path, name });
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
