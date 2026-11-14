import { getPrefix, escapeHtml } from "../lib/helpers.js";
import {
  fetchIdentities,
  addIdentity,
  selectIdentity,
  removeIdentity,
} from "../api/identities.js";
import { setIdentity } from "../api/data.js";
import { APP } from "../constants/app.js";
import { ACCENTS, THEMES, getAccent, getTheme, setAccent, setTheme } from "../theme.js";

const TABS = ["ssh", "theme", "about"];

customElements.define(
  getPrefix("settings"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $dialog: undefined,
      $current: undefined,
      $users: undefined,
      $form: undefined,
      $error: undefined,
    };

    #identities = [];

    #template = `
      <dialog data-tab="ssh">
        <button type="button" class="close pb-danger" aria-label="Close">x</button>

        <aside class="sidebar">
          <ul class="tabs">
            <li>
              <button type="button" class="pb-nav-bar pb-active" data-tab="ssh">SSH</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar" data-tab="theme">Theme</button>
            </li>
            <li>
              <button type="button" class="pb-nav-bar" data-tab="about">About</button>
            </li>
          </ul>
        </aside>

        <header>
          <h2>Settings</h2>
        </header>

        <section class="body pb-settings-tab-ssh">
          <form class="add">
            <label>
              <span>Name</span>
              <input type="text" name="name" required />
            </label>
            <label>
              <span>Private key</span>
              <input type="file" name="key" required />
              <div class="add-file pb-btn-2">Choose File</div>
            </label>
            
            <hr>

            <button type="submit" class="add-ssh pb-btn">+ Add new SSH</button>
          </form>
          <p class="pb-error" hidden></p>

          <hr>

          <div class="user"></div>

          <ul class="users"></ul>
        </section>

        <section class="body pb-settings-tab-theme">
          <p>Theme</p>
          <ul class="themes">
            ${THEMES.map(
              (t) => `
            <li>
              <label>
                <input type="radio" name="theme" value="${t.id}">
                <span>${escapeHtml(t.label)}</span>
              </label>
            </li>`,
            ).join("")}
          </ul>

          <p>Accent</p>
          <ul class="themes">
            ${ACCENTS.map(
              (t) => `
            <li>
              <label>
                <input type="radio" name="accent" value="${t.id}">
                <span>${escapeHtml(t.label)}</span>
              </label>
            </li>`,
            ).join("")}
          </ul>
        </section>

        <section class="body pb-settings-tab-about">
          <h2>${escapeHtml(APP.name)} v${escapeHtml(APP.version)}</h2>
          <p>
            ${escapeHtml(APP.description)}
          </p>
          <ul class="claims">
            <li>
              GPL 3.0
            </li>
          </ul>
        </section>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $dialog: $("dialog"),
        $current: $(".user"),
        $users: $(".users"),
        $form: $("form.add"),
        $error: $(".pb-error"),
      };

      document.addEventListener("pb-open-settings", () => this.open());
      this.#html.$dialog.addEventListener("click", (e) => this.#onClick(e));
      this.#html.$form.addEventListener("submit", (e) => this.#onAdd(e));
      this.#html.$dialog.addEventListener("change", (e) => {
        if (e.target.name === "theme") setTheme(e.target.value);
        if (e.target.name === "accent") setAccent(e.target.value);
      });

      this.#loadIdentities(fetchIdentities());
    }

    open(tab = "ssh") {
      this.#showTab(tab);
      const current = { theme: getTheme(), accent: getAccent() };
      for (const radio of this.querySelectorAll('input[name="theme"], input[name="accent"]')) {
        radio.checked = radio.value === current[radio.name];
      }
      if (!this.#html.$dialog.open) this.#html.$dialog.showModal();
    }

    #showTab(tab) {
      if (!TABS.includes(tab)) return;
      this.#html.$dialog.dataset.tab = tab;
      for (const btn of this.querySelectorAll(".pb-nav-bar")) {
        btn.classList.toggle("pb-active", btn.dataset.tab === tab);
      }
    }

    #onClick(e) {
      const dialog = this.#html.$dialog;
      if (e.target === dialog) return dialog.close();

      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("close")) return dialog.close();
      if (btn.dataset.tab) return this.#showTab(btn.dataset.tab);

      const id = btn.closest("li[data-id]")?.dataset.id;
      if (btn.classList.contains("select") && id) {
        this.#loadIdentities(selectIdentity(id));
      } else if (btn.classList.contains("remove") && id) {
        this.#loadIdentities(removeIdentity(id));
      }
    }

    async #onAdd(e) {
      e.preventDefault();
      const form = this.#html.$form;
      const name = form.elements.name.value.trim();
      const keyFile = form.elements.key.files[0];
      if (!name || !keyFile) return;

      const ok = await this.#loadIdentities(addIdentity({ name, keyFile }));
      if (ok) form.reset();
    }

    async #loadIdentities(request) {
      const $error = this.#html.$error;
      try {
        this.#identities = await request;
        $error.hidden = true;
      } catch (err) {
        console.error(err);
        $error.textContent = "Something went wrong, try again.";
        $error.hidden = false;
        return false;
      }
      this.#renderIdentities();
      return true;
    }

    #renderIdentities() {
      const active = this.#identities.find((i) => i.isActive);

      this.#html.$current.innerHTML = active
        ? `<pb-avatar class="pb-medium" name="${escapeHtml(active.name)}" src="${escapeHtml(active.avatarUrl ?? "")}"></pb-avatar>
           <span class="name">${escapeHtml(active.name)}</span>`
        : `<span class="name">No identity selected</span>`;

      this.#html.$users.innerHTML = this.#identities
        .map(
          (i) => `
          <li data-id="${escapeHtml(i.id)}"${i.isActive ? ' class="pb-active"' : ""}>
            <pb-avatar class="pb-small" name="${escapeHtml(i.name)}" src="${escapeHtml(i.avatarUrl ?? "")}"></pb-avatar>
            <span class="name">${escapeHtml(i.name)}</span>
            <span class="key">${escapeHtml(i.keyName)}</span>
            ${
              i.isActive
                ? `<span class="badge">Active</span>`
                : `<button type="button" class="select">Use</button>`
            }
            <button type="button" class="remove pb-danger" aria-label="Remove ${escapeHtml(i.name)}">x</button>
          </li>`,
        )
        .join("");

      setIdentity(active);
    }
  },
);
