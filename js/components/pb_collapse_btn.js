import { getPrefix } from "../lib/helpers.js";

import data, { setPanelCollapsed } from "../api/data.js";

// The thin bar on the inner edge of a sidebar. Clicking it collapses the
// sidebar down to just this bar (hiding .pb-panel-content), and again expands it.
customElements.define(
  getPrefix("collapse-btn"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $button: undefined,
    };

    #template = `
      <button type="button" aria-expanded="true"></button>
    `;

    get #panel() {
      return this.closest("pb-sidebar-left, pb-sidebar-right");
    }

    // "pb-sidebar-left" -> "left"
    get #side() {
      return this.#panel?.localName.replace("pb-sidebar-", "");
    }

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
        this.#html.$button = this.querySelector("button");
        this.#html.$button.addEventListener("click", () => this.toggle());
      }

      const side = this.#side;
      if (!side) return;
      this.#apply(data.panels[side]);
      document.addEventListener("pb-panel-change", (e) => {
        if (e.detail.side === side) this.#apply(e.detail.collapsed);
      });
    }

    toggle() {
      const side = this.#side;
      if (side) setPanelCollapsed(side, !data.panels[side]);
    }

    #apply(collapsed) {
      this.#panel.classList.toggle("pb-collapsed", collapsed);
      const label = collapsed ? "Expand panel" : "Collapse panel";
      this.#html.$button.setAttribute("aria-expanded", String(!collapsed));
      this.#html.$button.setAttribute("aria-label", label);
      this.#html.$button.title = label;
    }
  },
);
