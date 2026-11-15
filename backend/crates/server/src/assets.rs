//! The frontend, compiled into the binary so the service is one file. Debug builds
//! read the folder from disk instead, so editing the frontend needs no rebuild.

use axum::http::{HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

use crate::error::ApiError;

#[derive(RustEmbed)]
#[folder = "../../../frontend/"]
#[exclude = "node_modules/*"]
struct Frontend;

pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path == "api" || path.starts_with("api/") {
        return ApiError::not_found("No such API endpoint.").into_response();
    }
    let path = if path.is_empty() { "index.html" } else { path };
    match Frontend::get(path) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let mut response = (StatusCode::OK, file.data.into_owned()).into_response();
            let h = response.headers_mut();
            if let Ok(v) = HeaderValue::from_str(mime.as_ref()) {
                h.insert(header::CONTENT_TYPE, v);
            }
            // Local service: always show the latest files, never a stale cached copy.
            h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            response
        }
        None => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}
