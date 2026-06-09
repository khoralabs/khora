import { isRosterAtCapacity } from "../registry";
import { jsonError } from "../responses";
import type { ChannelRelayHttpDeps } from "./deps";
import {
  applyRateLimit,
  checkDefaultIpRateLimit,
  mintTicketForChannel,
  readBoundedBody,
  requireAuthedDid,
} from "./request";

export async function handleChannelsInviteJoin(
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

  const didCheck = applyRateLimit(deps.rateLimiters.channelsJoinDid(did));
  if (didCheck !== undefined) return didCheck;

  let inviteToken: string;
  try {
    const body = JSON.parse(bodyText) as { inviteToken?: unknown; joinToken?: unknown };
    const raw =
      typeof body.joinToken === "string"
        ? body.joinToken
        : typeof body.inviteToken === "string"
          ? body.inviteToken
          : "";
    if (raw.trim().length === 0) {
      return jsonError("joinToken required", 400);
    }
    inviteToken = raw.trim();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const t = deps.now();
  const rec = deps.registry.redeemInvite(inviteToken, did, t);
  if (rec === undefined) {
    return jsonError("Invalid or expired invite token", 400);
  }

  const channel = deps.registry.getChannel(rec.channelId, t);
  if (channel === undefined) {
    return jsonError("Channel no longer active", 410);
  }
  if (isRosterAtCapacity(deps.registry.countActiveMembers(rec.channelId), channel.maxPopulation)) {
    return jsonError("channel population limit reached", 409);
  }

  deps.registry.addMember({
    channelId: rec.channelId,
    principalDid: did,
    maxChains: channel.maxChains,
    joinedAtMs: t,
  });

  const ticketRes = await mintTicketForChannel(
    deps,
    req,
    rec.channelId,
    channel.expiresAtMs,
    deps.registry.channelPolicy(channel),
  );
  const payload = (await ticketRes.json()) as Record<string, unknown>;
  return Response.json({ ...payload, creatorDid: rec.creatorDid });
}
