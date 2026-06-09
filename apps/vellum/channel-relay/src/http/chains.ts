import { zVellumChannelChainAllocateBody } from "@khoralabs/vellum-contracts";

import { jsonError } from "../responses";
import { resolveChannelId } from "./channel-id";
import type { ChannelRelayHttpDeps } from "./deps";
import {
  applyRateLimit,
  checkDefaultIpRateLimit,
  readBoundedBody,
  requireAuthedDid,
  requireMember,
} from "./request";

export async function handleChainAllocate(
  deps: ChannelRelayHttpDeps,
  req: Request,
  url: URL,
  channelIdRaw: string,
): Promise<Response> {
  const ipCheck = checkDefaultIpRateLimit(req, deps.rateLimiters);
  if (ipCheck !== undefined) return ipCheck;

  const bodyRead = await readBoundedBody(req);
  if (bodyRead instanceof Response) return bodyRead;
  const bodyText = bodyRead;

  const authed = await requireAuthedDid(deps.auth, req, url, bodyText);
  if (authed instanceof Response) return authed;
  const { did } = authed;

  const didCheck = applyRateLimit(deps.rateLimiters.channelsAllocateDid(did));
  if (didCheck !== undefined) return didCheck;

  const channelId = resolveChannelId(deps, channelIdRaw);
  if (channelId instanceof Response) return channelId;
  const t = deps.now();
  const memberErr = requireMember(deps, channelId, did, t);
  if (memberErr !== undefined) return memberErr;

  let parsed: ReturnType<typeof zVellumChannelChainAllocateBody.parse>;
  try {
    parsed = zVellumChannelChainAllocateBody.parse(JSON.parse(bodyText) as unknown);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON body";
    return jsonError(msg, 400);
  }

  const channel = deps.registry.getChannel(channelId, t);
  if (channel === undefined) return jsonError("Channel not found or expired", 404);
  if (!deps.registry.isActiveMember(channelId, parsed.counterpartyDid)) {
    return jsonError("counterparty not a member", 400);
  }
  if (parsed.counterpartyDid === did) {
    return jsonError("counterparty must differ from caller", 400);
  }

  const result = deps.registry.allocateChain({
    channelId,
    sessionId: parsed.sessionId,
    partyADid: did,
    partyBDid: parsed.counterpartyDid,
    maxChains: channel.maxChains,
    createdAtMs: t,
  });
  if (!result.ok) return jsonError(result.reason, 409);
  return Response.json({ ok: true as const, sessionId: parsed.sessionId });
}

export async function handleChainStatus(
  deps: ChannelRelayHttpDeps,
  req: Request,
  url: URL,
  channelIdRaw: string,
  sessionIdRaw: string,
): Promise<Response> {
  const ipCheck = checkDefaultIpRateLimit(req, deps.rateLimiters);
  if (ipCheck !== undefined) return ipCheck;

  const authed = await requireAuthedDid(deps.auth, req, url, "");
  if (authed instanceof Response) return authed;
  const { did } = authed;

  const channelId = resolveChannelId(deps, channelIdRaw);
  if (channelId instanceof Response) return channelId;
  const sessionId = decodeURIComponent(sessionIdRaw);
  if (sessionId === "allocate") return jsonError("Not found", 404);

  const t = deps.now();
  const memberErr = requireMember(deps, channelId, did, t);
  if (memberErr !== undefined) return memberErr;

  if (!deps.registry.isChainAllocated(channelId, sessionId)) {
    return jsonError("chain slot not allocated", 404);
  }
  return Response.json({ allocated: true as const, sessionId });
}

export async function handleChainRelease(
  deps: ChannelRelayHttpDeps,
  req: Request,
  url: URL,
  channelIdRaw: string,
  sessionIdRaw: string,
): Promise<Response> {
  const ipCheck = checkDefaultIpRateLimit(req, deps.rateLimiters);
  if (ipCheck !== undefined) return ipCheck;

  const authed = await requireAuthedDid(deps.auth, req, url, "");
  if (authed instanceof Response) return authed;
  const { did } = authed;

  const channelId = resolveChannelId(deps, channelIdRaw);
  if (channelId instanceof Response) return channelId;
  const sessionId = decodeURIComponent(sessionIdRaw);
  const ok = deps.registry.releaseChain(channelId, sessionId, did);
  if (!ok) return jsonError("chain slot not found", 404);
  return Response.json({ ok: true as const });
}
