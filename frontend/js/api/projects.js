import MOCK from "./config.js";
const USE_MOCK = MOCK.projects;

const MOCK_PROJECTS = [
  {
    name: "fikret",
    description: "Web Git client playground",
    defaultBranch: "v10",
  },
  { name: "mako zero", description: "Game prototype", defaultBranch: "main" },
  { name: "iqra", description: "This very app", defaultBranch: "main" },
  {
    name: "dotfiles",
    description: "Personal configuration",
    defaultBranch: "main",
  },
];

const MOCK_BRANCHES = {
  fikret: [
    "v10",
    "main",
    "feature/sidebar",
    "feature/theme",
    "fix/avatar-crash",
  ],
  "mako zero": ["main", "feature/inventory", "fix/jump-height"],
  iqra: ["main", "feature/backlog"],
  dotfiles: ["main"],
};

const delay = () => new Promise((resolve) => setTimeout(resolve, 150));

export async function fetchProjects() {
  if (USE_MOCK) {
    await delay();
    return structuredClone(MOCK_PROJECTS);
  }
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
  return (await res.json()).projects;
}

const mockDetached = {};
export function mockSetDetached(repo, hash) {
  if (hash) mockDetached[repo] = hash.slice(0, 7);
  else delete mockDetached[repo];
}

export async function fetchBranches(repo) {
  if (USE_MOCK) {
    await delay();
    const project = MOCK_PROJECTS.find((p) => p.name === repo);
    const names = MOCK_BRANCHES[repo] ?? [project?.defaultBranch ?? "main"];
    const detached = mockDetached[repo];
    const list = names.map((name) => ({
      name,
      isDefault: !detached && name === project?.defaultBranch,
      isDetached: false,
    }));
    return detached
      ? [{ name: detached, isDefault: true, isDetached: true }, ...list]
      : list;
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/branches`);
  if (!res.ok) throw new Error(`Failed to load branches (${res.status})`);
  return (await res.json()).branches;
}

// Mock only: a branch created from the toolbar.
export function mockAddBranch(repo, name) {
  (MOCK_BRANCHES[repo] ??= []).push(name);
}

export async function deleteBranch({ repo, name, force = false }) {
  if (USE_MOCK) {
    await delay();
    const names = MOCK_BRANCHES[repo];
    if (names) MOCK_BRANCHES[repo] = names.filter((n) => n !== name);
    return {};
  }
  const params = new URLSearchParams({ name });
  if (force) params.set("force", "true");
  const res = await fetch(
    `/api/repos/${encodeURIComponent(repo)}/branches?${params}`,
    { method: "DELETE" },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      body.error || `Could not delete the branch (${res.status})`,
    );
  return body;
}

export async function deleteRemoteBranch({ repo, name }) {
  if (USE_MOCK) {
    await delay();
    const i = (MOCK_REMOTE_BRANCHES[repo] ?? []).indexOf(name);
    if (i >= 0) MOCK_REMOTE_BRANCHES[repo].splice(i, 1);
    return {};
  }
  const res = await fetch(
    `/api/repos/${encodeURIComponent(repo)}/remote-branches?${new URLSearchParams({ name })}`,
    { method: "DELETE" },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      body.error || `Could not delete the remote branch (${res.status})`,
    );
  return body;
}

const MOCK_REMOTE_BRANCHES = {
  fikret: ["origin/main", "origin/v10", "origin/feature/theme"],
  "mako zero": ["origin/main"],
};

export async function fetchRemoteBranches(repo) {
  if (USE_MOCK) {
    await delay();
    return (MOCK_REMOTE_BRANCHES[repo] ?? []).map((name) => ({ name }));
  }
  const res = await fetch(
    `/api/repos/${encodeURIComponent(repo)}/remote-branches`,
  );
  if (!res.ok)
    throw new Error(`Failed to load remote branches (${res.status})`);
  return (await res.json()).branches;
}

const SSH_URL = /^(ssh:\/\/\S+|[\w.-]+@[\w.-]+:\S+)$/i;
const LOCAL_PATH = /^(\/|~[\/\\]|[a-z]:[\/\\]|\\\\)/i;

export function folderName(path) {
  return (
    String(path ?? "")
      .trim()
      .replace(/[\/\\]+$/, "")
      .split(/[\/\\]/)
      .pop() ?? ""
  );
}

export async function cloneProject({ url, name }) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (/^https?:\/\//i.test(url))
      throw new Error(
        "Only SSH URLs are supported, e.g. git@github.com:owner/repo.git.",
      );
    if (!SSH_URL.test(url))
      throw new Error("That does not look like an SSH git URL.");
    if (MOCK_PROJECTS.some((p) => p.name === name)) {
      throw new Error(`A project named "${name}" already exists.`);
    }
    const project = {
      name,
      description: `Cloned from ${url}`,
      defaultBranch: "main",
    };
    MOCK_PROJECTS.push(project);
    MOCK_BRANCHES[name] = ["main"];
    return structuredClone(project);
  }

  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Clone failed (${res.status})`);
  }
  return (await res.json()).project;
}

export async function openLocalProject({ path, name }) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!LOCAL_PATH.test(path))
      throw new Error(
        "Enter the full path of the folder, e.g. /home/me/projects/iqra.",
      );
    if (MOCK_PROJECTS.some((p) => p.name === name)) {
      throw new Error(`A project named "${name}" already exists.`);
    }
    const project = {
      name,
      description: `Opened from ${path}`,
      defaultBranch: "main",
    };
    MOCK_PROJECTS.push(project);
    MOCK_BRANCHES[name] = ["main"];
    return structuredClone(project);
  }

  const res = await fetch("/api/projects/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Could not open the folder (${res.status})`);
  }
  return (await res.json()).project;
}

export async function fetchSubmodules(repo) {
  if (USE_MOCK) {
    await delay();
    return [];
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/submodules`);
  if (!res.ok) throw new Error(`Failed to load submodules (${res.status})`);
  return (await res.json()).submodules;
}
