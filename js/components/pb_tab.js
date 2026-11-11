import { getPrefix } from "../_helpers.js";

customElements.define(
  getPrefix("tab"),
  class extends HTMLElement {
    static observedAttributes = ["label"];

    #initialized = false;

    #html = {
      $label: undefined,
      $closeBtn: undefined,
    };

    #template = `
      <button class="label" type="button"></button>
      <button class="close" type="button">x</button>
    `;

    get label() {
      return this.getAttribute("label") ?? "";
    }

    set label(value) {
      this.setAttribute("label", value);
    }

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        this.#html.$label = this.querySelector(".label");
        this.#html.$closeBtn = this.querySelector(".close");
      }

      this.update();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;

      if (this.#initialized) {
        this.update();
      }
    }

    update() {
      this.#html.$label.textContent = this.label;
    }
  },
);
