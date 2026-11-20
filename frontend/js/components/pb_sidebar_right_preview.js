import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import data, {
  setBranch,
  setCommit,
  setFile,
  isSelectedFile,
} from "../api/data.js";
import { checkout } from "../api/commits.js";
import { cherryPick } from "../api/git.js";
import { toast } from "../lib/toast.js";
import { confirmModal } from "./pb_modal.js";

function splitMessage(message) {
  const [subject, ...rest] = String(message ?? "").split("\n");
  return { subject, body: rest.join("\n").trim() };
}

function formatWhen(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${time} @ ${date}`;
}

customElements.define(
  getPrefix("sidebar-right-preview"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #template = `
      <div class="pb-wrapper">
        <div class="pb-flex-row">
          <button type="button" class="pb-checkout pb-btn-outline" aria-label="Check out this commit" title="Check out this commit">
            Checkout
          </button>
          <button type="button" class="pb-cherry-pick pb-btn-outline" aria-label="Cherry pick this commit" title="Cherry pick this commit">
            Cherry Pick
          </button>
          <span class="pb-flex-separator"></span>
          <button type="button" class="pb-close" aria-label="Close preview" title="Close (Esc)">
            ${icon("times")}
          </button>
        </div>

        <hr>

        <p class="pb-hash"></p>

        <div class="pb-user">
          <pb-avatar class="pb-large"></pb-avatar>
          <div class="pb-details">
            <p class="pb-name"></p>
            <p><time></time></p>
          </div>
        </div>

        <input type="text" class="pb-subject" />
        <textarea rows="6" class="pb-body"></textarea>

        <button class="pb-commit-btn pb-btn" type="button">update message</button>
        <p class="pb-error" role="alert" hidden></p>
      </div>

      <details class="pb-files" open>
        <summary>Changed Files</summary>
        <ul class="pb-content"></ul>
      </details>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $hash: $(".pb-hash"),
        $checkout: $(".pb-checkout"),
        $cherry: $(".pb-cherry-pick"),
        $update: $(".pb-commit-btn"),
        $error: $(".pb-error"),
        $avatar: $("pb-avatar"),
        $name: $(".pb-name"),
        $time: $("time"),
        $subject: $(".pb-subject"),
        $body: $(".pb-body"),
        $files: $(".pb-files .pb-content"),
      };

      this.querySelector(".pb-close").addEventListener("click", () =>
        setCommit(null),
      );
      this.#html.$checkout.addEventListener("click", () => this.#checkout());
      this.#html.$cherry.addEventListener("click", () => this.#cherryPick());
      document.addEventListener("pb-commit-select", () => this.#render());
      document.addEventListener("pb-file-select", () => this.#markSelected());

      this.#html.$files.addEventListener("click", (e) => {
        const index = e.target.closest("button[data-index]")?.dataset.index;
        const f = data.commit?.files?.[index];
        if (!f) return;
        const file = {
          path: f.path,
          status: f.status,
          commit: data.commit.hash,
        };
        setFile(isSelectedFile(file) ? null : file);
      });
      this.#render();
    }

    #render() {
      const commit = data.commit;
      if (!commit) return;
      const h = this.#html;

      // a stash is shown like a commit, but there is nothing to check out, pick or reword
      for (const el of [h.$checkout, h.$cherry, h.$body, h.$update]) {
        el.hidden = !!commit.isStash;
      }
      h.$subject.readOnly = !!commit.isStash;
      h.$hash.textContent = commit.isStash
        ? `${commit.stashId} · ${commit.shortHash}`
        : commit.hash;
      h.$error.hidden = true;
      const { branch } = this.#checkoutTarget(commit);
      h.$checkout.disabled = commit.refs.some((r) => r.isHead);
      // a merge commit has two sides: which one to take is not something to guess
      const merge = (commit.parents?.length ?? 0) > 1;
      h.$cherry.disabled = merge;
      h.$cherry.title = merge
        ? "Merge commits cannot be cherry picked"
        : `Cherry pick onto ${data.branch}`;
      h.$checkout.title = h.$checkout.disabled
        ? "Already checked out"
        : branch
          ? `Check out ${branch}`
          : "Check out this commit (detached HEAD)";
      h.$avatar.setAttribute("name", commit.author.name);
      h.$avatar.setAttribute("src", commit.author.avatarUrl ?? "");
      h.$name.textContent = commit.author.name;
      h.$time.dateTime = commit.committedAt;
      h.$time.textContent = formatWhen(commit.committedAt);

      const { subject, body } = splitMessage(commit.message);
      h.$subject.value = subject;
      h.$body.value = body;

      const files = commit.files ?? [];
      h.$files.innerHTML = files.length
        ? files
            .map(
              (f, i) => `
            <li><button type="button" class="pb-file" data-index="${i}" title="${escapeHtml(f.path)}">
              <span class="pb-file-status" data-status="${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
              <span class="pb-file-path">${escapeHtml(f.path)}</span>
            </button></li>`,
            )
            .join("")
        : `<li class="pb-empty">No file information.</li>`;
      this.#markSelected();
    }

    async #cherryPick() {
      const commit = data.commit;
      if (!commit || commit.isStash || !data.repository) return;
      const repo = data.repository;
      const picked = await confirmModal({
        title: "Cherry pick",
        message: `Copy the changes of ${commit.shortHash ?? commit.hash.slice(0, 7)} onto ${data.detached ? "the checked-out commit" : data.branch} as a new commit?\n${splitMessage(commit.message).subject}`,
        confirmLabel: "Cherry pick",
        // changed files, conflicts or an empty pick: the dialog stays open and says so
        action: () => cherryPick({ repo, commit: commit.hash }),
      });
      if (!picked) return;
      toast("Cherry picked.");
      document.dispatchEvent(new CustomEvent("pb-history-change"));
    }

    #checkoutTarget(commit) {
      const branch = commit.refs.find(
        (r) => r.type === "branch" && !r.isHead,
      )?.name;
      return branch ? { branch } : { commit: commit.hash };
    }

    async #checkout() {
      const commit = data.commit;
      if (!commit || !data.repository) return;
      const { $checkout, $error } = this.#html;
      const target = this.#checkoutTarget(commit);
      $checkout.disabled = true;
      try {
        await checkout({ repo: data.repository, ...target });
        $error.hidden = true;
      } catch (err) {
        console.error(err);
        $error.textContent = err.message || "Something went wrong, try again.";
        $error.hidden = false;
        $checkout.disabled = false;
        return;
      }

      if (target.branch) setBranch(target.branch);
      else
        setBranch(commit.shortHash ?? commit.hash.slice(0, 7), {
          detached: true,
        });
      setCommit(null);
      document.dispatchEvent(new CustomEvent("pb-history-change"));
    }

    #markSelected() {
      const commit = data.commit;
      for (const btn of this.querySelectorAll("button[data-index]")) {
        const f = commit?.files?.[btn.dataset.index];
        const active =
          !!f &&
          isSelectedFile({
            path: f.path,
            status: f.status,
            commit: commit.hash,
          });
        btn.classList.toggle("pb-active", active);
        btn.setAttribute("aria-pressed", String(active));
      }
    }
  },
);
