import type { FrameRelayHubWsData } from "@khoralabs/obp-frame-relay";

import { jsonError } from "../responses";
import { handleChainAllocate, handleChainRelease, handleChainStatus } from "./chains";
import { handleChannelsCreate } from "./channels-create";
import { handleChannelsInviteJoin } from "./channels-join";
import type { ChannelRelayHttpDeps } from "./deps";
import { handleChannelMintJoinToken } from "./join-tokens";
import {
  channelAllocatePathRe,
  channelChainStatusPathRe,
  channelJoinTokensPathRe,
  channelReleasePathRe,
  channelTicketPathRe,
  channelWsNoncePathRe,
  channelWsPathRe,
} from "./paths";
import { handleChannelMintTicket } from "./ticket";
import { handleChannelWsUpgrade } from "./ws";
import { handleChannelMintWsNonce } from "./ws-nonce";

export async function routeChannelRelayHttp(
  deps: ChannelRelayHttpDeps,
  req: Request,
  server: Bun.Server<FrameRelayHubWsData>,
): Promise<Response | undefined> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }

  if (req.method === "POST" && url.pathname === "/v1/channels/join") {
    return handleChannelsInviteJoin(deps, req, url);
  }

  if (req.method === "POST" && url.pathname === "/v1/channels") {
    if (deps.relayProfile.mode === "single") {
      return jsonError("channel spawn is orchestrator-only; this relay hosts one channel", 501);
    }
    return handleChannelsCreate(deps, req, url);
  }

  const allocateMatch = channelAllocatePathRe.exec(url.pathname);
  if (req.method === "POST" && allocateMatch !== null) {
    return handleChainAllocate(deps, req, url, allocateMatch[1] as string);
  }

  const chainStatusMatch = channelChainStatusPathRe.exec(url.pathname);
  if (req.method === "GET" && chainStatusMatch !== null) {
    return handleChainStatus(
      deps,
      req,
      url,
      chainStatusMatch[1] as string,
      chainStatusMatch[2] as string,
    );
  }

  const releaseMatch = channelReleasePathRe.exec(url.pathname);
  if (req.method === "POST" && releaseMatch !== null) {
    return handleChainRelease(deps, req, url, releaseMatch[1] as string, releaseMatch[2] as string);
  }

  const ticketMatch = channelTicketPathRe.exec(url.pathname);
  if (req.method === "POST" && ticketMatch !== null) {
    return handleChannelMintTicket(deps, req, url, ticketMatch[1] as string);
  }

  const joinTokensMatch = channelJoinTokensPathRe.exec(url.pathname);
  if (req.method === "POST" && joinTokensMatch !== null) {
    return handleChannelMintJoinToken(deps, req, url, joinTokensMatch[1] as string);
  }

  const wsNonceMatch = channelWsNoncePathRe.exec(url.pathname);
  if (req.method === "POST" && wsNonceMatch !== null) {
    return handleChannelMintWsNonce(deps, req, url, wsNonceMatch[1] as string);
  }

  const wsMatch = channelWsPathRe.exec(url.pathname);
  if (req.method === "GET" && wsMatch !== null) {
    const wsRes = await handleChannelWsUpgrade(deps, req, url, wsMatch[1] as string, server);
    if (wsRes !== undefined) return wsRes;
    return undefined;
  }

  return jsonError("Not found", 404);
}
