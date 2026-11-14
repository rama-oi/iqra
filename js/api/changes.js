// The working tree of a project: which files changed, and what changed in them.
//
// Backend contract:
//   GET /api/repos/:repo/status
//     -> { staged: [file], unstaged: [file] }
//   GET /api/repos/:repo/diff?path=...&staged=1|0&commit=<hash>
//     -> { path, status, binary, patch }
//        `commit` is given for a file of an existing commit, `staged` for a
//        working-tree file. `patch` is the raw unified diff (`git diff` output),
//        parsed in the browser by lib/diff.js. Empty when `binary` is true.
//
// file: { path, status: "A" | "M" | "D" }   (added, modified, deleted)

const USE_MOCK = true;

const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
const file = (path, status) => ({ path, status });

const MOCK_STATUS = {
  fikret: {
    staged: [file("js/lib/enum.js", "A"), file("js/api/data.js", "M")],
    unstaged: [
      file("css/style.css", "M"),
      file("js/components/pb_menu.js", "M"),
      file("js/constants/old_areas.js", "D"),
    ],
  },
  "mako zero": {
    staged: [],
    unstaged: [file("src/player.gd", "M")],
  },
};

// Kept per project so committing can empty the staged list.
const mockStatus = structuredClone(MOCK_STATUS);

// The mock commit button calls this: staged files stop being "changes".
export function mockCommitStaged(repo) {
  if (mockStatus[repo]) mockStatus[repo].staged = [];
}

const MOCK_PATCHES = {
  "js/api/data.js": `diff --git a/js/api/data.js b/js/api/data.js
--- a/js/api/data.js
+++ b/js/api/data.js
@@ -10,6 +10,9 @@ const data = {
   area: "workarea", // a key of AREAS
   commit: null, // the commit selected in the tree, or null
   filter: "", // the toolbar search text
+  identity: null, // the active identity, or null
+  theme: load("theme", THEMES[0].id, isId(THEMES)),
+  accent: load("accent", ACCENTS[0].id, isId(ACCENTS)),
 };

 export default data;
@@ -38,7 +41,7 @@ function activate(tab) {
 }

 export function setArea(area) {
-  if (!(area in AREAS) || area === data.area) return;
+  if (!AREAS.hasKey(area) || area === data.area) return;
   data.area = area;
   clearFilter(); // a filter makes no sense in another view
   emit("pb-area-change", area);
`,
  "js/lib/enum.js": `diff --git a/js/lib/enum.js b/js/lib/enum.js
--- /dev/null
+++ b/js/lib/enum.js
@@ -0,0 +1,8 @@
+// A two-way lookup: new Enum({ a: "A" }) makes get("a") === "A" and get("A") === "a".
+export default class Enum {
+  #forward = new Map(); // key -> value
+  #backward = new Map(); // value -> key
+
+  get(x) {
+    return this.#forward.has(x) ? this.#forward.get(x) : this.#backward.get(x);
+  }
+}
`,
  "css/style.css": `diff --git a/css/style.css b/css/style.css
--- a/css/style.css
+++ b/css/style.css
@@ -742,9 +742,9 @@ pb-settings dialog {
 /* --- workarea: which view shows ------------------------------------- */
-pb-workarea[data-area="backlog"] > :not(pb-workarea-backlog),
-pb-workarea[data-area="contributors"] > :not(pb-workarea-contributors) {
-  display: none;
-}
+pb-workarea[data-view] > * {
+  display: none;
+}
`,
  "js/components/pb_menu.js": `diff --git a/js/components/pb_menu.js b/js/components/pb_menu.js
--- a/js/components/pb_menu.js
+++ b/js/components/pb_menu.js
@@ -20,5 +20,6 @@ customElements.define(
       this.querySelector(".pb-config").addEventListener("click", () =>
         document.dispatchEvent(new CustomEvent("pb-open-settings")),
       );
+      document.addEventListener("pb-identity-change", () => this.#render());
       this.#render();
     }
`,
  "js/constants/old_areas.js": `diff --git a/js/constants/old_areas.js b/js/constants/old_areas.js
--- a/js/constants/old_areas.js
+++ /dev/null
@@ -1,5 +0,0 @@
-export default {
-  workarea: "Work Area",
-  backlog: "Backlog",
-  contributors: "Contributors",
-};
`,
};

export async function fetchStatus({ repo } = {}) {
  if (USE_MOCK) {
    await delay();
    return structuredClone(mockStatus[repo] ?? { staged: [], unstaged: [] });
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/status`);
  if (!res.ok) throw new Error(`Failed to load changes (${res.status})`);
  return res.json();
}

export async function fetchDiff({ repo, path, staged = false, commit } = {}) {
  if (USE_MOCK) {
    await delay();
    const all = [...(mockStatus[repo]?.staged ?? []), ...(mockStatus[repo]?.unstaged ?? [])];
    const status = all.find((f) => f.path === path)?.status ?? "M";
    const patch =
      MOCK_PATCHES[path] ??
      `@@ -1,2 +1,3 @@\n // mock diff for ${path}\n-old line\n+new line\n+another new line\n`;
    return { path, status, binary: false, patch };
  }
  const params = new URLSearchParams({ path });
  if (commit) params.set("commit", commit);
  else params.set("staged", staged ? "1" : "0");
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/diff?${params}`);
  if (!res.ok) throw new Error(`Failed to load diff (${res.status})`);
  return res.json();
}
