import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("sidebar-right-preview"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
      <div class="pb-wrapper">
        <p class="pb-hash">2309239020392309</p>
        
        <div class="pb-user">
          <pb-avatar class="pb-large"></pb-avatar>
          <div class="details">
            <p class="name">Pombo</p>
            <p><time datetime="12:00">12:00 @ 10:00</time></p>
          </div>
        </div>

        <input type="text" />
        <textarea rows="6"></textarea>

        <button class="commit-btn pb-btn" type="button">update message</button>
      </div>

      <details class="staged" open>
        <summary>Staged Files</summary>
        <ul class="content">
          <li><button type="button">file 1</button></li>
        </ul>
      </details>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }
    }
  },
);
