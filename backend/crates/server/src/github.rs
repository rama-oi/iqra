//! Looks up a GitHub account's public profile: the display name and the picture.
//! No token is involved: this is public data, and GitHub allows 60 such requests an hour
//! per address, far more than adding a key needs.

use std::time::Duration;

use iqra_core::Profile;
use serde_json::Value;

pub const API: &str = "https://api.github.com";

/// Only these hosts' pictures are kept: the URL ends up in an <img> in the page.
fn trusted_avatar(url: &str) -> bool {
    url.strip_prefix("https://")
        .and_then(|rest| rest.split(['/', '?']).next())
        .is_some_and(|host| host == "github.com" || host.ends_with(".githubusercontent.com"))
}

/// `login` is what `ssh -T git@github.com` reported. When the API cannot be reached the
/// answer still has the login and the plain `github.com/<login>.png` picture, so a key
/// GitHub recognised never ends up with nothing.
pub fn fetch_profile(api: &str, login: &str) -> Profile {
    let fallback = Profile {
        login: login.to_string(),
        name: None,
        avatar_url: Some(format!("https://github.com/{login}.png?size=96")),
    };
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(6)))
        .build()
        .into();
    let fetched = agent
        .get(format!("{api}/users/{login}"))
        .header("User-Agent", "iqra")
        .header("Accept", "application/vnd.github+json")
        .call()
        .ok()
        .and_then(|mut res| res.body_mut().read_json::<Value>().ok());
    let Some(v) = fetched else { return fallback };

    let text = |key: &str| v.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty());
    Profile {
        // the login GitHub spells (the one ssh printed is the same, but with its own casing)
        login: text("login").unwrap_or(login).to_string(),
        name: text("name").map(|n| n.chars().take(100).collect()),
        avatar_url: text("avatar_url").filter(|u| trusted_avatar(u)).map(String::from).or(fallback.avatar_url),
    }
}

/// The issues of `owner/name` (pull requests, which GitHub lists among them, left out),
/// newest first, in the shape the Backlog view reads. Public repositories need no token;
/// private ones need `IQRA_GITHUB_TOKEN` on the server.
pub fn fetch_issues(api: &str, owner: &str, name: &str, token: Option<&str>) -> Result<Vec<Value>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();
    let mut req = agent
        .get(format!("{api}/repos/{owner}/{name}/issues?state=all&per_page=100&sort=created&direction=desc"))
        .header("User-Agent", "iqra")
        .header("Accept", "application/vnd.github+json");
    if let Some(t) = token.filter(|t| !t.is_empty()) {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let list: Vec<Value> = match req.call() {
        Ok(mut res) => res.body_mut().read_json().map_err(|_| "GitHub sent something that is not a list of issues.".to_string())?,
        Err(ureq::Error::StatusCode(404 | 401 | 403)) => {
            return Err(format!(
                "GitHub would not show the issues of {owner}/{name}: the repository is private or the rate limit is used up. For private repositories start Iqra with IQRA_GITHUB_TOKEN set."
            ));
        }
        Err(ureq::Error::StatusCode(code)) => return Err(format!("GitHub answered {code} for the issues of {owner}/{name}.")),
        Err(_) => return Err("Could not reach GitHub.".to_string()),
    };
    Ok(list.iter().filter(|i| i.get("pull_request").is_none()).filter_map(issue_json).collect())
}

fn issue_json(i: &Value) -> Option<Value> {
    let text = |v: &Value| v.as_str().map(str::to_string);
    Some(serde_json::json!({
        "number": i.get("number")?.as_u64()?,
        "title": text(i.get("title")?)?,
        "state": text(i.get("state")?)?,
        "labels": i.get("labels").and_then(Value::as_array).map(|l| l.iter().filter_map(|x| x.get("name").and_then(text)).collect::<Vec<_>>()).unwrap_or_default(),
        "author": i.pointer("/user/login").and_then(text),
        "assignee": i.pointer("/assignee/login").and_then(text),
        "createdAt": i.get("created_at").and_then(text),
        "body": i.get("body").and_then(text).unwrap_or_default(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// A one-request HTTP server answering with `status` and `body`; returns its address.
    fn serve(status: &str, body: &str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let reply = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap();
            let request = String::from_utf8_lossy(&buf[..n]).to_string();
            assert!(request.starts_with("GET /users/octocat "), "{request}");
            assert!(request.to_lowercase().contains("user-agent: iqra"), "GitHub rejects requests without a User-Agent");
            stream.write_all(reply.as_bytes()).unwrap();
        });
        format!("http://{addr}")
    }

    #[test]
    fn reads_name_and_picture() {
        let api = serve(
            "200 OK",
            r#"{"login":"octocat","name":"  The Octocat ","avatar_url":"https://avatars.githubusercontent.com/u/583231?v=4"}"#,
        );
        let p = fetch_profile(&api, "octocat");
        assert_eq!(p.login, "octocat");
        assert_eq!(p.name.as_deref(), Some("The Octocat"));
        assert_eq!(p.avatar_url.as_deref(), Some("https://avatars.githubusercontent.com/u/583231?v=4"));
    }

    #[test]
    fn an_account_without_a_display_name_has_none() {
        let api = serve("200 OK", r#"{"login":"octocat","name":null,"avatar_url":"https://avatars.githubusercontent.com/u/1"}"#);
        assert_eq!(fetch_profile(&api, "octocat").name, None);
    }

    #[test]
    fn failures_still_give_the_login_and_a_picture() {
        for api in [serve("403 Forbidden", r#"{"message":"rate limit exceeded"}"#), serve("200 OK", "not json"), "http://127.0.0.1:1".into()] {
            let p = fetch_profile(&api, "octocat");
            assert_eq!(p.login, "octocat");
            assert_eq!(p.name, None);
            assert_eq!(p.avatar_url.as_deref(), Some("https://github.com/octocat.png?size=96"));
        }
    }

    #[test]
    fn pictures_from_other_hosts_are_not_trusted() {
        let api = serve("200 OK", r#"{"login":"octocat","avatar_url":"https://evil.example/track.png"}"#);
        assert_eq!(fetch_profile(&api, "octocat").avatar_url.as_deref(), Some("https://github.com/octocat.png?size=96"));
        assert!(!trusted_avatar("http://avatars.githubusercontent.com/x"));
        assert!(!trusted_avatar("https://githubusercontent.com.evil.example/x"));
        assert!(trusted_avatar("https://avatars.githubusercontent.com/u/1?v=4"));
    }
}
