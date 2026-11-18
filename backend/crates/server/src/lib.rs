//! The REST API of Iqra plus the embedded frontend, as one axum router.

pub mod api;
pub mod assets;
pub mod config;
pub mod error;
pub mod github;
pub mod security;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::middleware;
use iqra_core::{Identities, Registry};

pub use config::Config;

/// Finds out which GitHub account a key belongs to (and its public profile). The real one
/// asks GitHub over ssh and its API; tests swap in a fake.
pub type ProfileLookup = Box<dyn for<'a> Fn(iqra_core::Ssh<'a>) -> Option<iqra_core::Profile> + Send + Sync>;

pub fn github_lookup() -> ProfileLookup {
    Box::new(|ssh| {
        let login = iqra_core::github_login(ssh)?;
        Some(github::fetch_profile(github::API, &login))
    })
}

pub struct AppState {
    pub registry: Mutex<Registry>,
    pub identities: Mutex<Identities>,
    /// Fallback ssh config, see `iqra_core::Ssh`.
    pub ssh_config: PathBuf,
    pub profile_lookup: ProfileLookup,
    pub clone_dir: PathBuf,
    /// Lower-case host names (no port) allowed in the `Host` header.
    pub accepted_hosts: Vec<String>,
}

pub fn build_state(config: &Config) -> anyhow::Result<Arc<AppState>> {
    build_state_with(config, github_lookup())
}

pub fn build_state_with(config: &Config, profile_lookup: ProfileLookup) -> anyhow::Result<Arc<AppState>> {
    let (data_dir, clone_dir) = config::ensure_dirs(config)?;
    let registry = Registry::open(data_dir.join("projects.json"))?;
    let identities = Identities::open(&data_dir)?;
    // what was found on disk, for the person wondering why a list is empty
    tracing::info!(
        "data folder {}: {} project(s), {} identit{}",
        data_dir.display(),
        registry.list().len(),
        identities.list().len(),
        if identities.list().len() == 1 { "y" } else { "ies" }
    );
    Ok(Arc::new(AppState {
        registry: Mutex::new(registry),
        identities: Mutex::new(identities),
        ssh_config: iqra_core::write_ssh_config(&data_dir)?,
        profile_lookup,
        clone_dir,
        accepted_hosts: config.accepted_hosts(),
    }))
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .nest("/api", api::routes())
        .fallback(assets::serve)
        .layer(middleware::from_fn_with_state(state.clone(), security::guard))
        .with_state(state)
}
