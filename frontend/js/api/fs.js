// The folders of the machine running the backend, for the folder picker. A browser
// cannot read a folder's path, so the backend lists them.
//
// Backend contract:
//   GET /api/fs?path=/abs/or/~/path&hidden=1
//     -> { path, parent | null, home | null, isRepo, truncated,
//          folders: [{ name, path, isRepo }] }      (folders only, sorted by name)
//   no `path` starts at the home folder; errors answer { error: "text" }
import MOCK from "./config.js";

const delay = () => new Promise((resolve) => setTimeout(resolve, 100));

const MOCK_TREE = {
  "/": ["home"],
  "/home": ["me"],
  "/home/me": ["Projects", "Documents", ".config"],
  "/home/me/Projects": ["iqra", "fikret", "mako-zero"],
  "/home/me/Projects/iqra": [],
  "/home/me/Projects/fikret": [],
  "/home/me/Projects/mako-zero": [],
  "/home/me/Documents": [],
  "/home/me/.config": [],
};
const MOCK_REPOS = ["/home/me/Projects/iqra", "/home/me/Projects/fikret", "/home/me/Projects/mako-zero"];

function mockListing(path, hidden) {
  const clean = path === "/" ? "/" : path.replace(/\/+$/, "");
  const names = MOCK_TREE[clean];
  if (!names) throw new Error(`The folder ${clean} does not exist.`);
  const join = (n) => (clean === "/" ? `/${n}` : `${clean}/${n}`);
  return {
    path: clean,
    parent: clean === "/" ? null : clean.slice(0, clean.lastIndexOf("/")) || "/",
    home: "/home/me",
    isRepo: MOCK_REPOS.includes(clean),
    truncated: false,
    folders: names
      .filter((n) => hidden || !n.startsWith("."))
      .map((name) => ({ name, path: join(name), isRepo: MOCK_REPOS.includes(join(name)) })),
  };
}

export async function fetchFolders({ path, hidden = false } = {}) {
  if (MOCK.fs) {
    await delay();
    return mockListing(path || "/home/me", hidden);
  }
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (hidden) params.set("hidden", "1");
  const res = await fetch(`/api/fs?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to list folders (${res.status})`);
  }
  return res.json();
}
