import { MOCK_COMMITS_RESPONSE } from "./mock-commits.js";

const USE_MOCK = true;

// The mock keeps its own history so commit/amend show up in the tree.
const mockStore = structuredClone(MOCK_COMMITS_RESPONSE);
const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

function randomHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fetchCommits({ repo, branch, limit = 200, cursor } = {}) {
  if (USE_MOCK) {
    await delay();
    return structuredClone(mockStore);
  }

  const params = new URLSearchParams({ limit });
  if (branch) params.set("branch", branch);
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/commits?${params}`);
  if (!res.ok) throw new Error(`Failed to load commits (${res.status})`);
  return res.json();
}

// Commit the staged files, or with `amend` fold them into the latest commit.
// `message` may be empty only when amending: the previous message is kept.
//
// Backend contract:
//   POST /api/repos/:repo/commits  { branch, message, amend } -> { commit }
//   errors answer { error: "human readable text" }
export async function createCommit({ repo, branch, message, amend = false }) {
  if (USE_MOCK) {
    await delay(300);
    const head = mockStore.commits[0];
    const hash = randomHash();
    const base = {
      hash,
      shortHash: hash.slice(0, 7),
      committedAt: new Date().toISOString(),
    };

    if (amend) {
      Object.assign(head, base, message ? { message } : {});
      return structuredClone(head);
    }

    const branchRefs = head.refs.filter((r) => r.type === "branch");
    head.refs = head.refs.filter((r) => r.type !== "branch");
    const commit = { ...base, parents: [head.hash], author: head.author, message, refs: branchRefs };
    mockStore.commits.unshift(commit);
    return structuredClone(commit);
  }

  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, message, amend }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Commit failed (${res.status})`);
  }
  return (await res.json()).commit;
}
