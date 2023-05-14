{
  description = "Gadget devtools development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    dateilager-flake = {
      url = "github:gadget-inc/dateilager/v0.5.17";
      inputs = {
        nixpkgs.follows = "nixpkgs";
        flake-utils.follows = "flake-utils";
      };
    };
  };

  outputs = { self, nixpkgs, flake-utils, dateilager-flake }:
    (flake-utils.lib.eachDefaultSystem
      (system: nixpkgs.lib.fix (flake:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          dateilager = dateilager-flake.defaultPackage.${system};
        in
        {
          packages = {
            dateilager = dateilager;
            deno = pkgs.deno;
            go-migrate = pkgs.go-migrate.overrideAttrs (attrs: { buildFlagsArray = [ "-tags=postgres" ]; });
            mkcert = pkgs.mkcert;
            nc = pkgs.netcat;
            postgresql = pkgs.postgresql;
            redis = pkgs.redis;
            rnix-lsp = pkgs.rnix-lsp;
            toxiproxy = pkgs.toxiproxy;

            services = pkgs.writeShellScriptBin "services" ''
              export DL_MIGRATION_DIR=${dateilager.migrations}
              deno run -A "$WORKSPACE_ROOT"/examples/services.ts "$@"
            '';
          };

          devShell = pkgs.mkShell {
            packages = builtins.attrValues flake.packages;

            shellHook = ''
              export WORKSPACE_ROOT="$PWD"
            '';
          };
        }
      )));
}
