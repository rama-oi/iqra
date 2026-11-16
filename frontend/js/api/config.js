// Which parts of the app talk to the backend (false) and which still use sample data (true).
// Flip a flag as its endpoints become real. The backend (backend/) serves these:
//   projects, commits, changes (status + diff), stashes -> real
//   git actions (api/git.js), remote branches           -> real (they follow `changes` and `projects`)
//   identities, issues                                  -> not built yet
const MOCK = {
  projects: false,
  commits: false,
  changes: false,
  stashes: false,
  fs: false, // the folder picker's view of the machine running the backend
  identities: true,
  issues: true,
};

export default MOCK;
