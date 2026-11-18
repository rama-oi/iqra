import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import {
  fetchIdentities,
  addIdentity,
  selectIdentity,
  removeIdentity,
} from "../api/identities.js";
import { setIdentity } from "../api/data.js";
import { toast } from "../lib/toast.js";
import "./pb_file_picker.js";

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
      <form class="pb-add">
        <label>
          <span>Name</span>
          <input type="text" name="name" required />
        </label>
        <label>
          <span>Private key</span>
          <pb-file-picker name="key" mode="upload" required></pb-file-picker>
        </label>

        <hr>

        <button type="submit" class="pb-add-ssh pb-btn">+ Add new SSH</button>
      </form>
      <p class="pb-error" hidden></p>
      <p class="pb-hint">
        The active identity's key is used to clone, pull and push. Use a key without a
        passphrase, and add its public key to your account on GitHub or your git host.
        With no identity, Iqra uses your ssh-agent and ~/.ssh/config like a terminal does.
      </p>

      <hr>

      <div class="pb-user"></div>

      <ul class="pb-users"></ul>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $current: $(".pb-user"),
        $users: $(".pb-users"),
        $form: $("form.pb-add"),
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
      if (btn.classList.contains("pb-select")) {
        this.#loadIdentities(selectIdentity(id));
      } else if (btn.classList.contains("pb-remove")) {
        this.#loadIdentities(removeIdentity(id));
      } else if (btn.classList.contains("pb-copy")) {
        this.#copyPublicKey(id);
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

    async #copyPublicKey(id) {
      const key = this.#identities.find((i) => i.id === id)?.publicKey;
      if (!key) return;
      try {
        await navigator.clipboard.writeText(key);
        toast("Public key copied. Paste it into your git host's SSH keys.");
      } catch {
        toast("Could not copy. Select the key from the page and copy it yourself.", { error: true });
      }
    }

    async #loadIdentities(request) {
      const $error = this.#html.$error;
      try {
        this.#identities = await request;
        $error.hidden = true;
      } catch (err) {
        console.error(err);
        $error.textContent = err.message || "Something went wrong, try again.";
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
           <span class="pb-name">${escapeHtml(active.name)}</span>`
        : `<span class="pb-name">No identity selected</span>`;

      this.#html.$users.innerHTML = this.#identities
        .map(
          (i) => `
          <li data-id="${escapeHtml(i.id)}"${i.isActive ? ' class="pb-active"' : ""}>
            <pb-avatar class="pb-small" name="${escapeHtml(i.name)}" src="${escapeHtml(i.avatarUrl ?? "")}"></pb-avatar>
            <span class="pb-name">${escapeHtml(i.name)}</span>
            <span class="pb-key">${escapeHtml(i.keyName)}</span>
            ${i.publicKey ? `<button type="button" class="pb-copy" title="Copy the public key">Copy public key</button>` : ""}
            ${
              i.isActive
                ? `<span class="pb-badge">Active</span>`
                : `<button type="button" class="pb-select">Use</button>`
            }
            <button type="button" class="pb-remove pb-danger" aria-label="Remove ${escapeHtml(i.name)}">
              ${icon("times")}
            </button>
          </li>`,
        )
        .join("");

      setIdentity(active);
    }
  },
);
