import {
  createFrameRelayHub,
  type FrameRelayHubPort,
  type FrameRelayHubWsData,
  frameRelayHubWebSocketHandlers,
  InMemoryFrameRelayStoreStrategy,
} from "@khoralabs/obp-frame-relay";

import { AuthError, type ChannelRelayAuth, createChannelRelayAuth } from "./auth";
import { type ChannelInviteStore, createInviteStore, randomInviteToken } from "./invites";

export const DEFAULT_CHANNEL_TTL_MS = 86_400_000;

const channelWsPathRe = /^\/v1\/channels\/([^/]+)\/ws$/;
const channelTicketPathRe = /^\/v1\/channels\/([^/]+)\/ticket$/;

function publicWebSocketBase(req: Request): string {
  const override = process.env.VELLUM_PUBLIC_BASE_URL?.trim();
  if (override !== undefined && override.length > 0) {
    const u = new URL(override.replace(/\/$/, ""));
    return u.protocol === "https:" ? `wss://${u.host}` : `ws://${u.host}`;
  }
  const u = new URL(req.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return jsonError(e.message, e.status);
  return jsonError(e instanceof Error ? e.message : String(e), 401);
}

export type ChannelRelayApp = {
  hub: FrameRelayHubPort;
  auth: ChannelRelayAuth;
  invites: ChannelInviteStore;
  websocket: ReturnType<typeof frameRelayHubWebSocketHandlers>;
  fetch(req: Request, server: Bun.Server<FrameRelayHubWsData>): Promise<Response | undefined>;
};

export function createChannelRelayApp(): ChannelRelayApp {
  const hub = createFrameRelayHub({ store: new InMemoryFrameRelayStoreStrategy() });
  const websocket = frameRelayHubWebSocketHandlers({ hub });
  const auth = createChannelRelayAuth();
  const invites = createInviteStore();

  function channelWebSocketUrl(req: Request, channelId: string, ticket: string): string {
    const base = publicWebSocketBase(req);
    return `${base}/v1/channels/${encodeURIComponent(channelId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  }

  async function handleChannelsCreate(req: Request, url: URL): Promise<Response> {
    const bodyText = await req.text();
    let did: string;
    try {
      ({ did } = await auth.requireAuthenticatedRequest(req, url, bodyText, []));
    } catch (e) {
      return authErrorResponse(e);
    }
    let ttlMs = DEFAULT_CHANNEL_TTL_MS;
    if (bodyText.trim().length > 0) {
      try {
        const body = JSON.parse(bodyText) as { ttlMs?: unknown };
        if (body.ttlMs !== undefined) {
          if (typeof body.ttlMs !== "number" || !Number.isFinite(body.ttlMs) || body.ttlMs <= 0) {
            return jsonError("ttlMs must be a positive number", 400);
          }
          ttlMs = body.ttlMs;
        }
      } catch {
        return jsonError("Invalid JSON body", 400);
      }
    }
    const channelId = crypto.randomUUID();
    const expiresAtMs = Date.now() + ttlMs;
    const { ticket } = await hub.createChannel(channelId, ttlMs);
    const inviteToken = randomInviteToken();
    invites.put(inviteToken, { channelId, creatorDid: did, expiresAtMs });
    return Response.json({
      channelId,
      ticket,
      webSocketUrl: channelWebSocketUrl(req, channelId, ticket),
      expiresAtMs,
      inviteToken,
    });
  }

  async function handleChannelsJoin(req: Request, url: URL): Promise<Response> {
    const bodyText = await req.text();
    let did: string;
    try {
      ({ did } = await auth.requireAuthenticatedRequest(req, url, bodyText, []));
    } catch (e) {
      return authErrorResponse(e);
    }
    let inviteToken: string;
    try {
      const body = JSON.parse(bodyText) as { inviteToken?: unknown };
      if (typeof body.inviteToken !== "string" || body.inviteToken.trim().length === 0) {
        return jsonError("inviteToken required", 400);
      }
      inviteToken = body.inviteToken.trim();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const rec = invites.redeem(inviteToken, did, Date.now());
    if (rec === undefined) {
      return jsonError("Invalid or expired invite token", 400);
    }
    let ticket: string;
    try {
      ({ ticket } = await hub.rotateChannelTicket(rec.channelId));
    } catch {
      return jsonError("Channel no longer active", 410);
    }
    return Response.json({
      channelId: rec.channelId,
      ticket,
      webSocketUrl: channelWebSocketUrl(req, rec.channelId, ticket),
      expiresAtMs: Date.now() + DEFAULT_CHANNEL_TTL_MS,
      creatorDid: rec.creatorDid,
    });
  }

  async function handleChannelMintTicket(
    req: Request,
    url: URL,
    channelIdRaw: string,
  ): Promise<Response> {
    const bodyText = await req.text();
    try {
      await auth.requireAuthenticatedRequest(req, url, bodyText, []);
    } catch (e) {
      return authErrorResponse(e);
    }
    const channelId = decodeURIComponent(channelIdRaw);
    let ticket: string;
    try {
      ({ ticket } = await hub.rotateChannelTicket(channelId));
    } catch {
      return jsonError("Channel not found or expired", 404);
    }
    return Response.json({
      channelId,
      ticket,
      webSocketUrl: channelWebSocketUrl(req, channelId, ticket),
      expiresAtMs: Date.now() + DEFAULT_CHANNEL_TTL_MS,
    });
  }

  async function handleChannelWsUpgrade(
    req: Request,
    url: URL,
    channelIdRaw: string,
    server: Bun.Server<FrameRelayHubWsData>,
  ): Promise<Response | undefined> {
    const channelId = decodeURIComponent(channelIdRaw);
    const ticket = url.searchParams.get("ticket") ?? "";
    const ok = await hub.verifyTicket(channelId, ticket);
    if (!ok) return jsonError("Invalid or expired ticket", 401);
    const upgraded = server.upgrade(req, {
      data: { kind: "channel", sessionId: channelId },
    });
    if (!upgraded) return jsonError("WebSocket upgrade failed", 500);
    return undefined;
  }

  async function fetch(
    req: Request,
    server: Bun.Server<FrameRelayHubWsData>,
  ): Promise<Response | undefined> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === "/v1/channels") {
      return handleChannelsCreate(req, url);
    }
    if (req.method === "POST" && url.pathname === "/v1/channels/join") {
      return handleChannelsJoin(req, url);
    }
    const ticketMatch = channelTicketPathRe.exec(url.pathname);
    if (req.method === "POST" && ticketMatch !== null) {
      return handleChannelMintTicket(req, url, ticketMatch[1] as string);
    }
    const wsMatch = channelWsPathRe.exec(url.pathname);
    if (req.method === "GET" && wsMatch !== null) {
      const wsRes = await handleChannelWsUpgrade(req, url, wsMatch[1] as string, server);
      if (wsRes !== undefined) return wsRes;
      return undefined;
    }
    return jsonError("Not found", 404);
  }

  return { hub, auth, invites, websocket, fetch };
}
