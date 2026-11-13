import { getPrefix } from "../_helpers.js";

const STORAGE_PREFIX = "pb-collapsed-";

function readCollapsed(key) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(key, collapsed) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, collapsed ? "1" : "0");
  } catch {
    // not persisted, still applied for this session
  }
}

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

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
        this.#html.$button = this.querySelector("button");
        this.#html.$button.addEventListener("click", () => this.toggle());
      }

      const panel = this.#panel;
      if (panel) this.#apply(readCollapsed(panel.localName));
    }

    toggle() {
      const panel = this.#panel;
      if (!panel) return;
      const collapsed = !panel.classList.contains("pb-collapsed");
      this.#apply(collapsed);
      writeCollapsed(panel.localName, collapsed);
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
