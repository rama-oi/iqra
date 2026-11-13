import AREAS from "./objects/areas.js";

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
  filter: "", // the toolbar search text
};

export default data;

const emit = (type, detail) =>
  document.dispatchEvent(new CustomEvent(type, { detail }));

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
  emit("pb-commit-select", null);
  clearFilter();
  emit("pb-repository-change", data.repository);
}

export function setArea(area) {
  if (!(area in AREAS) || area === data.area) return;
  data.area = area;
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
  emit("pb-commit-select", null);
  emit("pb-branch-change", branch);
}

// Pass null to go back to the "commit your changes" view.
export function setCommit(commit) {
  if ((commit?.hash ?? null) === (data.commit?.hash ?? null)) return;
  data.commit = commit;
  emit("pb-commit-select", commit);
}

export function setFilter(text) {
  if (text === data.filter) return;
  data.filter = text;
  emit("pb-filter-change", text);
}
