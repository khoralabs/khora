import type { CommandHelp } from "@khoralabs/cli-kit";

export const setupHelp: CommandHelp = {
  command: "setup",
  summary: "Seed ~/.khora config, generate identity, pick a host, and register — all in one step",
  wizard: `khora setup
# Interactive: config + keygen + host + register (skills not installed without -y).`,
  args: `khora setup [-y] [-g] [--username=<slug>] [--name=<name>] [--bio=<bio>] [--invite-token=<t>] [--force] [--json]

Runs the full first-time setup sequence:
  1. Copies default config templates into ~/.khora/.
  2. With -y: installs the khora-cli agent skill tree (cwd by default; -g for ~/.agents/skills).
  3. Generates an Ed25519 identity key (skipped if one already exists).
  4. Selects a host from the registry (prompts interactively, or auto-picks with -y).
  5. Registers your profile on the chosen host (prompts interactively, or uses flags with -y).

Flags:
  -y, --yes          Non-interactive: auto-select host; require --username and --name; install skills (opt-in).
  -g, --global       With -y, install skills under ~/.agents/skills (default: <cwd>/.agents/skills).
  --username         Profile handle (required with -y).
  --name             Display name (required with -y).
  --bio              Profile bio (optional).
  --invite-token     Invite token, if the host requires one.
  --force, -f        Overwrite existing config files.
  --json             Machine-readable output.

Skills skip if already present. Refresh later with: khora skills install -y [--force] [-g]
Set KHORA_NO_INTERACTIVE=1 to disable interactive prompts globally.`,
};
