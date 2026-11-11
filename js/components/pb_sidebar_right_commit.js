import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("sidebar-right-commit"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
      <p class="hash">2309239020392309</p>
      
      <div class="user">
        <pb-avatar class="large"></pb-avatar>
        <div class="details">
          <p class="name">Pombo</p>
          <p><time datetime="12:00">12:00 @ 10:00</time></p>
        </div>
      </div>

      <input type="text" />
      <textarea rows="7"></textarea>

      <button class="commit-btn btn" type="button">commit</button>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;
      }
    }
  },
);
