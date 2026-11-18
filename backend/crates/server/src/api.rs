//! The endpoints the frontend's api/*.js files call. Git work runs on blocking threads
//! so a slow clone or a big history never stalls other requests.

use std::sync::Arc;

use axum::extract::multipart::MultipartRejection;
use axum::extract::{DefaultBodyLimit, Multipart, Path, State};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use iqra_core::{
    DiffTarget, Project, Repo, display_path, expand_tilde, validate_project_name, validate_ssh_url,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::{ApiError, ApiJson, ApiQuery};

type Shared = State<Arc<AppState>>;
type Reply = Result<Json<Value>, ApiError>;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/projects", get(list_projects).post(clone_project))
        .route("/projects/open", post(open_project))
        .route("/fs", get(browse))
        .route("/identities", get(list_identities).post(add_identity).layer(DefaultBodyLimit::max(64 * 1024)))
        .route("/identities/{id}/activate", post(activate_identity))
        .route("/identities/{id}", delete(remove_identity))
        .route("/repos/{repo}/issues", get(issues))
        .route("/repos/{repo}/branches", get(branches))
        .route("/repos/{repo}/remote-branches", get(remote_branches))
        .route("/repos/{repo}/stage", post(stage))
        .route("/repos/{repo}/unstage", post(unstage))
        .route("/repos/{repo}/push", post(push))
        .route("/repos/{repo}/pull", post(pull))
        .route("/repos/{repo}/stashes/push", post(stash_push))
        .route("/repos/{repo}/stashes/pop", post(stash_pop))
        .route("/repos/{repo}/commits", get(commits).post(commit))
        .route("/repos/{repo}/checkout", post(checkout))
        .route("/repos/{repo}/status", get(status))
        .route("/repos/{repo}/diff", get(diff))
        .route("/repos/{repo}/stashes", get(stashes))
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> iqra_core::Result<T> + Send + 'static,
) -> Result<T, ApiError> {
    match tokio::task::spawn_blocking(work).await {
        Ok(result) => result.map_err(ApiError::from),
        Err(e) => {
            tracing::error!("git task failed: {e}");
            Err(ApiError::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, "The git task crashed."))
        }
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "name": "iqra", "version": env!("CARGO_PKG_VERSION") }))
}

// ---- projects ---------------------------------------------------------------------

async fn list_projects(State(state): Shared) -> Reply {
    let entries: Vec<_> = {
        let registry = state.registry.lock().unwrap_or_else(|e| e.into_inner());
        registry.list().to_vec()
    };
    let projects = blocking(move || {
        Ok(entries
            .into_iter()
            .map(|e| match Repo::open(&e.name, &e.path) {
                Ok(repo) => repo.project(),
                // folder moved or deleted: still listed, so the person can see what is wrong
                Err(_) => Project {
                    name: e.name,
                    description: display_path(&e.path),
                    default_branch: "main".into(),
                },
            })
            .collect::<Vec<_>>())
    })
    .await?;
    Ok(Json(json!({ "projects": projects })))
}

#[derive(Deserialize)]
struct CloneBody {
    url: String,
    #[serde(default)]
    name: String,
}

/// `git@host:team/game.git` or `ssh://host/team/game.git` -> `game`
fn name_from_url(url: &str) -> String {
    let last = url.trim().trim_end_matches('/').rsplit(['/', ':']).next().unwrap_or("");
    last.strip_suffix(".git").unwrap_or(last).to_string()
}

async fn clone_project(State(state): Shared, ApiJson(body): ApiJson<CloneBody>) -> Reply {
    validate_ssh_url(&body.url)?;
    let name = if body.name.trim().is_empty() { name_from_url(&body.url) } else { body.name.trim().to_string() };
    validate_project_name(&name)?;
    let dest = state.clone_dir.join(&name);
    {
        let registry = state.registry.lock().unwrap_or_else(|e| e.into_inner());
        registry.check_free(&name, &dest)?;
    }
    let url = body.url.clone();
    let key = active_key(&state);
    let state2 = state.clone();
    let project = {
        let dest = dest.clone();
        let name = name.clone();
        blocking(move || {
            iqra_core::clone_ssh(&url, &dest, ssh_of(&key, &state2))?;
            Ok(Repo::open(&name, &dest)?.project())
        })
        .await?
    };
    let mut registry = state.registry.lock().unwrap_or_else(|e| e.into_inner());
    registry.add(&name, dest)?;
    Ok(Json(json!({ "project": project })))
}

#[derive(Deserialize)]
struct OpenBody {
    path: String,
    #[serde(default)]
    name: String,
}

async fn open_project(State(state): Shared, ApiJson(body): ApiJson<OpenBody>) -> Reply {
    let path = expand_tilde(body.path.trim());
    if !path.is_absolute() {
        return Err(ApiError::invalid("Give the full path of the folder, e.g. ~/Projects/game."));
    }
    let name_hint = body.name.trim().to_string();
    let (name, path, project) = blocking(move || {
        let path = path.canonicalize().map_err(|_| {
            iqra_core::Error::NotFound(format!("The folder {} does not exist.", path.display()))
        })?;
        let name = if name_hint.is_empty() {
            path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
        } else {
            name_hint
        };
        validate_project_name(&name)?;
        let project = Repo::open(&name, &path)?.project();
        Ok((name, path, project))
    })
    .await?;
    let mut registry = state.registry.lock().unwrap_or_else(|e| e.into_inner());
    registry.add(&name, path)?;
    Ok(Json(json!({ "project": project })))
}

// ---- one repository ---------------------------------------------------------------

async fn branches(State(state): Shared, Path(repo): Path<String>) -> Reply {
    let branches = blocking(move || open_repo_blocking(&state, &repo)?.branches()).await?;
    Ok(Json(json!({ "branches": branches })))
}

/// Looks the project up by name: no request ever names a folder itself.
fn open_repo_blocking(state: &AppState, name: &str) -> iqra_core::Result<Repo> {
    let path = state.registry.lock().unwrap_or_else(|e| e.into_inner()).get(name)?.path.clone();
    Repo::open(name, &path)
}

#[derive(Deserialize)]
struct CommitsQuery {
    limit: Option<usize>,
    cursor: Option<String>,
    // `branch` is accepted for the frontend's sake: the graph always shows every branch.
    #[allow(dead_code)]
    branch: Option<String>,
}

async fn commits(State(state): Shared, Path(repo): Path<String>, ApiQuery(q): ApiQuery<CommitsQuery>) -> Reply {
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    let page = blocking(move || open_repo_blocking(&state, &repo)?.commits(limit, q.cursor.as_deref())).await?;
    Ok(Json(serde_json::to_value(page).map_err(iqra_core::Error::from)?))
}

#[derive(Deserialize)]
struct CommitBody {
    branch: Option<String>,
    #[serde(default)]
    message: String,
    #[serde(default)]
    amend: bool,
}

async fn commit(State(state): Shared, Path(repo): Path<String>, ApiJson(body): ApiJson<CommitBody>) -> Reply {
    let commit = blocking(move || {
        let r = open_repo_blocking(&state, &repo)?;
        // Committing always lands on the checked-out branch. Until there is a checkout
        // endpoint, refuse instead of silently committing somewhere else.
        if let Some(want) = body.branch.as_deref().filter(|b| !b.is_empty()) {
            let head = r.head_branch();
            if head.as_deref() != Some(want) {
                return Err(iqra_core::Error::Conflict(format!(
                    "The repository is on {}, not {want}. Switch branches in a terminal first.",
                    head.as_deref().unwrap_or("no branch")
                )));
            }
        }
        iqra_core::commit(r.path(), &body.message, body.amend)?;
        r.head_commit()
    })
    .await?;
    Ok(Json(json!({ "commit": commit })))
}

async fn status(State(state): Shared, Path(repo): Path<String>) -> Reply {
    let status = blocking(move || open_repo_blocking(&state, &repo)?.status()).await?;
    Ok(Json(serde_json::to_value(status).map_err(iqra_core::Error::from)?))
}

#[derive(Deserialize)]
struct DiffQuery {
    path: Option<String>,
    staged: Option<String>,
    commit: Option<String>,
}

async fn diff(State(state): Shared, Path(repo): Path<String>, ApiQuery(q): ApiQuery<DiffQuery>) -> Reply {
    let path = q.path.filter(|p| !p.is_empty()).ok_or_else(|| ApiError::invalid("The path of the file is required."))?;
    let target = match q.commit.filter(|c| !c.is_empty()) {
        Some(hash) => DiffTarget::Commit(hash),
        None if matches!(q.staged.as_deref(), Some("1" | "true")) => DiffTarget::Staged,
        None => DiffTarget::Unstaged,
    };
    let diff = blocking(move || open_repo_blocking(&state, &repo)?.diff(&path, &target)).await?;
    Ok(Json(serde_json::to_value(diff).map_err(iqra_core::Error::from)?))
}

async fn stashes(State(state): Shared, Path(repo): Path<String>) -> Reply {
    let stashes = blocking(move || open_repo_blocking(&state, &repo)?.stashes()).await?;
    Ok(Json(json!({ "stashes": stashes })))
}

// ---- folder picker --------------------------------------------------------------------

#[derive(Deserialize)]
struct BrowseQuery {
    path: Option<String>,
    hidden: Option<String>,
}

/// Folders (names only) of the machine running the service, for the "choose a folder"
/// dialog. Starts at the home folder when no path is given.
async fn browse(ApiQuery(q): ApiQuery<BrowseQuery>) -> Reply {
    let hidden = matches!(q.hidden.as_deref(), Some("1" | "true"));
    let path = match q.path.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) => expand_tilde(p),
        None => expand_tilde("~"),
    };
    let listing = blocking(move || iqra_core::list_folders(&path, hidden)).await?;
    Ok(Json(serde_json::to_value(listing).map_err(iqra_core::Error::from)?))
}

#[derive(Deserialize)]
struct CheckoutBody {
    /// A local branch to switch to...
    #[serde(default)]
    branch: Option<String>,
    /// ...or a commit hash, which detaches HEAD there. Exactly one of the two.
    #[serde(default)]
    commit: Option<String>,
}

async fn checkout(State(state): Shared, Path(repo): Path<String>, ApiJson(body): ApiJson<CheckoutBody>) -> Reply {
    let current = blocking(move || {
        let r = open_repo_blocking(&state, &repo)?;
        match (body.branch.as_deref(), body.commit.as_deref()) {
            (Some(branch), None) => iqra_core::checkout(r.path(), branch, false)?,
            (None, Some(commit)) => iqra_core::checkout(r.path(), commit, true)?,
            _ => return Err(iqra_core::Error::Invalid("Say either a branch or a commit.".into())),
        }
        Ok(open_repo_blocking(&state, &repo)?.head_branch())
    })
    .await?;
    Ok(Json(json!({ "currentBranch": current })))
}

async fn remote_branches(State(state): Shared, Path(repo): Path<String>) -> Reply {
    let names = blocking(move || open_repo_blocking(&state, &repo)?.remote_branches()).await?;
    let branches: Vec<Value> = names.into_iter().map(|name| json!({ "name": name })).collect();
    Ok(Json(json!({ "branches": branches })))
}

#[derive(Deserialize)]
struct PathsBody {
    #[serde(default)]
    paths: Vec<String>,
}

async fn stage(State(state): Shared, Path(repo): Path<String>, ApiJson(body): ApiJson<PathsBody>) -> Reply {
    blocking(move || iqra_core::stage(open_repo_blocking(&state, &repo)?.path(), &body.paths)).await?;
    Ok(Json(json!({})))
}

async fn unstage(State(state): Shared, Path(repo): Path<String>, ApiJson(body): ApiJson<PathsBody>) -> Reply {
    blocking(move || iqra_core::unstage(open_repo_blocking(&state, &repo)?.path(), &body.paths)).await?;
    Ok(Json(json!({})))
}

/// Push and pull act on the checked-out branch: with a detached HEAD there is none.
fn on_a_branch(r: &Repo) -> iqra_core::Result<()> {
    if r.head_branch().is_none() {
        return Err(iqra_core::Error::Conflict("Check out a branch first: HEAD is detached.".into()));
    }
    Ok(())
}

async fn push(State(state): Shared, Path(repo): Path<String>) -> Reply {
    let key = active_key(&state);
    blocking(move || {
        let r = open_repo_blocking(&state, &repo)?;
        on_a_branch(&r)?;
        iqra_core::push(r.path(), ssh_of(&key, &state))
    })
    .await?;
    Ok(Json(json!({})))
}

async fn pull(State(state): Shared, Path(repo): Path<String>) -> Reply {
    let key = active_key(&state);
    blocking(move || {
        let r = open_repo_blocking(&state, &repo)?;
        on_a_branch(&r)?;
        iqra_core::pull(r.path(), ssh_of(&key, &state))
    })
    .await?;
    Ok(Json(json!({})))
}

#[derive(Deserialize)]
struct StashBody {
    #[serde(default)]
    message: String,
}

async fn stash_push(State(state): Shared, Path(repo): Path<String>, ApiJson(body): ApiJson<StashBody>) -> Reply {
    blocking(move || {
        let r = open_repo_blocking(&state, &repo)?;
        let status = r.status()?;
        if status.staged.is_empty() && status.unstaged.is_empty() {
            return Err(iqra_core::Error::Conflict("There are no changes to stash.".into()));
        }
        iqra_core::stash_push(r.path(), &body.message)
    })
    .await?;
    Ok(Json(json!({})))
}

async fn stash_pop(State(state): Shared, Path(repo): Path<String>) -> Reply {
    blocking(move || iqra_core::stash_pop(open_repo_blocking(&state, &repo)?.path())).await?;
    Ok(Json(json!({})))
}

// ---- SSH identities -------------------------------------------------------------------
//
// The browser sends a private key once (multipart) and never sees it again: the list
// carries names, file names and the public half only.

/// The key file of the active identity; clone, pull and push authenticate with it.
fn active_key(state: &AppState) -> Option<std::path::PathBuf> {
    state.identities.lock().unwrap_or_else(|e| e.into_inner()).active_key()
}

/// What git needs to authenticate: the active key plus the fallback config.
fn ssh_of<'a>(key: &'a Option<std::path::PathBuf>, state: &'a AppState) -> iqra_core::Ssh<'a> {
    iqra_core::Ssh { key: key.as_deref(), fallback_config: Some(&state.ssh_config) }
}

fn identities_json(state: &AppState) -> Value {
    let ids = state.identities.lock().unwrap_or_else(|e| e.into_inner());
    let active = ids.active_id();
    let list: Vec<Value> = ids
        .list()
        .iter()
        .map(|i| {
            json!({
                "id": i.id,
                "name": i.name,
                "avatarUrl": null,
                "keyName": i.key_name,
                "publicKey": i.public_key,
                "isActive": Some(i.id.as_str()) == active,
            })
        })
        .collect();
    json!({ "identities": list })
}

async fn list_identities(State(state): Shared) -> Reply {
    Ok(Json(identities_json(&state)))
}

async fn add_identity(State(state): Shared, form: Result<Multipart, MultipartRejection>) -> Reply {
    // our own error shape, also for a body that is not a form upload
    let mut form = form.map_err(|_| ApiError::invalid("Send the name and the key file as a form upload."))?;
    let (mut name, mut key) = (None, None);
    while let Some(field) = form.next_field().await.map_err(|e| ApiError::invalid(format!("Invalid upload: {e}")))? {
        match field.name() {
            Some("name") => name = Some(field.text().await.map_err(|e| ApiError::invalid(format!("Invalid upload: {e}")))?),
            Some("key") => {
                let file_name = field.file_name().unwrap_or("").to_string();
                let bytes = field.bytes().await.map_err(|e| ApiError::invalid(format!("Invalid upload: {e}")))?;
                key = Some((file_name, bytes));
            }
            _ => {}
        }
    }
    let name = name.ok_or_else(|| ApiError::invalid("Give the identity a name."))?;
    let (file_name, bytes) = key.ok_or_else(|| ApiError::invalid("Choose the private key file."))?;

    // ssh-keygen runs while the key is checked, so keep it off the async threads
    let state2 = state.clone();
    blocking(move || {
        let mut ids = state2.identities.lock().unwrap_or_else(|e| e.into_inner());
        ids.add(&name, &file_name, &bytes).map(|_| ())
    })
    .await?;
    Ok(Json(identities_json(&state)))
}

async fn activate_identity(State(state): Shared, Path(id): Path<String>) -> Reply {
    state.identities.lock().unwrap_or_else(|e| e.into_inner()).activate(&id)?;
    Ok(Json(identities_json(&state)))
}

async fn remove_identity(State(state): Shared, Path(id): Path<String>) -> Reply {
    state.identities.lock().unwrap_or_else(|e| e.into_inner()).remove(&id)?;
    Ok(Json(identities_json(&state)))
}

// ---- issues ---------------------------------------------------------------------------

/// Issues live on a forge (GitHub, ...), not in git, so there is nothing to read from a
/// repository on disk yet. The Backlog view shows an honest empty list until a forge
/// integration exists.
async fn issues(State(state): Shared, Path(repo): Path<String>) -> Reply {
    blocking(move || open_repo_blocking(&state, &repo).map(|_| ())).await?;
    Ok(Json(json!({ "issues": [] })))
}
