const SHOW_MS = 3500;
const SHOW_ERROR_MS = 8000;

let $host;
function host() {
  if (!$host) {
    $host = document.createElement("div");
    $host.className = "pb-toasts";
    (document.querySelector("pb-app") ?? document.body).append($host);
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
