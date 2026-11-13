function fakeHash(id) {
  let h = 0x811c9dc5;
  let out = "";
  for (let round = 0; out.length < 40; round++) {
    for (const ch of id + round) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
}

const AUTHORS = {
  fikret: { name: "Fikret", email: "fikret@example.com", avatarUrl: null },
  aisha: { name: "Aisha Karim", email: "aisha@example.com", avatarUrl: null },
  omar: { name: "Omar Haddad", email: "omar@example.com", avatarUrl: "https://github.com/octocat.png" },
};

const branch = (name, isHead = false) => ({ name, type: "branch", isHead });
const remote = (name) => ({ name, type: "remote", isHead: false });
const tag = (name) => ({ name, type: "tag", isHead: false });

const TABLE = [
  ["a", ["b"], "Render commit graph rows as inline SVG", "fikret", [branch("v10", true), remote("origin/v10")]],
  ["f1", ["f2"], "Collapse sidebars on narrow screens", "aisha", [branch("feature/sidebar")]],
  ["b", ["c"], "Add workarea tree table", "fikret", []],
  ["f2", ["f3"], "Persist sidebar width", "aisha", []],
  ["c", ["d", "g1"], "Merge branch 'feature/theme' into v10", "fikret", []],
  ["h1", ["h2"], "Guard against missing avatar url", "omar", [branch("fix/avatar-crash")]],
  ["g1", ["g2"], "Add catppuccin latte palette", "omar", [branch("feature/theme"), remote("origin/feature/theme")]],
  ["d", ["e", "f3"], "Merge branch 'feature/sidebar' into v10", "fikret", []],
  ["f3", ["e"], "Add left sidebar skeleton", "aisha", []],
  ["g2", ["i"], "Extract theme tokens into css variables", "omar", []],
  ["h2", ["e"], "Render avatar as img", "omar", []],
  ["e", ["e2"], "Add toolbar and view switcher", "fikret", []],
  ["e2", ["i"], "Add tabbar component", "fikret", []],
  ["i", ["j"], "Define grid structure", "fikret", [tag("v0.1.0")]],
  ["j", ["j2"], "Define web components", "fikret", []],
  ["j2", ["k"], "Add css reset", "fikret", []],
  ["k", [], "Start boilerplate", "fikret", []],
];

const NEWEST = Date.parse("2026-11-12T18:30:00Z");
const HOUR = 3_600_000;

export const MOCK_COMMITS_RESPONSE = {
  repository: "fikret",
  currentBranch: "v10",
  commits: TABLE.map(([id, parents, message, author, refs], i) => {
    const hash = fakeHash(id);
    return {
      hash,
      shortHash: hash.slice(0, 7),
      parents: parents.map(fakeHash),
      author: AUTHORS[author],
      committedAt: new Date(NEWEST - i * 5 * HOUR - (i % 3) * 17 * 60_000).toISOString(),
      message,
      refs,
    };
  }),
  // Pagination: pass this back as ?cursor= to get the next page, null = end.
  nextCursor: null,
};
