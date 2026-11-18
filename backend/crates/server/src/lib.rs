//! The REST API of Iqra plus the embedded frontend, as one axum router.

pub mod api;
pub mod assets;
pub mod config;
pub mod error;
pub mod security;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::middleware;
use iqra_core::{Identities, Registry};

pub use config::Config;

pub struct AppState {
    pub registry: Mutex<Registry>,
    pub identities: Mutex<Identities>,
    pub clone_dir: PathBuf,
    /// Lower-case host names (no port) allowed in the `Host` header.
    pub accepted_hosts: Vec<String>,
}

pub fn build_state(config: &Config) -> anyhow::Result<Arc<AppState>> {
    let (data_dir, clone_dir) = config::ensure_dirs(config)?;
    Ok(Arc::new(AppState {
        registry: Mutex::new(Registry::open(data_dir.join("projects.json"))?),
        identities: Mutex::new(Identities::open(&data_dir)?),
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
