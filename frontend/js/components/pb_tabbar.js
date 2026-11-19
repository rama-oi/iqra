import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, { closeTab, selectTab } from "../api/data.js";
import "./pb_tab.js";
import "./pb_tab_add.js";
import "./pb_menu.js";

customElements.define(
  getPrefix("tabbar"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $tabs: undefined,
      $prev: undefined,
      $next: undefined,
    };

    // The arrows only show while the tabs do not fit (see #updateArrows).
    #template = `
      <pb-tab-add></pb-tab-add>
      <button type="button" class="pb-tabs-scroll pb-tabs-prev" aria-label="Scroll tabs left" title="Scroll tabs left" hidden>${icon("arrow-left")}</button>
      <div class="pb-tabs"></div>
      <button type="button" class="pb-tabs-scroll pb-tabs-next" aria-label="Scroll tabs right" title="Scroll tabs right" hidden>${icon("arrow-right")}</button>
      <span class="pb-flex-separator"></span>
      <pb-menu></pb-menu>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;
        this.innerHTML = this.#template;
        this.#html.$tabs = this.querySelector(".pb-tabs");
        this.#html.$prev = this.querySelector(".pb-tabs-prev");
        this.#html.$next = this.querySelector(".pb-tabs-next");

        const $tabs = this.#html.$tabs;
        this.#html.$prev.addEventListener("click", () => this.#scrollBy(-1));
        this.#html.$next.addEventListener("click", () => this.#scrollBy(1));
        $tabs.addEventListener("scroll", () => this.#updateArrows(), { passive: true });
        // a mouse wheel moves the strip sideways, as it does in a browser's tab bar
        $tabs.addEventListener(
          "wheel",
          (e) => {
            if (e.deltaX || $tabs.scrollWidth <= $tabs.clientWidth) return;
            e.preventDefault();
            $tabs.scrollLeft += e.deltaY;
          },
          { passive: false },
        );
        // the room for tabs changes with the window, and with the menu next to them
        new ResizeObserver(() => this.#updateArrows()).observe($tabs);

        this.#html.$tabs.addEventListener("pb-tab-select", (e) => selectTab(e.detail));
        this.#html.$tabs.addEventListener("pb-tab-close", (e) => closeTab(e.detail));
        for (const type of ["pb-tabs-change", "pb-repository-change"]) {
          document.addEventListener(type, () => this.#render());
        }
        this.#render();
      }
    }

    #render() {
      this.#html.$tabs.innerHTML = data.tabs
        .map(
          (tab) =>
            `<pb-tab label="${escapeHtml(tab.name)}"${tab.name === data.repository ? ' class="pb-active"' : ""}></pb-tab>`,
        )
        .join("");
      this.#revealActive();
      this.#updateArrows();
    }

    // Scrolls just the strip (not the page) so the open project's tab is not hidden.
    #revealActive() {
      const $tabs = this.#html.$tabs;
      const $active = $tabs.querySelector("pb-tab.pb-active");
      if (!$active) return;
      const left = $active.offsetLeft - $tabs.offsetLeft;
      const right = left + $active.offsetWidth;
      if (left < $tabs.scrollLeft) $tabs.scrollLeft = left;
      else if (right > $tabs.scrollLeft + $tabs.clientWidth) $tabs.scrollLeft = right - $tabs.clientWidth;
    }

    #scrollBy(direction) {
      const $tabs = this.#html.$tabs;
      $tabs.scrollBy({ left: direction * Math.max(120, $tabs.clientWidth * 0.6), behavior: "smooth" });
    }

    #updateArrows() {
      const { $tabs, $prev, $next } = this.#html;
      const overflowing = $tabs.scrollWidth > $tabs.clientWidth + 1;
      $prev.hidden = $next.hidden = !overflowing;
      $prev.disabled = $tabs.scrollLeft <= 0;
      $next.disabled = $tabs.scrollLeft + $tabs.clientWidth >= $tabs.scrollWidth - 1;
    }
  },
);
