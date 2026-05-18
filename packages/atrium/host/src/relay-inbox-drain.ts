import type { ResolvedPayload } from "@khoralabs/colonnade-persistence";
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

function popCatalogRelayInboxRows(ctx: AtriumHostContext, did: string): RelayInboxDrainItem[] {
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

/**
 * Drain cell-backed post inbox (pointer → author outbox) plus legacy catalog rows under
 * `relay:inbox` (e.g. room tickets).
 */
export async function popRelayInboxDrainItemsForDid(
  ctx: AtriumHostContext,
  did: string,
): Promise<RelayInboxDrainItem[]> {
  const { cluster, tenantKey, catalogDb, host } = ctx;
  const cellId = cluster.assignPrincipalToCell(did);
  const cell = cluster.resolveCell(cellId);
  const list = await cell.listPendingInboxEntries({
    cell_id: cellId,
    tenant_key: tenantKey,
    principal_id: did,
    limit: 256,
    cursor: "",
  });

  const resolvedBatch: ResolvedPayload[] = [];
  const toDiscard: string[] = [];

  for (const e of list.entries) {
    if (e.staging.kind !== "pointer") {
      toDiscard.push(e.inbox_entry_id);
      continue;
    }
    const ptr = e.staging.pointer.pointer;
    const metaRaw = e.staging.pointer.metadata;
    const meta =
      metaRaw !== undefined &&
      typeof metaRaw === "object" &&
      metaRaw !== null &&
      !Array.isArray(metaRaw)
        ? (metaRaw as Record<string, unknown>)
        : undefined;
    const postId = typeof meta?.postId === "string" ? meta.postId : undefined;
    const authorPrincipalId =
      typeof meta?.authorPrincipalId === "string" ? meta.authorPrincipalId : undefined;

    if (postId !== undefined && host.persistenceClient.getPostById(postId) == null) {
      toDiscard.push(e.inbox_entry_id);
      continue;
    }

    if (
      !relayInboxAuthorPointerDeliverable({
        catalogDb,
        persistence: host.persistence,
        authorPrincipalId,
        postId,
        getPostById: (id) => host.persistenceClient.getPostById(id),
      })
    ) {
      toDiscard.push(e.inbox_entry_id);
      continue;
    }

    const sourceCell = cluster.resolveCell(ptr.source_cell_id);
    const fetched = await sourceCell.fetchOutboxPayload({
      cell_id: ptr.source_cell_id,
      locator: { cell_id: ptr.source_cell_id, record_key: ptr.source_record_key },
    });

    if (!fetched.bytes_available) {
      toDiscard.push(e.inbox_entry_id);
      continue;
    }

    resolvedBatch.push({
      inbox_entry_id: e.inbox_entry_id,
      pointer: ptr,
      verified_bytes: fetched.payload_bytes,
    });
  }

  if (toDiscard.length > 0) {
    await cell.discardInboxEntries({
      cell_id: cellId,
      tenant_key: tenantKey,
      principal_id: did,
      inbox_entry_ids: toDiscard,
    });
  }

  const cellItems: RelayInboxDrainItem[] = [];
  if (resolvedBatch.length > 0) {
    const drainIds = resolvedBatch.map((r) => r.inbox_entry_id);
    await cell.verifyAndDrainInboxBatch({
      cell_id: cellId,
      tenant_key: tenantKey,
      principal_id: did,
      inbox_entry_ids: drainIds,
      resolved_payloads: resolvedBatch,
    });

    for (const r of resolvedBatch) {
      const entry = list.entries.find((x) => x.inbox_entry_id === r.inbox_entry_id);
      const staging = entry?.staging;
      const metadata =
        staging?.kind === "pointer" && staging.pointer.metadata !== undefined
          ? staging.pointer.metadata
          : undefined;
      const baseProj =
        typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
          ? { ...(metadata as Record<string, unknown>) }
          : {};
      cellItems.push({
        entryKey: r.inbox_entry_id,
        pointer: r.pointer,
        projection: {
          ...baseProj,
          bodyJson: new TextDecoder().decode(r.verified_bytes),
        },
      });
    }
  }

  const catalogItems = popCatalogRelayInboxRows(ctx, did);
  return [...cellItems, ...catalogItems];
}
