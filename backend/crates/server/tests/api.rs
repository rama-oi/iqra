use std::path::Path;
use std::process::Command;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use iqra_server::{Config, build_state, router};
use serde_json::{Value, json};
use tower::ServiceExt;

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git").arg("-C").arg(dir).args(args).output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

struct Env {
    app: Router,
    repo: tempfile::TempDir,
    _data: tempfile::TempDir,
    _clones: tempfile::TempDir,
}

fn env() -> Env {
    let repo = tempfile::tempdir().unwrap();
    let r = repo.path();
    git(r, &["init", "-q", "-b", "main"]);
    for (k, v) in [("user.name", "Tester"), ("user.email", "t@example.com"), ("commit.gpgsign", "false")] {
        git(r, &["config", k, v]);
    }
    std::fs::write(r.join("a.txt"), "one\n").unwrap();
    git(r, &["add", "."]);
    git(r, &["commit", "-q", "-m", "first"]);
    git(r, &["branch", "feature"]);

    let data = tempfile::tempdir().unwrap();
    let clones = tempfile::tempdir().unwrap();
    let config = Config {
        host: "127.0.0.1".into(),
        port: 4747,
        data_dir: Some(data.path().into()),
        clone_dir: Some(clones.path().into()),
        allowed_hosts: vec!["git.lan".into()],
    };
    Env { app: router(build_state(&config).unwrap()), repo, _data: data, _clones: clones }
}

async fn call(app: &Router, method: &str, uri: &str, headers: &[(&str, &str)], body: Option<Value>) -> (StatusCode, header_map::H, Value, String) {
    let mut req = Request::builder().method(method).uri(uri);
    let has_host = headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("host"));
    if !has_host {
        req = req.header("host", "localhost:4747");
    }
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let body = match body {
        Some(v) => {
            req = req.header(header::CONTENT_TYPE, "application/json");
            Body::from(v.to_string())
        }
        None => Body::empty(),
    };
    let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = res.status();
    let h = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let json = serde_json::from_str(&text).unwrap_or(Value::Null);
    (status, h, json, text)
}

mod header_map {
    pub type H = axum::http::HeaderMap;
}

async fn get(app: &Router, uri: &str) -> (StatusCode, Value) {
    let (s, _, j, _) = call(app, "GET", uri, &[], None).await;
    (s, j)
}

async fn open_demo(e: &Env) {
    let path = e.repo.path().to_str().unwrap();
    let (s, _, j, _) = call(&e.app, "POST", "/api/projects/open", &[], Some(json!({ "path": path, "name": "demo" }))).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["project"]["name"], "demo");
    assert_eq!(j["project"]["defaultBranch"], "main");
}

#[tokio::test]
async fn health_and_security_headers() {
    let e = env();
    let (s, h, j, _) = call(&e.app, "GET", "/api/health", &[], None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(j["status"], "ok");
    assert_eq!(h["x-frame-options"], "DENY");
    assert_eq!(h["x-content-type-options"], "nosniff");
}

#[tokio::test]
async fn unknown_hosts_are_refused_known_ones_work() {
    let e = env();
    for host in ["evil.example", "evil.example:4747", "localhost.evil.example"] {
        let (s, _, j, _) = call(&e.app, "GET", "/api/projects", &[("host", host)], None).await;
        assert_eq!(s, StatusCode::FORBIDDEN, "{host}");
        assert!(j["error"].as_str().unwrap().contains("not allowed"));
    }
    for host in ["localhost", "127.0.0.1:4747", "[::1]:4747", "git.lan:4747"] {
        let (s, ..) = call(&e.app, "GET", "/api/projects", &[("host", host)], None).await;
        assert_eq!(s, StatusCode::OK, "{host}");
    }
    // the page itself is protected too, not only the API
    let (s, ..) = call(&e.app, "GET", "/", &[("host", "evil.example")], None).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn writes_must_come_from_our_own_page_and_be_json() {
    let e = env();
    let body = json!({ "url": "git@example.com:a/b.git" });

    for origin in ["https://evil.example", "http://localhost:9999", "null"] {
        let (s, ..) = call(&e.app, "POST", "/api/projects", &[("origin", origin)], Some(body.clone())).await;
        assert_eq!(s, StatusCode::FORBIDDEN, "{origin}");
    }

    // a form post (what a hostile page could send without CORS) is not JSON
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("host", "localhost:4747")
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = e.app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let j: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(j["error"].as_str().unwrap().contains("application/json"));

    // same-origin passes the guard (and then fails on its own merits, not with 403)
    let (s, ..) = call(&e.app, "POST", "/api/projects", &[("origin", "http://localhost:4747")], Some(json!({ "url": "https://x/y.git" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn cloning_refuses_https_and_odd_names() {
    let e = env();
    let (s, _, j, _) = call(&e.app, "POST", "/api/projects", &[], Some(json!({ "url": "https://github.com/a/b.git", "name": "b" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(j["error"].as_str().unwrap().to_lowercase().contains("ssh"), "{j}");

    let (s, ..) = call(&e.app, "POST", "/api/projects", &[], Some(json!({ "url": "git@example.com:a/b.git", "name": "../escape" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn opening_registers_a_project_once() {
    let e = env();
    assert_eq!(get(&e.app, "/api/projects").await.1["projects"], json!([]));
    open_demo(&e).await;

    let (_, j) = get(&e.app, "/api/projects").await;
    assert_eq!(j["projects"][0]["name"], "demo");
    assert!(j["projects"][0]["description"].as_str().unwrap().len() > 3);

    let path = e.repo.path().to_str().unwrap();
    let (s, _, j, _) = call(&e.app, "POST", "/api/projects/open", &[], Some(json!({ "path": path, "name": "demo" }))).await;
    assert_eq!(s, StatusCode::CONFLICT, "{j}");

    let dir = tempfile::tempdir().unwrap();
    let (s, _, j, _) = call(&e.app, "POST", "/api/projects/open", &[], Some(json!({ "path": dir.path(), "name": "plain" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "{j}");
    let (s, ..) = call(&e.app, "POST", "/api/projects/open", &[], Some(json!({ "path": "/no/such/folder" }))).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (s, ..) = call(&e.app, "POST", "/api/projects/open", &[], Some(json!({ "path": "relative/path" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_project_name_is_the_only_way_to_a_folder() {
    let e = env();
    let (s, j) = get(&e.app, "/api/repos/nope/branches").await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert!(j["error"].is_string());
    let (s, _) = get(&e.app, "/api/repos/%2Fetc/status").await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn reads_match_the_shapes_the_frontend_expects() {
    let e = env();
    open_demo(&e).await;

    let (s, j) = get(&e.app, "/api/repos/demo/branches").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(j["branches"], json!([{ "name": "main", "isDefault": true, "isDetached": false }, { "name": "feature", "isDefault": false, "isDetached": false }]));

    let (s, j) = get(&e.app, "/api/repos/demo/commits?limit=10&branch=main").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(j["repository"], "demo");
    assert_eq!(j["currentBranch"], "main");
    assert_eq!(j["nextCursor"], Value::Null);
    let c = &j["commits"][0];
    assert_eq!(c["message"], "first");
    assert_eq!(c["author"]["name"], "Tester");
    assert_eq!(c["shortHash"].as_str().unwrap().len(), 7);
    assert!(c["committedAt"].as_str().unwrap().ends_with('Z'));
    assert_eq!(c["files"], json!([{ "path": "a.txt", "status": "A" }]));
    assert!(c["refs"].as_array().unwrap().iter().any(|r| r["name"] == "main" && r["isHead"] == true && r["type"] == "branch"));

    assert_eq!(get(&e.app, "/api/repos/demo/commits?limit=abc").await.0, StatusCode::BAD_REQUEST);

    let (s, j) = get(&e.app, "/api/repos/demo/stashes").await;
    assert_eq!((s, &j["stashes"]), (StatusCode::OK, &json!([])));
}

#[tokio::test]
async fn status_diff_and_commit_round_trip() {
    let e = env();
    open_demo(&e).await;
    let r = e.repo.path();
    std::fs::write(r.join("a.txt"), "one\ntwo\n").unwrap();
    std::fs::write(r.join("new.txt"), "n\n").unwrap();
    git(r, &["add", "new.txt"]);

    let (_, j) = get(&e.app, "/api/repos/demo/status").await;
    assert_eq!(j["staged"], json!([{ "path": "new.txt", "status": "A" }]));
    assert_eq!(j["unstaged"], json!([{ "path": "a.txt", "status": "M" }]));

    let (s, j) = get(&e.app, "/api/repos/demo/diff?path=a.txt&staged=0").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(j["binary"], false);
    assert!(j["patch"].as_str().unwrap().contains("+two"));
    let (_, j) = get(&e.app, "/api/repos/demo/diff?path=new.txt&staged=1").await;
    assert!(j["patch"].as_str().unwrap().contains("+n"));
    assert_eq!(get(&e.app, "/api/repos/demo/diff").await.0, StatusCode::BAD_REQUEST);

    let (_, j) = get(&e.app, "/api/repos/demo/commits").await;
    let hash = j["commits"][0]["hash"].as_str().unwrap().to_string();
    let (s, j) = get(&e.app, &format!("/api/repos/demo/diff?path=a.txt&commit={hash}")).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["status"], "A");
    assert_eq!(get(&e.app, "/api/repos/demo/diff?path=a.txt&commit=HEAD").await.0, StatusCode::BAD_REQUEST);

    // commit: wrong branch is a conflict, empty message is invalid, then it works
    let url = "/api/repos/demo/commits";
    let (s, _, j, _) = call(&e.app, "POST", url, &[], Some(json!({ "branch": "feature", "message": "x" }))).await;
    assert_eq!(s, StatusCode::CONFLICT, "{j}");
    let (s, ..) = call(&e.app, "POST", url, &[], Some(json!({ "branch": "main", "message": " " }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _, j, _) = call(&e.app, "POST", url, &[], Some(json!({ "branch": "main", "message": "Add new" }))).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["commit"]["message"], "Add new");
    assert_eq!(j["commit"]["files"], json!([{ "path": "new.txt", "status": "A" }]));

    let (_, j) = get(&e.app, "/api/repos/demo/status").await;
    assert_eq!(j["staged"], json!([]));

    // nothing staged any more: git's own explanation comes back
    let (s, _, j, _) = call(&e.app, "POST", url, &[], Some(json!({ "message": "again" }))).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(j["error"].as_str().unwrap().contains("nothing") || j["error"].as_str().unwrap().contains("no changes"), "{j}");
}

#[tokio::test]
async fn serves_the_frontend_and_json_404s_for_the_api() {
    let e = env();
    let (s, h, _, text) = call(&e.app, "GET", "/", &[], None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(h[header::CONTENT_TYPE].to_str().unwrap().starts_with("text/html"));
    assert!(text.contains("pb-app"), "index.html should mount <pb-app>");
    assert_eq!(h[header::CACHE_CONTROL], "no-cache");

    let (s, h, ..) = call(&e.app, "GET", "/js/api/data.js", &[], None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(h[header::CONTENT_TYPE].to_str().unwrap().contains("javascript"));
    let (s, ..) = call(&e.app, "GET", "/package.json", &[], None).await;
    assert_eq!(s, StatusCode::OK);

    assert_eq!(call(&e.app, "GET", "/nope.js", &[], None).await.0, StatusCode::NOT_FOUND);
    let (s, _, j, _) = call(&e.app, "GET", "/api/nope", &[], None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert!(j["error"].is_string());
}

#[tokio::test]
async fn folder_browsing_lists_folders_and_explains_failures() {
    let e = env();
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(tmp.path().join("proj/.git")).unwrap();
    std::fs::create_dir(tmp.path().join("notes")).unwrap();
    std::fs::write(tmp.path().join("file.txt"), "x").unwrap();
    let root = tmp.path().canonicalize().unwrap();

    let uri = format!("/api/fs?path={}", root.display());
    let (s, j) = get(&e.app, &uri).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["path"], root.to_str().unwrap());
    let names: Vec<_> = j["folders"].as_array().unwrap().iter().map(|f| f["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["notes", "proj"]);
    assert_eq!(j["folders"][1]["isRepo"], true);
    assert_eq!(j["folders"][0]["isRepo"], false);
    assert!(j["parent"].is_string());

    assert_eq!(get(&e.app, "/api/fs?path=/no/such/dir").await.0, StatusCode::NOT_FOUND);
    assert_eq!(get(&e.app, "/api/fs?path=relative").await.0, StatusCode::BAD_REQUEST);
    assert_eq!(get(&e.app, &format!("/api/fs?path={}/file.txt", root.display())).await.0, StatusCode::BAD_REQUEST);
    // no path: starts at home
    assert_eq!(get(&e.app, "/api/fs").await.0, StatusCode::OK);
    // like everything else, only for our own host names
    let (s, ..) = call(&e.app, "GET", "/api/fs", &[("host", "evil.example")], None).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

// ---- SSH identities ---------------------------------------------------------------------

/// A real passphrase-less key when ssh-keygen exists (core then checks it with
/// ssh-keygen); otherwise an armored stand-in, which core accepts without it.
fn private_key() -> String {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("k");
    let made = Command::new("ssh-keygen")
        .args(["-q", "-t", "ed25519", "-N", "", "-C", "iqra-test", "-f"])
        .arg(&path)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if made {
        std::fs::read_to_string(&path).unwrap()
    } else {
        "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n".into()
    }
}

async fn upload(app: &Router, name: &str, key: &str, headers: &[(&str, &str)]) -> (StatusCode, Value) {
    let b = "XBOUNDARYX";
    let body = format!(
        "--{b}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\n{name}\r\n\
         --{b}\r\nContent-Disposition: form-data; name=\"key\"; filename=\"id_ed25519\"\r\n\
         Content-Type: application/octet-stream\r\n\r\n{key}\r\n--{b}--\r\n"
    );
    let mut req = Request::builder()
        .method("POST")
        .uri("/api/identities")
        .header("host", "localhost:4747")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={b}"));
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let res = app.clone().oneshot(req.body(Body::from(body)).unwrap()).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[tokio::test]
async fn identities_are_added_activated_and_removed_and_the_key_never_comes_back() {
    let e = env();
    let (s, j) = get(&e.app, "/api/identities").await;
    assert_eq!((s, &j["identities"]), (StatusCode::OK, &json!([])));

    let key = private_key();
    let (s, j) = upload(&e.app, "Work", &key, &[]).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    let first = &j["identities"][0];
    assert_eq!((first["name"].as_str(), first["keyName"].as_str(), first["isActive"].as_bool()), (Some("Work"), Some("id_ed25519"), Some(true)));
    assert!(first["avatarUrl"].is_null());
    let first_id = first["id"].as_str().unwrap().to_string();

    // nothing in any reply contains the private key
    let (_, _, _, text) = call(&e.app, "GET", "/api/identities", &[], None).await;
    assert!(!text.contains("PRIVATE KEY"), "{text}");

    let (s, j) = upload(&e.app, "Personal", &key, &[]).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["identities"].as_array().unwrap().len(), 2);
    assert_eq!(j["identities"][0]["isActive"], true, "adding does not switch identity");
    let second_id = j["identities"][1]["id"].as_str().unwrap().to_string();

    let (s, _, j, _) = call(&e.app, "POST", &format!("/api/identities/{second_id}/activate"), &[], None).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["identities"][1]["isActive"], true);
    assert_eq!(j["identities"][0]["isActive"], false);

    let (s, _, j, _) = call(&e.app, "DELETE", &format!("/api/identities/{second_id}"), &[], None).await;
    assert_eq!(s, StatusCode::OK, "{j}");
    assert_eq!(j["identities"].as_array().unwrap().len(), 1);
    assert_eq!(j["identities"][0]["id"], first_id.as_str());
    assert_eq!(j["identities"][0]["isActive"], true, "the remaining one takes over");

    let (s, _, j, _) = call(&e.app, "DELETE", "/api/identities/id-99", &[], None).await;
    assert_eq!(s, StatusCode::NOT_FOUND, "{j}");
    assert!(j["error"].is_string());
}

#[tokio::test]
async fn bad_uploads_explain_themselves_and_cross_site_ones_are_refused() {
    let e = env();
    let (s, j) = upload(&e.app, "Work", "ssh-ed25519 AAAAC3 me@host", &[]).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(j["error"].as_str().unwrap().contains("public key"), "{j}");

    let (s, j) = upload(&e.app, "Work", "not a key", &[]).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "{j}");

    let key = private_key();
    let (s, j) = upload(&e.app, "  ", &key, &[]).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "{j}");

    // another website cannot add a key on the person's behalf
    let (s, j) = upload(&e.app, "Evil", &key, &[("origin", "https://evil.example")]).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{j}");
    // our own page can
    let (s, j) = upload(&e.app, "Mine", &key, &[("origin", "http://localhost:4747")]).await;
    assert_eq!(s, StatusCode::OK, "{j}");

    // a body that is not multipart gets the API's error shape
    let (s, _, j, _) = call(&e.app, "POST", "/api/identities", &[], Some(json!({}))).await;
    assert!(s.is_client_error(), "{s}");
    assert!(j["error"].is_string());

    // far too big to be a key
    let (s, _) = upload(&e.app, "Big", &"a".repeat(100_000), &[]).await;
    assert!(s.is_client_error(), "{s}");
}

#[tokio::test]
async fn issues_are_an_empty_list_for_a_known_project_only() {
    let e = env();
    open_demo(&e).await;
    let (s, j) = get(&e.app, "/api/repos/demo/issues").await;
    assert_eq!((s, &j["issues"]), (StatusCode::OK, &json!([])));
    assert_eq!(get(&e.app, "/api/repos/nope/issues").await.0, StatusCode::NOT_FOUND);
}
