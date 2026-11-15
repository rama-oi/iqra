use anyhow::{Context, Result};
use clap::Parser;
use iqra_server::{Config, build_state, router};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_env("IQRA_LOG").unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let config = Config::parse();
    let state = build_state(&config)?;

    if !config.is_loopback() {
        tracing::warn!(
            "listening on {}: anyone who can reach this port can read and commit to your repositories, \
             there is no login yet. Prefer 127.0.0.1.",
            config.host
        );
    }

    let listener = tokio::net::TcpListener::bind((config.host.trim_matches(['[', ']']), config.port))
        .await
        .with_context(|| format!("cannot listen on {}:{}", config.host, config.port))?;
    let addr = listener.local_addr()?;
    tracing::info!("Iqra {} is running at http://{addr}", env!("CARGO_PKG_VERSION"));
    tracing::info!("accepting host names: {}", config.accepted_hosts().join(", "));

    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown())
        .await
        .context("server stopped")
}

/// Ctrl-C in a terminal, SIGTERM from systemd.
async fn shutdown() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.ok() };
    #[cfg(unix)]
    let term = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutting down");
}
