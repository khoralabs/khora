import type { CommandHelp } from "@khoralabs/cli-kit";

export const roomCreateHelp: CommandHelp = {
  command: "room create",
  summary: "Create an AT2 room (after register)",
  args: `vellum room create [--target-did=<did>] [--target-username=<u>] [--ttl-ms=<n>] [--base-url=…] [--data-dir=…]`,
};

export const roomJoinHelp: CommandHelp = {
  command: "room join",
  summary: "Redeem a room invite / join token",
  wizard: `vellum room join
# prompts for join token when --join-token is omitted.`,
  args: `vellum room join --join-token=<t> [--base-url=…] [--data-dir=…]`,
};
