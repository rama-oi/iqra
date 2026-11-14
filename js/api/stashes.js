// Stashes of a project: work set aside with `git stash`.
//
// Backend contract:
//   GET /api/repos/:repo/stashes
//     -> { stashes: [{ id, message, branch, createdAt }] }
//        id is the stash ref ("stash@{0}"), newest first; createdAt is ISO 8601.

const USE_MOCK = true;

const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_STASHES = {
  fikret: [
    { id: "stash@{0}", message: "WIP: diff view", branch: "v10", createdAt: "2026-11-13T21:40:00Z" },
    { id: "stash@{1}", message: "Try grid layout for the tab bar", branch: "feature/sidebar", createdAt: "2026-11-09T10:05:00Z" },
  ],
};

export async function fetchStashes(repo) {
  if (USE_MOCK) {
    await delay();
    return structuredClone(MOCK_STASHES[repo] ?? []);
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/stashes`);
  if (!res.ok) throw new Error(`Failed to load stashes (${res.status})`);
  return (await res.json()).stashes;
}
