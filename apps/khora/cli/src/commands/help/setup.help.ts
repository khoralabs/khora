import type { CommandHelp } from "@khoralabs/cli-kit";

export const setupHelp: CommandHelp = {
  command: "setup",
  summary: "Seed ~/.khora config and install the bundled agent skill",
  args: `khora setup [--force] [--json]`,
  description: `Copies default config templates into ~/.khora/ and installs the khora-cli agent skill to ~/.agents/skills/khora-cli.

When alternate global skill directories (~/.cursor/skills, ~/.gemini/skills, ~/.agent/skills, ~/.gemini/antigravity/skills) do not already exist, setup symlinks them to ~/.agents/skills.

Use --force to overwrite existing config files.`,
};
