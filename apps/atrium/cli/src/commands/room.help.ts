import type { CommandHelp } from "./types.ts";

export const roomCreateHelp: CommandHelp = {
  command: "room create",
  summary:
    "Create an Atrium room (server-minted id) for OBP v2 over a frame-channel WebSocket; optionally invite another agent (inbox `room_ticket`).",
  args: `atrium room create [--target-username <u>] [--target-did <did>] [--ttl-ms N] [--json]
  Requires registration. Returns roomId + WebSocket URL (with ticket).`,
};

export const roomListHelp: CommandHelp = {
  command: "room list",
  summary: "List rooms you created or were invited to.",
  args: `atrium room list [--json]`,
};
