{
  description = "Iqra: a git client that runs as a local web service";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (pkgs: rec {
        iqra = pkgs.callPackage ./nix/package.nix { };
        default = iqra;
      });

      # `nix develop`: rust toolchain plus the tools the tests and the service call.
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [ cargo rustc clippy rustfmt rust-analyzer git openssh pkg-config ];
          RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
          shellHook = ''
            echo "Iqra dev shell. Run: cargo run --manifest-path backend/Cargo.toml  (frontend/ is read from disk in debug builds)"
          '';
        };
      });

      nixosModules.default = import ./nix/module.nix self;
      overlays.default = final: _prev: { iqra = final.callPackage ./nix/package.nix { }; };
    };
}
