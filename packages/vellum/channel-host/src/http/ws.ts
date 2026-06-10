import type { FrameRelayHubWsData } from "@khoralabs/obp-frame-relay";
import { vellumWsUpgradeProtocol } from "@khoralabs/vellum-contracts";

import { jsonError } from "../responses";
import { wsUpgradeNonceFromRequest } from "../ws-upgrade-nonce";
import { resolveChannelId } from "./channel-id";
import type { ChannelRelayHttpDeps } from "./deps";
import { checkDefaultIpRateLimit } from "./request";

export async function handleChannelWsUpgrade(
  deps: ChannelRelayHttpDeps,
  req: Request,
  _url: URL,
  channelIdRaw: string,
  server: Bun.Server<FrameRelayHubWsData>,
): Promise<Response | undefined> {
  const ipCheck = checkDefaultIpRateLimit(req, deps.rateLimiters);
  if (ipCheck !== undefined) return ipCheck;

  const channelId = resolveChannelId(deps, channelIdRaw);
  if (channelId instanceof Response) return channelId;
  const t = deps.now();
  const channel = deps.registry.getChannel(channelId, t);
  if (channel === undefined) return jsonError("Channel not found or expired", 404);

  const upgradeNonce = wsUpgradeNonceFromRequest(req);
  let admitted = false;
  let selectedProtocol: string | undefined;

  if (upgradeNonce !== undefined) {
    admitted = deps.registry.consumeWsUpgradeNonce(channelId, upgradeNonce, t);
    if (admitted) {
      selectedProtocol = vellumWsUpgradeProtocol(upgradeNonce);
    }
  }

  if (!admitted) {
    return jsonError("Invalid or expired upgrade credentials", 401);
  }

  const minted = await deps.hub.mintChannelTicket(channelId);
  if (minted === undefined) {
    return jsonError("Channel not found or expired", 404);
  }

  const upgraded = server.upgrade(req, {
    data: { kind: "channel", sessionId: channelId, ticket: minted.ticket },
    ...(selectedProtocol !== undefined ? { protocol: selectedProtocol } : {}),
  });
  if (!upgraded) return jsonError("WebSocket upgrade failed", 500);
  return undefined;
}
