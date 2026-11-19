import { getPrefix, icon } from "../lib/helpers.js";
import data from "../api/data.js";
import { pull, push, stashChanges, popStash } from "../api/git.js";
import { toast } from "../lib/toast.js";
import "./pb_view_switcher.js";

const ACTIONS = {
  pull: { label: "Pull", done: "Pulled.", run: (repo) => pull({ repo }) },
  push: { label: "Push", done: "Pushed.", run: (repo) => push({ repo }) },
  stash: {
    label: "Stash changes",
    done: "Changes stashed.",
    run: (repo) =>
      stashChanges({ repo, branch: data.detached ? null : data.branch }),
  },
  pop: {
    label: "Pop the latest stash",
    done: "Stash applied.",
    run: (repo) => popStash({ repo }),
  },
};

const BUTTONS = [
  { name: "restore", glyph: "arrow-left", label: "Undo" },
  { name: "redo", glyph: "arrow-right", label: "Redo" },
  { name: "pull", glyph: "arrow-down", label: ACTIONS.pull.label },
  { name: "push", glyph: "arrow-up", label: ACTIONS.push.label },
  { name: "branch", glyph: "branch", label: "New branch" },
  { name: "stash", glyph: "download-alt", label: ACTIONS.stash.label },
  { name: "pop", glyph: "upload-alt", label: ACTIONS.pop.label },
  { name: "terminal", glyph: "code", label: "Terminal" },
];

customElements.define(
  getPrefix("toolbar"),
  class extends HTMLElement {
    #initialized = false;
    #busy = false;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;

      const buttons = BUTTONS.map(({ name, glyph, label }) => {
        const wired = name in ACTIONS;
        return `<button type="button" class="pb-${name}"${wired ? ` data-action="${name}"` : " disabled"}
          aria-label="${label}" title="${wired ? label : `${label} (not available yet)`}">${icon(glyph)}</button>`;
      });
      this.innerHTML = `<pb-view-switcher></pb-view-switcher>${buttons.join("")}`;

      this.addEventListener("click", (e) => {
        const name = e.target.closest("button[data-action]")?.dataset.action;
        if (name) this.#run(name);
      });
      document.addEventListener("pb-repository-change", () => this.#sync());
      this.#sync();
    }

    #sync() {
      for (const $btn of this.querySelectorAll("button[data-action]")) {
        $btn.disabled = this.#busy || !data.repository;
      }
    }

    async #run(name) {
      const repo = data.repository;
      if (!repo || this.#busy) return;
      const action = ACTIONS[name];
      this.#busy = true;
      this.#sync();
      this.setAttribute("aria-busy", "true");
      try {
        await action.run(repo);
        toast(action.done);
      } catch (err) {
        console.error(err);
        toast(err.message || "Something went wrong, try again.", {
          error: true,
        });
      } finally {
        this.#busy = false;
        this.removeAttribute("aria-busy");
        this.#sync();

        if (repo === data.repository)
          document.dispatchEvent(new CustomEvent("pb-history-change"));
      }
    }
  },
);
