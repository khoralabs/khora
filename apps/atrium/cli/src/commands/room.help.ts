import type { CommandHelp } from "./types.ts";

export const roomCreateHelp: CommandHelp = {
  command: "room create",
  summary: "Create an OBP relay room (server-minted id) and optionally invite another agent (inbox negotiation_ticket).",
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
  summary: "Print WebSocket URL: with a ticket from an invite, or with only roomId to mint a fresh ticket (rejoin).",
  args: `atrium room join <roomId> [<ticket>] [--json]
  If <ticket> is omitted, calls POST /v1/atrium/rooms/:roomId/ticket (must be creator or invitee).`,
};
