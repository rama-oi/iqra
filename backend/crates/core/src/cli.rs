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

/// Moves HEAD: to the branch `target`, or with `detach` to the commit `target` (a
/// hash), which leaves HEAD detached. Git itself refuses when uncommitted changes
/// would be overwritten, and its message says which files.
pub fn checkout(repo: &Path, target: &str, detach: bool) -> Result<()> {
    let target = target.trim();
    let hex = target.len() >= 7 && target.len() <= 64 && target.chars().all(|c| c.is_ascii_hexdigit());
    if detach && !hex {
        return Err(Error::Invalid("That is not a commit hash.".into()));
    }
    // a leading dash would be read by git as an option
    if target.is_empty() || target.starts_with('-') || target.chars().any(|c| c.is_control()) {
        return Err(Error::Invalid("That is not a branch name.".into()));
    }
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).arg("checkout");
    if detach {
        cmd.arg("--detach");
    }
    cmd.arg::<&OsStr>(target.as_ref()).arg("--");
    run(cmd)
}

/// A path from the browser goes to git after `--`, as a literal name (no globbing).
fn check_paths(paths: &[String]) -> Result<()> {
    if paths.is_empty() || paths.iter().any(|p| p.is_empty() || p.contains('\0')) {
        return Err(Error::Invalid("Choose at least one file.".into()));
    }
    Ok(())
}

fn git_in(repo: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.arg("--literal-pathspecs").arg("-C").arg(repo);
    cmd
}

/// Adds the files to the index; a deleted file is staged as a deletion.
pub fn stage(repo: &Path, paths: &[String]) -> Result<()> {
    check_paths(paths)?;
    let mut cmd = git_in(repo);
    cmd.args(["add", "-A", "--"]).args(paths);
    run(cmd)
}

/// Takes the files out of the index again; their changes stay in the folder.
pub fn unstage(repo: &Path, paths: &[String]) -> Result<()> {
    check_paths(paths)?;
    let mut cmd = git_in(repo);
    cmd.args(["reset", "-q", "--"]).args(paths);
    run(cmd)
}

/// Sets the changes aside (new files too) and leaves a clean folder.
pub fn stash_push(repo: &Path, message: &str) -> Result<()> {
    // no --literal-pathspecs here: git passes it on to its own helpers, and the stash
    // then misses untracked files whose names look like patterns
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(["stash", "push", "--include-untracked"]);
    let message = message.trim();
    if !message.is_empty() {
        cmd.arg("-m").arg::<&OsStr>(message.as_ref());
    }
    run(cmd)
}

/// Brings the newest stash back and drops it. When it conflicts git keeps the stash
/// and says which files, so nothing is lost.
pub fn stash_pop(repo: &Path) -> Result<()> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(["stash", "pop"]);
    run(cmd)
}

/// Fetches and fast-forwards the current branch. It never merges or rebases by
/// itself: when the branches diverged, git's message says so.
pub fn pull(repo: &Path) -> Result<()> {
    let mut cmd = git_in(repo);
    cmd.args(["pull", "--ff-only"]);
    ssh_never_prompts(&mut cmd);
    run(cmd)
}

/// Pushes the current branch; the first push of a branch sets its upstream on origin.
pub fn push(repo: &Path) -> Result<()> {
    let has_upstream = git_in(repo)
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let mut cmd = git_in(repo);
    cmd.arg("push");
    if !has_upstream {
        cmd.args(["--set-upstream", "origin", "HEAD"]);
    }
    ssh_never_prompts(&mut cmd);
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

    #[test]
    fn checkout_refuses_what_git_would_read_as_an_option() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["", "--orphan", "-b"] {
            let err = checkout(dir.path(), bad, false).unwrap_err();
            assert!(matches!(err, Error::Invalid(_)), "{bad}");
        }
        let err = checkout(dir.path(), "main", true).unwrap_err();
        assert!(matches!(err, Error::Invalid(_)));
    }

    #[test]
    fn checkout_switches_branch_and_detaches_at_a_commit() {
        let dir = tempfile::tempdir().unwrap();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(dir.path())
                .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["commit", "-q", "--allow-empty", "-m", "one"]);
        let first = git(&["rev-parse", "HEAD"]);
        git(&["commit", "-q", "--allow-empty", "-m", "two"]);
        git(&["branch", "other"]);

        checkout(dir.path(), "other", false).unwrap();
        assert_eq!(git(&["rev-parse", "--abbrev-ref", "HEAD"]), "other");

        checkout(dir.path(), &first, true).unwrap();
        assert_eq!(git(&["rev-parse", "HEAD"]), first);
        assert_eq!(git(&["rev-parse", "--abbrev-ref", "HEAD"]), "HEAD");

        let err = checkout(dir.path(), "missing", false).unwrap_err();
        assert!(matches!(err, Error::Git(_)));
    }

    #[test]
    fn stage_and_unstage_need_files() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(stage(dir.path(), &[]).unwrap_err(), Error::Invalid(_)));
        assert!(matches!(unstage(dir.path(), &["".into()]).unwrap_err(), Error::Invalid(_)));
    }

    #[test]
    fn stage_stash_and_pop_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(dir.path())
                .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        git(&["init", "-q", "-b", "main"]);
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        git(&["add", "a.txt"]);
        git(&["commit", "-q", "-m", "one"]);

        std::fs::write(dir.path().join("a.txt"), "two\n").unwrap();
        std::fs::write(dir.path().join("b[1].txt"), "new\n").unwrap();

        stage(dir.path(), &["b[1].txt".into()]).unwrap(); // a literal name, not a pattern
        assert_eq!(git(&["diff", "--cached", "--name-only"]), "b[1].txt");
        unstage(dir.path(), &["b[1].txt".into()]).unwrap();
        assert_eq!(git(&["diff", "--cached", "--name-only"]), "");

        stash_push(dir.path(), "wip").unwrap();
        assert_eq!(git(&["status", "--porcelain"]), "");
        assert!(git(&["stash", "list"]).contains("wip"));

        stash_pop(dir.path()).unwrap();
        assert_eq!(std::fs::read_to_string(dir.path().join("a.txt")).unwrap(), "two\n");
        assert!(dir.path().join("b[1].txt").exists());
        assert_eq!(git(&["stash", "list"]), "");
    }

    #[test]
    fn push_and_pull_against_a_local_remote() {
        let tmp = tempfile::tempdir().unwrap();
        let sh = |dir: &Path, args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(dir)
                .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        let remote = tmp.path().join("remote.git");
        let one = tmp.path().join("one");
        let two = tmp.path().join("two");
        std::fs::create_dir_all(&remote).unwrap();
        sh(&remote, &["init", "-q", "--bare", "-b", "main"]);
        std::fs::create_dir_all(&one).unwrap();
        sh(&one, &["init", "-q", "-b", "main"]);
        sh(&one, &["remote", "add", "origin", remote.to_str().unwrap()]);
        sh(&one, &["commit", "-q", "--allow-empty", "-m", "first"]);
        push(&one).unwrap(); // sets the upstream
        sh(tmp.path(), &["clone", "-q", remote.to_str().unwrap(), two.to_str().unwrap()]);
        sh(&one, &["commit", "-q", "--allow-empty", "-m", "second"]);
        push(&one).unwrap();
        pull(&two).unwrap();
        assert_eq!(sh(&two, &["log", "--format=%s", "-1"]), "second");
    }
}
