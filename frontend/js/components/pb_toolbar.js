import { getPrefix, icon } from "../lib/helpers.js";
import data, { setBranch } from "../api/data.js";
import { pull, push, stashChanges, popStash, createBranch } from "../api/git.js";
import { toast } from "../lib/toast.js";
import { promptModal } from "./pb_modal.js";
import "./pb_view_switcher.js";

const ACTIONS = {
  pull: { label: "Pull", done: "Pulled.", run: (repo) => pull({ repo }) },
  push: { label: "Push", done: "Pushed.", run: (repo) => push({ repo }) },
  branch: {
    label: "New branch",
    done: "Branch created and checked out.",
    run: async (repo) => {
      const name = await promptModal({
        title: "New branch",
        message: "It starts at the commit you are on and is checked out right away.",
        label: "Branch name",
        placeholder: "feature/my-change",
        confirmLabel: "Create branch",
        // a name git refuses (taken, not valid) is shown in the dialog, which stays open
        action: async (name) => {
          const { currentBranch } = await createBranch({ repo, name });
          setBranch(currentBranch ?? name);
        },
      });
      if (name === null) return false; // cancelled
    },
  },
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
  { name: "pull", glyph: "arrow-down", label: ACTIONS.pull.label },
  { name: "push", glyph: "arrow-up", label: ACTIONS.push.label },
  { name: "branch", glyph: "branch", label: "New branch" },
  { name: "stash", glyph: "download-alt", label: ACTIONS.stash.label },
  { name: "pop", glyph: "upload-alt", label: ACTIONS.pop.label },
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
        if ((await action.run(repo)) !== false) toast(action.done);
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
