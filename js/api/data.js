import AREAS from "../constants/areas.js";
import { THEMES, ACCENTS } from "../constants/themes.js";
import { load, save, upgrade, takeLegacy } from "../store/storage.js";

// Before the store, theme and panel state used their own "pb-*" keys.
upgrade((from, { save }) => {
  if (from >= 1) return;
  const theme = takeLegacy("pb-theme");
  const accent = takeLegacy("pb-accent");
  const left = takeLegacy("pb-collapsed-pb-sidebar-left");
  const right = takeLegacy("pb-collapsed-pb-sidebar-right");
  if (theme) save("theme", theme);
  if (accent) save("accent", accent);
  if (left !== null || right !== null) save("panels", { left: left === "1", right: right === "1" });
});

const isId = (list) => (id) => list.some((item) => item.id === id);
const isPanels = (v) => v && typeof v.left === "boolean" && typeof v.right === "boolean";

// Shared app state. Change it through the functions below so the rest of the
// app hears about it via a document event.
const data = {
  appName: "Iqra",
  // Open projects. The active one is `repository`; each tab remembers its branch.
  tabs: [
    { name: "fikret", branch: "v10" },
    { name: "mako zero", branch: "main" },
  ],
  repository: "fikret", // null when no tab is open
  branch: "v10",
  area: "workarea", // a key of AREAS
  commit: null, // the commit selected in the tree, or null
  file: null, // the file whose diff shows: { path, status, staged, commit }, or null
  filter: "", // the toolbar search text
  identity: null, // the active identity ({ id, name, avatarUrl, keyName }), or null

  // Remembered between visits (see store/storage.js).
  theme: load("theme", THEMES[0].id, isId(THEMES)),
  accent: load("accent", ACCENTS[0].id, isId(ACCENTS)),
  panels: load("panels", { left: false, right: false }, isPanels), // true = collapsed
};

export default data;

const emit = (type, detail) =>
  document.dispatchEvent(new CustomEvent(type, { detail }));

function clearFile() {
  if (!data.file) return;
  data.file = null;
  emit("pb-file-select", null);
}

function clearFilter() {
  if (!data.filter) return;
  data.filter = "";
  emit("pb-filter-change", "");
}

// Make a tab (or nothing, when the last one was closed) the active project.
function activate(tab) {
  data.repository = tab?.name ?? null;
  data.branch = tab?.branch ?? null;
  data.commit = null;
  clearFile();
  emit("pb-commit-select", null);
  clearFilter();
  emit("pb-repository-change", data.repository);
}

export function setArea(area) {
  if (!AREAS.hasKey(area) || area === data.area) return;
  data.area = area;
  clearFile(); // choosing a view from the menu leaves the diff
  clearFilter(); // a filter makes no sense in another view
  emit("pb-area-change", area);
}

// Open a project in a tab (reusing its tab if it is already open) and show it.
export function openProject({ name, defaultBranch }) {
  let tab = data.tabs.find((t) => t.name === name);
  if (!tab) {
    tab = { name, branch: defaultBranch };
    data.tabs.push(tab);
    emit("pb-tabs-change");
  }
  if (name !== data.repository) activate(tab);
}

export function selectTab(name) {
  const tab = data.tabs.find((t) => t.name === name);
  if (tab && name !== data.repository) activate(tab);
}

// Closing the active tab shows its right neighbour, else its left one, else nothing.
export function closeTab(name) {
  const index = data.tabs.findIndex((t) => t.name === name);
  if (index === -1) return;
  data.tabs.splice(index, 1);
  emit("pb-tabs-change");
  if (name === data.repository) activate(data.tabs[index] ?? data.tabs[index - 1] ?? null);
}

export function setBranch(branch) {
  if (!branch || !data.repository || branch === data.branch) return;
  data.branch = branch;
  const tab = data.tabs.find((t) => t.name === data.repository);
  if (tab) tab.branch = branch;
  data.commit = null;
  clearFile();
  emit("pb-commit-select", null);
  emit("pb-branch-change", branch);
}

// Pass null to go back to the "commit your changes" view.
export function setCommit(commit) {
  if ((commit?.hash ?? null) === (data.commit?.hash ?? null)) return;
  data.commit = commit;
  clearFile();
  emit("pb-commit-select", commit);
}

const sameFile = (a, b) =>
  a?.path === b?.path &&
  !!a?.staged === !!b?.staged &&
  (a?.commit ?? null) === (b?.commit ?? null) &&
  !!a === !!b;

// A file of the working tree ({ path, status, staged }) or of the selected commit
// ({ path, status, commit }). Pass null to close the diff.
export function setFile(file) {
  file = file ?? null;
  if (sameFile(file, data.file)) return;
  data.file = file;
  emit("pb-file-select", file);
}

export const isSelectedFile = (file) => !!data.file && sameFile(file, data.file);

// What the work area shows. One answer, so the CSS only reads data-view.
// Order matters: with no project only the empty message shows, otherwise a
// selected file's diff covers whichever view the area menu picked.
// (A merge conflict will go between the two, above the diff.)
export function getView() {
  if (!data.repository) return "empty";
  if (data.file) return "diffs";
  return data.area;
}

export function setFilter(text) {
  if (text === data.filter) return;
  data.filter = text;
  emit("pb-filter-change", text);
}

// Called with the active identity whenever the identity list is (re)loaded.
export function setIdentity(identity) {
  data.identity = identity ?? null;
  emit("pb-identity-change", data.identity);
}

export function setTheme(id) {
  if (!isId(THEMES)(id) || id === data.theme) return;
  data.theme = id;
  save("theme", id);
  emit("pb-theme-change", id);
}

export function setAccent(id) {
  if (!isId(ACCENTS)(id) || id === data.accent) return;
  data.accent = id;
  save("accent", id);
  emit("pb-accent-change", id);
}

// side: "left" | "right"
export function setPanelCollapsed(side, collapsed) {
  if (!(side in data.panels) || data.panels[side] === collapsed) return;
  data.panels[side] = collapsed;
  save("panels", data.panels);
  emit("pb-panel-change", { side, collapsed });
}
