import AREAS from "./objects/areas.js";

// Shared app state. Change it through the setters below so the rest of the app
// hears about it via a document event.
const data = {
  appName: "Iqra",
  repository: "fikret",
  branch: "v10",
  area: "workarea", // a key of AREAS
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
  emit("pb-repository-change", name);
}

export function setBranch(branch) {
  if (!branch || branch === data.branch) return;
  data.branch = branch;
  emit("pb-branch-change", branch);
}
