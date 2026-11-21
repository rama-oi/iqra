import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, { setSubmodule } from "../api/data.js";
import { updateSubmodule } from "../api/projects.js";
import { toast } from "../lib/toast.js";
import { confirmModal } from "./pb_modal.js";

customElements.define(
  getPrefix("sidebar-right-submodule"),
  class extends HTMLElement {
    #initialized = false;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = `
        <div class="pb-wrapper">
          <div class="pb-flex-row">
            <button type="button" class="pb-update pb-btn-outline"></button>
            <span class="pb-flex-separator"></span>
            <button type="button" class="pb-close" aria-label="Close" title="Close (Esc)">${icon("times")}</button>
          </div>
          <hr>
          <p class="pb-sub-path"></p>
          <dl class="pb-sub-details"></dl>
          <p class="pb-hint pb-sub-note"></p>
        </div>`;
      this.querySelector(".pb-close").addEventListener("click", () =>
        setSubmodule(null),
      );
      this.querySelector(".pb-update").addEventListener("click", () =>
        this.#update(),
      );
      document.addEventListener("pb-submodule-select", () => this.#render());
      this.#render();
    }

    #render() {
      const m = data.submodule;
      if (!m) return;
      const $ = (s) => this.querySelector(s);
      $(".pb-sub-path").textContent = m.path;
      const row = (k, v) =>
        v ? `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>` : "";
      $(".pb-sub-details").innerHTML = [
        row("Remote", m.url),
        row("Follows", m.branch ?? "the remote's default branch"),
        row("Recorded", m.recorded),
        row("Checked out", m.initialized ? m.checkedOut : "not cloned"),
      ].join("");
      const btn = $(".pb-update");
      btn.textContent = m.initialized
        ? "Update to latest commit"
        : "Clone and update";
      btn.title = "Fetch the remote and check out its newest commit";
      $(".pb-sub-note").textContent =
        m.initialized && m.recorded && m.checkedOut && m.recorded !== m.checkedOut
          ? "The checked-out commit differs from the one this project records. Stage the submodule to record it."
          : "";
    }

    async #update() {
      const m = data.submodule;
      const repo = data.repository;
      if (!m || !repo) return;
      let list;
      const done = await confirmModal({
        title: m.initialized ? "Update submodule" : "Clone submodule",
        message: `Fetch ${m.path} and check out the newest commit of ${m.branch ?? "its default branch"}? The project will then show it as a changed file.`,
        confirmLabel: "Update",
        action: async () => {
          list = await updateSubmodule(repo, m.path);
        },
      });
      if (!done) return;
      const fresh = list.find((s) => s.path === m.path);
      if (fresh) setSubmodule(fresh);
      toast("Submodule updated.");
      document.dispatchEvent(new CustomEvent("pb-changes-change"));
      document.dispatchEvent(new CustomEvent("pb-history-change"));
    }
  },
);
