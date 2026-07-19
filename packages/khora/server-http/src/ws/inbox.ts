import type { KhoraHostContext } from "@khoralabs/khora-host";
import {
  handleInboxClientMessage,
  helloFrame,
  type InboxMultiplexWsData,
  newInboxConnectionId,
} from "@khoralabs/khora-host";
import type { KhoraWsUpgradePort } from "@khoralabs/khora-transport";
import type { WebSocketHandler } from "bun";
import type { HostRouteDeps } from "../http/deps";
import { jsonError, rateLimitedResponse } from "../http/responses";
import { logger } from "../logger";
import { clientIpFromRequest } from "../rate-limit";

export async function handleInboxWsUpgrade(
  req: Request,
  _url: URL,
  upgradePort: KhoraWsUpgradePort,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  const ip = clientIpFromRequest(req);
  const unboundRl = deps.rateLimiters.inboxUnboundIp(`ip:${ip}`);
  if (!unboundRl.ok) return rateLimitedResponse(unboundRl.retryAfterSec);

  const connectionId = newInboxConnectionId();
  const ok = upgradePort.upgrade(req, {
    data: {
      kind: "inbox",
      connectionId,
      boundDids: new Set<string>(),
    },
  });
  if (!ok) {
    return jsonError("WebSocket upgrade failed", 500);
  }
  return undefined;
}

export function createInboxDrainWebSocketHandlers(opts: {
  ctx: KhoraHostContext;
  allowBind?: (did: string) => boolean;
}): WebSocketHandler<InboxMultiplexWsData> {
  return {
    open(ws) {
      const { connectionId } = ws.data;
      logger.info({ connectionId }, "inbox websocket open");
      ws.send(helloFrame(connectionId));
    },
    close(ws) {
      logger.info(
        { connectionId: ws.data.connectionId, bound: ws.data.boundDids.size },
        "inbox websocket close",
      );
      const hub = opts.ctx.host.inboxHub;
      if (hub !== undefined) {
        hub.removeSession(ws);
      }
      ws.data.boundDids.clear();
    },
    message(ws, message) {
      const text =
        typeof message === "string"
          ? message
          : Buffer.isBuffer(message)
            ? message.toString("utf8")
            : new TextDecoder().decode(message as ArrayBuffer);
      const hub = opts.ctx.host.inboxHub;
      if (hub === undefined) {
        logger.error("inbox websocket message: missing inboxHub");
        return;
      }
      void handleInboxClientMessage({
        ctx: opts.ctx,
        connectionId: ws.data.connectionId,
        boundDids: ws.data.boundDids,
        ws,
        inboxHub: hub,
        raw: text,
        ...(opts.allowBind !== undefined ? { allowBind: opts.allowBind } : {}),
      }).catch((e) => {
        logger.error({ err: e, connectionId: ws.data.connectionId }, "inbox bind handling failed");
      });
    },
  };
}

/** Build allowBind that applies per-DID inbox rate limits. */
export function inboxBindRateLimitGuard(
  rateLimiters: HostRouteDeps["rateLimiters"],
): (did: string) => boolean {
  return (did: string) => {
    const rl = rateLimiters.inboxDid(`did:${did}`);
    if (!rl.ok) return false;
    const bindRl = rateLimiters.inboxBindDid(`did:${did}`);
    return bindRl.ok;
  };
}

export function createInboxDrainWebSocketHandlersForDeps(opts: {
  ctx: KhoraHostContext;
  rateLimiters: HostRouteDeps["rateLimiters"];
}): WebSocketHandler<InboxMultiplexWsData> {
  return createInboxDrainWebSocketHandlers({
    ctx: opts.ctx,
    allowBind: inboxBindRateLimitGuard(opts.rateLimiters),
  });
}
