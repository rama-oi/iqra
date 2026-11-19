import MOCK from "./config.js";
import {
  mockStage,
  mockUnstage,
  mockTakeChanges,
  mockGiveChanges,
} from "./changes.js";
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
