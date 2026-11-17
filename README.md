# Iqra

A git client you open in any browser. A small Rust service runs on your machine, reads and writes your
repositories, and serves the app on a port you choose.

```
frontend/   the app: vanilla web components, no build step
backend/    Rust workspace
  crates/core     git logic (libgit2 for reads, the git binary for clone/commit); no HTTP, no UI
  crates/server   REST API + the frontend embedded in the binary
```

## NixOS

Add the flake and enable the service (it runs as **your user**, so your SSH keys, `~/.gitconfig` and
repositories work as they do in a terminal):

```nix
# flake.nix
inputs.iqra.url = "path:/home/you/code/iqra";   # or github:you/iqra
# ...
modules = [
  iqra.nixosModules.default
  ({ ... }: {
    services.iqra = {
      enable = true;
      port = 4747;                 # http://localhost:4747 in any browser
      cloneDir = "~/code";         # where new clones go (default ~/Projects)
      # sshAuthSock = "%t/ssh-agent";   # if cloning private repos says "Permission denied (publickey)"
      # host = "127.0.0.1";             # keep it on loopback: there is no login yet
      # allowedHosts = [ "git.lan" ];   # extra names you reach it by
      # autoStart = false;              # define it, start with `systemctl --user start iqra`
    };
  })
];
```

Logs: `journalctl --user -u iqra -f`. Restart after a rebuild: `systemctl --user restart iqra`.

## Without Nix

```sh
cargo run --manifest-path backend/Cargo.toml          # debug: frontend/ is read from disk, edit and reload
cargo build --release --manifest-path backend/Cargo.toml   # one file with the frontend inside
IQRA_PORT=8080 iqra                                    # or --port 8080
```

Options (flag / environment): `--host` `IQRA_HOST`, `--port` `IQRA_PORT`, `--data-dir` `IQRA_DATA_DIR`,
`--clone-dir` `IQRA_CLONE_DIR`, `--allowed-host` `IQRA_ALLOWED_HOSTS`, log level `IQRA_LOG` (default `info`).

## Security

There is no login. The service listens on 127.0.0.1, refuses requests whose `Host` is not an expected
name (DNS rebinding), refuses writes whose `Origin` is not the page itself, and only accepts JSON bodies.
Do not expose it to a network you do not trust.

## Tests

`cargo test --manifest-path backend/Cargo.toml` (needs `git` on PATH).
