// Which parts of the app talk to the backend (false) and which still use sample data (true).
// Flip a flag as its endpoints become real. The backend (backend/) serves these:
//   projects, commits, changes (status + diff), stashes -> real
//   git actions (api/git.js), remote branches           -> real (they follow `changes` and `projects`)
//   identities (SSH keys; clone, pull and push use the active one) -> real
//   issues -> real, but always empty: issues live on a forge (GitHub...), not in git
const MOCK = {
  projects: false,
  commits: false,
  changes: false,
  stashes: false,
  fs: false, // the folder picker's view of the machine running the backend
  identities: false,
  issues: false,
};

export default MOCK;
