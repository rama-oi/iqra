use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git2::{
    BranchType, Delta, Diff, DiffFormat, DiffOptions, ErrorCode, Oid, Repository, Sort,
    StatusOptions,
};

use crate::time::iso8601_utc;
use crate::{
    Author, Branch, Commit, CommitsPage, Error, FileChange, FileDiff, Project, RefKind, RefLabel,
    Result, Stash, Status, display_path,
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
        Ok(names
            .into_iter()
            .map(|name| Branch { is_default: Some(&name) == head.as_ref(), name })
            .collect())
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
                let created = self.inner.find_commit(oid)?.time().seconds();
                Ok(Stash {
                    id: format!("stash@{{{index}}}"),
                    message,
                    branch,
                    created_at: iso8601_utc(created),
                })
            })
            .collect()
    }
}
