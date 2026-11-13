import { MOCK_COMMITS_RESPONSE } from "./mock-commits.js";

const USE_MOCK = true;

export async function fetchCommits({ repo, branch, limit = 200, cursor } = {}) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 150)); // fake latency
    return structuredClone(MOCK_COMMITS_RESPONSE);
  }

  const params = new URLSearchParams({ limit });
  if (branch) params.set("branch", branch);
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/commits?${params}`);
  if (!res.ok) throw new Error(`Failed to load commits (${res.status})`);
  return res.json();
}
