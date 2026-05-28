import { type KhoraHostContext, popRelayInboxDrainItemsForDid } from "@khoralabs/khora-host";
import type { KhoraWsUpgradePort } from "@khoralabs/khora-transport";
import type { WebSocketHandler } from "bun";
import type { HostRouteDeps } from "../http/deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "../http/responses.ts";
import { logger } from "../logger.ts";

export async function handleInboxWsUpgrade(
  req: Request,
  url: URL,
  upgradePort: KhoraWsUpgradePort,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  let did: string;
  try {
    ({ did } = await deps.ctx.auth.requireInboxAccess(req, url, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const inboxRl = deps.rateLimiters.inboxDid(`did:${did}`);
  if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
  const ok = upgradePort.upgrade(req, { data: { kind: "inbox", did } });
  if (!ok) {
    return jsonError("WebSocket upgrade failed", 500);
  }
  return undefined;
}

export function createInboxDrainWebSocketHandlers(opts: {
  ctx: KhoraHostContext;
}): WebSocketHandler<{ kind: "inbox"; did: string }> {
  return {
    open(ws) {
      const did = ws.data.did;
      logger.info({ did }, "inbox websocket open");
      void (async () => {
        try {
          const items = await popRelayInboxDrainItemsForDid(opts.ctx, did);
          ws.send(JSON.stringify({ type: "drain", items }));
        } catch (e) {
          logger.error({ err: e, did }, "inbox drain failed");
          ws.send(JSON.stringify({ type: "drain", items: [] }));
        }
        const hub = opts.ctx.host.inboxHub;
        if (hub !== undefined) {
          hub.add(did, ws);
        }
      })();
    },
    close(ws) {
      logger.info({ did: ws.data.did }, "inbox websocket close");
      const hub = opts.ctx.host.inboxHub;
      if (hub !== undefined) {
        hub.remove(ws.data.did, ws);
      }
    },
    message() {},
  };
}
