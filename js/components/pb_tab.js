import { getPrefix } from "../_helpers.js";

// A project tab. It only reports what the user did (both events bubble);
// pb-tabbar decides what that means.
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
      <button class="close pb-danger" type="button" aria-label="Close tab" title="Close tab">x</button>
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

        const fire = (type) =>
          this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: this.label }));
        this.#html.$label.addEventListener("click", () => fire("pb-tab-select"));
        this.#html.$closeBtn.addEventListener("click", () => fire("pb-tab-close"));
        // middle click closes, like browser tabs
        this.#html.$label.addEventListener("auxclick", (e) => {
          if (e.button === 1) fire("pb-tab-close");
        });
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
