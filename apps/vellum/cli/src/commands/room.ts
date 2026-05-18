import { AtriumClient, type AtriumRoomCreateBody } from "@khoralabs/atrium-client";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import { cliBaseUrl, loadSigner, type VellumCliContext } from "../flows/context.ts";
import { promptJoinTokenIfMissing } from "../flows/room-join-flow.ts";
import { disconnectLocalRoom } from "./disconnect.ts";

export async function handleRoomCreate(flags: FlagMap): Promise<void> {
  const baseUrl = cliBaseUrl(flags);
  const targetDid = strFlag(flags, "target-did") ?? strFlag(flags, "targetDid") ?? "";
  const targetUsername =
    strFlag(flags, "target-username") ?? strFlag(flags, "targetUsername") ?? "";
  const ttlRaw = strFlag(flags, "ttl-ms") ?? strFlag(flags, "ttlMs") ?? "";

  const signer = await loadSigner(flags);
  const body: AtriumRoomCreateBody = {};
  if (ttlRaw.length > 0) {
    const n = Number.parseInt(ttlRaw, 10);
    if (!Number.isFinite(n)) throw new Error("ttl-ms must be a number");
    body.ttlMs = n;
  }
  if (targetDid.length > 0) body.targetDid = targetDid;
  if (targetUsername.length > 0) body.targetUsername = targetUsername;

  const ac = new AtriumClient({ baseUrl, signer });
  try {
    const out = await ac.createRoom(body);
    console.log(JSON.stringify(out, null, 2));
  } finally {
    ac.dispose();
  }
}

export async function handleRoomRead(positional: string[], flags: FlagMap): Promise<void> {
  const roomId = positional[2]?.trim();
  if (roomId === undefined || roomId.length === 0) {
    throw new Error("room id required");
  }
  const signer = await loadSigner(flags);
  const ac = new AtriumClient({ baseUrl: cliBaseUrl(flags), signer });
  try {
    const item = await ac.getRoom(roomId);
    if (boolFlag(flags, "json")) {
      console.log(JSON.stringify(item, null, 2));
      return;
    }
    const peer = item.peerDid ?? "-";
    const exp = item.expiresAtMs !== undefined ? String(item.expiresAtMs) : "-";
    console.log(`roomId:\t${item.roomId}`);
    console.log(`role:\t${item.role}`);
    console.log(`creatorDid:\t${item.creatorDid}`);
    console.log(`peerDid:\t${peer}`);
    console.log(`createdAtMs:\t${String(item.createdAtMs)}`);
    console.log(`expiresAtMs:\t${exp}`);
  } finally {
    ac.dispose();
  }
}

export async function handleRoomLeave(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const roomId = positional[2]?.trim();
  if (roomId === undefined || roomId.length === 0) {
    throw new Error("room id required");
  }
  const force = boolFlag(flags, "force");
  if (!force) {
    const ans = await ctx.readLine("Leave this room permanently? [y/N] ");
    if (ans.trim().toLowerCase() !== "y") {
      console.log("cancelled");
      return;
    }
  }
  disconnectLocalRoom(flags, roomId);
  const signer = await loadSigner(flags);
  const ac = new AtriumClient({ baseUrl: cliBaseUrl(flags), signer });
  try {
    await ac.leaveRoom(roomId);
  } finally {
    ac.dispose();
  }
  console.log(`left room ${roomId}`);
}

export async function handleRoomJoin(ctx: VellumCliContext, flags: FlagMap): Promise<void> {
  const baseUrl = cliBaseUrl(flags);
  const joinToken = await promptJoinTokenIfMissing(ctx, flags);

  const signer = await loadSigner(flags);
  const ac = new AtriumClient({ baseUrl, signer });
  try {
    const out = await ac.redeemRoomInvite({ joinToken });
    console.log(JSON.stringify(out, null, 2));
  } finally {
    ac.dispose();
  }
}
