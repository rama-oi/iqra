import { getPrefix } from "../lib/helpers.js";
import { fetchProjects } from "../api/projects.js";
import { openProject } from "../api/data.js";
import { pickOne } from "./pb_picker.js";

// Shown instead of every view while no project is open.
customElements.define(
  getPrefix("workarea-empty"),
  class extends HTMLElement {
    #initialized = false;

    #template = `
      <p>No project open</p>
      <button type="button" class="pb-btn pb-switch" hidden>open a saved project</button>
      <button type="button" class="pb-btn pb-open-clone">clone or open a repository</button>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      this.querySelector(".pb-open-clone").addEventListener("click", () =>
        document.dispatchEvent(new CustomEvent("pb-open-clone")),
      );

      // Projects the server remembers, which stay when the browser forgets its tabs.
      const $switch = this.querySelector(".pb-switch");
      $switch.addEventListener("click", () => this.#chooseSaved());
      fetchProjects()
        .then((list) => ($switch.hidden = list.length === 0))
        .catch(() => {});
      document.addEventListener("pb-repository-change", () => {
        fetchProjects()
          .then((list) => ($switch.hidden = list.length === 0))
          .catch(() => {});
      });
    }

    async #chooseSaved() {
      const projects = fetchProjects();
      const name = await pickOne({
        title: "Open a saved project",
        items: projects.then((list) =>
          list.map((p) => ({ id: p.name, label: p.name, description: p.description })),
        ),
      });
      if (name === null) return;
      const project = (await projects).find((p) => p.name === name);
      if (project) openProject(project);
    }
  },
);
