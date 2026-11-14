import { getPrefix, escapeHtml } from "../lib/helpers.js";
import {
  fetchIdentities,
  addIdentity,
  selectIdentity,
  removeIdentity,
} from "../api/identities.js";
import { setIdentity } from "../api/data.js";

// Settings > SSH: the identities (name + private key) used for git operations.
// Loaded at startup, not when the dialog opens, so the corner avatar is right.
customElements.define(
  getPrefix("settings-ssh"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $current: undefined,
      $users: undefined,
      $form: undefined,
      $error: undefined,
    };

    #identities = [];

    #template = `
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
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $current: $(".user"),
        $users: $(".users"),
        $form: $("form.add"),
        $error: $(".pb-error"),
      };

      this.addEventListener("click", (e) => this.#onClick(e));
      this.#html.$form.addEventListener("submit", (e) => this.#onAdd(e));

      this.#loadIdentities(fetchIdentities());
    }

    #onClick(e) {
      const btn = e.target.closest("button");
      const id = btn?.closest("li[data-id]")?.dataset.id;
      if (!id) return;
      if (btn.classList.contains("select")) {
        this.#loadIdentities(selectIdentity(id));
      } else if (btn.classList.contains("remove")) {
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
