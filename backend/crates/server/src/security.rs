//! Iqra has no login: it is "whatever can reach the port may use your repositories".
//! Two checks keep web pages from doing that on someone's behalf.
//!
//! * `Host` must be a name we expect, or a page on `evil.example` that re-points its
//!   DNS at 127.0.0.1 could read everything (DNS rebinding).
//! * Requests that change something must come from our own page (`Origin` equal to
//!   `Host`), so another site cannot POST to localhost from the person's browser.
//!   Combined with JSON-only bodies, a cross-site form cannot reach a handler either.

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::AppState;
use crate::error::ApiError;

/// `localhost:4747` -> `localhost`, `[::1]:4747` -> `[::1]`, lower case.
pub fn host_name(authority: &str) -> String {
    let a = authority.trim().to_lowercase();
    if let Some(rest) = a.strip_prefix('[') {
        return match rest.find(']') {
            Some(end) => format!("[{}]", &rest[..end]),
            None => a,
        };
    }
    a.split(':').next().unwrap_or("").to_string()
}

/// `http://localhost:4747/` -> `localhost:4747`
fn origin_authority(origin: &str) -> Option<String> {
    let rest = origin.split_once("://")?.1;
    let authority = rest.split('/').next()?;
    (!authority.is_empty()).then(|| authority.to_lowercase())
}

pub async fn guard(State(state): State<Arc<AppState>>, req: Request, next: Next) -> Response {
    let host = req.headers().get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
    if host.is_empty() || !state.accepted_hosts.contains(&host_name(&host)) {
        return ApiError::new(
            StatusCode::FORBIDDEN,
            "This host name is not allowed. Add it to the allowed hosts (IQRA_ALLOWED_HOSTS) if it is yours.",
        )
        .into_response();
    }

    let safe = matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    if !safe {
        // Browsers always send Origin on cross-site writes; tools like curl send none.
        if let Some(origin) = req.headers().get(header::ORIGIN) {
            let same = origin.to_str().ok().and_then(origin_authority).is_some_and(|a| a == host);
            if !same {
                return ApiError::new(StatusCode::FORBIDDEN, "Cross-site requests are not allowed.").into_response();
            }
        }
    }

    let mut response = next.run(req).await;
    let h = response.headers_mut();
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    h.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_names() {
        assert_eq!(host_name("localhost:4747"), "localhost");
        assert_eq!(host_name("LocalHost"), "localhost");
        assert_eq!(host_name("127.0.0.1:80"), "127.0.0.1");
        assert_eq!(host_name("[::1]:4747"), "[::1]");
        assert_eq!(host_name("git.lan"), "git.lan");
    }

    #[test]
    fn origins() {
        assert_eq!(origin_authority("http://localhost:4747").as_deref(), Some("localhost:4747"));
        assert_eq!(origin_authority("null"), None);
    }
}
