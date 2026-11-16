// A short message at the bottom of the page, for the result of an action that has no
// place of its own on screen (pull, push, stash...). Errors stay longer.
const SHOW_MS = 3500;
const SHOW_ERROR_MS = 8000;

let $host;
function host() {
  if (!$host) {
    $host = document.createElement("div");
    $host.className = "pb-toasts";
    (document.querySelector("pb-app") ?? document.body).append($host); // styles live under pb-app
  }
  return $host;
}

export function toast(text, { error = false } = {}) {
  const $toast = document.createElement("p");
  $toast.className = error ? "pb-toast pb-error" : "pb-toast";
  $toast.setAttribute("role", error ? "alert" : "status");
  $toast.textContent = text;
  host().append($toast);
  setTimeout(() => $toast.remove(), error ? SHOW_ERROR_MS : SHOW_MS);
}
