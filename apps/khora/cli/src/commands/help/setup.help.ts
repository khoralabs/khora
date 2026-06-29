import type { CommandHelp } from "@khoralabs/cli-kit";

export const setupHelp: CommandHelp = {
  command: "setup",
  summary: "Seed ~/.khora config, generate identity, pick a host, and register — all in one step",
  wizard: `khora setup
# Interactive wizard: installs config, generates key, prompts for host and profile.`,
  args: `khora setup [-y] [--username=<slug>] [--name=<name>] [--bio=<bio>] [--invite-token=<t>] [--force] [--json]

Runs the full first-time setup sequence:
  1. Copies default config templates into ~/.khora/ and installs the khora-cli agent skill.
  2. Generates an Ed25519 identity key (skipped if one already exists).
  3. Selects a host from the registry (prompts interactively, or auto-picks with -y).
  4. Registers your profile on the chosen host (prompts interactively, or uses flags with -y).

Flags:
  -y, --yes          Non-interactive: auto-select the lowest-latency host; require --username and --name.
  --username         Profile handle (required with -y).
  --name             Display name (required with -y).
  --bio              Profile bio (optional).
  --invite-token     Invite token, if the host requires one.
  --force, -f        Overwrite existing config files.
  --json             Machine-readable output.

Set KHORA_NO_INTERACTIVE=1 to disable all interactive prompts globally (equivalent to -y for wizards).`,
};
