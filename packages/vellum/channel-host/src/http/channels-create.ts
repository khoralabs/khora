import { zVellumChannelCreateBody } from "@khoralabs/vellum-contracts";

import { MAX_CHANNEL_TTL_MS } from "../auth";
import { randomInviteToken } from "../invites";
import { parseCreateChannelPolicy } from "../registry";
import { DEFAULT_CHANNEL_TTL_MS } from "../relay-config";
import { jsonError } from "../responses";
import type { ChannelRelayHttpDeps } from "./deps";
import {
  applyRateLimit,
  checkDefaultIpRateLimit,
  mintWsAttachForChannel,
  readBoundedBody,
  requireAuthedDid,
} from "./request";

export async function handleChannelsCreate(
  deps: ChannelRelayHttpDeps,
  req: Request,
  url: URL,
): Promise<Response> {
  const ipCheck = checkDefaultIpRateLimit(req, deps.rateLimiters);
  if (ipCheck !== undefined) return ipCheck;

  const bodyRead = await readBoundedBody(req);
  if (bodyRead instanceof Response) return bodyRead;
  const bodyText = bodyRead;

  const authed = await requireAuthedDid(deps.auth, req, url, bodyText);
  if (authed instanceof Response) return authed;
  const { did } = authed;

  const didCheck = applyRateLimit(deps.rateLimiters.channelsCreateDid(did));
  if (didCheck !== undefined) return didCheck;

  let parsedBody: ReturnType<typeof zVellumChannelCreateBody.parse>;
  if (bodyText.trim().length === 0) {
    parsedBody = zVellumChannelCreateBody.parse({});
  } else {
    try {
      parsedBody = zVellumChannelCreateBody.parse(JSON.parse(bodyText) as unknown);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid JSON body";
      return jsonError(msg, 400);
    }
  }

  const ttlMs = Math.min(parsedBody.ttlMs ?? DEFAULT_CHANNEL_TTL_MS, MAX_CHANNEL_TTL_MS);
  const policy = parseCreateChannelPolicy(parsedBody);
  const t = deps.now();

  if (deps.relayProfile.mode !== "pool") {
    return jsonError("channel create is only available in pool mode", 501);
  }
  if (deps.registry.countActiveChannels(t) >= deps.relayProfile.maxRelayChannels) {
    return jsonError("relay at channel capacity", 503);
  }

  const channelId = crypto.randomUUID();
  const expiresAtMs = t + ttlMs;
  await deps.hub.createChannel(channelId, ttlMs);
  deps.registry.insertChannel({
    channelId,
    creatorDid: did,
    admissionMode: policy.admissionMode,
    maxPopulation: policy.maxPopulation,
    maxChains: policy.maxChains,
    expiresAtMs,
    createdAtMs: t,
  });

  const inviteToken = randomInviteToken();
  deps.registry.putInvite(inviteToken, { channelId, creatorDid: did, expiresAtMs });

  const attachRes = await mintWsAttachForChannel(deps, req, channelId, expiresAtMs, {
    includeTicket: true,
    policy: deps.registry.channelPolicy({
      channelId,
      creatorDid: did,
      ...policy,
      expiresAtMs,
      createdAtMs: t,
    }),
  });
  if (!attachRes.ok) return attachRes;

  const attach = (await attachRes.json()) as Record<string, unknown>;
  return Response.json({ ...attach, inviteToken });
}
