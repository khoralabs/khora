import type { CommandHelp } from "@khoralabs/cli-kit";

export const listHelp: CommandHelp = {
  command: "list",
  summary: "List local Vellum channels and daemon connection status",
  args: `vellum list [--data-dir=…] [--json]`,
};
