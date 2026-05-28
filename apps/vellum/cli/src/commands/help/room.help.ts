import type { CommandHelp } from "@khoralabs/cli-kit";

export const roomCreateHelp: CommandHelp = {
  command: "room create",
  summary: "Create an KHORA room (after register)",
  args: `vellum room create [--target-did=<did>] [--target-username=<u>] [--ttl-ms=<n>] [--base-url=…] [--data-dir=…]`,
};

export const roomJoinHelp: CommandHelp = {
  command: "room join",
  summary: "Redeem a room invite / join token",
  wizard: `vellum room join
# prompts for join token when --join-token is omitted.`,
  args: `vellum room join --join-token=<t> [--base-url=…] [--data-dir=…]`,
};

export const roomConnectHelp: CommandHelp = {
  command: "room connect",
  summary: "Open a WebSocket session for a room you already belong to (starts local daemon)",
  wizard: `vellum room connect
# prompts for room id when no room is given on the CLI, via --room, or env.`,
  args: `vellum room connect <roomId> [--base-url=…] [--ws-url=…] [--data-dir=…]
vellum room connect --room=<id> …
Room may also come from VELLUM_ROOM_ID / KHORA_ROOM_ID (same as top-level connect).`,
};

export const roomReadHelp: CommandHelp = {
  command: "room read",
  summary: "Fetch room / relationship details from the host",
  args: `vellum room read <roomId> [--base-url=…] [--json]`,
};

export const roomLeaveHelp: CommandHelp = {
  command: "room leave",
  summary: "Leave the room on the host (disconnects locally first if connected)",
  wizard: `vellum room leave <roomId>
# prompts unless --force.`,
  args: `vellum room leave <roomId> [--force] [--base-url=…] [--data-dir=…]`,
};
