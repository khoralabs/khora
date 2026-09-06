import type { CommandHelp } from "@khoralabs/cli-kit";

export const skillsInstallHelp: CommandHelp = {
  command: "skills install",
  summary: "Install the bundled khora-cli agent skill tree",
  args: `khora skills install -y [-g] [--force] [--json]`,
  wizard: `Requires -y (opt-in). Default target is <cwd>/.agents/skills/khora-cli.
Use -g for ~/.agents/skills/khora-cli (and tool skill-root symlinks).
Skips if the skill directory already exists unless --force.`,
};
