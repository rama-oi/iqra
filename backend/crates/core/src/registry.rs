use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{Error, Result, validate_project_name};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub path: PathBuf,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct File {
    projects: Vec<Entry>,
}

/// The projects the person has cloned or opened: a name and a folder each, kept in
/// one JSON file in the data folder. The repositories themselves stay where they are.
#[derive(Debug)]
pub struct Registry {
    file: PathBuf,
    projects: Vec<Entry>,
}

impl Registry {
    /// Reads the file, or starts empty when it does not exist yet.
    pub fn open(file: impl Into<PathBuf>) -> Result<Self> {
        let file = file.into();
        let projects = match fs::read_to_string(&file) {
            Ok(text) => serde_json::from_str::<File>(&text)?.projects,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.into()),
        };
        Ok(Self { file, projects })
    }

    pub fn list(&self) -> &[Entry] {
        &self.projects
    }

    pub fn get(&self, name: &str) -> Result<&Entry> {
        self.projects
            .iter()
            .find(|p| p.name == name)
            .ok_or_else(|| Error::NotFound(format!("There is no project named \"{name}\".")))
    }

    /// The project registered for this folder, whatever it is called.
    pub fn find_by_path(&self, path: &Path) -> Option<&Entry> {
        self.projects
            .iter()
            .find(|p| p.path == path || p.path.canonicalize().is_ok_and(|c| c == path))
    }

    /// Points an existing project at another folder (its old one moved or is gone).
    pub fn rebind(&mut self, name: &str, path: PathBuf) -> Result<Entry> {
        let index = self
            .projects
            .iter()
            .position(|p| p.name == name)
            .ok_or_else(|| Error::NotFound(format!("There is no project named \"{name}\".")))?;
        let old = std::mem::replace(&mut self.projects[index].path, path);
        if let Err(e) = self.save() {
            self.projects[index].path = old;
            return Err(e);
        }
        Ok(self.projects[index].clone())
    }

    /// Rejects a name or folder that is already registered.
    pub fn check_free(&self, name: &str, path: &Path) -> Result<()> {
        validate_project_name(name)?;
        if self.projects.iter().any(|p| p.name == name) {
            let other = self.projects.iter().find(|p| p.name == name).map(|p| crate::display_path(&p.path)).unwrap_or_default();
            return Err(Error::Conflict(format!(
                "A project named \"{name}\" already exists ({other}). Type a different name."
            )));
        }
        if let Some(existing) = self.projects.iter().find(|p| p.path == path) {
            return Err(Error::Conflict(format!(
                "That folder is already open as \"{}\".",
                existing.name
            )));
        }
        Ok(())
    }

    pub fn add(&mut self, name: &str, path: PathBuf) -> Result<Entry> {
        self.check_free(name, &path)?;
        let entry = Entry { name: name.to_string(), path };
        self.projects.push(entry.clone());
        if let Err(e) = self.save() {
            self.projects.pop();
            return Err(e);
        }
        Ok(entry)
    }

    // Write to a temporary file and rename, so a crash never leaves half a file.
    fn save(&self) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = self.file.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(&File { projects: self.projects.clone() })?;
        fs::write(&tmp, text)?;
        fs::rename(&tmp, &self.file)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_and_refuses_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("data/projects.json");

        let mut reg = Registry::open(&file).unwrap();
        assert!(reg.list().is_empty());
        reg.add("iqra", "/code/iqra".into()).unwrap();

        assert!(matches!(reg.add("iqra", "/code/other".into()), Err(Error::Conflict(_))));
        assert!(matches!(reg.add("again", "/code/iqra".into()), Err(Error::Conflict(_))));
        assert!(matches!(reg.add("../evil", "/code/x".into()), Err(Error::Invalid(_))));
        assert!(matches!(reg.get("nope"), Err(Error::NotFound(_))));
        assert_eq!(reg.find_by_path(Path::new("/code/iqra")).unwrap().name, "iqra");
        assert!(reg.find_by_path(Path::new("/code/none")).is_none());
        reg.rebind("iqra", "/code/moved".into()).unwrap();
        assert_eq!(Registry::open(&file).unwrap().get("iqra").unwrap().path, PathBuf::from("/code/moved"));
        reg.rebind("iqra", "/code/iqra".into()).unwrap();

        let reopened = Registry::open(&file).unwrap();
        assert_eq!(reopened.list(), reg.list());
        assert_eq!(reopened.get("iqra").unwrap().path, PathBuf::from("/code/iqra"));
    }
}
