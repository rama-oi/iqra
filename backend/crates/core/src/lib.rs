//! The git logic of Iqra. No HTTP and no UI in here, so the same crate can sit
//! behind the REST server today and behind a desktop shell later.
//!
//! Reads (log, status, diff, branches, stashes) go through libgit2 (`git2`): fast
//! and structured. Writes that touch the network or run hooks (clone, commit) go
//! through the `git` binary, so the person's SSH config/agent, hooks and signing
//! behave exactly as they do in a terminal.

mod browse;
mod cli;
mod error;
mod identities;
mod model;
mod paths;
mod registry;
mod repo;
mod ssh_url;
mod time;

pub use browse::{Folder, Listing, list_folders};
pub use cli::{Ssh, checkout, delete_branch, clone_ssh, commit, github_login, pull, push, stage, stash_pop, stash_push, unstage, write_ssh_config};
pub use error::{Error, Result};
pub use identities::{Identities, Identity, Profile};
pub use model::*;
pub use paths::{display_path, expand_tilde};
pub use registry::Registry;
pub use repo::{DiffTarget, Repo};
pub use ssh_url::validate_ssh_url;

/// A project name doubles as a folder name when cloning, so keep it boring.
pub fn validate_project_name(name: &str) -> Result<()> {
    let bad = name.is_empty()
        || name.chars().count() > 100
        || name == "."
        || name == ".."
        || name.starts_with('.')
        || name.trim() != name
        || name.chars().any(|c| c.is_control() || matches!(c, '/' | '\\'));
    if bad {
        return Err(Error::Invalid(
            "Project names cannot be empty, start with a dot or contain slashes.".into(),
        ));
    }
    Ok(())
}
