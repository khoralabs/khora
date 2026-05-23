import {
  CellPoolCountMismatchError,
  createPointerStore,
  OutboxGhostError,
  PointerHashMismatchError,
  type PointerStore,
  type ResolvedPayload,
  resolveSourcemap,
  sha256HexLower,
} from "@khoralabs/colonnade-persistence";
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
  const { cluster, tenantKey, principalLifecycle, outboxPayloadCodec } = ctx;
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
  const pointerStores = new Map<string, PointerStore>();

  const pointerStoreForCell = (sourceCellId: string): PointerStore => {
    let store = pointerStores.get(sourceCellId);
    if (store === undefined) {
      store = createPointerStore(cluster.resolveCell(sourceCellId), ctx.cellPoolCount);
      pointerStores.set(sourceCellId, store);
    }
    return store;
  };

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
    const _postId = typeof meta?.postId === "string" ? meta.postId : undefined;
    const authorPrincipalId =
      typeof meta?.authorPrincipalId === "string" ? meta.authorPrincipalId : undefined;

    if (!principalLifecycle.isPostPointerDeliverable(authorPrincipalId)) {
      toDiscard.push(e.inbox_entry_id);
      continue;
    }

    let verified_bytes: Uint8Array;
    try {
      const resolved = await resolveSourcemap(ptr, pointerStoreForCell(ptr.source_cell_id));
      if (resolved.kind !== "blob") {
        toDiscard.push(e.inbox_entry_id);
        continue;
      }
      verified_bytes = new Uint8Array(await resolved.blob.arrayBuffer());
    } catch (err) {
      if (
        err instanceof OutboxGhostError ||
        err instanceof PointerHashMismatchError ||
        err instanceof CellPoolCountMismatchError
      ) {
        toDiscard.push(e.inbox_entry_id);
        continue;
      }
      throw err;
    }

    resolvedBatch.push({
      inbox_entry_id: e.inbox_entry_id,
      pointer: ptr,
      verified_bytes,
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
      const plaintextBytes = await outboxPayloadCodec.decrypt(r.verified_bytes);
      pointerItems.push({
        entryKey: r.inbox_entry_id,
        pointer: r.pointer,
        projection: {
          ...baseProj,
          bodyJson: new TextDecoder().decode(plaintextBytes),
        },
      });
    }
  }

  return [...pointerItems, ...inlineItems];
}
