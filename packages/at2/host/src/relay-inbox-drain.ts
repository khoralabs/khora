import type { At2HostContext } from "./context.ts";
import { RELAY_INBOX_SOURCE_MAP_ID } from "./relay-inbox.ts";

export type RelayInboxDrainItem = {
  entryKey: string;
  pointer: unknown;
  projection: unknown;
};

/**
 * List colonnade relay inbox rows for `did`, delete them in one catalog transaction, return the
 * payload for `{ type: "drain", items }` (same semantics as v2 HTTP inbox WebSocket open).
 */
export function popRelayInboxDrainItemsForDid(ctx: At2HostContext, did: string): RelayInboxDrainItem[] {
  const { store, tenantKey, catalogDb } = ctx;
  const prefix = `${did}/`;
  const rows = store.listBySourceMap(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, prefix);
  const items: RelayInboxDrainItem[] = rows.map((r) => ({
    entryKey: r.entry_key,
    pointer: r.pointer,
    projection: r.projection,
  }));
  catalogDb.transaction(() => {
    for (const r of rows) {
      store.deleteRow(tenantKey, RELAY_INBOX_SOURCE_MAP_ID, r.entry_key);
    }
  })();
  return items;
}
