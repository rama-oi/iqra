// Bring the whole app up to date with the repositories on disk, which other clients (a
// terminal, another editor, another browser tab) may have changed behind our back.
import data, { syncTabs, setBranch } from "./data.js";
import { fetchProjects, fetchBranches } from "./projects.js";

const MIN_GAP_MS = 1500; // focus and visibility events often arrive together
let last = 0;
let running = false;

// What HEAD was the last time we looked, per project: "main" or, detached, "#1a2b3c4".
const seenHead = new Map();

// Follow HEAD when it moved (a checkout elsewhere), and leave a branch that no longer
// exists (deleted elsewhere) for the one HEAD is on.
async function syncHead() {
  const repo = data.repository;
  if (!repo) return;
  const list = await fetchBranches(repo);
  const head = list.find((b) => b.isDefault);
  if (!head) return; // a repository with no commits yet
  if (repo !== data.repository) return; // the person switched project meanwhile

  const key = head.isDetached ? `#${head.name}` : head.name;
  const moved = seenHead.has(repo) && seenHead.get(repo) !== key;
  seenHead.set(repo, key);
  const stillThere = list.some((b) => b.name === data.branch && b.isDetached === data.detached);
  if (moved || !stillThere) setBranch(head.name, { detached: !!head.isDetached });
}

export async function refreshApp({ force = false } = {}) {
  const now = Date.now();
  if (running || (!force && now - last < MIN_GAP_MS)) return;
  running = true;
  last = now;
  try {
    syncTabs(await fetchProjects());
    await syncHead();
  } catch (err) {
    console.error(err);
  } finally {
    running = false;
  }
  // every view reloads its files, history, branches and stashes
  document.dispatchEvent(new CustomEvent("pb-history-change"));
}
