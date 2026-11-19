export function toSshUrl(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text))
    return { ok: true, url: text, converted: false };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, message: "That does not look like a valid URL." };
  }
  if (url.port) {
    return {
      ok: false,
      message:
        "This URL uses a custom port, so it cannot be converted. Enter the SSH URL instead.",
    };
  }

  const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!path) return { ok: false, message: "The URL has no repository path." };
  return { ok: true, url: `git@${url.hostname}:${path}.git`, converted: true };
}

export function repoName(url) {
  const cleaned = String(url ?? "")
    .trim()
    .replace(/[\/\\]+$/, "")
    .replace(/\.git$/i, "");
  return cleaned.split(/[\/:\\]/).pop() ?? "";
}
