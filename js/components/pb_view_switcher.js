import { getPrefix } from "../_helpers.js";
import data from "../data.js";

customElements.define(
  getPrefix("view-switcher"),
  class extends HTMLElement {
    #initialized = false;

    #html = {
      $area: undefined,
      $repository: undefined,
      $branch: undefined,
    };

    #template = `
      <button type="button" class="area"></button>
      <span class="arrow-path"></span>
      <button type="button" class="repository"></button>
      <span class="arrow-path"></span>
      <button type="button" class="branch"></button>
    `;

    connectedCallback() {
      if (!this.#initialized) {
        this.#initialized = true;

        this.innerHTML = this.#template;

        this.#html.$area = this.querySelector(".area");
        this.#html.$repository = this.querySelector(".repository");
        this.#html.$branch = this.querySelector(".branch");

        this.#html.$area.innerText = data.area;
        this.#html.$repository.innerText = data.repository;
        this.#html.$branch.innerText = data.branch;
      }
    }
  },
);
