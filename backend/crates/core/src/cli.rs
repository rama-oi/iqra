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
    let mut text = failure_text(&out.stdout, &out.stderr);
    if text.is_empty() {
        text = "git failed without saying why.".into();
    } else if text.to_ascii_lowercase().contains("bad owner or permissions") {
        let lower = text.to_ascii_lowercase();
        let system = ["/nix/store/", "/etc/", "/usr/"].iter().any(|p| lower.contains(&format!("bad owner or permissions on {p}")));
        text.push_str(if system {
            "\nssh does not trust a system config file. That usually means the service runs in a sandbox where \
             root-owned files look foreign (systemd PrivateUsers= or DynamicUser=): run Iqra as your own user."
        } else {
            "\nssh does not trust that file: it must belong to the user running Iqra, and only that user \
             may write it (chmod 600 for keys and ~/.ssh/config, chmod 700 for ~/.ssh)."
        });
    }
    Err(Error::Git(text))
}

/// How a command that talks to a remote authenticates.
#[derive(Debug, Clone, Copy, Default)]
pub struct Ssh<'a> {
    /// The private key of the active identity.
    pub key: Option<&'a Path>,
    /// A config file (see `write_ssh_config`) that replaces the *system-wide* ssh config,
    /// used only when ssh refuses that system config ("Bad owner or permissions", as
    /// happens in sandboxed services where root-owned files look foreign).
    pub fallback_config: Option<&'a Path>,
}

/// Writes the fallback config into `dir`: it only pulls in the person's own
/// `~/.ssh/config`, so per-host settings survive while `/etc/ssh/ssh_config` is skipped.
pub fn write_ssh_config(dir: &Path) -> Result<std::path::PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("ssh_config");
    std::fs::write(&path, "# written by Iqra: used only when ssh distrusts the system config\nInclude ~/.ssh/config\n")?;
    Ok(path)
}

/// Runs a remote command; if ssh refuses a root-owned system file, runs it once more
/// with the fallback config, which leaves the system config out.
fn run_remote(ssh: Ssh<'_>, mut build: impl FnMut(Ssh<'_>) -> Command) -> Result<()> {
    let plain = Ssh { fallback_config: None, ..ssh };
    match run(build(plain)) {
        Err(Error::Git(text))
            if ssh.fallback_config.is_some()
                && text.to_ascii_lowercase().contains("bad owner or permissions on /") =>
        {
            run(build(ssh))
        }
        other => other,
    }
}

/// Reads the login out of what `ssh -T git@github.com` prints for a key GitHub knows:
/// "Hi <login>! You've successfully authenticated, but GitHub does not provide shell
/// access." Anything else (an unknown key, no network) gives `None`.
fn parse_github_login(output: &str) -> Option<String> {
    let rest = output.lines().find_map(|l| l.trim().strip_prefix("Hi "))?;
    let (login, tail) = rest.split_once('!')?;
    let valid = !login.is_empty()
        && login.len() <= 39
        && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        && tail.contains("successfully authenticated");
    valid.then(|| login.to_string())
}

/// Asks GitHub which account `ssh.key` logs in as. The key must already be added to that
/// account (Settings → SSH keys). Never an error: `None` covers an unregistered key, no
/// network, no ssh. Retries without the system ssh config like `run_remote` does.
pub fn github_login(ssh: Ssh<'_>) -> Option<String> {
    ssh.key?;
    let probe = |ssh: Ssh<'_>| {
        let script = format!("{} -T git@github.com", ssh_command(ssh.key, ssh.fallback_config));
        let out = Command::new("sh").arg("-c").arg(script).stdin(Stdio::null()).output().ok()?;
        Some(format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr)))
    };
    let text = probe(Ssh { fallback_config: None, ..ssh })?;
    if ssh.fallback_config.is_some() && text.to_ascii_lowercase().contains("bad owner or permissions on /") {
        return parse_github_login(&probe(ssh)?);
    }
    parse_github_login(&text)
}

/// Single-quotes a string for the shell that runs `GIT_SSH_COMMAND`.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// The ssh command git should run. With a key, only that key is offered
/// (`IdentitiesOnly`), so the agent's other keys cannot log in as somebody else.
///
/// * `BatchMode`: ssh must never ask a question with nobody to answer, or the request
///   would hang.
/// * `StrictHostKeyChecking=accept-new`: a host seen for the first time is remembered
///   instead of refused (batch mode cannot ask "are you sure?"), but a host whose key
///   *changed* is still refused.
/// * `ConnectTimeout`: an unreachable host fails in seconds, not minutes.
fn ssh_command(key: Option<&Path>, config: Option<&Path>) -> String {
    let mut parts = vec!["ssh".to_string()];
    if let Some(config) = config {
        parts.push("-F".into());
        parts.push(shell_quote(&config.to_string_lossy()));
    }
    if let Some(key) = key {
        parts.push("-i".into());
        parts.push(shell_quote(&key.to_string_lossy()));
        parts.push("-o IdentitiesOnly=yes".into());
    }
    parts.push("-o BatchMode=yes".into());
    parts.push("-o StrictHostKeyChecking=accept-new".into());
    parts.push("-o ConnectTimeout=20".into());
    parts.join(" ")
}

/// Sets up ssh for a command that talks to a remote. A chosen identity (`key`) wins
/// over everything; otherwise any ssh command the person configured is respected, and
/// plain ssh (agent, ~/.ssh/config) is used with the safe options above.
fn ssh_never_prompts(cmd: &mut Command, ssh: Ssh<'_>) {
    let key = ssh.key;
    if key.is_none() {
        if std::env::var_os("GIT_SSH_COMMAND").is_some() || std::env::var_os("GIT_SSH").is_some() {
            return;
        }
        let configured = Command::new("git")
            .args(["config", "--get", "core.sshCommand"])
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);
        if configured {
            return;
        }
    }
    cmd.env("GIT_SSH_COMMAND", ssh_command(key, ssh.fallback_config));
}

fn clone_unchecked(url: &str, dest: &Path, ssh: Ssh<'_>) -> Result<()> {
    run_remote(ssh, |ssh| {
        let mut cmd = Command::new("git");
        cmd.arg("clone").arg("--").arg(url).arg(dest);
        ssh_never_prompts(&mut cmd, ssh);
        cmd
    })
}

/// `git clone` over SSH into `dest`, which must not exist yet. Anything that is not an SSH URL is refused before git sees it.
pub fn clone_ssh(url: &str, dest: &Path, ssh: Ssh<'_>) -> Result<()> {
    validate_ssh_url(url)?;
    if dest.exists() {
        return Err(Error::Conflict(format!("The folder {} already exists.", dest.display())));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    clone_unchecked(url.trim(), dest, ssh)
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
pub fn pull(repo: &Path, ssh: Ssh<'_>) -> Result<()> {
    run_remote(ssh, |ssh| {
        let mut cmd = git_in(repo);
        cmd.args(["pull", "--ff-only"]);
        ssh_never_prompts(&mut cmd, ssh);
        cmd
    })
}

/// Pushes the current branch; the first push of a branch sets its upstream on origin.
pub fn push(repo: &Path, ssh: Ssh<'_>) -> Result<()> {
    let has_upstream = git_in(repo)
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    run_remote(ssh, |ssh| {
        let mut cmd = git_in(repo);
        cmd.arg("push");
        if !has_upstream {
            cmd.args(["--set-upstream", "origin", "HEAD"]);
        }
        ssh_never_prompts(&mut cmd, ssh);
        cmd
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_https_before_running_git() {
        let dir = tempfile::tempdir().unwrap();
        let err = clone_ssh("https://github.com/owner/repo.git", &dir.path().join("x"), Ssh::default()).unwrap_err();
        assert!(matches!(err, Error::Invalid(_)));
        assert!(!dir.path().join("x").exists());
    }

    #[test]
    fn refuses_an_existing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let err = clone_ssh("git@github.com:o/r.git", dir.path(), Ssh::default()).unwrap_err();
        assert!(matches!(err, Error::Conflict(_)));
    }

    #[test]
    fn clone_runs_git_and_reports_its_failure() {
        let dir = tempfile::tempdir().unwrap();
        let err = clone_unchecked("/definitely/not/a/repo", &dir.path().join("x"), Ssh::default()).unwrap_err();
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
        clone_unchecked(src.path().to_str().unwrap(), &target, Ssh::default()).unwrap();
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
        push(&one, Ssh::default()).unwrap(); // sets the upstream
        sh(tmp.path(), &["clone", "-q", remote.to_str().unwrap(), two.to_str().unwrap()]);
        sh(&one, &["commit", "-q", "--allow-empty", "-m", "second"]);
        push(&one, Ssh::default()).unwrap();
        pull(&two, Ssh::default()).unwrap();
        assert_eq!(sh(&two, &["log", "--format=%s", "-1"]), "second");
    }

    #[test]
    fn ssh_command_offers_only_the_chosen_key_and_never_prompts() {
        let plain = ssh_command(None, None);
        assert!(plain.contains("BatchMode=yes") && plain.contains("accept-new") && !plain.contains("-i "));

        let with_key = ssh_command(Some(Path::new("/data/keys/id-1")), None);
        assert!(with_key.starts_with("ssh -i '/data/keys/id-1' -o IdentitiesOnly=yes"), "{with_key}");
        assert!(with_key.contains("BatchMode=yes"));
    }

    #[test]
    fn a_key_path_cannot_break_out_of_its_quotes() {
        assert_eq!(shell_quote("/a b/it's"), r#"'/a b/it'\''s'"#);
        let cmd = ssh_command(Some(Path::new("/x'; touch /tmp/pwned; '")), None);
        // run it through a real shell: ssh is replaced by echo, so we see the argv
        let out = Command::new("sh").arg("-c").arg(cmd.replacen("ssh", "printf '%s\\n'", 1)).output().unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        assert!(text.contains("/x'; touch /tmp/pwned; '"), "{text}");
        assert!(!Path::new("/tmp/pwned").exists());
    }

    #[test]
    fn the_chosen_key_reaches_git_as_ssh_command() {
        let mut cmd = Command::new("git");
        ssh_never_prompts(&mut cmd, Ssh { key: Some(Path::new("/k")), fallback_config: None });
        let env: Vec<_> = cmd.get_envs().collect();
        let (_, v) = env.iter().find(|(k, _)| *k == "GIT_SSH_COMMAND").unwrap();
        assert!(v.unwrap().to_string_lossy().contains("-i '/k'"));
    }

    #[test]
    fn a_distrusted_system_config_is_retried_without_it() {
        let cfg = Path::new("/data/ssh_config");
        // "ssh" that fails exactly as the real one does until it is given -F
        let build = |ssh: Ssh<'_>| {
            let mut c = Command::new("sh");
            let script = if ssh.fallback_config.is_some() {
                "exit 0"
            } else {
                "echo 'Bad owner or permissions on /nix/store/x/ssh_config.d/20.conf' >&2; exit 1"
            };
            c.args(["-c", script]);
            c
        };
        let with = Ssh { key: None, fallback_config: Some(cfg) };
        assert!(run_remote(with, build).is_ok());
        // without a fallback config there is nothing to retry with: the error surfaces, with the right hint
        let err = run_remote(Ssh::default(), build).unwrap_err().to_string();
        assert!(err.contains("Bad owner") && err.contains("PrivateUsers"), "{err}");
    }

    #[test]
    fn other_failures_are_not_retried() {
        let mut calls = 0;
        let r = run_remote(Ssh { key: None, fallback_config: Some(Path::new("/c")) }, |_| {
            calls += 1;
            let mut c = Command::new("sh");
            c.args(["-c", "echo 'Permission denied (publickey).' >&2; exit 1"]);
            c
        });
        assert!(r.is_err());
        assert_eq!(calls, 1);
    }

    #[test]
    fn fallback_config_includes_the_users_own_config_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_ssh_config(dir.path()).unwrap();
        assert!(std::fs::read_to_string(&path).unwrap().contains("Include ~/.ssh/config"));
        assert!(ssh_command(None, Some(&path)).starts_with("ssh -F '"));
    }

    #[test]
    fn github_login_is_read_from_the_ssh_greeting() {
        let ok = "Warning: Permanently added 'github.com' to the list of known hosts.\nHi octo-cat! You've successfully authenticated, but GitHub does not provide shell access.\n";
        assert_eq!(parse_github_login(ok).as_deref(), Some("octo-cat"));
        for bad in [
            "git@github.com: Permission denied (publickey).",
            "Hi there! How are you?",
            "Hi ! You've successfully authenticated",
            "Hi a/b! You've successfully authenticated",
            "",
        ] {
            assert_eq!(parse_github_login(bad), None, "{bad}");
        }
    }

    #[test]
    fn no_key_means_no_lookup() {
        assert_eq!(github_login(Ssh::default()), None);
    }
}
