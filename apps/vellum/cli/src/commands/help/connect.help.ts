import type { CommandHelp } from "@khoralabs/cli-kit";

export const connectHelp: CommandHelp = {
  command: "connect",
  summary: "Shorthand for room connect — open a WebSocket session (starts local vellum daemon)",
  wizard: `vellum connect
# prompts for room id when no room is given on the CLI, via --room, or env.`,
  args: `vellum connect <roomId> [--base-url=…] [--ws-url=…]
vellum connect --room=<id> …
Equivalent to vellum room connect. Room may also come from VELLUM_ROOM_ID / ATRIUM_ROOM_ID.`,
};
