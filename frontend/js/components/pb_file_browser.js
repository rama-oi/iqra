import { getPrefix, escapeHtml, icon } from "../lib/helpers.js";
import { fetchFolders } from "../api/fs.js";
import { load, save } from "../store/storage.js";

// Where the dialog opens when it is not told where to start: the last folder chosen,
// or for a git repository its parent, so the repositories next to it are in view.
const LAST_KEY = "lastFolder";
const isPath = (v) => typeof v === "string" && v.startsWith("/");

// A modal "choose a folder" dialog that browses the machine running the backend.
//
//   const path = await browseFolder({ title: "Open a repository", start: "/home/me" });
//   // path is the chosen folder, or null when dismissed.
//
// Clicking a folder goes into it; "Choose this folder" picks the one being shown.
// With no `start` it opens where the last choice was made (like a file manager).
// Folders that are git repositories carry a badge.
export function browseFolder(options) {
  const browser = document.querySelector(getPrefix("file-browser"));
  if (!browser) throw new Error("<pb-file-browser> is missing from the page");
  return browser.browse(options);
}

customElements.define(
  getPrefix("file-browser"),
  class extends HTMLElement {
    #initialized = false;

    #html = {};

    #listing = null;
    #hidden = false;
    #resolve = null;
    #requestId = 0;

    #template = `
      <dialog>
        <header>
          <h2></h2>
          <button type="button" class="pb-close pb-danger" aria-label="Close">
            ${icon("times")}
          </button>
        </header>
        <div class="pb-bar">
          <code class="pb-path"></code>
        </div>
        <p class="pb-status" hidden></p>
        <ul class="pb-list"></ul>
        <footer>
          <label class="pb-hidden-toggle"><input type="checkbox" /> <span>Hidden folders</span></label>
          <span class="pb-flex-separator"></span>
          <button type="button" class="pb-choose pb-btn">Choose this folder</button>
        </footer>
      </dialog>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const $ = (sel) => this.querySelector(sel);
      this.#html = {
        $dialog: $("dialog"),
        $title: $("h2"),
        $path: $(".pb-path"),
        $status: $(".pb-status"),
        $list: $(".pb-list"),
        $choose: $(".pb-choose"),
        $hidden: $('input[type="checkbox"]'),
      };

      const { $dialog, $hidden } = this.#html;
      $dialog.addEventListener("click", (e) => this.#onClick(e));
      $dialog.addEventListener("close", () => this.#finish(null));
      $hidden.addEventListener("change", () => {
        this.#hidden = $hidden.checked;
        this.#go(this.#listing?.path);
      });
    }

    browse({ title = "Choose a folder", start = "" } = {}) {
      const { $dialog, $title, $hidden } = this.#html;
      // A second call while open answers the first with "nothing chosen".
      this.#finish(null);

      $title.textContent = title;
      this.#listing = null;
      this.#hidden = false;
      $hidden.checked = false;
      this.#render();

      return new Promise((resolve) => {
        this.#resolve = resolve;
        if (!$dialog.open) $dialog.showModal();
        // An unreadable start (typo, deleted folder, an old memory) falls back to home.
        this.#go(start || load(LAST_KEY, "", isPath), { fallbackHome: true });
      });
    }

    async #go(path, { fallbackHome = false } = {}) {
      const requestId = ++this.#requestId;
      this.#setStatus("Loading…");
      try {
        let listing;
        try {
          listing = await fetchFolders({ path, hidden: this.#hidden });
        } catch (err) {
          if (!fallbackHome || !path) throw err;
          listing = await fetchFolders({ hidden: this.#hidden });
        }
        if (requestId !== this.#requestId) return;
        this.#listing = listing;
        this.#setStatus(listing.folders.length ? "" : "No folders in here.");
        if (listing.truncated) this.#setStatus("Only the first folders are shown.");
      } catch (err) {
        if (requestId !== this.#requestId) return;
        console.error(err);
        this.#setStatus(err.message || "Could not read the folder.", true);
      }
      this.#render();
    }

    #render() {
      const { $path, $list, $choose } = this.#html;
      const l = this.#listing;
      // <bdo dir="ltr"> keeps the slashes in place inside the right-to-left box, which
      // is only there so a long path scrolls to show its end.
      $path.innerHTML = l ? `<bdo dir="ltr">${escapeHtml(l.path)}</bdo>` : "";
      $path.title = l?.path ?? "";
      $choose.disabled = !l;
      // ".." goes to the parent folder, as in a terminal listing.
      const parent = l?.parent
        ? `
          <li>
            <button type="button" class="pb-item pb-parent" data-path="${escapeHtml(l.parent)}" title="Parent folder">
              <span class="pb-label">${icon("folder-open")} ..</span>
            </button>
          </li>`
        : "";
      $list.innerHTML =
        parent +
        (l?.folders ?? [])
          .map(
            (f) => `
          <li>
            <button type="button" class="pb-item" data-path="${escapeHtml(f.path)}">
              <span class="pb-label">${icon("folder-open")} ${escapeHtml(f.name)}</span>
              ${f.isRepo ? `<span class="pb-badge">git</span>` : ""}
            </button>
          </li>`,
          )
          .join("");
      $list.scrollTop = 0;
    }

    #setStatus(text, isError = false) {
      const { $status } = this.#html;
      $status.textContent = text;
      $status.hidden = !text;
      $status.classList.toggle("pb-error", isError);
    }

    #onClick(e) {
      const { $dialog, $choose } = this.#html;
      if (e.target === $dialog) return $dialog.close();
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.classList.contains("pb-close")) return $dialog.close();
      if (btn === $choose) return this.#choose();
      if (btn.dataset.path) this.#go(btn.dataset.path);
    }

    #choose() {
      const listing = this.#listing;
      const path = listing?.path;
      if (!path) return;
      save(LAST_KEY, listing.isRepo && listing.parent ? listing.parent : path);
      this.#finish(path);
      this.#html.$dialog.close();
    }

    // Answers the pending browse() exactly once.
    #finish(path) {
      const resolve = this.#resolve;
      this.#resolve = null;
      resolve?.(path);
    }
  },
);
