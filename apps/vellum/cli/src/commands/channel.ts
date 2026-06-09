import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";
import { VellumChannelClient } from "@khoralabs/vellum-client";
import type { VellumMaxChains } from "@khoralabs/vellum-contracts";
import { promptInviteTokenIfMissing } from "../flows/channel-join-flow";
import { cliRelayBaseUrl, loadSigner, type VellumCliContext } from "../flows/context";
import { handleConnect } from "./connect";

function parseChainLimit(raw: string | undefined): VellumMaxChains | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const s = raw.trim();
  const colon = s.indexOf(":");
  if (colon < 0) throw new Error("chain-limit must be global:N or principal:N");
  const mode = s.slice(0, colon).trim();
  const measure = Number.parseInt(s.slice(colon + 1).trim(), 10);
  if (!Number.isFinite(measure) || measure <= 0) {
    throw new Error("chain-limit measure must be a positive integer");
  }
  if (mode === "global") return { mode: "global", measure };
  if (mode === "principal") return { mode: "principal", measure };
  throw new Error("chain-limit mode must be global or principal");
}

export async function handleChannelCreate(flags: FlagMap): Promise<void> {
  const ttlRaw = strFlag(flags, "ttl-ms") ?? strFlag(flags, "ttlMs") ?? "";
  const maxPopRaw = strFlag(flags, "max-population") ?? strFlag(flags, "maxPopulation");
  const chainLimitRaw = strFlag(flags, "chain-limit") ?? strFlag(flags, "chainLimit");

  const body: {
    ttlMs?: number;
    maxPopulation?: number;
    maxChains?: VellumMaxChains;
  } = {};

  if (ttlRaw.length > 0) {
    const n = Number.parseInt(ttlRaw, 10);
    if (!Number.isFinite(n)) throw new Error("ttl-ms must be a number");
    body.ttlMs = n;
  }
  if (maxPopRaw !== undefined && maxPopRaw.length > 0) {
    const n = Number.parseInt(maxPopRaw, 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error("max-population must be a positive integer");
    body.maxPopulation = n;
  }
  const chainLimit = parseChainLimit(chainLimitRaw);
  if (chainLimit !== undefined) body.maxChains = chainLimit;

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
