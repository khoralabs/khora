import type { CommandHelp } from "@khoralabs/cli-kit";

export const listHelp: CommandHelp = {
  command: "list",
  summary: "List your rooms on the host and local connection status",
  args: `vellum list [--data-dir=…] [--base-url=…] [--json]`,
};
