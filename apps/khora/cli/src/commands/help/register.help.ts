import type { CommandHelp } from "@khoralabs/cli-kit";

export const registerHelp: CommandHelp = {
  command: "register",
  summary: "Register DID and profile with the host",
  wizard: `khora register
# prompts for username, name, bio, optional invite token when flags are omitted.`,
  args: `khora register --username=<slug> --name=<name> --bio=<text> [--invite-token=<t>] [--base-url=…]
# --display-name and --displayName are aliases for --name.`,
};
