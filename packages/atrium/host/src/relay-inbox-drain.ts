import { relayInboxAuthorPointerDeliverable } from "@khoralabs/relay-colonnade";
import type { AtriumHostContext } from "./context.ts";
import { RELAY_INBOX_SOURCE_MAP_ID } from "./relay-inbox.ts";

export type RelayInboxDrainItem = {
  entryKey: string;
  pointer: unknown;
  projection: unknown;
};

function authorPrincipalIdFromRelayInboxProjection(projection: unknown): string | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const id = (projection as Record<string, unknown>).authorPrincipalId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function postIdFromRelayInboxProjection(projection: unknown): string | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const id = (projection as Record<string, unknown>).postId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * List colonnade relay inbox rows for `did`, delete them in one catalog transaction, return the
 * payload for `{ type: "drain", items }` (same semantics as v2 HTTP inbox WebSocket open).
 * Rows whose post no longer exist are dropped without being delivered (lazy pointer reconcile).
 * Rows whose author is unregistered or in an active teardown job are dropped the same way.
 */
export function popRelayInboxDrainItemsForDid(
  ctx: AtriumHostContext,
  did: string,
): RelayInboxDrainItem[] {
  const { store, tenantKey, catalogDb, host } = ctx;
  const prefix = `${did}/`;
  const rows = store.listBySourceMap(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, prefix);
  const items: RelayInboxDrainItem[] = [];
  catalogDb.transaction(() => {
    for (const r of rows) {
      const postId = postIdFromRelayInboxProjection(r.projection);
      if (postId !== undefined && host.persistenceClient.getPostById(postId) == null) {
        store.deleteRow(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, r.entry_key);
        continue;
      }
      const authorPrincipalId = authorPrincipalIdFromRelayInboxProjection(r.projection);
      if (
        !relayInboxAuthorPointerDeliverable({
          catalogDb,
          persistence: ctx.host.persistence,
          authorPrincipalId,
          postId,
          getPostById: (id) => host.persistenceClient.getPostById(id),
        })
      ) {
        store.deleteRow(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, r.entry_key);
        continue;
      }
      items.push({
        entryKey: r.entry_key,
        pointer: r.pointer,
        projection: r.projection,
      });
      store.deleteRow(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, r.entry_key);
    }
  })();
  return items;
}
