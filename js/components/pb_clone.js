import { getPrefix } from "../lib/helpers.js";
import "./pb_clone_url.js";
import "./pb_clone_open.js";

const TABS = ["clone", "open"];

// The "add a repository" dialog: the shell with the tab navigation (same look as
// the settings dialog). Each tab is its own component and a direct child of the
// dialog. A tab tells the shell what it is doing with two bubbling events:
//   pb-clone-busy  { detail: true | false }  work in progress: do not close or switch tab
//   pb-clone-done                            a project was opened: close the dialog
customElements.define(
  getPrefix("clone"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    #html = {
      $dialog: undefined,
    };

    #template = `
      <dialog data-tab="clone">
        <button type="button" class="pb-close pb-danger" aria-label="Close">
          <span class="pb-icon">❌</span>
        </button>

        <aside class="pb-sidebar">
          <ul class="pb-tabs">
            <li>
              <button type="button" class="pb-nav-bar pb-active" data-tab="clone">Clone</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar" data-tab="open">Open</button>
            </li>
          </ul>
        </aside>

        <header>
          <h2>Open repository</h2>
        </header>

        <pb-clone-url class="pb-body pb-clone-tab-clone"></pb-clone-url>
        <pb-clone-open class="pb-body pb-clone-tab-open"></pb-clone-open>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $dialog = (this.#html.$dialog = this.querySelector("dialog"));

      document.addEventListener("pb-open-clone", () => this.open());
      $dialog.addEventListener("click", (e) => this.#onClick(e));
      // Esc must not abandon a clone that is already running
      $dialog.addEventListener("cancel", (e) => this.#busy && e.preventDefault());
      this.addEventListener("pb-clone-busy", (e) => (this.#busy = e.detail));
      this.addEventListener("pb-clone-done", () => $dialog.close());
    }

    open(tab = "clone") {
      const $dialog = this.#html.$dialog;
      if ($dialog.open) return;
      for (const $tab of this.querySelectorAll("pb-clone-url, pb-clone-open")) $tab.reset();
      this.#showTab(tab);
      $dialog.showModal();
    }

    #showTab(tab) {
      if (!TABS.includes(tab)) return;
      this.#html.$dialog.dataset.tab = tab;
      for (const btn of this.querySelectorAll(".pb-nav-bar")) {
        btn.classList.toggle("pb-active", btn.dataset.tab === tab);
      }
      this.querySelector(`.pb-clone-tab-${tab} input`)?.focus();
    }

    #onClick(e) {
      if (this.#busy) return;
      const $dialog = this.#html.$dialog;
      if (e.target === $dialog) return $dialog.close();

      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.classList.contains("pb-close")) return $dialog.close();
      if (btn.dataset.tab) this.#showTab(btn.dataset.tab);
    }
  },
);
