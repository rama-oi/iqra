use std::io;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The request itself is wrong (bad name, bad URL, ...). Message is for people.
    #[error("{0}")]
    Invalid(String),
    /// What was asked for does not exist (project, file, commit).
    #[error("{0}")]
    NotFound(String),
    /// It exists, but the current state does not allow it (name taken, wrong branch).
    #[error("{0}")]
    Conflict(String),
    /// The `git` binary failed; the message is its own output.
    #[error("{0}")]
    Git(String),
    #[error("{0}")]
    Libgit2(#[from] git2::Error),
    #[error("{0}")]
    Io(#[from] io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}
