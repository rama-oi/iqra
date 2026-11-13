import { getPrefix, escapeHtml } from "../_helpers.js";

// A modal "pick one from a list" dialog with a filter box.
//
//   const id = await pickOne({
//     title: "Switch project",
//     items: [{ id, label, description? }] or a Promise of that,
//     current: id,
//   });
//   // id is the chosen item's id, or null when dismissed.
export function pickOne(options) {
  const picker = document.querySelector(getPrefix("picker"));
  if (!picker) throw new Error("<pb-picker> is missing from the page");
  return picker.pick(options);
}

customElements.define(
  getPrefix("picker"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $dialog: undefined,
      $title: undefined,
      $filter: undefined,
      $list: undefined,
      $status: undefined,
    };

    #items = [];
    #current = null;
    #choice = null;
    #resolve = null;
    #requestId = 0;

    #template = `
      <dialog>
        <header>
          <h2></h2>
          <button type="button" class="close pb-danger" aria-label="Close">x</button>
        </header>
        <input type="search" class="filter" placeholder="Filter…" autofocus />
        <p class="status" hidden></p>
        <ul class="list"></ul>
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
        $filter: $(".filter"),
        $list: $(".list"),
        $status: $(".status"),
      };

      const { $dialog, $filter } = this.#html;
      $dialog.addEventListener("click", (e) => this.#onClick(e));
      $dialog.addEventListener("close", () => this.#onClose());
      $filter.addEventListener("input", () => this.#renderList());
      $filter.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const first = this.#visibleItems()[0];
        if (first) this.#select(first.id);
      });
    }

    pick({ title, items, current = null }) {
      const { $dialog, $title, $filter } = this.#html;

      this.#current = current;
      this.#items = [];
      this.#choice = null;
      $title.textContent = title;
      $filter.value = "";
      this.#renderList();
      this.#setStatus("Loading…");

      const requestId = ++this.#requestId;
      Promise.resolve(items).then(
        (list) => {
          if (requestId !== this.#requestId) return;
          this.#items = list;
          this.#setStatus(list.length ? "" : "Nothing to choose from.");
          this.#renderList();
        },
        (err) => {
          if (requestId !== this.#requestId) return;
          console.error(err);
          this.#setStatus("Could not load the list, try again.", true);
        },
      );

      return new Promise((resolve) => {
        this.#resolve = resolve;
        $dialog.showModal();
      });
    }

    #visibleItems() {
      const query = this.#html.$filter.value.trim().toLowerCase();
      if (!query) return this.#items;
      return this.#items.filter((i) =>
        `${i.label} ${i.description ?? ""}`.toLowerCase().includes(query),
      );
    }

    #renderList() {
      this.#html.$list.innerHTML = this.#visibleItems()
        .map((i) => {
          const active = i.id === this.#current;
          return `
          <li>
            <button type="button" class="item${active ? " pb-active" : ""}" data-id="${escapeHtml(i.id)}"${active ? ' aria-current="true"' : ""}>
              <span class="label">${escapeHtml(i.label)}</span>
              ${i.description ? `<span class="description">${escapeHtml(i.description)}</span>` : ""}
            </button>
          </li>`;
        })
        .join("");
    }

    #setStatus(text, isError = false) {
      const { $status } = this.#html;
      $status.textContent = text;
      $status.hidden = !text;
      $status.classList.toggle("pb-error", isError);
    }

    #select(id) {
      this.#choice = id;
      this.#html.$dialog.close();
    }

    #onClick(e) {
      const dialog = this.#html.$dialog;
      if (e.target === dialog) return dialog.close(); // backdrop

      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.classList.contains("close")) return dialog.close();
      if (btn.dataset.id !== undefined) this.#select(btn.dataset.id);
    }

    #onClose() {
      this.#requestId++; // ignore a list that is still loading
      const resolve = this.#resolve;
      this.#resolve = null;
      resolve?.(this.#choice);
    }
  },
);
