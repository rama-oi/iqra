import { getPrefix } from "../lib/helpers.js";

import "./pb_avatar.js";
import "./pb_collapse_btn.js";
import "./pb_picker.js";
import "./pb_clone.js";

import "./pb_tabbar.js";
import "./pb_toolbar.js";
import "./pb_sidebar_left.js";
import "./pb_sidebar_right.js";
import "./pb_workarea.js";
import "./pb_settings.js";

// The root of the app: the page layout (header + three columns) and the dialogs.
// index.html only contains <pb-app>, and every style in style.css is nested under it.
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
      <pb-clone></pb-clone>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;
    }
  },
);
