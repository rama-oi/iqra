self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.iqra;
  inherit (lib) mkEnableOption mkIf mkOption types;
  loopback = [ "127.0.0.1" "localhost" "::1" "[::1]" ];
in
{
  options.services.iqra = {
    enable = mkEnableOption "Iqra, a git client you open in any browser on this machine";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "inputs.iqra.packages.\${system}.default";
      description = "The Iqra package to run.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = ''
        Address to listen on. Iqra has no login, so keep this on loopback unless the
        network is one you trust.
      '';
    };

    port = mkOption {
      type = types.port;
      default = 4747;
      description = "Port to listen on. Open http://localhost:<port> in any browser.";
    };

    allowedHosts = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "git.lan" ];
      description = ''
        Extra host names the service answers to, besides localhost and the listen
        address. Requests with any other Host header are refused (DNS rebinding).
      '';
    };

    cloneDir = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "~/code";
      description = "Folder new clones go into. Null means ~/Projects.";
    };

    dataDir = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "~/.local/share/iqra";
      description = "Where Iqra keeps its list of projects. Null means $XDG_DATA_HOME/iqra.";
    };

    sshAuthSock = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "%t/ssh-agent";
      description = ''
        Socket of your SSH agent, for cloning private repositories. A systemd user
        service does not always inherit SSH_AUTH_SOCK from your shell; set it here if
        clones fail with "Permission denied (publickey)". `%t` is $XDG_RUNTIME_DIR.
      '';
    };

    autoStart = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Start with your user session. When false the service is only defined:
        run `systemctl --user start iqra` when you want it.
      '';
    };
  };

  config = mkIf cfg.enable {
    warnings = lib.optional (!(builtins.elem cfg.host loopback))
      "services.iqra.host is ${cfg.host}: anyone who can reach port ${toString cfg.port} can read and commit to your repositories (Iqra has no login yet).";

    # A user service, not a system one: git needs your SSH keys, your ~/.gitconfig
    # and your repositories, and they all belong to you.
    systemd.user.services.iqra = {
      description = "Iqra git client";
      wantedBy = lib.optional cfg.autoStart "default.target";
      after = [ "network.target" ];
      path = [ pkgs.git pkgs.openssh ];
      environment = {
        IQRA_HOST = cfg.host;
        IQRA_PORT = toString cfg.port;
      }
      // lib.optionalAttrs (cfg.allowedHosts != [ ]) { IQRA_ALLOWED_HOSTS = lib.concatStringsSep "," cfg.allowedHosts; }
      // lib.optionalAttrs (cfg.cloneDir != null) { IQRA_CLONE_DIR = cfg.cloneDir; }
      // lib.optionalAttrs (cfg.dataDir != null) { IQRA_DATA_DIR = cfg.dataDir; }
      // lib.optionalAttrs (cfg.sshAuthSock != null) { SSH_AUTH_SOCK = cfg.sshAuthSock; };
      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = 2;
        NoNewPrivileges = true;
        PrivateTmp = true;
      };
    };
  };
}
