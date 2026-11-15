//! Runs the core against real repositories made in temporary folders.

use std::fs;
use std::path::Path;

use git2::{Oid, Repository, Signature, Time};
use iqra_core::{DiffTarget, Error, RefKind, Repo, commit};
use tempfile::TempDir;

const T0: i64 = 1_794_594_600; // 2026-11-13T18:30:00Z

fn sig(offset: i64) -> Signature<'static> {
    Signature::new("Fikret", "fikret@example.com", &Time::new(T0 + offset, 0)).unwrap()
}

/// A commit whose whole tree is `files`, made without touching the working folder.
fn commit_tree(repo: &Repository, update_ref: &str, parents: &[Oid], files: &[(&str, &[u8])], message: &str, offset: i64) -> Oid {
    let mut builder = repo.treebuilder(None).unwrap();
    for (name, content) in files {
        let blob = repo.blob(content).unwrap();
        builder.insert(name, blob, 0o100644).unwrap();
    }
    let tree = repo.find_tree(builder.write().unwrap()).unwrap();
    let parents: Vec<_> = parents.iter().map(|p| repo.find_commit(*p).unwrap()).collect();
    let parents: Vec<_> = parents.iter().collect();
    let s = sig(offset);
    repo.commit(Some(update_ref), &s, &s, message, &tree, &parents).unwrap()
}

struct Fixture {
    dir: TempDir,
    git: Repository,
    c1: Oid,
    c2: Oid,
    c3: Oid,
}

/// main: c1 -> c2 (HEAD), feature: c1 -> c3, tag v1 on c1. Working folder is clean.
fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let mut opts = git2::RepositoryInitOptions::new();
    opts.initial_head("main");
    let git = Repository::init_opts(dir.path(), &opts).unwrap();
    git.config().unwrap().set_bool("commit.gpgsign", false).unwrap();

    let c1 = commit_tree(&git, "refs/heads/main", &[], &[("a.txt", b"one\n")], "first", 0);
    let c2 = commit_tree(
        &git,
        "refs/heads/main",
        &[c1],
        &[("a.txt", b"one\ntwo\n"), ("b.txt", b"b\n")],
        "second\n\nWith a body.",
        1000,
    );
    let c3 = commit_tree(&git, "refs/heads/feature", &[c1], &[("a.txt", b"one\n"), ("c.txt", b"c\n")], "third", 2000);
    git.reference("refs/tags/v1", c1, false, "tag").unwrap();
    git.checkout_head(Some(git2::build::CheckoutBuilder::new().force())).unwrap();
    Fixture { dir, git, c1, c2, c3 }
}

fn open(f: &Fixture) -> Repo {
    Repo::open("demo", f.dir.path()).unwrap()
}

fn stage(git: &Repository, path: &str) {
    let mut index = git.index().unwrap();
    index.add_path(Path::new(path)).unwrap();
    index.write().unwrap();
}

#[test]
fn opening_something_that_is_not_a_repository_explains_itself() {
    let dir = tempfile::tempdir().unwrap();
    match Repo::open("x", dir.path()) {
        Err(Error::Invalid(m)) => assert!(m.contains("not a git repository"), "{m}"),
        _ => panic!("expected an Invalid error"),
    }
}

#[test]
fn project_and_branches_put_the_current_branch_first() {
    let f = fixture();
    let repo = open(&f);
    let project = repo.project();
    assert_eq!(project.name, "demo");
    assert_eq!(project.default_branch, "main");

    let branches = repo.branches().unwrap();
    let names: Vec<_> = branches.iter().map(|b| (b.name.as_str(), b.is_default)).collect();
    assert_eq!(names, [("main", true), ("feature", false)]);
}

#[test]
fn a_repository_without_commits_still_has_its_branch() {
    let dir = tempfile::tempdir().unwrap();
    let mut opts = git2::RepositoryInitOptions::new();
    opts.initial_head("trunk");
    Repository::init_opts(dir.path(), &opts).unwrap();
    let repo = Repo::open("empty", dir.path()).unwrap();

    assert_eq!(repo.project().default_branch, "trunk");
    assert_eq!(repo.branches().unwrap().len(), 1);
    let page = repo.commits(50, None).unwrap();
    assert!(page.commits.is_empty() && page.next_cursor.is_none());
    assert!(repo.status().unwrap().staged.is_empty());
}

#[test]
fn commits_come_children_first_with_refs_parents_and_files() {
    let f = fixture();
    let page = open(&f).commits(50, None).unwrap();

    assert_eq!(page.repository, "demo");
    assert_eq!(page.current_branch.as_deref(), Some("main"));
    assert_eq!(page.next_cursor, None);

    // newest first, and every commit before its parents
    let hashes: Vec<_> = page.commits.iter().map(|c| c.hash.clone()).collect();
    assert_eq!(hashes, [f.c3.to_string(), f.c2.to_string(), f.c1.to_string()]);

    let [third, second, first] = &page.commits[..] else { panic!() };
    assert_eq!(second.parents, [f.c1.to_string()]);
    assert!(first.parents.is_empty());
    assert_eq!(second.short_hash, &f.c2.to_string()[..7]);
    assert_eq!(second.committed_at, "2026-11-13T18:46:40Z");
    assert_eq!(second.author.name, "Fikret");
    assert_eq!(second.author.avatar_url, None);
    assert_eq!(second.message, "second\n\nWith a body.");

    // refs: the current branch is marked, tags and other branches show up on their commits
    assert_eq!((second.refs[0].name.as_str(), second.refs[0].kind, second.refs[0].is_head), ("main", RefKind::Branch, true));
    assert_eq!((third.refs[0].name.as_str(), third.refs[0].is_head), ("feature", false));
    assert_eq!((first.refs[0].name.as_str(), first.refs[0].kind), ("v1", RefKind::Tag));

    // files against the first parent
    let pairs = |c: &iqra_core::Commit| c.files.iter().map(|f| format!("{}{}", f.status, f.path)).collect::<Vec<_>>();
    assert_eq!(pairs(first), ["Aa.txt"]);
    assert_eq!(pairs(second), ["Ma.txt", "Ab.txt"]);
    assert_eq!(pairs(third), ["Ac.txt"]);
}

#[test]
fn history_is_paged_with_a_cursor() {
    let f = fixture();
    let repo = open(&f);

    let first = repo.commits(2, None).unwrap();
    assert_eq!(first.commits.len(), 2);
    assert_eq!(first.next_cursor.as_deref(), Some("2"));

    let second = repo.commits(2, first.next_cursor.as_deref()).unwrap();
    assert_eq!(second.commits.len(), 1);
    assert_eq!(second.commits[0].hash, f.c1.to_string());
    assert_eq!(second.next_cursor, None);

    assert!(matches!(repo.commits(2, Some("abc")), Err(Error::Invalid(_))));
}

#[test]
fn remote_branches_are_listed_and_origin_head_is_not() {
    let f = fixture();
    f.git.reference("refs/remotes/origin/main", f.c2, false, "x").unwrap();
    f.git.reference_symbolic("refs/remotes/origin/HEAD", "refs/remotes/origin/main", false, "x").unwrap();

    let page = open(&f).commits(50, None).unwrap();
    let second = page.commits.iter().find(|c| c.hash == f.c2.to_string()).unwrap();
    let names: Vec<_> = second.refs.iter().map(|r| (r.name.as_str(), r.kind)).collect();
    assert_eq!(names, [("main", RefKind::Branch), ("origin/main", RefKind::Remote)]);
}

#[test]
fn status_splits_staged_and_unstaged_work() {
    let f = fixture();
    let root = f.dir.path();

    fs::write(root.join("a.txt"), "one\ntwo\nthree\n").unwrap(); // modified ...
    stage(&f.git, "a.txt"); // ... and staged ...
    fs::write(root.join("a.txt"), "one\ntwo\nthree\nfour\n").unwrap(); // ... then modified again
    fs::write(root.join("n.txt"), "new\n").unwrap();
    stage(&f.git, "n.txt"); // new and staged
    fs::remove_file(root.join("b.txt")).unwrap(); // deleted, not staged
    fs::create_dir(root.join("dir")).unwrap();
    fs::write(root.join("dir/u.txt"), "untracked\n").unwrap(); // untracked

    let status = open(&f).status().unwrap();
    let list = |files: &[iqra_core::FileChange]| files.iter().map(|f| format!("{}{}", f.status, f.path)).collect::<Vec<_>>();
    assert_eq!(list(&status.staged), ["Ma.txt", "An.txt"]);
    assert_eq!(list(&status.unstaged), ["Ma.txt", "Db.txt", "Adir/u.txt"]);
}

#[test]
fn diffs_are_unified_patches_for_each_target() {
    let f = fixture();
    let root = f.dir.path();
    fs::write(root.join("a.txt"), "one\ntwo\nthree\n").unwrap();
    stage(&f.git, "a.txt");
    fs::write(root.join("a.txt"), "one\ntwo\nthree\nfour\n").unwrap();
    fs::write(root.join("u.txt"), "untracked\n").unwrap();
    let repo = open(&f);

    let staged = repo.diff("a.txt", &DiffTarget::Staged).unwrap();
    assert!(staged.patch.starts_with("diff --git a/a.txt b/a.txt"), "{}", staged.patch);
    assert!(staged.patch.contains("\n+three\n") && !staged.patch.contains("four"));
    assert_eq!((staged.status.as_str(), staged.binary, staged.truncated), ("M", false, false));

    let unstaged = repo.diff("a.txt", &DiffTarget::Unstaged).unwrap();
    assert!(unstaged.patch.contains("\n+four\n") && !unstaged.patch.contains("+three"));

    // a file git does not track yet shows up as all-added
    let untracked = repo.diff("u.txt", &DiffTarget::Unstaged).unwrap();
    assert_eq!(untracked.status, "A");
    assert!(untracked.patch.contains("\n+untracked\n"), "{}", untracked.patch);

    // a commit against its parent, by full or abbreviated hash
    let full = f.c2.to_string();
    for rev in [full.as_str(), &full[..8]] {
        let d = repo.diff("b.txt", &DiffTarget::Commit(rev.to_string())).unwrap();
        assert_eq!(d.status, "A");
        assert!(d.patch.contains("\n+b\n"));
    }
    let d = repo.diff("a.txt", &DiffTarget::Commit(full)).unwrap();
    assert!(d.patch.contains("\n one\n") && d.patch.contains("\n+two\n"), "{}", d.patch);
}

#[test]
fn the_path_is_a_file_name_not_a_pattern() {
    let f = fixture();
    fs::write(f.dir.path().join("a.txt"), "changed\n").unwrap();
    let d = open(&f).diff("*.txt", &DiffTarget::Unstaged).unwrap();
    assert!(d.patch.is_empty());
}

#[test]
fn commit_diffs_only_accept_hashes() {
    let f = fixture();
    let repo = open(&f);
    for rev in ["HEAD", "HEAD~1", "main", "abc", "zzzzzzzz", "a.txt:b"] {
        let err = repo.diff("a.txt", &DiffTarget::Commit(rev.into())).unwrap_err();
        assert!(matches!(err, Error::Invalid(_)), "{rev}: {err:?}");
    }
    let err = repo.diff("a.txt", &DiffTarget::Commit("deadbeef".into())).unwrap_err();
    assert!(matches!(err, Error::NotFound(_)));
}

#[test]
fn binary_files_have_no_patch() {
    let f = fixture();
    let bin = commit_tree(&f.git, "refs/heads/main", &[f.c2], &[("a.txt", b"x"), ("img.bin", &[0, 1, 2, 0, 255, 0])], "binary", 3000);
    let d = open(&f).diff("img.bin", &DiffTarget::Commit(bin.to_string())).unwrap();
    assert!(d.binary && d.patch.is_empty());
}

#[test]
fn stashes_list_newest_first_with_branch_and_message() {
    let f = fixture();
    let mut git = Repository::open(f.dir.path()).unwrap();
    let root = f.dir.path();
    let s = sig(5000);

    fs::write(root.join("a.txt"), "stash me\n").unwrap();
    git.stash_save2(&s, Some("my work"), None).unwrap();
    fs::write(root.join("a.txt"), "and me\n").unwrap();
    git.stash_save2(&s, None, None).unwrap(); // git's own "WIP on main: <hash> <subject>"

    let stashes = open(&f).stashes_via_new_handle();
    assert_eq!(stashes.len(), 2);
    assert_eq!((stashes[0].id.as_str(), stashes[0].branch.as_str()), ("stash@{0}", "main"));
    assert_eq!(stashes[0].message, "second\n\nWith a body.".lines().next().unwrap());
    assert_eq!((stashes[1].id.as_str(), stashes[1].message.as_str()), ("stash@{1}", "my work"));
    assert_eq!(stashes[1].created_at, "2026-11-13T19:53:20Z");
}

// `stashes` needs `&mut`; this keeps the test above readable.
trait StashHelper {
    fn stashes_via_new_handle(self) -> Vec<iqra_core::Stash>;
}
impl StashHelper for Repo {
    fn stashes_via_new_handle(mut self) -> Vec<iqra_core::Stash> {
        self.stashes().unwrap()
    }
}

#[test]
fn committing_uses_the_git_binary_and_can_amend() {
    let f = fixture();
    let root = f.dir.path();
    let mut cfg = f.git.config().unwrap();
    cfg.set_str("user.name", "Tester").unwrap();
    cfg.set_str("user.email", "tester@example.com").unwrap();

    // nothing to commit, and no message: both are explained
    assert!(matches!(commit(root, "  ", false), Err(Error::Invalid(_))));
    match commit(root, "nothing", false) {
        Err(Error::Git(text)) => assert!(text.contains("nothing to commit"), "{text}"),
        other => panic!("{other:?}"),
    }

    fs::write(root.join("f.txt"), "f\n").unwrap();
    stage(&f.git, "f.txt");
    commit(root, "Add f", false).unwrap();
    let head = open(&f).head_commit().unwrap();
    assert_eq!(head.message, "Add f");
    assert_eq!(head.parents, [f.c2.to_string()]);
    assert_eq!(head.author.name, "Tester");
    assert_eq!(head.refs[0].name, "main");

    // amend: new files fold into the same commit, an empty message keeps the old one
    fs::write(root.join("g.txt"), "g\n").unwrap();
    stage(&f.git, "g.txt");
    commit(root, "", true).unwrap();
    let amended = open(&f).head_commit().unwrap();
    assert_ne!(amended.hash, head.hash);
    assert_eq!(amended.message, "Add f");
    assert_eq!(amended.parents, head.parents);
    assert_eq!(amended.files.len(), 2);

    commit(root, "Better message", true).unwrap();
    assert_eq!(open(&f).head_commit().unwrap().message, "Better message");
}
