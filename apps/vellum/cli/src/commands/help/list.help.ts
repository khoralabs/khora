import type { CommandHelp } from "@khoralabs/cli-kit";

export const listHelp: CommandHelp = {
  command: "list",
  summary: "List local vellum room rows under obp/rooms",
  args: `vellum list [--data-dir=…] [--json]`,
};
