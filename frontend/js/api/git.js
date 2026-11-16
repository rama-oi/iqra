// The git actions of a project: stage, unstage, stash, pop, pull and push.
//
// Backend contract (every call answers {} or { error: "human readable text" }):
//   POST /api/repos/:repo/stage          { paths: [path] }   add files to the next commit
//   POST /api/repos/:repo/unstage        { paths: [path] }   take them out again
//   POST /api/repos/:repo/stashes/push   { message? }        set the changes aside (new files too)
//   POST /api/repos/:repo/stashes/pop                         bring the newest stash back
//   POST /api/repos/:repo/pull                                fast-forward only, never merges
//   POST /api/repos/:repo/push                                first push sets the upstream on origin
//
// The sample data of changes.js and stashes.js has to move together (a stash empties the
// changes), so these follow the `changes` flag.

import MOCK from "./config.js";
import { mockStage, mockUnstage, mockTakeChanges, mockGiveChanges } from "./changes.js";
import { mockPushStash, mockPopStash } from "./stashes.js";

const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(repo, action, body = {}) {
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(reply.error || `Request failed (${res.status})`);
  return reply;
}

export async function stage({ repo, paths }) {
  if (MOCK.changes) return delay(100).then(() => mockStage(repo, paths));
  return post(repo, "stage", { paths });
}

export async function unstage({ repo, paths }) {
  if (MOCK.changes) return delay(100).then(() => mockUnstage(repo, paths));
  return post(repo, "unstage", { paths });
}

export async function stashChanges({ repo, branch, message = "" }) {
  if (MOCK.changes) {
    await delay();
    const files = mockTakeChanges(repo);
    if (!files.length) throw new Error("There are no changes to stash.");
    return mockPushStash(repo, { files, branch, message });
  }
  return post(repo, "stashes/push", { message });
}

export async function popStash({ repo }) {
  if (MOCK.changes) {
    await delay();
    const stash = mockPopStash(repo);
    if (!stash) throw new Error("No stash entries found.");
    return mockGiveChanges(repo, stash.files);
  }
  return post(repo, "stashes/pop");
}

export async function pull({ repo }) {
  if (MOCK.changes) return delay(600);
  return post(repo, "pull");
}

export async function push({ repo }) {
  if (MOCK.changes) return delay(600);
  return post(repo, "push");
}
