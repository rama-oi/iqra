import { getPrefix, escapeHtml } from "../_helpers.js";

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

      this.innerHTML = `
        ${initials ? `<span class="pb-initials">${escapeHtml(initials)}</span>` : ""}
        ${src ? `<img class="avatar" alt="" src="${escapeHtml(src)}" />` : ""}
      `;

      this.querySelector("img")?.addEventListener("error", (e) => e.target.remove());
    }
  },
);
