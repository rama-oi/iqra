use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git2::{
    BranchType, Delta, Diff, DiffFormat, DiffOptions, ErrorCode, Oid, Repository, Sort,
    StatusOptions,
};

use crate::time::iso8601_utc;
use crate::{
    Author, Branch, Commit, CommitsPage, Error, FileChange, FileDiff, Project, RefKind, RefLabel,
    Result, Stash, Status, Submodule, display_path,
};

/// A commit lists the files it changed; a commit that touched thousands is cut here.
pub const MAX_FILES_PER_COMMIT: usize = 300;
/// A patch bigger than this is cut (and flagged `truncated`) instead of sent whole.
const MAX_PATCH_BYTES: usize = 2_000_000;

/// What to compare for a diff.
#[derive(Debug, Clone)]
pub enum DiffTarget {
    /// HEAD against the index (what the next commit will contain).
    Staged,
    /// The index against the working folder (what is changed but not staged).
    Unstaged,
    /// A commit against its first parent. Full or abbreviated hash.
    Commit(String),
}

/// One opened repository. Cheap to create, so the server opens one per request
/// (libgit2 handles are not shared between threads).
pub struct Repo {
    name: String,
    path: PathBuf,
    inner: Repository,
}

fn status_letter(delta: Delta) -> &'static str {
    match delta {
        Delta::Added | Delta::Copied | Delta::Untracked => "A",
        Delta::Deleted => "D",
        Delta::Renamed => "R",
        Delta::Conflicted => "U",
        _ => "M",
    }
}

fn changes(diff: &Diff<'_>, cap: usize) -> Vec<FileChange> {
    diff.deltas()
        .filter_map(|d| {
            let path = d.new_file().path().or_else(|| d.old_file().path())?;
            Some(FileChange {
                path: path.to_string_lossy().into_owned(),
                status: status_letter(d.status()).into(),
            })
        })
        .take(cap)
        .collect()
}

fn rank(kind: RefKind) -> u8 {
    match kind {
        RefKind::Branch => 0,
        RefKind::Remote => 1,
        RefKind::Tag => 2,
        RefKind::Head => 0,
    }
}

fn parse_stash_message(message: &str) -> (String, String) {
    for prefix in ["WIP on ", "On "] {
        if let Some((branch, text)) = message.strip_prefix(prefix).and_then(|r| r.split_once(": ")) {
            // "WIP on main: 1a2b3c4 subject" -> drop the abbreviated hash
            let text = match text.split_once(' ') {
                Some((hash, rest)) if hash.len() >= 7 && hash.chars().all(|c| c.is_ascii_hexdigit()) => rest,
                _ => text,
            };
            return (branch.to_string(), text.to_string());
        }
    }
    (String::new(), message.to_string())
}

impl Repo {
    /// Opens the repository whose working folder is exactly `path`.
    pub fn open(name: &str, path: &Path) -> Result<Self> {
        let inner = Repository::open(path).map_err(|e| {
            if e.code() == ErrorCode::NotFound {
                Error::Invalid(
                    "That folder is not a git repository: there is no .git inside it. \
                     Open the folder at the top of the repository."
                        .into(),
                )
            } else {
                e.into()
            }
        })?;
        if inner.is_bare() {
            return Err(Error::Invalid("A bare repository has no working folder to open.".into()));
        }
        Ok(Self { name: name.to_string(), path: path.to_path_buf(), inner })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The branch HEAD points at. Works for a repository with no commits yet;
    /// None when HEAD is detached.
    pub fn head_branch(&self) -> Option<String> {
        let head = self.inner.find_reference("HEAD").ok()?;
        head.symbolic_target().ok()??.strip_prefix("refs/heads/").map(String::from)
    }

    /// The commit HEAD is detached on, None when it is on a branch (or the repository
    /// is empty).
    fn detached_head(&self) -> Option<Oid> {
        if self.head_branch().is_some() {
            return None;
        }
        self.inner.head().ok()?.target()
    }

    pub fn project(&self) -> Project {
        Project {
            name: self.name.clone(),
            description: display_path(&self.path),
            default_branch: self.head_branch().unwrap_or_else(|| "main".into()),
        }
    }

    /// Local branches, the one the repository is on first.
    pub fn branches(&self) -> Result<Vec<Branch>> {
        let head = self.head_branch();
        let mut names: Vec<String> = self
            .inner
            .branches(Some(BranchType::Local))?
            .filter_map(|b| b.ok())
            .filter_map(|(b, _)| b.name().ok().flatten().map(String::from))
            .collect();
        // a repository with no commits has a current branch but no branch yet
        if let Some(h) = &head
            && !names.contains(h) {
                names.push(h.clone());
            }
        names.sort_by_key(|n| (Some(n) != head.as_ref(), n.clone()));
        let mut branches: Vec<Branch> = names
            .into_iter()
            .map(|name| Branch { is_default: Some(&name) == head.as_ref(), is_detached: false, name })
            .collect();
        // a detached HEAD is the current "branch", so it leads the list
        if let Some(oid) = self.detached_head() {
            branches.insert(0, Branch { name: oid.to_string()[..7].to_string(), is_default: true, is_detached: true });
        }
        Ok(branches)
    }

    /// Remote-tracking branches ("origin/main"), as last fetched.
    pub fn remote_branches(&self) -> Result<Vec<String>> {
        let mut names: Vec<String> = self
            .inner
            .branches(Some(BranchType::Remote))?
            .filter_map(|b| b.ok())
            .filter_map(|(b, _)| b.name().ok().flatten().map(String::from))
            .filter(|n| !n.ends_with("/HEAD"))
            .collect();
        names.sort();
        Ok(names)
    }

    /// `(owner, name)` of the GitHub repository this project's remote points at, if any.
    /// `origin` wins; otherwise the first remote that is on GitHub.
    pub fn github_slug(&self) -> Option<(String, String)> {
        let remotes = self.inner.remotes().ok()?;
        let mut names: Vec<&str> = remotes.iter().flatten().flatten().collect();
        names.sort_by_key(|n| *n != "origin");
        names
            .into_iter()
            .filter_map(|n| self.inner.find_remote(n).ok())
            .find_map(|r| r.url().ok().and_then(github_slug))
    }

    /// The submodules the project declares in `.gitmodules`.
    pub fn submodules(&self) -> Result<Vec<Submodule>> {
        let mut list: Vec<Submodule> = self
            .inner
            .submodules()?
            .iter()
            .map(|m| {
                let path = m.path().to_string_lossy().into_owned();
                let initialized = self.inner.workdir().is_some_and(|w| w.join(&path).join(".git").exists());
                let short = |id: Option<Oid>| id.map(|i| i.to_string()[..7].to_string());
                Submodule {
                    name: m.name().unwrap_or(&path).to_string(),
                    url: m.url().ok().flatten().map(str::to_string).unwrap_or_default(),
                    branch: m.branch().ok().flatten().map(str::to_string),
                    recorded: short(m.index_id().or_else(|| m.head_id())),
                    checked_out: if initialized { short(m.workdir_id()) } else { None },
                    path,
                    initialized,
                }
            })
            .collect();
        list.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(list)
    }

    /// Every branch, remote branch and tag, keyed by the commit it points at.
    fn ref_labels(&self) -> Result<HashMap<Oid, Vec<RefLabel>>> {
        let head = self.head_branch();
        let mut map: HashMap<Oid, Vec<RefLabel>> = HashMap::new();
        for reference in self.inner.references()? {
            let reference = reference?;
            let Ok(name) = reference.name() else { continue };
            let (kind, short) = if let Some(s) = name.strip_prefix("refs/heads/") {
                (RefKind::Branch, s)
            } else if let Some(s) = name.strip_prefix("refs/remotes/") {
                if s.ends_with("/HEAD") {
                    continue;
                }
                (RefKind::Remote, s)
            } else if let Some(s) = name.strip_prefix("refs/tags/") {
                (RefKind::Tag, s)
            } else {
                continue;
            };
            // a tag can point at a tree or blob; those have no place in the graph
            let Ok(commit) = reference.peel_to_commit() else { continue };
            let is_head = kind == RefKind::Branch && head.as_deref() == Some(short);
            map.entry(commit.id())
                .or_default()
                .push(RefLabel { name: short.to_string(), kind, is_head });
        }
        if let Some(oid) = self.detached_head() {
            map.entry(oid).or_default().push(RefLabel { name: "HEAD".into(), kind: RefKind::Head, is_head: true });
        }
        for labels in map.values_mut() {
            labels.sort_by(|a, b| (rank(a.kind), !a.is_head, &a.name).cmp(&(rank(b.kind), !b.is_head, &b.name)));
        }
        Ok(map)
    }

    fn build_commit(&self, commit: &git2::Commit<'_>, labels: &HashMap<Oid, Vec<RefLabel>>) -> Result<Commit> {
        let tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().map(|p| p.tree()).transpose()?;
        let diff = self.inner.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;

        let hash = commit.id().to_string();
        let author = commit.author();
        Ok(Commit {
            short_hash: hash[..7].to_string(),
            hash,
            parents: commit.parent_ids().map(|id| id.to_string()).collect(),
            author: Author {
                name: String::from_utf8_lossy(author.name_bytes()).into_owned(),
                email: String::from_utf8_lossy(author.email_bytes()).into_owned(),
                avatar_url: None,
            },
            committed_at: iso8601_utc(commit.time().seconds()),
            message: String::from_utf8_lossy(commit.message_bytes()).trim_end().to_string(),
            refs: labels.get(&commit.id()).cloned().unwrap_or_default(),
            files: changes(&diff, MAX_FILES_PER_COMMIT),
        })
    }

    /// The history of every branch and tag together (what `git log --all
    /// --topo-order` shows), newest first, children always before their parents so
    /// the graph can be drawn row by row. `cursor` is what the previous page returned.
    pub fn commits(&self, limit: usize, cursor: Option<&str>) -> Result<CommitsPage> {
        let skip = match cursor {
            None | Some("") => 0,
            Some(c) => c
                .parse::<usize>()
                .map_err(|_| Error::Invalid("That page cursor is not valid.".into()))?,
        };
        let limit = limit.clamp(1, 1000);
        let labels = self.ref_labels()?;

        let mut walk = self.inner.revwalk()?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
        for oid in labels.keys() {
            walk.push(*oid)?;
        }
        // a detached HEAD is not on any branch, but its history belongs in the graph
        if let Some(oid) = self.inner.head().ok().and_then(|h| h.target()) {
            walk.push(oid)?;
        }

        // one more than asked for tells us whether another page exists
        let mut commits = Vec::new();
        let mut more = false;
        for oid in walk.skip(skip).take(limit + 1) {
            if commits.len() == limit {
                more = true;
                break;
            }
            commits.push(self.build_commit(&self.inner.find_commit(oid?)?, &labels)?);
        }

        Ok(CommitsPage {
            repository: self.name.clone(),
            current_branch: self.head_branch(),
            commits,
            next_cursor: more.then(|| (skip + limit).to_string()),
        })
    }

    /// The commit HEAD points at (what was just created, after a commit).
    pub fn head_commit(&self) -> Result<Commit> {
        let commit = self.inner.head()?.peel_to_commit()?;
        self.build_commit(&commit, &self.ref_labels()?)
    }

    /// Changed files of the working folder, split into what is staged and what is not.
    /// New files that git does not track yet count as unstaged additions.
    pub fn status(&self) -> Result<Status> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true).include_ignored(false);

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        for entry in self.inner.statuses(Some(&mut opts))?.iter() {
            let path = String::from_utf8_lossy(entry.path_bytes()).into_owned();
            let s = entry.status();
            let push = |list: &mut Vec<FileChange>, letter: &str| {
                list.push(FileChange { path: path.clone(), status: letter.into() })
            };

            use git2::Status as S;
            if s.contains(S::CONFLICTED) {
                push(&mut unstaged, "U");
                continue;
            }
            if s.contains(S::INDEX_NEW) {
                push(&mut staged, "A");
            } else if s.contains(S::INDEX_DELETED) {
                push(&mut staged, "D");
            } else if s.contains(S::INDEX_RENAMED) {
                push(&mut staged, "R");
            } else if s.intersects(S::INDEX_MODIFIED | S::INDEX_TYPECHANGE) {
                push(&mut staged, "M");
            }
            if s.contains(S::WT_NEW) {
                push(&mut unstaged, "A");
            } else if s.contains(S::WT_DELETED) {
                push(&mut unstaged, "D");
            } else if s.contains(S::WT_RENAMED) {
                push(&mut unstaged, "R");
            } else if s.intersects(S::WT_MODIFIED | S::WT_TYPECHANGE) {
                push(&mut unstaged, "M");
            }
        }
        staged.sort_by(|a, b| a.path.cmp(&b.path));
        unstaged.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(Status { staged, unstaged })
    }

    /// The unified diff of one file.
    pub fn diff(&self, path: &str, target: &DiffTarget) -> Result<FileDiff> {
        let mut opts = DiffOptions::new();
        // `path` is a file name, not a pattern: "*" or "[x]" must not match other files
        opts.pathspec(path).disable_pathspec_match(true);

        let diff = match target {
            DiffTarget::Staged => {
                let head = self.inner.head().ok().and_then(|h| h.peel_to_tree().ok());
                self.inner.diff_tree_to_index(head.as_ref(), None, Some(&mut opts))?
            }
            DiffTarget::Unstaged => {
                opts.include_untracked(true).show_untracked_content(true).recurse_untracked_dirs(true);
                self.inner.diff_index_to_workdir(None, Some(&mut opts))?
            }
            DiffTarget::Commit(rev) => {
                // only hashes: this must not become a way to evaluate `HEAD~3:file` expressions
                if rev.len() < 4 || rev.len() > 40 || !rev.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Err(Error::Invalid("That is not a commit hash.".into()));
                }
                let commit = self
                    .inner
                    .revparse_single(rev)
                    .and_then(|o| o.peel_to_commit())
                    .map_err(|_| Error::NotFound(format!("There is no commit {rev}.")))?;
                let tree = commit.tree()?;
                let parent = commit.parent(0).ok().map(|p| p.tree()).transpose()?;
                self.inner.diff_tree_to_tree(parent.as_ref(), Some(&tree), Some(&mut opts))?
            }
        };

        let status = diff
            .deltas()
            .next()
            .map_or("M", |d| status_letter(d.status()))
            .to_string();

        let mut patch = String::new();
        let mut binary = false;
        let mut truncated = false;
        let printed = diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            if line.origin() == 'B' {
                binary = true;
                return true;
            }
            if patch.len() > MAX_PATCH_BYTES {
                truncated = true;
                return false; // stop printing
            }
            // added/removed/context lines come without their leading character
            if matches!(line.origin(), '+' | '-' | ' ') {
                patch.push(line.origin());
            }
            patch.push_str(&String::from_utf8_lossy(line.content()));
            true
        });
        if let Err(e) = printed
            && !truncated {
                return Err(e.into());
            }
        if binary {
            patch.clear();
        }
        Ok(FileDiff { path: path.to_string(), status, binary, patch, truncated })
    }

    /// Stashes, newest first. (libgit2 wants a mutable handle to walk them.)
    pub fn stashes(&mut self) -> Result<Vec<Stash>> {
        let mut found: Vec<(usize, String, Oid)> = Vec::new();
        self.inner.stash_foreach(|index, message, oid| {
            found.push((index, message.to_string(), *oid));
            true
        })?;

        found
            .into_iter()
            .map(|(index, message, oid)| {
                let (branch, message) = parse_stash_message(&message);
                let commit = self.inner.find_commit(oid)?;
                let tree = commit.tree()?;
                let base = commit.parent(0).ok().map(|p| p.tree()).transpose()?;
                let diff = self.inner.diff_tree_to_tree(base.as_ref(), Some(&tree), None)?;
                let hash = oid.to_string();
                Ok(Stash {
                    id: format!("stash@{{{index}}}"),
                    message,
                    branch,
                    created_at: iso8601_utc(commit.time().seconds()),
                    short_hash: hash[..7].to_string(),
                    hash,
                    files: changes(&diff, MAX_FILES_PER_COMMIT),
                })
            })
            .collect()
    }
}

/// `("owner", "name")` from a GitHub remote URL in any of its spellings:
/// `git@github.com:o/n.git`, `ssh://git@github.com/o/n`, `https://github.com/o/n.git`.
pub fn github_slug(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    let rest = if let Some(r) = url.strip_prefix("git@github.com:") {
        r
    } else {
        let after = url.split_once("://")?.1;
        let after = after.rsplit_once('@').map_or(after, |(_, h)| h);
        let after = after.strip_prefix("github.com")?;
        // an optional port (ssh://git@github.com:22/o/n)
        let after = after.trim_start_matches(|c: char| c == ':' || c.is_ascii_digit());
        after.strip_prefix('/')?
    };
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let (owner, name) = rest.split_once('/')?;
    let ok = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
    (ok(owner) && ok(name)).then(|| (owner.to_string(), name.to_string()))
}

#[cfg(test)]
mod github_slug_tests {
    use super::github_slug;

    #[test]
    fn every_spelling_of_a_github_remote_is_understood() {
        let want = Some(("rama-oi".to_string(), "iqra".to_string()));
        for url in [
            "git@github.com:rama-oi/iqra.git",
            "git@github.com:rama-oi/iqra",
            "ssh://git@github.com/rama-oi/iqra.git",
            "ssh://git@github.com:22/rama-oi/iqra.git",
            "https://github.com/rama-oi/iqra.git",
            "https://github.com/rama-oi/iqra/",
            "https://user:token@github.com/rama-oi/iqra",
        ] {
            assert_eq!(github_slug(url), want, "{url}");
        }
        for url in ["git@gitlab.com:o/n.git", "/srv/git/iqra.git", "https://github.com/onlyowner", "https://github.com.evil.io/o/n", "git@github.com:o/n/extra"] {
            assert_eq!(github_slug(url), None, "{url}");
        }
    }
}
