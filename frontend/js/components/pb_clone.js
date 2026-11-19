import { getPrefix, icon } from "../lib/helpers.js";
import "./pb_clone_url.js";
import "./pb_clone_open.js";

const TITLES = { url: "Clone a repository", open: "Open a repository" };

customElements.define(
  getPrefix("clone"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    #html = {};

    #template = `
      <dialog data-tab="url">
        <button type="button" class="pb-close" aria-label="Close">
          ${icon("times")}
        </button>

        <aside class="pb-sidebar">
          <ul class="pb-tabs">
            <li>
              <button type="button" class="pb-nav-bar pb-active" data-tab="url">Clone</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar" data-tab="open">Open</button>
            </li>
          </ul>
        </aside>

        <header>
          <h2>${TITLES.url}</h2>
        </header>

        <pb-clone-url class="pb-body pb-clone-tab-url"></pb-clone-url>
        <pb-clone-open class="pb-body pb-clone-tab-open"></pb-clone-open>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $dialog = this.querySelector("dialog");
      this.#html = { $dialog, $title: this.querySelector("header h2") };

      document.addEventListener("pb-open-clone", (e) =>
        this.open(e.detail?.tab),
      );
      $dialog.addEventListener("click", (e) => this.#onClick(e));

      this.addEventListener("pb-clone-busy", (e) => (this.#busy = e.detail));
      $dialog.addEventListener(
        "cancel",
        (e) => this.#busy && e.preventDefault(),
      );
      this.addEventListener("pb-clone-done", () => $dialog.close());
    }

    open(tab = "url") {
      const { $dialog } = this.#html;
      if ($dialog.open) return;
      this.querySelector("pb-clone-url").reset();
      this.querySelector("pb-clone-open").reset();
      this.#showTab(tab);
      $dialog.showModal();
      this.#focusInput();
    }

    #showTab(tab) {
      if (!(tab in TITLES)) tab = "url";
      const { $dialog, $title } = this.#html;
      $dialog.dataset.tab = tab;
      $title.textContent = TITLES[tab];
      for (const btn of this.querySelectorAll(".pb-nav-bar")) {
        btn.classList.toggle("pb-active", btn.dataset.tab === tab);
      }
    }

    #focusInput() {
      const { $dialog } = this.#html;
      const tab =
        $dialog.dataset.tab === "open" ? "pb-clone-open" : "pb-clone-url";
      this.querySelector(`${tab} input`)?.focus();
    }

    #onClick(e) {
      const { $dialog } = this.#html;
      if (this.#busy) return;
      if (e.target === $dialog) return $dialog.close();

      const btn = e.target.closest("button");
      if (btn?.classList.contains("pb-close")) return $dialog.close();
      if (btn?.dataset.tab) {
        this.#showTab(btn.dataset.tab);
        this.#focusInput();
      }
    }
  },
);
