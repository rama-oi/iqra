import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("sidebar-right-commit"),
  class extends HTMLElement {
    #initialized = false;

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
        <input type="text" />
        <textarea rows="6"></textarea>
        <button class="commit-btn pb-btn" type="button">commit</button>
      </div>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }
    }
  },
);
