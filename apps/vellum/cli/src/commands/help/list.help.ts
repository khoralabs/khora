import type { CommandHelp } from "@khoralabs/cli-kit";

export const listHelp: CommandHelp = {
  command: "list",
  summary: "List local rooms (control metadata under the configured data dir)",
  args: `vellum list [--data-dir=…] [--json]`,
};
