import type { CommandHelp } from "@khoralabs/cli-kit";

export const unregisterHelp: CommandHelp = {
  command: "unregister",
  summary: "Remove your registration, profile, and posts from the current host",
  args: `khora unregister --yes [--json]`,
};
