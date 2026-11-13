// Projects (repositories) and their branches.
//
// Backend contract:
//   GET /api/projects                  -> { projects: [{ name, description, defaultBranch }] }
//   GET /api/repos/:repo/branches      -> { branches: [{ name, isDefault }] }
//   POST /api/projects { url, name }   -> { project: { name, description, defaultBranch } }
//     clones the repository; errors answer { error: "human readable text" }

const USE_MOCK = true;

const MOCK_PROJECTS = [
  { name: "fikret", description: "Web Git client playground", defaultBranch: "v10" },
  { name: "mako zero", description: "Game prototype", defaultBranch: "main" },
  { name: "iqra", description: "This very app", defaultBranch: "main" },
  { name: "dotfiles", description: "Personal configuration", defaultBranch: "main" },
];

const MOCK_BRANCHES = {
  fikret: ["v10", "main", "feature/sidebar", "feature/theme", "fix/avatar-crash"],
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

export async function fetchBranches(repo) {
  if (USE_MOCK) {
    await delay();
    const project = MOCK_PROJECTS.find((p) => p.name === repo);
    const names = MOCK_BRANCHES[repo] ?? [project?.defaultBranch ?? "main"];
    return names.map((name) => ({ name, isDefault: name === project?.defaultBranch }));
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/branches`);
  if (!res.ok) throw new Error(`Failed to load branches (${res.status})`);
  return (await res.json()).branches;
}

const GIT_URL = /^(https?:\/\/|ssh:\/\/|git:\/\/|git@)\S+$/i;

export async function cloneProject({ url, name }) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 900)); // cloning takes a while
    if (!GIT_URL.test(url)) throw new Error("That does not look like a git URL.");
    if (MOCK_PROJECTS.some((p) => p.name === name)) {
      throw new Error(`A project named "${name}" already exists.`);
    }
    const project = { name, description: `Cloned from ${url}`, defaultBranch: "main" };
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
