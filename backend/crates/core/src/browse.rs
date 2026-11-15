//! Lists folders for the folder picker. Only names of directories are returned, never
//! file contents, and nothing is written.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::{Error, Result};

/// Folders past this many are left out, so a huge directory cannot flood the browser.
const MAX_ENTRIES: usize = 1000;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub name: String,
    pub path: String,
    /// Has a `.git` inside: the picker marks it so repositories stand out.
    pub is_repo: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    /// The folder shown, resolved (symlinks and `..` gone).
    pub path: String,
    /// The folder above it, `None` at the root.
    pub parent: Option<String>,
    /// The person's home folder, for a "home" shortcut.
    pub home: Option<String>,
    /// The folder itself is a git repository.
    pub is_repo: bool,
    pub folders: Vec<Folder>,
    pub truncated: bool,
}

pub fn list_folders(path: &Path, hidden: bool) -> Result<Listing> {
    if !path.is_absolute() {
        return Err(Error::Invalid("Give the full path of the folder.".into()));
    }
    let path = path
        .canonicalize()
        .map_err(|_| Error::NotFound(format!("The folder {} does not exist.", path.display())))?;
    if !path.is_dir() {
        return Err(Error::Invalid(format!("{} is not a folder.", path.display())));
    }
    let read = fs::read_dir(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => {
            Error::Invalid(format!("No permission to read {}.", path.display()))
        }
        _ => Error::Io(e),
    })?;

    let mut folders = Vec::new();
    let mut truncated = false;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !hidden && name.starts_with('.') {
            continue;
        }
        let full = entry.path();
        // metadata() follows symlinks, so a link to a folder counts as a folder
        if !fs::metadata(&full).is_ok_and(|m| m.is_dir()) {
            continue;
        }
        if folders.len() >= MAX_ENTRIES {
            truncated = true;
            break;
        }
        folders.push(Folder { is_repo: full.join(".git").exists(), path: full.to_string_lossy().into_owned(), name });
    }
    folders.sort_by_cached_key(|f| f.name.to_lowercase());

    Ok(Listing {
        parent: path.parent().map(|p| p.to_string_lossy().into_owned()),
        home: std::env::var_os("HOME").filter(|h| !h.is_empty()).map(|h| Path::new(&h).to_string_lossy().into_owned()),
        is_repo: path.join(".git").exists(),
        path: path.to_string_lossy().into_owned(),
        folders,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_folders_only_sorted_with_repos_marked() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        for d in ["beta", "Alpha", ".hidden", "repo/.git"] {
            fs::create_dir_all(r.join(d)).unwrap();
        }
        fs::write(r.join("file.txt"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(r.join("beta"), r.join("link")).unwrap();

        let l = list_folders(r, false).unwrap();
        let names: Vec<_> = l.folders.iter().map(|f| f.name.as_str()).collect();
        #[cfg(unix)]
        assert_eq!(names, ["Alpha", "beta", "link", "repo"]);
        assert!(l.folders.iter().find(|f| f.name == "repo").unwrap().is_repo);
        assert!(!l.folders.iter().find(|f| f.name == "beta").unwrap().is_repo);
        assert_eq!(l.parent.as_deref(), Some(r.canonicalize().unwrap().parent().unwrap().to_str().unwrap()));

        let all = list_folders(r, true).unwrap();
        assert!(all.folders.iter().any(|f| f.name == ".hidden"));
    }

    #[test]
    fn refuses_what_is_not_a_folder() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("f"), "x").unwrap();
        assert!(matches!(list_folders(&dir.path().join("f"), false), Err(Error::Invalid(_))));
        assert!(matches!(list_folders(&dir.path().join("none"), false), Err(Error::NotFound(_))));
        assert!(matches!(list_folders(Path::new("relative"), false), Err(Error::Invalid(_))));
    }

    #[test]
    fn the_root_has_no_parent() {
        assert_eq!(list_folders(Path::new("/"), false).unwrap().parent, None);
    }
}
