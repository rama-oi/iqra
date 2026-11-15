//! Writes that go through the `git` binary, so hooks, commit signing and the
//! person's SSH setup (agent, ~/.ssh/config, known hosts) work as in a terminal.

use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};

use crate::{Error, Result, validate_ssh_url};

/// The last lines of what git printed, which is where it says what went wrong.
fn failure_text(stdout: &[u8], stderr: &[u8]) -> String {
    let text = format!("{}\n{}", String::from_utf8_lossy(stdout), String::from_utf8_lossy(stderr));
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let tail = &lines[lines.len().saturating_sub(6)..];
    let joined = tail.join("\n");
    match joined.char_indices().nth(800) {
        Some((cut, _)) => format!("{}…", &joined[..cut]),
        None => joined,
    }
}

fn run(mut cmd: Command) -> Result<()> {
    // Never wait for a person: there is nobody at this terminal.
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .stdin(Stdio::null());
    let out = cmd.output().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => {
            Error::Git("The `git` command was not found. Install git and make it available to the service.".into())
        }
        _ => e.into(),
    })?;
    if out.status.success() {
        return Ok(());
    }
    let text = failure_text(&out.stdout, &out.stderr);
    Err(Error::Git(if text.is_empty() { "git failed without saying why.".into() } else { text }))
}

/// ssh must never ask a question (host key, passphrase) with nobody to answer, or
/// the request would hang. Respect any ssh command the person configured.
fn ssh_never_prompts(cmd: &mut Command) {
    if std::env::var_os("GIT_SSH_COMMAND").is_some() || std::env::var_os("GIT_SSH").is_some() {
        return;
    }
    let configured = Command::new("git")
        .args(["config", "--get", "core.sshCommand"])
        .output()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);
    if !configured {
        cmd.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    }
}

fn clone_unchecked(url: &str, dest: &Path) -> Result<()> {
    let mut cmd = Command::new("git");
    cmd.arg("clone").arg("--").arg(url).arg(dest);
    ssh_never_prompts(&mut cmd);
    run(cmd)
}

/// `git clone` over SSH into `dest`, which must not exist yet. Anything that is not
/// an SSH URL is refused before git sees it.
pub fn clone_ssh(url: &str, dest: &Path) -> Result<()> {
    validate_ssh_url(url)?;
    if dest.exists() {
        return Err(Error::Conflict(format!("The folder {} already exists.", dest.display())));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    clone_unchecked(url.trim(), dest)
}

/// Commits what is staged, or with `amend` folds it into the last commit. An empty
/// message is only allowed when amending: the old message is kept.
pub fn commit(repo: &Path, message: &str, amend: bool) -> Result<()> {
    let message = message.trim();
    if message.is_empty() && !amend {
        return Err(Error::Invalid("A commit message is required.".into()));
    }
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).arg("commit");
    if amend {
        cmd.arg("--amend");
    }
    if message.is_empty() {
        cmd.arg("--no-edit");
    } else {
        cmd.arg("-m").arg::<&OsStr>(message.as_ref());
    }
    run(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_https_before_running_git() {
        let dir = tempfile::tempdir().unwrap();
        let err = clone_ssh("https://github.com/owner/repo.git", &dir.path().join("x")).unwrap_err();
        assert!(matches!(err, Error::Invalid(_)));
        assert!(!dir.path().join("x").exists());
    }

    #[test]
    fn refuses_an_existing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let err = clone_ssh("git@github.com:o/r.git", dir.path()).unwrap_err();
        assert!(matches!(err, Error::Conflict(_)));
    }

    #[test]
    fn clone_runs_git_and_reports_its_failure() {
        let dir = tempfile::tempdir().unwrap();
        let err = clone_unchecked("/definitely/not/a/repo", &dir.path().join("x")).unwrap_err();
        match err {
            Error::Git(text) => assert!(text.to_lowercase().contains("does not exist") || text.contains("fatal"), "{text}"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn clone_unchecked_copies_a_local_repository() {
        let src = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(src.path()).unwrap();
        let sig = git2::Signature::now("T", "t@example.com").unwrap();
        let tree = repo.find_tree(repo.index().unwrap().write_tree_to(&repo).unwrap()).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();

        let dest = tempfile::tempdir().unwrap();
        let target = dest.path().join("copy");
        clone_unchecked(src.path().to_str().unwrap(), &target).unwrap();
        assert!(target.join(".git").exists());
    }

    #[test]
    fn long_output_is_cut_to_the_tail() {
        let long = (0..20).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let text = failure_text(b"", long.as_bytes());
        assert!(text.starts_with("line 14") && text.ends_with("line 19"), "{text}");
    }
}
