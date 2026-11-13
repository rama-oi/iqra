export const LANE_W = 20;
export const ROW_H = 30;
const MID = ROW_H / 2;
const CORNER = 10; // radius of the rounded elbows
const NODE_R = 9; // avatar commit (matches .pb-small = 18px in style.css)
const DOT_R = 4.5; // merge commit
const BLEED = 1; // lines overshoot the row by 1px so neighbouring SVGs never leave a hairline seam

const x = (lane) => lane * LANE_W + LANE_W / 2;

function pathIn(from, to) {
  if (from === to) return `M${x(from)} ${-BLEED}V${MID}`;
  const s = Math.sign(x(to) - x(from));
  return `M${x(from)} ${-BLEED}V${MID - CORNER}Q${x(from)} ${MID} ${x(from) + s * CORNER} ${MID}H${x(to)}`;
}

function pathOut(from, to) {
  if (from === to) return `M${x(from)} ${MID}V${ROW_H + BLEED}`;
  const s = Math.sign(x(to) - x(from));
  return `M${x(from)} ${MID}H${x(to) - s * CORNER}Q${x(to)} ${MID} ${x(to)} ${MID + CORNER}V${ROW_H + BLEED}`;
}

const laneGroup = (color, d) => `<g class="pb-lane-${color}"><path d="${d}"/></g>`;

export function renderGraphRow(row, laneCount) {
  const { lane, color, isMerge, hasRefs } = row;
  const width = laneCount * LANE_W;
  const cx = x(lane);
  const parts = [];

  for (const l of row.through) parts.push(laneGroup(l.color, `M${x(l.lane)} ${-BLEED}V${ROW_H + BLEED}`));
  for (const l of row.ins) parts.push(laneGroup(l.color, pathIn(l.lane, lane)));
  for (const l of row.outs) parts.push(laneGroup(l.color, pathOut(lane, l.lane)));

  if (hasRefs) parts.push(laneGroup(color, `M${-BLEED} ${MID}H${cx}`));

  if (isMerge) {
    parts.push(`<g class="pb-lane-${color}"><circle class="pb-node-merge" cx="${cx}" cy="${MID}" r="${DOT_R}"/></g>`);
  }

  return `<svg class="pb-graph" width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}" aria-hidden="true">${parts.join("")}</svg>`;
}

export function avatarStyle(lane) {
  return `left:${x(lane) - NODE_R}px;top:${MID - NODE_R}px`;
}
