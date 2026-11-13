import AREAS from "./objects/areas.js";

// Shared app state. Change it through the setters below so the rest of the app
// hears about it via a document event.
const data = {
  appName: "Iqra",
  repository: "fikret",
  branch: "v10",
  area: "workarea", // a key of AREAS
  commit: null, // the commit selected in the tree, or null
};

export default data;

const emit = (type, detail) =>
  document.dispatchEvent(new CustomEvent(type, { detail }));

export function setArea(area) {
  if (!(area in AREAS) || area === data.area) return;
  data.area = area;
  emit("pb-area-change", area);
}

// Switching project also lands on that project's default branch.
export function setRepository({ name, defaultBranch }) {
  if (name === data.repository) return;
  data.repository = name;
  data.branch = defaultBranch;
  data.commit = null;
  emit("pb-commit-select", null);
  emit("pb-repository-change", name);
}

export function setBranch(branch) {
  if (!branch || branch === data.branch) return;
  data.branch = branch;
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
