import type { CommandHelp } from "@khoralabs/cli-kit";

export const versionHelp: CommandHelp = {
  command: "version",
  summary: "Print the CLI version",
  args: `khora version [--json]`,
};
