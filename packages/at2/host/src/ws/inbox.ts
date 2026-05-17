import type { Server, WebSocketHandler } from "bun";
import type { At2HostContext, At2WsData } from "../http/deps.ts";
import { RELAY_INBOX_SOURCE_MAP_ID } from "../relay-inbox.ts";
import type { HostRouteDeps } from "../http/deps.ts";
import { authErrorResponse, jsonError } from "../http/responses.ts";

export async function handleInboxWsUpgrade(
  req: Request,
  url: URL,
  srv: Server<At2WsData>,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  let did: string;
  try {
    ({ did } = await deps.ctx.auth.requireInboxAccess(req, url, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const ok = srv.upgrade(req, { data: { kind: "inbox", did } });
  if (!ok) {
    return jsonError("WebSocket upgrade failed", 500);
  }
  return undefined;
}

export function createInboxDrainWebSocketHandlers(opts: {
  ctx: At2HostContext;
}): WebSocketHandler<{ kind: "inbox"; did: string }> {
  return {
    open(ws) {
      const did = ws.data.did;
      const { store, tenantKey, host } = opts.ctx;
      const prefix = `${did}/`;
      const rows = store.listBySourceMap(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, prefix);
      const items = rows.map((r) => ({
        entryKey: r.entry_key,
        pointer: r.pointer,
        projection: r.projection,
      }));
      ws.send(JSON.stringify({ type: "drain", items }));
      const catalogDb = opts.ctx.catalogDb;
      catalogDb.transaction(() => {
        for (const r of rows) {
          store.deleteRow(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, r.entry_key);
        }
      })();
      const hub = host.inboxHub;
      if (hub !== undefined) {
        hub.add(did, ws);
      }
    },
    close(ws) {
      const hub = opts.ctx.host.inboxHub;
      if (hub !== undefined) {
        hub.remove(ws.data.did, ws);
      }
    },
    message() {},
  };
}
