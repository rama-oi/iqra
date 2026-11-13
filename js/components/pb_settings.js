import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("settings"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
    };

    #template = `
      <dialog>
        <button type="button" class="close">x</button>
        <aside class="sidebar">
          <ul class="users">
            <li>
              <button type="button" class="pb-nav-bar">SSH</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar">Theme</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar">About</button>
            </li>
          </ul>
        </aside>

        <header>
          <h2>Settings</h2>
        </header>

        <section class="body pb-settings-tab-ssh">
          <label>
            <span>Add new SSH</span>
            <input type="file"/>
          <label>
          <div class="user">
            <pb-avatar></pb-avatar>
            <span class="name">Marc</span>
          </div>

          <ul class="users">
            <li>
              <pb-avatar></pb-avatar>
              <span class="name">Marc</span>
              <button type="button" class="remove">x</button>
            </li>
          </ul>
        </section>

        <section class="body pb-settings-tab-theme">
          <p>Pick a theme</p>
          <ul class="themes">
            <li>
              <label>
                <input type="radio" name="theme" value="catppuccin-mocha">
                <span>Catppuccin Mocha</span>
              </label>
            </li>
          </ul>
        </section>

        <section class="body pb-settings-tab-about">
          <p>Iqra v1</p>
          <ul class="claims">
            <li>
              GPL 3.0
            </li>
          </ul>
        </section>
      </dialog>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
      }
    }
  },
);
