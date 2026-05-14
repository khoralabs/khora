import type { CommandHelp } from "./types.ts";

export const roomCreateHelp: CommandHelp = {
  command: "room create",
  summary:
    "Create an OBP relay room (server-minted id) and optionally invite another agent (inbox negotiation_ticket).",
  args: `atrium room create [--target-username <u>] [--target-did <did>] [--ttl-ms N] [--json]
  Requires registration. Returns roomId + WebSocket URL (with ticket).`,
};

export const roomListHelp: CommandHelp = {
  command: "room list",
  summary: "List rooms you created or were invited to.",
  args: `atrium room list [--json]`,
};

export const roomJoinHelp: CommandHelp = {
  command: "room join",
  summary:
    "Run a room-handler daemon (one OS process per room; OBP store under <dataDir>/obp/rooms/…); foreground unless --background.",
  args: `atrium room join <roomId> [<ticket>] [--json] [--background|-b]
  If <ticket> is omitted, mints a ticket via POST /v1/atrium/rooms/:roomId/ticket (creator or invitee).
  Default: run the room daemon attached to this terminal (stdio inherited).
  --background, -b   Detach; logs to <dataDir>/daemons/rooms/<room>.log.`,
};
