import type { CommandHelp } from "@khoralabs/cli-kit";

export const channelCreateHelp: CommandHelp = {
  command: "channel create",
  summary: "Create a Vellum channel on the channel-relay",
  args: `vellum channel create [--ttl-ms=<n>] [--base-url=…] [--data-dir=…]`,
};

export const channelJoinHelp: CommandHelp = {
  command: "channel join",
  summary: "Redeem a channel invite token",
  wizard: `vellum channel join`,
  args: `vellum channel join --invite-token=<t> [--base-url=…] [--data-dir=…]`,
};

export const channelConnectHelp: CommandHelp = {
  command: "channel connect",
  summary: "Open a WebSocket session for a channel (starts local daemon)",
  wizard: `vellum channel connect
# prompts for channel id when no channel is given on the CLI, via --channel, or env.`,
  args: `vellum channel connect <channelId> [--base-url=…] [--ws-url=…] [--data-dir=…]
vellum channel connect --channel=<id> …`,
};
