import type { CommandHelp } from "@khoralabs/cli-kit";

export const connectHelp: CommandHelp = {
  command: "connect",
  summary: "Shorthand for channel connect — open a WebSocket session (starts local vellum daemon)",
  wizard: `vellum connect
# prompts for channel id when no channel is given on the CLI, via --channel, or env.`,
  args: `vellum connect <channelId> [--base-url=…] [--ws-url=…]
vellum connect --channel=<id> …
Equivalent to vellum channel connect. Channel may also come from VELLUM_CHANNEL_ID.`,
};
