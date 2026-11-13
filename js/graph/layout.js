export const PALETTE_SIZE = 8;

export function layoutGraph(commits) {
  const lanes = [];
  const colors = [];
  let cycle = 0;
  let laneCount = 1;

  const pickColor = () => {
    const used = new Set(colors.filter((c) => c !== undefined));
    for (let i = 0; i < PALETTE_SIZE; i++) if (!used.has(i)) return i;
    return cycle++ % PALETTE_SIZE;
  };

  const rows = commits.map((commit) => {
    const incoming = [];
    lanes.forEach((hash, i) => hash === commit.hash && incoming.push(i));

    let lane;
    if (incoming.length) {
      lane = incoming[0];
    } else {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = null;
      colors[lane] = pickColor();
    }
    const nodeColor = colors[lane];

    const through = [];
    lanes.forEach((hash, i) => {
      if (hash !== null && !incoming.includes(i))
        through.push({ lane: i, color: colors[i] });
    });
    const ins = incoming.map((i) => ({ lane: i, color: colors[i] }));

    for (const i of incoming) lanes[i] = null;

    const outs = [];
    const reserved = new Set([...incoming, lane]);
    commit.parents.forEach((parent, k) => {
      if (k === 0) {
        lanes[lane] = parent;
        colors[lane] = nodeColor;
        outs.push({ lane, color: nodeColor });
        return;
      }
      let target = lanes.indexOf(parent);
      if (target === -1) {
        target = lanes.findIndex((h, i) => h === null && !reserved.has(i));
        if (target === -1) target = lanes.length;
        lanes[target] = parent;
        colors[target] = pickColor();
      }
      outs.push({ lane: target, color: colors[target] });
    });

    for (const i of incoming) if (lanes[i] === null) colors[i] = undefined;
    if (!commit.parents.length) colors[lane] = undefined;

    const touched = [lane, ...through, ...ins, ...outs].map((x) =>
      typeof x === "number" ? x : x.lane,
    );
    laneCount = Math.max(laneCount, ...touched.map((n) => n + 1));

    return {
      commit,
      lane,
      color: nodeColor,
      isMerge: commit.parents.length > 1,
      hasRefs: commit.refs.length > 0,
      through,
      ins,
      outs,
    };
  });

  return { rows, laneCount };
}
