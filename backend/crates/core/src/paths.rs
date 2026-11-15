use std::path::{Path, PathBuf};

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// "~" and "~/x" become the home folder; everything else is untouched.
pub fn expand_tilde(path: &str) -> PathBuf {
    let path = path.trim();
    if path == "~" {
        return home().unwrap_or_else(|| PathBuf::from(path));
    }
    if let Some(rest) = path.strip_prefix("~/")
        && let Some(home) = home() {
            return home.join(rest);
        }
    PathBuf::from(path)
}

/// The inverse, for showing a path to a person: "/home/me/code" -> "~/code".
pub fn display_path(path: &Path) -> String {
    if let Some(home) = home()
        && let Ok(rest) = path.strip_prefix(&home) {
            return if rest.as_os_str().is_empty() {
                "~".into()
            } else {
                format!("~/{}", rest.display())
            };
        }
    path.display().to_string()
}
