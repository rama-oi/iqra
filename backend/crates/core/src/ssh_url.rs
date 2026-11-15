use crate::{Error, Result};

const MESSAGE: &str = "Only SSH URLs are supported, e.g. git@github.com:owner/repo.git.";

fn host_ok(host: &str) -> bool {
    // A host that starts with "-" could be read by ssh as an option.
    let mut chars = host.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

fn user_ok(user: &str) -> bool {
    let mut chars = user.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric() || c == '_')
        && user.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// Accepts `ssh://[user@]host[:port]/path` and the scp-like `user@host:path`.
/// Anything else (https, git://, file paths, `ext::` helpers...) is refused, and
/// hosts and users that look like command-line options never get through.
pub fn validate_ssh_url(url: &str) -> Result<()> {
    let url = url.trim();
    let invalid = || Error::Invalid(MESSAGE.into());

    if let Some(rest) = url.strip_prefix("ssh://") {
        let (authority, path) = rest.split_once('/').ok_or_else(invalid)?;
        if path.is_empty() {
            return Err(invalid());
        }
        let (user, host_port) = match authority.rsplit_once('@') {
            Some((user, host_port)) => (Some(user), host_port),
            None => (None, authority),
        };
        let (host, port) = match host_port.rsplit_once(':') {
            Some((host, port)) => (host, Some(port)),
            None => (host_port, None),
        };
        let port_ok = port.is_none_or(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
        if user.is_some_and(|u| !user_ok(u)) || !host_ok(host) || !port_ok {
            return Err(invalid());
        }
        return Ok(());
    }

    // scp-like: user@host:path (no scheme, so no "//" and a colon after the host)
    let (user, rest) = url.split_once('@').ok_or_else(invalid)?;
    let (host, path) = rest.split_once(':').ok_or_else(invalid)?;
    if user_ok(user) && host_ok(host) && !path.is_empty() && !path.starts_with("//") {
        return Ok(());
    }
    Err(invalid())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_ssh_forms() {
        for url in [
            "git@github.com:rama-oi/iqra.git",
            "ssh://git@host.example/owner/repo.git",
            "ssh://host.example:2222/owner/repo",
            "me@192.168.1.5:projects/repo",
        ] {
            assert!(validate_ssh_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn refuses_everything_else() {
        for url in [
            "https://github.com/owner/repo.git",
            "http://github.com/owner/repo",
            "git://github.com/owner/repo.git",
            "/home/me/repo",
            "file:///home/me/repo",
            "ext::sh -c touch% /tmp/pwned",
            "ssh://-oProxyCommand=touch/tmp/x/repo",
            "-oProxyCommand=x@host:repo",
            "git@-host:repo",
            "ssh://host:port/repo",
            "git@host:",
            "",
        ] {
            assert!(validate_ssh_url(url).is_err(), "{url}");
        }
    }
}
