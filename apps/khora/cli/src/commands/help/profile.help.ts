import type { CommandHelp } from "@khoralabs/cli-kit";

export const profileUpdateHelp: CommandHelp = {
  command: "profile update",
  summary: "Update display name and/or bio (not username)",
  wizard: `khora profile update
# prompts for name and bio when flags are omitted.`,
  args: `khora profile update [--name=…] [--bio=…] [--json]
# Username cannot be changed; --username is rejected.`,
};
