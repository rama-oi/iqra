import { getPrefix } from "../lib/helpers.js";
import MOCK from "../api/config.js";
import { goBack } from "../api/data.js";
import { refreshApp } from "../api/refresh.js";

import "./pb_avatar.js";
import "./pb_collapse_btn.js";
import "./pb_picker.js";
import "./pb_file_picker.js";
import "./pb_clone.js";

import "./pb_tabbar.js";
import "./pb_toolbar.js";
import "./pb_sidebar_left.js";
import "./pb_sidebar_right.js";
import "./pb_workarea.js";
import "./pb_settings.js";

customElements.define(
  getPrefix("app"),
  class extends HTMLElement {
    #initialized = false;

    #template = `
      <header>
        <pb-tabbar></pb-tabbar>
        <pb-toolbar></pb-toolbar>
      </header>

      <main>
        <pb-sidebar-left></pb-sidebar-left>
        <pb-workarea></pb-workarea>
        <pb-sidebar-right></pb-sidebar-right>
      </main>

      <pb-settings></pb-settings>
      <pb-picker></pb-picker>
      <pb-file-browser></pb-file-browser>
      <pb-clone></pb-clone>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      if (!MOCK.projects) refreshApp({ force: true });

      window.addEventListener("focus", () => refreshApp());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshApp();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if (document.querySelector("dialog[open], :popover-open")) return;
        if (e.target.closest?.("input, textarea, select, [contenteditable]"))
          return;
        if (goBack()) e.preventDefault();
      });
    }
  },
);
