//! SSH identities: a display name plus a private key, kept in the data folder. The
//! active one is what clone, pull and push authenticate with. The key bytes never
//! leave this module except as a file path handed to `ssh -i`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::{Error, Result};

/// A private key is a few KB; anything bigger is not one.
const MAX_KEY_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub id: String,
    pub name: String,
    /// The file name the key was uploaded with, for display only.
    pub key_name: String,
    /// The matching public key (what goes into GitHub's "SSH keys"), when `ssh-keygen`
    /// could derive it.
    #[serde(default)]
    pub public_key: Option<String>,
    /// The GitHub account this key logs in as, once GitHub has recognised it.
    #[serde(default)]
    pub github_login: Option<String>,
    /// That account's picture (https only: it ends up in an <img>).
    #[serde(default)]
    pub avatar_url: Option<String>,
}

/// What GitHub says about the account a key belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Profile {
    pub login: String,
    /// The display name set on the profile; many accounts have none.
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct File {
    #[serde(default)]
    active: Option<String>,
    #[serde(default)]
    identities: Vec<Identity>,
}

pub struct Identities {
    dir: PathBuf,
    file: File,
}

fn key_error(msg: &str) -> Error {
    Error::Invalid(msg.into())
}

/// Checks the text looks like an OpenSSH/PEM private key and returns it normalised:
/// LF line endings (a key saved on Windows has CRLF, which OpenSSH rejects as
/// "invalid format") and a final newline (without it, "error in libcrypto").
fn normalise_key(bytes: &[u8]) -> Result<String> {
    if bytes.len() > MAX_KEY_BYTES {
        return Err(key_error("That file is too big to be an SSH private key."));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| key_error("That is not a text key file."))?;
    let text = text.trim().replace("\r\n", "\n").replace('\r', "\n");
    let first = text.lines().next().unwrap_or("");
    let last = text.lines().last().unwrap_or("");
    if first.contains("PUBLIC KEY") || first.starts_with("ssh-") {
        return Err(key_error(
            "That looks like the public key. Choose the private one (the file without .pub).",
        ));
    }
    let ok = first.starts_with("-----BEGIN ") && first.contains("PRIVATE KEY-----") && last.starts_with("-----END ");
    if !ok {
        return Err(key_error("That does not look like an SSH private key (it should start with -----BEGIN)."));
    }
    Ok(format!("{text}\n"))
}

/// `ssh-keygen -y` prints the public key of a private one, and fails when the key is
/// protected by a passphrase. Returns `None` when ssh-keygen is not installed.
fn derive_public_key(key: &Path) -> Result<Option<String>> {
    let out = match Command::new("ssh-keygen")
        .args(["-y", "-P", "", "-f"])
        .arg(key)
        .stdin(Stdio::null())
        .output()
    {
        Ok(out) => out,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if out.status.success() {
        return Ok(Some(String::from_utf8_lossy(&out.stdout).trim().to_string()));
    }
    let err = String::from_utf8_lossy(&out.stderr).to_lowercase();
    if err.contains("passphrase") {
        return Err(key_error(
            "That key is protected by a passphrase, and Iqra cannot type it for you. \
             Use a key without a passphrase (ssh-keygen -p -f <key> removes it).",
        ));
    }
    Err(key_error("ssh could not read that key. Is it a complete, valid private key?"))
}

#[cfg(unix)]
fn write_private(path: &Path, text: &str) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    // created 0600 from the start, so the key is never readable by others, not even briefly
    let mut f = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    f.write_all(text.as_bytes())?;
    Ok(())
}

#[cfg(not(unix))]
fn write_private(path: &Path, text: &str) -> Result<()> {
    fs::write(path, text)?;
    Ok(())
}

impl Identities {
    /// `dir` holds `identities.json` and a `keys/` folder. Starts empty when new.
    pub fn open(dir: impl Into<PathBuf>) -> Result<Self> {
        let dir = dir.into();
        let file = match fs::read_to_string(dir.join("identities.json")) {
            Ok(text) => serde_json::from_str::<File>(&text)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => File::default(),
            Err(e) => return Err(e.into()),
        };
        Ok(Self { dir, file })
    }

    pub fn list(&self) -> &[Identity] {
        &self.file.identities
    }

    pub fn active_id(&self) -> Option<&str> {
        self.file.active.as_deref()
    }

    /// The key file of the active identity, which ssh is told to use.
    pub fn active_key(&self) -> Option<PathBuf> {
        let id = self.file.active.as_deref()?;
        let path = self.key_path(id);
        path.is_file().then_some(path)
    }

    fn key_path(&self, id: &str) -> PathBuf {
        self.dir.join("keys").join(id)
    }

    /// The key file of an identity, for asking GitHub who it is.
    pub fn key_path_of(&self, id: &str) -> Option<PathBuf> {
        self.file.identities.iter().any(|i| i.id == id).then(|| self.key_path(id))
    }

    /// Records who GitHub says the key belongs to. With `adopt_name` the identity is
    /// renamed to the GitHub display name (or the login when the profile has none), unless
    /// another identity already has that name.
    pub fn set_profile(&mut self, id: &str, profile: Profile, adopt_name: bool) -> Result<Identity> {
        let index = self
            .file
            .identities
            .iter()
            .position(|i| i.id == id)
            .ok_or_else(|| Error::NotFound("There is no such identity.".into()))?;
        let before = self.file.identities[index].clone();

        let wanted = profile.name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| profile.login.clone());
        let free = !self.file.identities.iter().any(|i| i.id != id && i.name == wanted);
        let entry = &mut self.file.identities[index];
        if adopt_name && free {
            entry.name = wanted;
        }
        entry.github_login = Some(profile.login);
        entry.avatar_url = profile.avatar_url;
        let updated = entry.clone();
        if let Err(e) = self.save() {
            self.file.identities[index] = before;
            return Err(e);
        }
        Ok(updated)
    }

    fn next_id(&self) -> String {
        let n = self
            .file
            .identities
            .iter()
            .filter_map(|i| i.id.strip_prefix("id-")?.parse::<u64>().ok())
            .max()
            .unwrap_or(0);
        format!("id-{}", n + 1)
    }

    /// Stores a new identity; the first one becomes the active one. An empty `name` is
    /// allowed (the file name stands in until GitHub tells the real one, see
    /// `set_profile`).
    pub fn add(&mut self, name: &str, key_name: &str, key: &[u8]) -> Result<Identity> {
        let name = name.trim();
        if name.chars().count() > 100 || name.chars().any(|c| c.is_control()) {
            return Err(key_error("That name is too long (up to 100 characters)."));
        }
        if !name.is_empty() && self.file.identities.iter().any(|i| i.name == name) {
            return Err(Error::Conflict(format!("An identity named \"{name}\" already exists.")));
        }
        let text = normalise_key(key)?;

        let id = self.next_id();
        let keys = self.dir.join("keys");
        fs::create_dir_all(&keys)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // ssh refuses keys in folders others can write to
            fs::set_permissions(&keys, fs::Permissions::from_mode(0o700))?;
        }
        let path = self.key_path(&id);
        let _ = fs::remove_file(&path); // a leftover from a crashed add
        write_private(&path, &text)?;

        let public_key = match derive_public_key(&path) {
            Ok(p) => p,
            Err(e) => {
                let _ = fs::remove_file(&path);
                return Err(e);
            }
        };

        let key_name = Path::new(key_name)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "private key".into());
        let name = if name.is_empty() {
            // a stand-in that cannot clash with another identity's name
            let taken = |n: &str| self.file.identities.iter().any(|i| i.name == n);
            if taken(&key_name) { format!("{key_name} ({id})") } else { key_name.clone() }
        } else {
            name.to_string()
        };
        let identity = Identity { id: id.clone(), name, key_name, public_key, github_login: None, avatar_url: None };

        self.file.identities.push(identity.clone());
        let was_active = self.file.active.clone();
        if was_active.is_none() {
            self.file.active = Some(id);
        }
        if let Err(e) = self.save() {
            self.file.identities.pop();
            self.file.active = was_active;
            let _ = fs::remove_file(&path);
            return Err(e);
        }
        Ok(identity)
    }

    pub fn activate(&mut self, id: &str) -> Result<()> {
        if !self.file.identities.iter().any(|i| i.id == id) {
            return Err(Error::NotFound("There is no such identity.".into()));
        }
        let before = self.file.active.replace(id.to_string());
        self.save().inspect_err(|_| self.file.active = before)
    }

    /// Deletes the identity and its key file. If it was the active one, the first
    /// remaining identity takes over (or none, when it was the last).
    pub fn remove(&mut self, id: &str) -> Result<()> {
        let index = self
            .file
            .identities
            .iter()
            .position(|i| i.id == id)
            .ok_or_else(|| Error::NotFound("There is no such identity.".into()))?;
        let removed = self.file.identities.remove(index);
        let before = self.file.active.clone();
        if self.file.active.as_deref() == Some(id) {
            self.file.active = self.file.identities.first().map(|i| i.id.clone());
        }
        if let Err(e) = self.save() {
            self.file.identities.insert(index, removed);
            self.file.active = before;
            return Err(e);
        }
        let _ = fs::remove_file(self.key_path(id));
        Ok(())
    }

    // Write to a temporary file and rename, so a crash never leaves half a file.
    fn save(&self) -> Result<()> {
        fs::create_dir_all(&self.dir)?;
        let path = self.dir.join("identities.json");
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(&self.file)?)?;
        fs::rename(&tmp, &path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Not a real key: validation without ssh-keygen only looks at the armor lines.
    // With ssh-keygen installed, `add` would (rightly) refuse it, so these tests use
    // `add_unchecked` for the bookkeeping and test key validation on its own.
    const FAKE: &str = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n";

    fn add_unchecked(ids: &mut Identities, name: &str) -> Identity {
        let id = ids.next_id();
        fs::create_dir_all(ids.dir.join("keys")).unwrap();
        write_private(&ids.key_path(&id), FAKE).unwrap();
        let identity = Identity { id: id.clone(), name: name.into(), key_name: "k".into(), public_key: None, github_login: None, avatar_url: None };
        ids.file.identities.push(identity.clone());
        ids.file.active.get_or_insert(id);
        ids.save().unwrap();
        identity
    }

    #[test]
    fn keys_are_checked_and_normalised() {
        let crlf = FAKE.replace('\n', "\r\n");
        assert_eq!(normalise_key(crlf.as_bytes()).unwrap(), FAKE);
        assert_eq!(normalise_key(FAKE.trim().as_bytes()).unwrap(), FAKE);

        for bad in [
            "ssh-ed25519 AAAAC3Nza me@host",
            "-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----",
            "hello",
            "",
            "-----BEGIN OPENSSH PRIVATE KEY-----\nno end line",
        ] {
            assert!(matches!(normalise_key(bad.as_bytes()), Err(Error::Invalid(_))), "{bad}");
        }
        assert!(normalise_key(&vec![b'a'; MAX_KEY_BYTES + 1]).is_err());
        assert!(normalise_key(&[0xff, 0xfe]).is_err());
    }

    #[test]
    fn rejects_bad_names_and_bad_keys_without_leaving_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut ids = Identities::open(dir.path()).unwrap();
        assert!(matches!(ids.add(&"n".repeat(101), "k", FAKE.as_bytes()), Err(Error::Invalid(_))));
        assert!(matches!(ids.add("me", "k", b"nope"), Err(Error::Invalid(_))));
        assert!(ids.list().is_empty());
        assert!(!dir.path().join("keys").exists() || fs::read_dir(dir.path().join("keys")).unwrap().next().is_none());
    }

    #[test]
    fn first_is_active_activate_and_remove_hand_over() {
        let dir = tempfile::tempdir().unwrap();
        let mut ids = Identities::open(dir.path()).unwrap();
        let a = add_unchecked(&mut ids, "a");
        let b = add_unchecked(&mut ids, "b");
        assert_eq!(ids.active_id(), Some(a.id.as_str()));
        assert_eq!(ids.active_key().unwrap(), dir.path().join("keys").join(&a.id));

        ids.activate(&b.id).unwrap();
        assert_eq!(ids.active_id(), Some(b.id.as_str()));
        assert!(matches!(ids.activate("id-99"), Err(Error::NotFound(_))));

        ids.remove(&b.id).unwrap(); // the active one: the other takes over
        assert_eq!(ids.active_id(), Some(a.id.as_str()));
        assert!(!dir.path().join("keys").join(&b.id).exists());
        ids.remove(&a.id).unwrap();
        assert_eq!(ids.active_key(), None);
        assert!(matches!(ids.remove(&a.id), Err(Error::NotFound(_))));

        // ids are not reused while others exist, and survive a reopen
        let c = add_unchecked(&mut ids, "c");
        let reopened = Identities::open(dir.path()).unwrap();
        assert_eq!(reopened.list(), [c]);
    }

    #[cfg(unix)]
    #[test]
    fn key_files_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let mut ids = Identities::open(dir.path()).unwrap();
        let a = add_unchecked(&mut ids, "a");
        let mode = fs::metadata(ids.key_path(&a.id)).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    fn profile(login: &str, name: Option<&str>) -> Profile {
        Profile { login: login.into(), name: name.map(Into::into), avatar_url: Some(format!("https://avatars.githubusercontent.com/{login}")) }
    }

    #[test]
    fn github_profile_fills_in_the_name_and_picture() {
        let dir = tempfile::tempdir().unwrap();
        let mut ids = Identities::open(dir.path()).unwrap();
        let a = add_unchecked(&mut ids, "label I typed");

        // keeping the typed name: only login and picture are recorded
        let kept = ids.set_profile(&a.id, profile("octocat", Some("The Octocat")), false).unwrap();
        assert_eq!((kept.name.as_str(), kept.github_login.as_deref()), ("label I typed", Some("octocat")));
        assert!(kept.avatar_url.unwrap().starts_with("https://"));

        // adopting: the GitHub name wins; no display name falls back to the login
        assert_eq!(ids.set_profile(&a.id, profile("octocat", Some("The Octocat")), true).unwrap().name, "The Octocat");
        assert_eq!(ids.set_profile(&a.id, profile("octocat", None), true).unwrap().name, "octocat");

        // a name another identity has is not taken over
        let b = add_unchecked(&mut ids, "Other");
        let same = ids.set_profile(&b.id, profile("o", Some("octocat")), true).unwrap();
        assert_eq!(same.name, "Other");

        assert!(matches!(ids.set_profile("id-99", profile("x", None), true), Err(Error::NotFound(_))));
        // survives a reopen
        let again = Identities::open(dir.path()).unwrap();
        assert_eq!(again.list()[0].github_login.as_deref(), Some("octocat"));
    }

    #[test]
    fn a_name_is_optional_and_the_stand_in_never_clashes() {
        let dir = tempfile::tempdir().unwrap();
        let mut ids = Identities::open(dir.path()).unwrap();
        let first = ids.add("", "id_ed25519", FAKE.as_bytes()).unwrap();
        let second = ids.add("  ", "id_ed25519", FAKE.as_bytes()).unwrap();
        assert_eq!(first.name, "id_ed25519");
        assert_ne!(second.name, first.name);
        assert!(ids.add(&"x".repeat(101), "k", FAKE.as_bytes()).is_err());
    }
}
