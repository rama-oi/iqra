import MOCK from "./config.js";
import AREAS from "../constants/areas.js";
import { THEMES, ACCENTS } from "../constants/themes.js";
import { load, save, upgrade, takeLegacy } from "../store/storage.js";

upgrade((from, { save }) => {
  if (from >= 1) return;
  const theme = takeLegacy("pb-theme");
  const accent = takeLegacy("pb-accent");
  const left = takeLegacy("pb-collapsed-pb-sidebar-left");
  const right = takeLegacy("pb-collapsed-pb-sidebar-right");
  if (theme) save("theme", theme);
  if (accent) save("accent", accent);
  if (left !== null || right !== null)
    save("panels", { left: left === "1", right: right === "1" });
});

const isId = (list) => (id) => list.some((item) => item.id === id);
const isTabs = (v) =>
  Array.isArray(v) && v.every((t) => t && typeof t.name === "string");
const isPanels = (v) =>
  v && typeof v.left === "boolean" && typeof v.right === "boolean";

const data = {
  appName: "Iqra",
  tabs: MOCK.projects
    ? [
        { name: "fikret", branch: "v10" },
        { name: "mako zero", branch: "main" },
      ]
    : load("tabs", [], isTabs),
  repository: null,
  branch: null,
  detached: false,
  area: "workarea",
  commit: null,
  submodule: null,
  file: null,
  filter: "",
  identity: null,
  theme: load("theme", THEMES[0].id, isId(THEMES)),
  accent: load("accent", ACCENTS[0].id, isId(ACCENTS)),
  panels: load("panels", { left: false, right: false }, isPanels),
};

const first = MOCK.projects
  ? data.tabs[0]
  : (data.tabs.find((t) => t.name === load("active", null)) ?? data.tabs[0]);
data.repository = first?.name ?? null;
data.branch = first?.branch ?? null;
data.detached = !!first?.detached;

export default data;

function saveTabs() {
  if (MOCK.projects) return;
  save("tabs", data.tabs);
  save("active", data.repository);
}

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

function activate(tab) {
  data.repository = tab?.name ?? null;
  data.branch = tab?.branch ?? null;
  data.detached = !!tab?.detached;
  data.commit = null;
  data.submodule = null;
  clearFile();
  emit("pb-commit-select", null);
  emit("pb-submodule-select", null);
  clearFilter();
  saveTabs();
  emit("pb-repository-change", data.repository);
}

export function setArea(area) {
  if (!AREAS.hasKey(area) || area === data.area) return;
  data.area = area;
  clearFile();
  clearFilter();
  emit("pb-area-change", area);
}

export function openProject({ name, defaultBranch }) {
  let tab = data.tabs.find((t) => t.name === name);
  if (!tab) {
    tab = { name, branch: defaultBranch };
    data.tabs.push(tab);
    saveTabs();
    emit("pb-tabs-change");
  }
  if (name !== data.repository) activate(tab);
}

export function syncTabs(projects) {
  const known = new Set(projects.map((p) => p.name));
  for (const tab of [...data.tabs])
    if (!known.has(tab.name)) closeTab(tab.name);
}

export function selectTab(name) {
  const tab = data.tabs.find((t) => t.name === name);
  if (tab && name !== data.repository) activate(tab);
}

export function closeTab(name) {
  const index = data.tabs.findIndex((t) => t.name === name);
  if (index === -1) return;
  data.tabs.splice(index, 1);
  saveTabs();
  emit("pb-tabs-change");
  if (name === data.repository)
    activate(data.tabs[index] ?? data.tabs[index - 1] ?? null);
}

export function setBranch(branch, { detached = false } = {}) {
  if (
    !branch ||
    !data.repository ||
    (branch === data.branch && detached === data.detached)
  )
    return;
  data.branch = branch;
  data.detached = detached;
  const tab = data.tabs.find((t) => t.name === data.repository);
  if (tab) {
    tab.branch = branch;
    tab.detached = detached;
  }
  saveTabs();
  data.commit = null;
  clearFile();
  emit("pb-commit-select", null);
  emit("pb-branch-change", branch);
}

export function setCommit(commit) {
  if ((commit?.hash ?? null) === (data.commit?.hash ?? null)) return;
  data.commit = commit;
  clearFile();
  // a commit and a submodule never share the preview
  if (commit && data.submodule) {
    data.submodule = null;
    emit("pb-submodule-select", null);
  }
  emit("pb-commit-select", commit);
}

export function setSubmodule(submodule) {
  submodule = submodule ?? null;
  if ((submodule?.path ?? null) === (data.submodule?.path ?? null)) {
    // same row again: keep it, but let the panel show fresh details
    if (submodule) {
      data.submodule = submodule;
      emit("pb-submodule-select", submodule);
    }
    return;
  }
  data.submodule = submodule;
  if (submodule && data.commit) setCommit(null);
  emit("pb-submodule-select", submodule);
}

export function refreshCommit(commit) {
  if (!commit || commit.hash !== data.commit?.hash) return;
  data.commit = commit;
  emit("pb-commit-select", commit);
}

const sameFile = (a, b) =>
  a?.path === b?.path &&
  !!a?.staged === !!b?.staged &&
  (a?.commit ?? null) === (b?.commit ?? null) &&
  !!a === !!b;

export function setFile(file) {
  file = file ?? null;
  if (sameFile(file, data.file)) return;
  data.file = file;
  emit("pb-file-select", file);
}

export function goBack() {
  if (data.file) setFile(null);
  else if (data.submodule) setSubmodule(null);
  else if (data.commit) setCommit(null);
  else return false;
  return true;
}

export const isSelectedFile = (file) =>
  !!data.file && sameFile(file, data.file);

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

export function setPanelCollapsed(side, collapsed) {
  if (!(side in data.panels) || data.panels[side] === collapsed) return;
  data.panels[side] = collapsed;
  save("panels", data.panels);
  emit("pb-panel-change", { side, collapsed });
}
