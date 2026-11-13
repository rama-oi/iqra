// Projects (repositories) and their branches.
//
// Backend contract:
//   GET /api/projects                  -> { projects: [{ name, description, defaultBranch }] }
//   GET /api/repos/:repo/branches      -> { branches: [{ name, isDefault }] }

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
