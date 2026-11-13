import { getPrefix, escapeHtml } from "../_helpers.js";
import AREAS from "../objects/areas.js";
import data, { openProject, setArea, setBranch, setFilter } from "../data.js";
import { fetchBranches, fetchProjects } from "../api/projects.js";
import { pickOne } from "./pb_picker.js";

customElements.define(
  getPrefix("view-switcher"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $area: undefined,
      $areaMenu: undefined,
      $repository: undefined,
      $branch: undefined,
      $search: undefined,
    };

    #template = `
      <button type="button" class="area" popovertarget="pb-area-menu" aria-haspopup="menu"></button>
      <ul id="pb-area-menu" class="area-menu" popover role="menu"></ul>
      <span class="arrow-path"></span>
      <button type="button" class="repository" title="Switch project"></button>
      <span class="arrow-path"></span>
      <button type="button" class="branch" title="Switch branch"></button>
      <span class="arrow-path"></span>
      <input type="search" class="search" />
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;

      this.innerHTML = this.#template;

      this.#html.$area = this.querySelector(".area");
      this.#html.$areaMenu = this.querySelector(".area-menu");
      this.#html.$repository = this.querySelector(".repository");
      this.#html.$branch = this.querySelector(".branch");
      this.#html.$search = this.querySelector(".search");

      const { $area, $areaMenu, $repository, $branch, $search } = this.#html;

      // Open the menu right under the button that opened it.
      $areaMenu.addEventListener("beforetoggle", (e) => {
        if (e.newState !== "open") return;
        const rect = $area.getBoundingClientRect();
        $areaMenu.style.top = `${rect.bottom}px`;
        $areaMenu.style.left = `${rect.left}px`;
      });
      $areaMenu.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-area]");
        if (!btn) return;
        $areaMenu.hidePopover();
        setArea(btn.dataset.area);
      });
      $repository.addEventListener("click", () => this.#chooseRepository());
      $branch.addEventListener("click", () => this.#chooseBranch());
      $search.addEventListener("input", () => setFilter($search.value));
      document.addEventListener("pb-filter-change", () => this.#render());

      for (const type of ["pb-area-change", "pb-repository-change", "pb-branch-change"]) {
        document.addEventListener(type, () => this.#render());
      }
      this.#render();
    }

    #render() {
      const { $area, $areaMenu, $repository, $branch, $search } = this.#html;

      $area.textContent = AREAS[data.area];
      $repository.textContent = data.repository ?? "No project";
      $branch.textContent = data.branch ?? "-";
      $branch.disabled = !data.repository;

      if ($search.value !== data.filter) $search.value = data.filter;

      $areaMenu.innerHTML = Object.entries(AREAS)
        .map(
          ([key, label]) => `
          <li role="none">
            <button type="button" role="menuitemradio" data-area="${escapeHtml(key)}" aria-checked="${key === data.area}"${key === data.area ? ' class="pb-active"' : ""}>${escapeHtml(label)}</button>
          </li>`,
        )
        .join("");
    }

    async #chooseRepository() {
      const projects = fetchProjects();
      const name = await pickOne({
        title: "Switch project",
        current: data.repository,
        items: projects.then((list) =>
          list.map((p) => ({ id: p.name, label: p.name, description: p.description })),
        ),
      });
      if (name === null) return;

      const project = (await projects).find((p) => p.name === name);
      if (project) openProject(project);
    }

    async #chooseBranch() {
      if (!data.repository) return;
      const branch = await pickOne({
        title: `Switch branch · ${data.repository}`,
        current: data.branch,
        items: fetchBranches(data.repository).then((list) =>
          list.map((b) => ({
            id: b.name,
            label: b.name,
            description: b.isDefault ? "default" : "",
          })),
        ),
      });
      if (branch !== null) setBranch(branch);
    }
  },
);
