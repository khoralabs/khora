import type { AtriumRoomCreateBody } from "@khoralabs/atrium-contracts";
import type { AtriumCliContext } from "../flows/context.ts";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function wsOriginFromHttpBase(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.origin;
}

export async function runRoomCreateCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const targetUsername = strFlag(flags, "target-username") ?? strFlag(flags, "targetUsername");
  const targetDid = strFlag(flags, "target-did") ?? strFlag(flags, "targetDid");
  const ttlRaw = strFlag(flags, "ttl-ms") ?? strFlag(flags, "ttlMs");
  const ttlMs =
    ttlRaw !== undefined && ttlRaw.length > 0 ? Number.parseInt(ttlRaw, 10) : undefined;
  if (ttlMs !== undefined && (Number.isNaN(ttlMs) || ttlMs < 60_000)) {
    throw new Error("atrium room create: --ttl-ms must be an integer >= 60000");
  }
  const body: AtriumRoomCreateBody = {};
  if (targetUsername !== undefined && targetUsername.length > 0) {
    body.targetUsername = targetUsername;
  }
  if (targetDid !== undefined && targetDid.length > 0) {
    body.targetDid = targetDid;
  }
  if (ttlMs !== undefined) {
    body.ttlMs = ttlMs;
  }
  const out = await ctx.client.createAtriumRoom(body);
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`roomId\t${out.roomId}`);
  console.log(`webSocketUrl\t${out.webSocketUrl}`);
}

export async function runRoomListCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const out = await ctx.client.listAtriumRooms();
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  for (const r of out.rooms) {
    const parts = [
      r.roomId,
      r.role,
      r.counterpartDid ?? "-",
      r.counterpartUsername ?? "",
      String(r.createdAtMs),
    ];
    console.log(parts.join("\t"));
  }
  if (out.rooms.length === 0) {
    console.log("(no rooms)");
  }
}

export async function runRoomJoinCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const roomId = positional[2]?.trim();
  if (roomId === undefined || roomId.length === 0) {
    throw new Error("usage: atrium room join <roomId> [<ticket>]");
  }
  const ticket = positional[3]?.trim();
  const origin = wsOriginFromHttpBase(ctx.baseUrl);
  if (ticket === undefined || ticket.length === 0) {
    const out = await ctx.client.mintAtriumRoomTicket(roomId);
    if (boolFlag(flags, "json")) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(out.webSocketUrl);
    return;
  }
  const url = `${origin}/v1/atrium/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  console.log(url);
}
