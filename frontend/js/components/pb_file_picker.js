import { getPrefix, escapeHtml } from "../lib/helpers.js";
import { browseFolder } from "./pb_file_browser.js";

// One look for "choose something" fields, with two modes:
//
//   <pb-file-picker name="key" mode="upload" required></pb-file-picker>
//     A file from this computer (read by the browser and sent to the backend),
//     e.g. an SSH private key. `.file` / `.files` give it.
//
//   <pb-file-picker name="path" mode="folder" dialog-title="Open a repository"></pb-file-picker>
//     A folder on the machine running the backend. The browser cannot read a
//     folder's path, so "Browse…" opens <pb-file-browser>. The path can also be
//     typed or pasted. `.value` gives it.
//
// Attributes: name, mode (upload | folder, default upload), placeholder, accept
// (upload), dialog-title (folder dialog), required. It sits in forms like an input:
// `form.elements.<name>` is the real input, form.reset() clears it, and a bubbling
// `pb-file-pick` event ({ detail: { value, file } }) says when something was chosen.
customElements.define(
  getPrefix("file-picker"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;

      const upload = this.mode === "upload";
      const name = escapeHtml(this.getAttribute("name") ?? "");
      const required = this.hasAttribute("required") ? "required" : "";
      const placeholder = escapeHtml(this.getAttribute("placeholder") ?? (upload ? "No file chosen" : "/home/me/projects/iqra"));

      // upload: the visible field only shows the file's name (the file input behind it
      // holds the file). folder: the visible field *is* the input, so it can be typed in.
      this.innerHTML = upload
        ? `<input type="text" class="pb-file-field" placeholder="${placeholder}" ${required} autocomplete="off" />
           <button type="button" class="pb-btn-2">Choose File</button>
           <input type="file" name="${name}" accept="${escapeHtml(this.getAttribute("accept") ?? "")}" hidden />`
        : `<input type="text" class="pb-file-field" name="${name}" placeholder="${placeholder}" ${required} autocomplete="off" spellcheck="false" />
           <button type="button" class="pb-btn-2">Browse…</button>`;

      const $ = (sel) => this.querySelector(sel);
      this.#html = { $field: $(".pb-file-field"), $button: $("button"), $file: $('input[type="file"]') };
      const { $field, $button, $file } = this.#html;

      $button.addEventListener("click", () => this.#choose());
      if (upload) {
        // Only the file input may change the field, so typing is refused.
        $field.addEventListener("beforeinput", (e) => e.preventDefault());
        $field.addEventListener("click", () => this.#choose());
        $field.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.#choose();
          }
        });
        $file.addEventListener("change", () => {
          $field.value = $file.files[0]?.name ?? "";
          this.#picked();
        });
        // form.reset() clears the file input but knows nothing of our display.
        this.closest("form")?.addEventListener("reset", () => setTimeout(() => ($field.value = $file.files[0]?.name ?? ""), 0));
      }
    }

    get mode() {
      return this.getAttribute("mode") === "folder" ? "folder" : "upload";
    }

    get value() {
      return this.#html.$field?.value ?? "";
    }

    set value(text) {
      if (this.mode === "folder" && this.#html.$field) this.#html.$field.value = text ?? "";
    }

    get files() {
      return this.#html.$file?.files ?? [];
    }

    get file() {
      return this.files[0] ?? null;
    }

    set disabled(off) {
      for (const el of Object.values(this.#html)) if (el) el.disabled = !!off;
    }

    focus() {
      this.#html.$field?.focus();
    }

    async #choose() {
      const { $field, $file } = this.#html;
      if (this.mode === "upload") return $file.click();

      const path = await browseFolder({
        title: this.getAttribute("dialog-title") ?? "Choose a folder",
        start: $field.value.trim(),
      });
      if (path === null) return;
      $field.value = path;
      // The same event typing makes, so listeners on the field need no second case.
      $field.dispatchEvent(new Event("input", { bubbles: true }));
      this.#picked();
      $field.focus();
    }

    #picked() {
      this.dispatchEvent(new CustomEvent("pb-file-pick", { bubbles: true, detail: { value: this.value, file: this.file } }));
    }
  },
);
