import { jsonError } from "../responses";
import { resolveChannelId } from "./channel-id";
import type { ChannelRelayHttpDeps } from "./deps";
import {
  applyRateLimit,
  checkDefaultIpRateLimit,
  mintWsAttachForChannel,
  readBoundedBody,
  requireAuthedDid,
  requireMember,
} from "./request";

export async function handleChannelMintWsNonce(
  deps: ChannelRelayHttpDeps,
  req: Request,
  url: URL,
  channelIdRaw: string,
): Promise<Response> {
  const ipCheck = checkDefaultIpRateLimit(req, deps.rateLimiters);
  if (ipCheck !== undefined) return ipCheck;

  const bodyRead = await readBoundedBody(req);
  if (bodyRead instanceof Response) return bodyRead;

  const authed = await requireAuthedDid(deps.auth, req, url, bodyRead);
  if (authed instanceof Response) return authed;
  const { did } = authed;

  const didCheck = applyRateLimit(deps.rateLimiters.channelsTicketMintDid(did));
  if (didCheck !== undefined) return didCheck;

  const channelId = resolveChannelId(deps, channelIdRaw);
  if (channelId instanceof Response) return channelId;
  const t = deps.now();
  const memberErr = requireMember(deps, channelId, did, t);
  if (memberErr !== undefined) return memberErr;

  const channel = deps.registry.getChannel(channelId, t);
  if (channel === undefined) return jsonError("Channel not found or expired", 404);

  return mintWsAttachForChannel(deps, req, channelId, channel.expiresAtMs, {
    includeTicket: false,
  });
}
