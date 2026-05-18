import { AtriumClient, type AtriumRoomCreateBody } from "@khoralabs/atrium-client";
import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

import { cliBaseUrl, loadSigner, type VellumCliContext } from "../flows/context.ts";
import { promptJoinTokenIfMissing } from "../flows/room-join-flow.ts";

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
