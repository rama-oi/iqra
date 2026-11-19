import { getPrefix, escapeHtml } from "../lib/helpers.js";
import data from "../api/data.js";
import { fetchBranches } from "../api/projects.js";
import { spiralCell, route } from "../graph/merge-grid.js";

const CELL_W = 220; // distance between branch centres, sideways
const CELL_H = 110; // ...and up and down
const NODE_W = 160;
const NODE_H = 38;
const MAX_LABEL = 20;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const READABLE = 0.7;
const SVG_NS = "http://www.w3.org/2000/svg";

// Long names lose their middle: the end ("-number-7") is what tells branches apart.
const shorten = (name) =>
  name.length > MAX_LABEL
    ? `${name.slice(0, 9)}…${name.slice(name.length - (MAX_LABEL - 10))}`
    : name;

// The graph of branches: pick the branch to merge, then the one to merge into, and the
// line between them is drawn. It is a map to look at and pan around; nothing is merged here.
customElements.define(
  getPrefix("workarea-merge"),
  class extends HTMLElement {
    #initialized = false;
    #loadId = 0;
    #repo = null;
    #nodes = []; // { name, x, y, current }
    #source = null;
    #target = null;
    #view = { cx: 0, cy: 0, scale: 1 };
    #drag = null;
    // Next time there is room, fit everything on screen but never smaller than this scale:
    // a big project opens readable, around the branch you are on, and "Fit" shows all.
    #fit = READABLE;

    #template = `
      <section class="pb-table-header">
        <div class="pb-backlog-title">
          <span>Merge graph</span>
          <span class="pb-count"></span>
        </div>
        <button type="button" class="pb-merge-center" title="Fit every branch on screen">Fit</button>
        <button type="button" class="pb-merge-clear" title="Forget the selection" disabled>Clear</button>
      </section>
      <p class="pb-merge-status" role="status"></p>
      <div class="pb-merge-canvas">
        <svg class="pb-merge-svg" role="group" aria-label="Branches. Choose the branch to merge, then the branch to merge into.">
          <defs>
            <marker id="pb-merge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="pb-merge-arrowhead"></path>
            </marker>
          </defs>
          <g class="pb-merge-route"></g>
          <g class="pb-merge-nodes"></g>
        </svg>
      </div>
    `;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      this.innerHTML = this.#template;

      const svg = this.querySelector(".pb-merge-svg");
      this.querySelector(".pb-merge-center").addEventListener("click", () => {
        this.#fit = MIN_SCALE;
        this.#applyView();
      });
      this.querySelector(".pb-merge-clear").addEventListener("click", () =>
        this.#select(null),
      );

      svg.addEventListener("click", (e) => {
        if (this.#drag?.moved) return; // the end of a pan, not a choice
        const node = e.target.closest("[data-branch]");
        if (node) this.#choose(node.dataset.branch);
      });
      svg.addEventListener("keydown", (e) => {
        const node = e.target.closest?.("[data-branch]");
        if (node && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          this.#choose(node.dataset.branch);
        } else if (e.key === "Escape") {
          this.#select(null);
        }
      });

      svg.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        this.#drag = { x: e.clientX, y: e.clientY, moved: false };
      });
      svg.addEventListener("pointermove", (e) => {
        const d = this.#drag;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        // captured only once it is a pan: capturing at pointerdown would send the click
        // of a plain choice to the svg instead of the branch
        svg.setPointerCapture(e.pointerId);
        svg.classList.add("pb-panning");
        this.#view.cx -= dx / this.#view.scale;
        this.#view.cy -= dy / this.#view.scale;
        d.x = e.clientX;
        d.y = e.clientY;
        this.#applyView();
      });
      const endDrag = () => {
        svg.classList.remove("pb-panning");
        // the click that ends a pan arrives right after pointerup
        setTimeout(() => (this.#drag = null));
      };
      svg.addEventListener("pointerup", endDrag);
      svg.addEventListener("pointercancel", endDrag);

      svg.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const before = this.#toWorld(e.clientX, e.clientY);
          const factor = Math.exp(-e.deltaY * 0.0015);
          this.#view.scale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, this.#view.scale * factor),
          );
          // keep the point under the cursor where it was
          const after = this.#toWorld(e.clientX, e.clientY);
          this.#view.cx += before.x - after.x;
          this.#view.cy += before.y - after.y;
          this.#applyView();
        },
        { passive: false },
      );

      new ResizeObserver(() => this.#applyView()).observe(svg);

      for (const type of [
        "pb-repository-change",
        "pb-branch-change",
        "pb-history-change",
      ]) {
        document.addEventListener(type, () => this.#load());
      }
      this.#load();
    }

    // ---- data -------------------------------------------------------------------------

    async #load() {
      const loadId = ++this.#loadId;
      if (!data.repository) {
        this.#nodes = [];
        this.#repo = null;
        return this.#render();
      }
      let branches;
      try {
        branches = await fetchBranches(data.repository);
      } catch (err) {
        console.error(err);
        branches = [];
      }
      if (loadId !== this.#loadId) return;

      if (this.#repo !== data.repository) {
        this.#repo = data.repository;
        this.#source = this.#target = null;
        this.#fit = READABLE;
      }

      // The branch you are on takes the middle, then the default branch, then the rest
      // A to Z: the same branch always lands on the same cell.
      const names = branches.filter((b) => !b.isDetached);
      const rank = (b) => (b.name === data.branch ? 0 : b.isDefault ? 1 : 2);
      names.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      this.#nodes = names.map((b, i) => ({
        name: b.name,
        current: b.name === data.branch,
        ...spiralCell(i),
      }));
      const has = (n) => this.#nodes.some((x) => x.name === n);
      if (!has(this.#source)) this.#source = null;
      if (!has(this.#target)) this.#target = null;
      this.#render();
    }

    // ---- choosing ---------------------------------------------------------------------

    #choose(name) {
      if (name === this.#source && !this.#target) return this.#select(null);
      if (!this.#source || this.#target) {
        // a first choice, or a fresh start after a finished pair
        this.#source = name;
        this.#target = null;
      } else if (name !== this.#source) {
        this.#target = name;
      }
      this.#render();
    }

    #select(name) {
      this.#source = name;
      this.#target = null;
      this.#render();
    }

    // ---- drawing ----------------------------------------------------------------------

    #toWorld(clientX, clientY) {
      const svg = this.querySelector(".pb-merge-svg");
      const r = svg.getBoundingClientRect();
      const { cx, cy, scale } = this.#view;
      return {
        x: cx + (clientX - r.left - r.width / 2) / scale,
        y: cy + (clientY - r.top - r.height / 2) / scale,
      };
    }

    #applyView() {
      const svg = this.querySelector(".pb-merge-svg");
      const { clientWidth: w, clientHeight: h } = svg;
      if (!w || !h) return;
      if (this.#fit > 0 && this.#nodes.length) {
        const xs = this.#nodes.map((n) => n.x * CELL_W);
        const ys = this.#nodes.map((n) => n.y * CELL_H);
        const x0 = Math.min(...xs) - NODE_W / 2 - 40;
        const x1 = Math.max(...xs) + NODE_W / 2 + 40;
        const y0 = Math.min(...ys) - NODE_H / 2 - 40;
        const y1 = Math.max(...ys) + NODE_H / 2 + 40;
        const fits = Math.min(w / (x1 - x0), h / (y1 - y0));
        const scale = Math.min(1, Math.max(this.#fit, fits));
        // when it does not all fit, stay on the middle (the branch you are on)
        const whole = fits >= scale;
        this.#view = {
          cx: whole ? (x0 + x1) / 2 : 0,
          cy: whole ? (y0 + y1) / 2 : 0,
          scale,
        };
        this.#fit = 0;
      }
      const { cx, cy, scale } = this.#view;
      const vw = w / scale;
      const vh = h / scale;
      svg.setAttribute("viewBox", `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
    }

    #render() {
      const nodes = this.#nodes;
      const $status = this.querySelector(".pb-merge-status");
      this.querySelector(".pb-count").textContent = nodes.length
        ? `${nodes.length} branch${nodes.length === 1 ? "" : "es"}`
        : "";
      this.querySelector(".pb-merge-clear").disabled = !this.#source;

      const src = this.#source;
      const dst = this.#target;
      $status.textContent = !nodes.length
        ? "No branches to show."
        : nodes.length === 1
          ? "This project has a single branch, so there is nothing to merge."
          : !src
            ? "Choose the branch to merge."
            : !dst
              ? `Merging ${src}: now choose the branch to merge into.`
              : `${src} into ${dst}`;

      this.querySelector(".pb-merge-nodes").innerHTML = nodes
        .map((n) => {
          const role = n.name === src ? "from" : n.name === dst ? "into" : "";
          const cls = ["pb-merge-node", role && `pb-${role}`, n.current && "pb-current"]
            .filter(Boolean)
            .join(" ");
          const px = n.x * CELL_W;
          const py = n.y * CELL_H;
          return `<g class="${cls}" data-branch="${escapeHtml(n.name)}" transform="translate(${px} ${py})" tabindex="0" role="button" aria-pressed="${role !== ""}" aria-label="${escapeHtml(n.name)}${role ? `, ${role === "from" ? "branch to merge" : "merge target"}` : ""}">
            <title>${escapeHtml(n.name)}${n.current ? " (checked out)" : ""}</title>
            <rect x="${-NODE_W / 2}" y="${-NODE_H / 2}" width="${NODE_W}" height="${NODE_H}" rx="8"></rect>
            ${n.current ? `<circle cx="${-NODE_W / 2 + 14}" cy="0" r="4" class="pb-merge-dot"></circle>` : ""}
            <text x="${n.current ? 6 : 0}" y="0" text-anchor="middle" dominant-baseline="central">${escapeHtml(shorten(n.name))}</text>
            ${role ? `<text class="pb-merge-role" x="0" y="${-NODE_H / 2 - 7}" text-anchor="middle">${role}</text>` : ""}
          </g>`;
        })
        .join("");

      this.#drawRoute();
      this.#applyView();
    }

    #drawRoute() {
      const $route = this.querySelector(".pb-merge-route");
      $route.innerHTML = "";
      const a = this.#nodes.find((n) => n.name === this.#source);
      const b = this.#nodes.find((n) => n.name === this.#target);
      if (!a || !b) return;
      const points = route(this.#nodes, a, b);
      if (!points) return;

      // The grid used for routing is twice as fine as the cells. The line starts under the
      // first branch's box and stops just short of the last one, so its arrow shows.
      const px = points.map((p) => ({ x: (p.x * CELL_W) / 2, y: (p.y * CELL_H) / 2 }));
      const last = px.at(-1);
      const before = px.at(-2);
      const horizontal = before.y === last.y;
      const back = (horizontal ? NODE_W : NODE_H) / 2 + 4;
      const len = Math.abs(horizontal ? last.x - before.x : last.y - before.y);
      const k = (len - back) / len;
      px[px.length - 1] = {
        x: before.x + (last.x - before.x) * k,
        y: before.y + (last.y - before.y) * k,
      };
      const d = px.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "pb-merge-line");
      path.setAttribute("marker-end", "url(#pb-merge-arrow)");
      $route.append(path);
    }
  },
);
