import { getPrefix, escapeHtml } from "../lib/helpers.js";

export function getInitials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

customElements.define(
  getPrefix("avatar"),
  class extends HTMLElement {
    static observedAttributes = ["name", "src"];

    connectedCallback() {
      this.#render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.#render();
    }

    #render() {
      const name = this.getAttribute("name");
      const src = this.getAttribute("src");
      const initials = getInitials(name);

      if (name) this.title = name;

      // The initials stand in only while there is no picture: no src, a src still
      // loading, or one that fails to load (offline, deleted, blocked).
      const initialsHtml = initials ? `<span class="pb-initials">${escapeHtml(initials)}</span>` : "";
      this.innerHTML = initialsHtml;
      if (!src) return;

      const $img = new Image();
      $img.className = "pb-avatar";
      $img.alt = "";
      // a later attribute change may have replaced this image already
      const current = () => this.getAttribute("src") === src;
      $img.addEventListener("load", () => {
        if (current()) this.replaceChildren($img);
      });
      $img.src = src;
    }
  },
);
