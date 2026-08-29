import type { CommandHelp } from "@khoralabs/cli-kit";

export const keygenHelp: CommandHelp = {
  command: "keygen",
  summary: "Generate Ed25519 agent identity",
  args: `khora keygen [--force] [--json] [--agent-key-path=…] [--config=…]`,
};
