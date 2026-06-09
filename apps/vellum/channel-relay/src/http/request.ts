import type { VellumChannelPolicy } from "@khoralabs/vellum-contracts";

import { type ChannelRelayAuth, MAX_AGENT_REQUEST_BODY_BYTES } from "../auth";
import { VELLUM_HTTP_HEADER } from "../http-headers";
import { clientIpFromRequest, type RateLimitCheck } from "../rate-limit";
import type { ChannelRelayRateLimiters } from "../rate-limit-buckets";
import { authErrorResponse, jsonError, rateLimitedResponse } from "../responses";
import type { ChannelRelayHttpDeps } from "./deps";

export function publicWebSocketBase(req: Request): string {
  const override = process.env.VELLUM_PUBLIC_BASE_URL?.trim();
  if (override !== undefined && override.length > 0) {
    const u = new URL(override.replace(/\/$/, ""));
    return u.protocol === "https:" ? `wss://${u.host}` : `ws://${u.host}`;
  }
  const u = new URL(req.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
}

export function channelWebSocketUrl(req: Request, channelId: string): string {
  const base = publicWebSocketBase(req);
  return `${base}/v1/channels/${encodeURIComponent(channelId)}/ws`;
}

export function applyRateLimit(check: RateLimitCheck): Response | undefined {
  if (!check.ok) return rateLimitedResponse(check.retryAfterSec);
  return undefined;
}

export async function readBoundedBody(req: Request): Promise<string | Response> {
  const cl = req.headers.get(VELLUM_HTTP_HEADER.contentLength);
  if (cl !== null) {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > MAX_AGENT_REQUEST_BODY_BYTES) {
      return jsonError("request body too large", 413);
    }
  }
  const bodyText = await req.text();
  if (bodyText.length > MAX_AGENT_REQUEST_BODY_BYTES) {
    return jsonError("request body too large", 413);
  }
  return bodyText;
}

export function checkDefaultIpRateLimit(
  req: Request,
  rateLimiters: ChannelRelayRateLimiters,
): Response | undefined {
  return applyRateLimit(rateLimiters.defaultIp(clientIpFromRequest(req)));
}

export async function requireAuthedDid(
  auth: ChannelRelayAuth,
  req: Request,
  url: URL,
  bodyText: string,
): Promise<{ did: string } | Response> {
  try {
    return await auth.requireAuthenticatedRequest(req, url, bodyText, []);
  } catch (e) {
    return authErrorResponse(e);
  }
}

export async function mintWsAttachForChannel(
  deps: ChannelRelayHttpDeps,
  req: Request,
  channelId: string,
  channelExpiresAtMs: number,
  options?: { includeTicket?: boolean; policy?: VellumChannelPolicy },
): Promise<Response> {
  const t = deps.now();
  const { nonce, expiresAtMs: upgradeNonceExpiresAtMs } = deps.registry.mintWsUpgradeNonce(
    channelId,
    channelExpiresAtMs,
    t,
  );
  const body: Record<string, unknown> = {
    channelId,
    webSocketUrl: channelWebSocketUrl(req, channelId),
    upgradeNonce: nonce,
    upgradeNonceExpiresAtMs,
  };
  if (options?.includeTicket !== false) {
    const minted = await deps.hub.mintChannelTicket(channelId);
    if (minted === undefined) {
      return jsonError("Channel not found or expired", 404);
    }
    body.ticket = minted.ticket;
    body.expiresAtMs = channelExpiresAtMs;
  }
  if (options?.policy !== undefined) {
    body.policy = options.policy;
  }
  return Response.json(body);
}

export async function mintTicketForChannel(
  deps: ChannelRelayHttpDeps,
  req: Request,
  channelId: string,
  expiresAtMs: number,
  policy?: VellumChannelPolicy,
): Promise<Response> {
  return mintWsAttachForChannel(deps, req, channelId, expiresAtMs, {
    includeTicket: true,
    policy,
  });
}

export function requireMember(
  deps: ChannelRelayHttpDeps,
  channelId: string,
  did: string,
  nowMs: number,
): Response | undefined {
  const channel = deps.registry.getChannel(channelId, nowMs);
  if (channel === undefined) return jsonError("Channel not found or expired", 404);
  if (!deps.registry.isActiveMember(channelId, did)) {
    return jsonError("not a channel member", 403);
  }
  return undefined;
}
