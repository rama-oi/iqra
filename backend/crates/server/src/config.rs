use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use clap::Parser;
use iqra_core::expand_tilde;

/// Every option can also be given as an `IQRA_*` environment variable, which is how
/// the NixOS module configures the service.
#[derive(Parser, Debug, Clone)]
#[command(name = "iqra", version, about = "Iqra git client: a local web service")]
pub struct Config {
    /// Address to listen on. Keep it on loopback unless you know why not: there is no login.
    #[arg(long, env = "IQRA_HOST", default_value = "127.0.0.1")]
    pub host: String,

    /// Port to listen on.
    #[arg(long, env = "IQRA_PORT", default_value_t = 4747)]
    pub port: u16,

    /// Where Iqra keeps its own data (the list of projects). Default: ~/.local/share/iqra
    #[arg(long, env = "IQRA_DATA_DIR")]
    pub data_dir: Option<PathBuf>,

    /// Folder new clones go into, as `<clone-dir>/<name>`. Default: ~/Projects
    #[arg(long, env = "IQRA_CLONE_DIR")]
    pub clone_dir: Option<PathBuf>,

    /// Extra host names the service answers to (comma separated), for when you reach
    /// it through a name other than localhost, e.g. `git.lan`.
    #[arg(long = "allowed-host", env = "IQRA_ALLOWED_HOSTS", value_delimiter = ',')]
    pub allowed_hosts: Vec<String>,
}

impl Config {
    pub fn data_dir(&self) -> Result<PathBuf> {
        if let Some(dir) = &self.data_dir {
            return Ok(expand_tilde(&dir.to_string_lossy()));
        }
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
            return Ok(PathBuf::from(xdg).join("iqra"));
        }
        let home = std::env::var_os("HOME").filter(|v| !v.is_empty());
        match home {
            Some(home) => Ok(PathBuf::from(home).join(".local/share/iqra")),
            None => bail!("cannot find a data folder: set IQRA_DATA_DIR"),
        }
    }

    pub fn clone_dir(&self) -> Result<PathBuf> {
        let dir = match &self.clone_dir {
            Some(dir) => expand_tilde(&dir.to_string_lossy()),
            None => expand_tilde("~/Projects"),
        };
        if !dir.is_absolute() {
            bail!("the clone folder must be an absolute path, got {}", dir.display());
        }
        Ok(dir)
    }

    pub fn is_loopback(&self) -> bool {
        match self.host.parse::<std::net::IpAddr>() {
            Ok(ip) => ip.is_loopback(),
            Err(_) => self.host == "localhost",
        }
    }

    /// Host names the service accepts in the `Host` header.
    pub fn accepted_hosts(&self) -> Vec<String> {
        let mut hosts: Vec<String> = ["localhost", "127.0.0.1", "[::1]"].map(String::from).into();
        let own = self.host.trim_start_matches('[').trim_end_matches(']');
        let wildcard = matches!(own, "0.0.0.0" | "::" | "");
        if !wildcard {
            hosts.push(if own.contains(':') { format!("[{own}]") } else { own.to_lowercase() });
        }
        hosts.extend(self.allowed_hosts.iter().map(|h| h.trim().to_lowercase()).filter(|h| !h.is_empty()));
        hosts.sort();
        hosts.dedup();
        hosts
    }
}

pub fn ensure_dirs(config: &Config) -> Result<(PathBuf, PathBuf)> {
    let data = config.data_dir()?;
    std::fs::create_dir_all(&data).with_context(|| format!("cannot create {}", data.display()))?;
    Ok((data, config.clone_dir()?))
}
