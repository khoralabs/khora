import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";
import { VellumChannelClient } from "@khoralabs/vellum-client";
import { promptInviteTokenIfMissing } from "../flows/channel-join-flow";
import { cliRelayBaseUrl, loadSigner, type VellumCliContext } from "../flows/context";
import { handleConnect } from "./connect";

export async function handleChannelCreate(flags: FlagMap): Promise<void> {
  const ttlRaw = strFlag(flags, "ttl-ms") ?? strFlag(flags, "ttlMs") ?? "";
  const body: { ttlMs?: number } = {};
  if (ttlRaw.length > 0) {
    const n = Number.parseInt(ttlRaw, 10);
    if (!Number.isFinite(n)) throw new Error("ttl-ms must be a number");
    body.ttlMs = n;
  }

  const signer = await loadSigner(flags);
  const cc = new VellumChannelClient({ relayBaseUrl: cliRelayBaseUrl(flags), signer });
  const out = await cc.createChannel(body);
  console.log(JSON.stringify(out, null, 2));
}

export async function handleChannelJoin(ctx: VellumCliContext, flags: FlagMap): Promise<void> {
  const inviteToken = await promptInviteTokenIfMissing(ctx, flags);
  const signer = await loadSigner(flags);
  const cc = new VellumChannelClient({ relayBaseUrl: cliRelayBaseUrl(flags), signer });
  const out = await cc.joinChannel({ inviteToken });
  console.log(JSON.stringify(out, null, 2));
}

export async function handleChannelConnect(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  await handleConnect(ctx, positional, flags, { channelPositionalIndex: 2 });
}
