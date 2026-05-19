import { type ResolvedPayload, sha256HexLower } from "@khoralabs/colonnade-persistence";
import { relayInboxAuthorPointerDeliverable } from "@khoralabs/relay-colonnade";
import type { AtriumHostContext } from "./context.ts";

export type RelayInboxDrainItem = {
  entryKey: string;
  pointer: unknown;
  projection: unknown;
};

/**
 * Drain the principal's cell inbox: post fan-out (pointer → author outbox) and room tickets (inline JSON).
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
  const inlineDrainIds: string[] = [];
  const inlineItems: RelayInboxDrainItem[] = [];
  const toDiscard: string[] = [];

  for (const e of list.entries) {
    if (e.staging.kind === "inline") {
      const hash = sha256HexLower(e.staging.inline.bytes);
      if (hash !== e.staging.inline.content_hash) {
        toDiscard.push(e.inbox_entry_id);
        continue;
      }
      let projection: unknown;
      try {
        projection = JSON.parse(new TextDecoder().decode(e.staging.inline.bytes)) as unknown;
      } catch {
        toDiscard.push(e.inbox_entry_id);
        continue;
      }
      inlineDrainIds.push(e.inbox_entry_id);
      inlineItems.push({
        entryKey: e.inbox_entry_id,
        pointer: null,
        projection,
      });
      continue;
    }

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

  const pointerItems: RelayInboxDrainItem[] = [];
  const allDrainIds = [...resolvedBatch.map((r) => r.inbox_entry_id), ...inlineDrainIds];
  if (allDrainIds.length > 0) {
    await cell.verifyAndDrainInboxBatch({
      cell_id: cellId,
      tenant_key: tenantKey,
      principal_id: did,
      inbox_entry_ids: allDrainIds,
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
      pointerItems.push({
        entryKey: r.inbox_entry_id,
        pointer: r.pointer,
        projection: {
          ...baseProj,
          bodyJson: new TextDecoder().decode(r.verified_bytes),
        },
      });
    }
  }

  return [...pointerItems, ...inlineItems];
}
