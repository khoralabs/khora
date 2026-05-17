import type { CommandHelp } from "@khoralabs/cli-kit";

export const registerHelp: CommandHelp = {
  command: "register",
  summary: "Register DID and profile with the host",
  wizard: `vellum register
# prompts for username, display name, optional invite token when flags are omitted.`,
  args: `vellum register --username=<slug> --display-name=<name> [--invite-token=<t>] [--base-url=…] [--data-dir=…]
# --displayName is accepted as an alias for --display-name.`,
};
