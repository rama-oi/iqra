// The merge graph's geometry, kept apart from the DOM so it can be tested on its own.
//
// Branches sit on a square spiral that grows from the middle:
//
//   [4 3 2]
//   [5 0 1]
//   [6 7 8]   ...and on, ring after ring, counter-clockwise.
//
// A line between two branches runs along the gaps between the cells, so it never crosses
// another branch.

// Column and row (y grows downwards) of the i-th cell of the spiral.
export function spiralCell(i) {
  if (i === 0) return { x: 0, y: 0 };
  let k = 1;
  while ((2 * k + 1) ** 2 <= i) k++;
  const n = i - (2 * k - 1) ** 2; // 0 .. 8k-1 within ring k, which starts at (k, k-1)
  if (n < 2 * k) return { x: k, y: k - 1 - n }; // up the right side
  if (n < 4 * k) return { x: k - 1 - (n - 2 * k), y: -k }; // left along the top
  if (n < 6 * k) return { x: -k, y: -k + 1 + (n - 4 * k) }; // down the left side
  return { x: -k + 1 + (n - 6 * k), y: k }; // right along the bottom
}

const DIRS = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];

// Smallest binary heap of [cost, value] pairs; the search below needs nothing more.
class Heap {
  #a = [];
  get size() {
    return this.#a.length;
  }
  push(item) {
    const a = this.#a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.#a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Cheapest orthogonal route from cell `from` to cell `to` that stays out of every other
 * cell in `cells` (an array of {x, y}). Works on a grid twice as fine as the cells:
 * cell centres are the even points and the gaps between cells the odd ones. Corners cost
 * extra so the line is straight where it can be. Returns the corner points in that fine
 * grid (multiply by half a cell to get pixels), or null if there is no way.
 */
export function route(cells, from, to) {
  const key = (x, y) => `${x},${y}`;
  const taken = new Set(cells.map((c) => key(c.x, c.y)));
  taken.delete(key(from.x, from.y));
  taken.delete(key(to.x, to.y));

  // room to go around the outside
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = 2 * (Math.min(...xs) - 1);
  const x1 = 2 * (Math.max(...xs) + 1);
  const y0 = 2 * (Math.min(...ys) - 1);
  const y1 = 2 * (Math.max(...ys) + 1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;

  const blocked = (x, y) => x % 2 === 0 && y % 2 === 0 && taken.has(key(x / 2, y / 2));
  const id = (x, y, d) => ((y - y0) * w + (x - x0)) * 4 + d;

  const start = { x: from.x * 2, y: from.y * 2 };
  const goal = { x: to.x * 2, y: to.y * 2 };
  const cost = new Map();
  const prev = new Map();
  const heap = new Heap();
  for (let d = 0; d < 4; d++) {
    cost.set(id(start.x, start.y, d), 0);
    heap.push([0, { ...start, d }]);
  }

  const TURN = 4;
  while (heap.size) {
    const [c, p] = heap.pop();
    if (c > (cost.get(id(p.x, p.y, p.d)) ?? Infinity)) continue;
    if (p.x === goal.x && p.y === goal.y) {
      const pts = [];
      for (let k = id(p.x, p.y, p.d); k !== undefined; k = prev.get(k)) {
        const cell = Math.floor(k / 4);
        pts.push({ x: (cell % w) + x0, y: Math.floor(cell / w) + y0 });
      }
      pts.reverse();
      return pts.filter((q, i) => {
        const a = pts[i - 1];
        const b = pts[i + 1];
        return !(a && b && ((a.x === q.x && q.x === b.x) || (a.y === q.y && q.y === b.y)));
      });
    }
    for (let d = 0; d < 4; d++) {
      const nx = p.x + DIRS[d][0];
      const ny = p.y + DIRS[d][1];
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || blocked(nx, ny)) continue;
      const next = c + 1 + (d !== p.d && !(p.x === start.x && p.y === start.y && c === 0) ? TURN : 0);
      const nid = id(nx, ny, d);
      if (next < (cost.get(nid) ?? Infinity)) {
        cost.set(nid, next);
        prev.set(nid, id(p.x, p.y, p.d));
        heap.push([next, { x: nx, y: ny, d }]);
      }
    }
  }
  return null;
}
