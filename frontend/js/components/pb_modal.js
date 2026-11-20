import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";

// One dialog for the questions the app has to ask: a yes/no (confirmModal) or a line of
// text (promptModal). It looks like the other modals and replaces the browser's own
// confirm() and prompt() boxes.
//
//   if (await confirmModal({ title: "Delete branch", message: "…", danger: true })) …
//   const name = await promptModal({ title: "New branch", label: "Name" }); // null: cancelled
//
// With `action` the dialog does the work itself: it shows "Working…", and when the action
// throws it stays open and shows the error under the field, so the person can fix it.
// Then confirmModal answers true and promptModal answers the typed text once it worked.

function modal() {
  const el = document.querySelector(getPrefix("modal"));
  if (!el) throw new Error("<pb-modal> is missing from the page");
  return el;
}

export function confirmModal(options) {
  return modal().ask({ ...options, kind: "confirm" });
}

export function promptModal(options) {
  return modal().ask({ ...options, kind: "prompt" });
}

customElements.define(
  getPrefix("modal"),
  class extends HTMLElement {
    #initialized = false;
    #opts = null;
    #resolve = null;
    #answer = null;
    #busy = false;

    #template = `
      <dialog>
        <header>
          <h2></h2>
          <button type="button" class="pb-close" aria-label="Close">${icon("times")}</button>
        </header>
        <form class="pb-modal-body" novalidate>
          <div class="pb-message"></div>
          <label class="pb-field" hidden>
            <span class="pb-label"></span>
            <input type="text" autocomplete="off" spellcheck="false" />
          </label>
          <p class="pb-modal-error" role="alert" hidden></p>
          <footer>
            <button type="button" class="pb-cancel pb-btn-outline"></button>
            <button type="submit" class="pb-confirm pb-btn"></button>
          </footer>
        </form>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const dialog = this.querySelector("dialog");
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) return this.#cancel();
        const btn = e.target.closest("button");
        if (btn?.classList.contains("pb-close") || btn?.classList.contains("pb-cancel")) {
          this.#cancel();
        }
      });
      // Esc: cancel() fires first, and a pending action must not be abandoned halfway
      dialog.addEventListener("cancel", (e) => {
        if (this.#busy) e.preventDefault();
      });
      dialog.addEventListener("close", () => this.#finish());
      this.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        this.#submit();
      });
    }

    ask(opts) {
      if (this.#resolve) throw new Error("a modal is already open");
      const dialog = this.querySelector("dialog");
      const prompt = opts.kind === "prompt";
      this.#opts = opts;
      this.#answer = null;
      this.dataset.kind = opts.kind;

      this.querySelector("h2").textContent = opts.title ?? "";
      this.querySelector(".pb-message").innerHTML = (opts.message ?? "")
        .split("\n")
        .filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("");

      const field = this.querySelector(".pb-field");
      const input = this.querySelector("input");
      field.hidden = !prompt;
      this.querySelector(".pb-label").textContent = opts.label ?? "";
      input.value = opts.value ?? "";
      input.placeholder = opts.placeholder ?? "";

      const confirm = this.querySelector(".pb-confirm");
      confirm.textContent = opts.confirmLabel ?? (prompt ? "OK" : "Confirm");
      confirm.classList.toggle("pb-danger", !!opts.danger);
      this.querySelector(".pb-cancel").textContent = opts.cancelLabel ?? "Cancel";
      this.#setError("");
      this.#setBusy(false);

      return new Promise((resolve) => {
        this.#resolve = resolve;
        dialog.showModal();
        // a destructive question starts on "Cancel", so a stray Enter does no harm
        if (prompt) {
          input.focus();
          input.select();
        } else if (opts.danger) {
          this.querySelector(".pb-cancel").focus();
        } else {
          confirm.focus();
        }
      });
    }

    async #submit() {
      if (this.#busy) return;
      const opts = this.#opts;
      const prompt = opts.kind === "prompt";
      const value = this.querySelector("input").value.trim();

      if (prompt) {
        const problem = !value
          ? (opts.emptyMessage ?? "Type something first.")
          : opts.validate?.(value);
        if (problem) {
          this.#setError(problem);
          this.querySelector("input").focus();
          return;
        }
      }
      if (opts.action) {
        this.#setBusy(true);
        this.#setError("");
        try {
          await opts.action(prompt ? value : undefined);
        } catch (err) {
          this.#setBusy(false);
          this.#setError(err?.message || "That did not work.");
          if (prompt) this.querySelector("input").focus();
          return;
        }
        this.#setBusy(false);
      }
      this.#answer = prompt ? value : true;
      this.querySelector("dialog").close();
    }

    #cancel() {
      if (this.#busy) return;
      this.querySelector("dialog").close();
    }

    #finish() {
      const resolve = this.#resolve;
      const answer = this.#answer;
      this.#resolve = null;
      this.#opts = null;
      this.#answer = null;
      resolve?.(answer ?? (this.dataset.kind === "confirm" ? false : null));
    }

    #setError(text) {
      const $err = this.querySelector(".pb-modal-error");
      $err.textContent = text;
      $err.hidden = !text;
    }

    #setBusy(busy) {
      this.#busy = busy;
      for (const el of this.querySelectorAll("input, .pb-cancel, .pb-confirm, .pb-close")) {
        el.disabled = busy;
      }
      const confirm = this.querySelector(".pb-confirm");
      if (busy) {
        confirm.dataset.label = confirm.textContent;
        confirm.textContent = "Working…";
      } else if (confirm.dataset.label) {
        confirm.textContent = confirm.dataset.label;
        delete confirm.dataset.label;
      }
    }
  },
);
