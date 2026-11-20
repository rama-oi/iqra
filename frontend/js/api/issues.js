import MOCK from "./config.js";
const USE_MOCK = MOCK.issues;

const issue = (
  number,
  title,
  state,
  labels,
  author,
  assignee,
  createdAt,
  body,
) => ({
  number,
  title,
  state,
  labels,
  author,
  assignee,
  createdAt,
  body,
});

const MOCK_ISSUES = {
  fikret: [
    issue(
      14,
      "Branch picker should remember the last branch per project",
      "open",
      ["enhancement"],
      "Aisha Karim",
      null,
      "2026-11-11T09:12:00Z",
      "When I switch to another project and come back, I land on the default branch again.\n\nIt would be nicer to restore the branch I was on last.",
    ),
    issue(
      13,
      "Commit graph is slow with more than 5,000 commits",
      "open",
      ["bug", "performance"],
      "Omar Haddad",
      "Fikret",
      "2026-11-09T16:40:00Z",
      "Every row renders its own SVG, so scrolling gets choppy on big repositories.\n\nIdea: virtualize the table body and only render rows near the viewport.",
    ),
    issue(
      12,
      "Show stash entries in the left sidebar",
      "open",
      ["enhancement"],
      "Fikret",
      null,
      "2026-11-06T11:03:00Z",
      "The toolbar has stash/pop buttons but nothing lists the existing stashes.",
    ),
    issue(
      11,
      "Avatar crashes when the image url is empty",
      "closed",
      ["bug"],
      "Omar Haddad",
      "Omar Haddad",
      "2026-11-03T08:30:00Z",
      "Fixed in fix/avatar-crash: an empty src now falls back to initials.",
    ),
    issue(
      10,
      "Add catppuccin latte theme",
      "closed",
      ["design"],
      "Fikret",
      "Omar Haddad",
      "2026-10-28T19:55:00Z",
      "Light theme for daytime use.",
    ),
  ],
  "mako zero": [
    issue(
      5,
      "Player can clip through the left wall",
      "open",
      ["bug"],
      "Fikret",
      null,
      "2026-11-10T20:15:00Z",
      "Happens when jumping into the corner of the first room.",
    ),
    issue(
      4,
      "Inventory screen",
      "open",
      ["feature"],
      "Fikret",
      "Fikret",
      "2026-11-04T10:00:00Z",
      "Grid layout, drag and drop, stack limits.",
    ),
  ],
  iqra: [
    issue(
      2,
      "Backlog view",
      "open",
      ["feature"],
      "Fikret",
      "Fikret",
      "2026-11-12T08:00:00Z",
      "List every issue of the project and let me expand one to read the details.",
    ),
  ],
};

export async function fetchIssues({ repo, page = 1 } = {}) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { issues: structuredClone(MOCK_ISSUES[repo] ?? []), note: null, nextPage: null };
  }
  const res = await fetch(`/api/repos/${encodeURIComponent(repo)}/issues?page=${page}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed to load issues (${res.status})`);
  return { issues: body.issues, note: body.note ?? null, nextPage: body.nextPage ?? null };
}
