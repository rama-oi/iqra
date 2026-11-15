// The app talks to remotes over SSH only. `toSshUrl` turns what the person typed
// into the URL that will really be used, so the dialog can show it before cloning.
//
//   null                                     nothing typed yet
//   { ok: true,  url, converted: false }     already SSH (git@host:path or ssh://...), unchanged
//   { ok: true,  url, converted: true }      an http(s) URL, rewritten as git@host:path.git
//   { ok: false, message }                   an http(s) URL that cannot be rewritten safely
//
// The rewrite is the one GitHub, GitLab, Bitbucket and most self-hosted servers use
// (https://host/owner/repo -> git@host:owner/repo.git). Hosts with their own SSH
// layout, like Azure DevOps, need the SSH URL typed in.
export function toSshUrl(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return { ok: true, url: text, converted: false };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, message: "That does not look like a valid URL." };
  }
  if (url.port) {
    // the web port says nothing about the SSH port
    return {
      ok: false,
      message: "This URL uses a custom port, so it cannot be converted. Enter the SSH URL instead.",
    };
  }

  const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!path) return { ok: false, message: "The URL has no repository path." };
  return { ok: true, url: `git@${url.hostname}:${path}.git`, converted: true };
}

// "git@host:user/repo.git", "https://host/user/repo" and "ssh://git@host/user/repo.git" all give "repo".
export function repoName(url) {
  const cleaned = String(url ?? "").trim().replace(/[\/\\]+$/, "").replace(/\.git$/i, "");
  return cleaned.split(/[\/:\\]/).pop() ?? "";
}
