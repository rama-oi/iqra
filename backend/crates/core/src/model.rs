//! The JSON the frontend reads. Field names are camelCase on the wire, matching
//! the contracts written at the top of `frontend/js/api/*.js`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    /// Where it lives on disk, shown under the name in the picker.
    pub description: String,
    /// The branch the repository is on (HEAD), "main" when it cannot tell.
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    /// True for the branch the repository is on (HEAD).
    pub is_default: bool,
    /// True for the one entry that stands for a detached HEAD: its name is the short
    /// hash of the commit checked out, and it comes first.
    pub is_detached: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub name: String,
    pub email: String,
    /// Always null for now: a gravatar URL would tell a third party who is on the log.
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RefKind {
    Branch,
    Remote,
    Tag,
    /// A detached HEAD: it is on a commit, not on a branch.
    Head,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: RefKind,
    pub is_head: bool,
}

/// One changed file. `status` is one letter: A added, M modified, D deleted,
/// R renamed, U unmerged.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author: Author,
    /// ISO 8601, UTC.
    pub committed_at: String,
    pub message: String,
    pub refs: Vec<RefLabel>,
    /// Files changed against the first parent (capped, see `MAX_FILES_PER_COMMIT`).
    pub files: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitsPage {
    pub repository: String,
    pub current_branch: Option<String>,
    pub commits: Vec<Commit>,
    /// Pass back as `?cursor=` for the next page; null at the end of history.
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Status {
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: String,
    pub binary: bool,
    /// Raw unified diff (what `git diff` prints); empty for binary files.
    pub patch: String,
    /// True when the patch was cut because it was too large to send.
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    /// The stash ref, "stash@{0}"; index 0 is the newest.
    pub id: String,
    pub message: String,
    pub branch: String,
    pub created_at: String,
}
