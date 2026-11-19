# Iqra

A web Git client: a small Rust service (git logic + REST API) that serves the frontend.
Run it on your machine, open it in a browser.

## Quick start

```sh
cd backend
cargo build --release          # the frontend is embedded in the binary
./target/release/iqra          # http://127.0.0.1:4747
```

Needs `git` and `ssh` on the PATH. Open http://localhost:4747, then:

1. **Settings (corner avatar) → SSH → add an identity**: your *private* key file (the
   name is optional). Use a key **without a passphrase** (Iqra cannot type one). Click
   *Copy public key* and paste it into GitHub → Settings → SSH keys, then press *Sync*.
   Iqra asks GitHub which account the key belongs to (`ssh -T git@github.com`) and shows
   that account's name and picture. Only github.com is recognised.
2. **`+` tab → Clone** with an SSH URL (`git@github.com:you/repo.git`), or **Open** a
   repository already on disk.
3. Stage, commit, pull and push from the toolbar. Clone, pull and push authenticate with
   the active identity; with none, Iqra uses your ssh-agent and `~/.ssh/config`.

Commits use your normal git config (`user.name`, `user.email`, signing, hooks).

## Configuration (flags or `IQRA_*` environment variables)

| Option | Env | Default |
|---|---|---|
| `--host` | `IQRA_HOST` | `127.0.0.1` |
| `--port` | `IQRA_PORT` | `4747` |
| `--data-dir` | `IQRA_DATA_DIR` | `~/.local/share/iqra` (projects, identities, keys) |
| `--clone-dir` | `IQRA_CLONE_DIR` | `~/Projects` |
| `--allowed-host` | `IQRA_ALLOWED_HOSTS` | extra host names, if you reach it by a name |
| (env only) | `IQRA_GITHUB_TOKEN` | optional GitHub token; the Backlog lists the issues of a project's GitHub remote, and private repositories need it |

## Things to know

* **There is no login.** Anything that can reach the port can use your repositories and
  keys. Keep it on `127.0.0.1`. Host and Origin checks stop other websites from using it.
* Uploaded keys live in `<data-dir>/keys/` (mode 0600) and are never sent back to the
  browser. Deleting an identity deletes its key file.
* The GitHub name and picture come from `api.github.com` (public data, no token, 60
  requests an hour per address). If it cannot be reached, the account's login and its
  `github.com/<login>.png` picture are used.
* At startup the log says which data folder was read and how many projects and identities
  it held (`journalctl --user -u iqra`).
* A host seen for the first time is trusted and remembered (`accept-new`); a host whose key
  *changes* is refused.
* Not built yet: merge/conflict view, branch create/delete, fetch, issues (the Backlog
  view is empty: issues live on a forge, not in git).

## Development

```sh
cd backend && cargo test       # debug builds serve ../frontend from disk: edit and reload
```
