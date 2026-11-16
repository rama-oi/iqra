// Stashes of a project: work set aside with `git stash`.
//
// Backend contract:
//   GET /api/repos/:repo/stashes
//     -> { stashes: [{ id, message, branch, createdAt }] }
//        id is the stash ref ("stash@{0}"), newest first; createdAt is ISO 8601.

import MOCK from "./config.js";
const USE_MOCK = MOCK.stashes;

const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_STASHES = {
  fikret: [
    { id: "stash@{0}", message: "WIP: diff view", branch: "v10", createdAt: "2026-11-13T21:40:00Z" },
    { id: "stash@{1}", message: "Try grid layout for the tab bar", branch: "feature/sidebar", createdAt: "2026-11-09T10:05:00Z" },
  ],
};

// The sample stashes keep the files they took, so popping gives them back.
const mockStashes = structuredClone(MOCK_STASHES);

export function mockPushStash(repo, { files, branch, message }) {
  const list = (mockStashes[repo] ??= []);
  list.unshift({
    message: message.trim() || `WIP on ${branch ?? "HEAD"}`,
    branch: branch ?? "HEAD",
    createdAt: new Date().toISOString(),
    files,
  });
  list.forEach((s, i) => (s.id = `stash@{${i}}`));
}

export function mockPopStash(repo) {
  const list = mockStashes[repo] ?? [];
  const stash = list.shift();
  list.forEach((s, i) => (s.id = `stash@{${i}}`));
  return stash && { ...stash, files: stash.files ?? [] };
}

export async function fetchStashes(repo) {
  if (USE_MOCK) {
    await delay();
    return structuredClone(mockStashes[repo] ?? []).map(({ files, ...s }) => s);
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/stashes`);
  if (!res.ok) throw new Error(`Failed to load stashes (${res.status})`);
  return (await res.json()).stashes;
}
