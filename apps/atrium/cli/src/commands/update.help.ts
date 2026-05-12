import type { CommandHelp } from "./types.ts";

export const updateHelp: CommandHelp = {
  command: "update",
  summary:
    "Check the npm registry for a newer release of @khoralabs/atrium-cli and optionally install it.",
  args: `atrium update [--check | --apply | --yes] [--tag <latest|next>]
              [--manager <npm|pnpm|yarn|bun>] [--json]
  Default: prints current/latest and prompts for install on a TTY.
  --check       Only report; do not prompt or install. Exit 0=up-to-date, 10=update available, 1=error.
  --apply, --yes Install without prompting.
  --tag <name>  npm dist-tag to query (default: latest; 'next' for prereleases).
  --manager X   Override package-manager auto-detection (npm | pnpm | yarn | bun).
  --json        Emit a JSON summary: { current, latest, tag, hasUpdate, applied }.

The check reads the binary's own version from the ATRIUM_CLI_VERSION env var
(set by the launcher in published installs). When --apply runs, the daemon is
stopped first (best-effort) and the install command inherits stdio so npm /
pnpm / yarn / bun prompts surface normally.`,
};
