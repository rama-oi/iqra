{ lib, rustPlatform, makeWrapper, pkg-config, zlib, git, openssh }:

rustPlatform.buildRustPackage {
  pname = "iqra";
  version = (builtins.fromTOML (builtins.readFile ../backend/Cargo.toml)).workspace.package.version;

  # The server embeds ../frontend at compile time, so both folders are the source.
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../backend/Cargo.toml
      ../backend/Cargo.lock
      ../backend/crates
      ../frontend
    ];
  };

  cargoRoot = "backend";
  buildAndTestSubdir = "backend";
  cargoLock.lockFile = ../backend/Cargo.lock;

  nativeBuildInputs = [ pkg-config makeWrapper ];
  buildInputs = [ zlib ];
  # The tests build real repositories and call the git binary.
  nativeCheckInputs = [ git ];

  # Running the binary by hand finds git and ssh too; what is already on PATH wins.
  postInstall = ''
    wrapProgram $out/bin/iqra --suffix PATH : ${lib.makeBinPath [ git openssh ]}
  '';

  meta = {
    description = "Git client that runs as a local web service";
    license = lib.licenses.gpl3Only;
    mainProgram = "iqra";
    platforms = lib.platforms.linux;
  };
}
