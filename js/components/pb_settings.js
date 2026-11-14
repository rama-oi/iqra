import { getPrefix } from "../lib/helpers.js";
import "./pb_settings_ssh.js";
import "./pb_settings_theme.js";
import "./pb_settings_about.js";

const TABS = ["ssh", "theme", "about"];

// The dialog shell: tab navigation and open/close. Each tab is its own component
// and a direct child of the dialog (the CSS shows the one matching data-tab).
customElements.define(
  getPrefix("settings"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $dialog: undefined,
    };

    #template = `
      <dialog data-tab="ssh">
        <button type="button" class="close pb-danger" aria-label="Close">x</button>

        <aside class="sidebar">
          <ul class="tabs">
            <li>
              <button type="button" class="pb-nav-bar pb-active" data-tab="ssh">SSH</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar" data-tab="theme">Theme</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar" data-tab="about">About</button>
            </li>
          </ul>
        </aside>

        <header>
          <h2>Settings</h2>
        </header>

        <pb-settings-ssh class="body pb-settings-tab-ssh"></pb-settings-ssh>
        <pb-settings-theme class="body pb-settings-tab-theme"></pb-settings-theme>
        <pb-settings-about class="body pb-settings-tab-about"></pb-settings-about>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.#html.$dialog = this.querySelector("dialog");

      document.addEventListener("pb-open-settings", () => this.open());
      this.#html.$dialog.addEventListener("click", (e) => this.#onClick(e));
    }

    open(tab = "ssh") {
      this.#showTab(tab);
      if (!this.#html.$dialog.open) this.#html.$dialog.showModal();
    }

    #showTab(tab) {
      if (!TABS.includes(tab)) return;
      this.#html.$dialog.dataset.tab = tab;
      for (const btn of this.querySelectorAll(".pb-nav-bar")) {
        btn.classList.toggle("pb-active", btn.dataset.tab === tab);
      }
    }

    #onClick(e) {
      const dialog = this.#html.$dialog;
      if (e.target === dialog) return dialog.close();

      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("close")) return dialog.close();
      if (btn.dataset.tab) this.#showTab(btn.dataset.tab);
    }
  },
);
