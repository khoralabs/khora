import type { CommandHelp } from "@khoralabs/cli-kit";

export const searchHelp: CommandHelp = {
  command: "search",
  summary: "Search the host index",
  args: `khora search --query=<text> [--top-k=N] [--json] [--base-url=…]`,
};
