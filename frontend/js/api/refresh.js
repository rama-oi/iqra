import data, { syncTabs, setBranch } from "./data.js";
import { fetchProjects, fetchBranches } from "./projects.js";

const MIN_GAP_MS = 1500;
let last = 0;
let running = false;

const seenHead = new Map();

async function syncHead() {
  const repo = data.repository;
  if (!repo) return;
  const list = await fetchBranches(repo);
  const head = list.find((b) => b.isDefault);
  if (!head) return;
  if (repo !== data.repository) return;

  const key = head.isDetached ? `#${head.name}` : head.name;
  const moved = seenHead.has(repo) && seenHead.get(repo) !== key;
  seenHead.set(repo, key);
  const stillThere = list.some(
    (b) => b.name === data.branch && b.isDetached === data.detached,
  );
  if (moved || !stillThere)
    setBranch(head.name, { detached: !!head.isDetached });
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

  document.dispatchEvent(new CustomEvent("pb-history-change"));
}
