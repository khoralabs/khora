import { describe, expect, test } from "bun:test";
import { canonicalSourceMapRowBytes, sha256HexLower } from "../../core/hash";
import type { OutboxPayloadCodec } from "../../crypto";
import type { CatalogPersistence } from "./catalog-persistence";
import type { CellPersistence } from "./cell-persistence";
import { InMemoryCatalogPersistence } from "./in-memory-catalog-persistence";
import { InMemoryCellPersistence } from "./in-memory-cell-persistence";

const POOL = 16;

export type ColonnadePersistenceContractHarness = {
  readonly catalog: CatalogPersistence;
  readonly authorCell: CellPersistence;
  readonly recipientCell: CellPersistence;
  readonly authorCellId: string;
  readonly recipientCellId: string;
};

export type ColonnadePersistenceContractFactory = () =>
  | ColonnadePersistenceContractHarness
  | Promise<ColonnadePersistenceContractHarness>;

export function createInMemoryColonnadeContractHarness(opts: {
  outboxPayloadCodec: OutboxPayloadCodec;
}): ColonnadePersistenceContractHarness {
  const authorCellId = "cell-a";
  const recipientCellId = "cell-b";
  return {
    catalog: new InMemoryCatalogPersistence(),
    authorCell: new InMemoryCellPersistence(authorCellId, {
      outboxPayloadCodec: opts.outboxPayloadCodec,
    }),
    recipientCell: new InMemoryCellPersistence(recipientCellId, {
      outboxPayloadCodec: opts.outboxPayloadCodec,
    }),
    authorCellId,
    recipientCellId,
  };
}

/**
 * Shared catalog + cell port contract suite. Call from each backend test file
 * so adapters stay aligned on core outbox/inbox/catalog invariants.
 */
export function runColonnadePersistenceContractTests(
  name: string,
  create: ColonnadePersistenceContractFactory,
): void {
  describe(`colonnade persistence contract: ${name}`, () => {
    test("catalog source-map upsert, lookup, batch, and row hash", async () => {
      const { catalog } = await create();
      const pointer = {
        source_cell_id: "cell-src",
        source_record_key: "rk1",
        content_hash: sha256HexLower(new TextEncoder().encode("payload")),
        cell_pool_count: POOL,
      };
      const projection = { span: [0, 4] };
      const rowOut = await catalog.upsertSourceMapPointerRow({
        tenant_key: "t1",
        source_map_id: "map-a",
        entry_key: "seg-1",
        pointer,
        projection,
      });

      const canon = canonicalSourceMapRowBytes({
        tenant_key: "t1",
        source_map_id: "map-a",
        entry_key: "seg-1",
        pointer,
        projection,
      });
      const hashed = await catalog.computeSourceRowContentHash({ canonical_row_bytes: canon });
      expect(hashed.content_hash).toBe(rowOut.source_row_content_hash);

      const one = await catalog.lookupSourceMapPointer({
        tenant_key: "t1",
        source_map_id: "map-a",
        entry_key: "seg-1",
      });
      expect(one.found).toBe(true);
      expect(one.pointer).toEqual(pointer);

      const miss = await catalog.lookupSourceMapPointer({
        tenant_key: "t1",
        source_map_id: "map-a",
        entry_key: "missing",
      });
      expect(miss.found).toBe(false);

      const batch = await catalog.batchLookupSourceMapPointers({
        tenant_key: "t1",
        source_map_id: "map-a",
        entry_keys: ["seg-1", "missing"],
      });
      expect(batch.hits).toHaveLength(1);
      expect(batch.hits[0]?.entry_key).toBe("seg-1");
      expect(batch.hits[0]?.source_row_content_hash).toBe(rowOut.source_row_content_hash);
    });

    test("catalog pointer upsert + resolve", async () => {
      const { catalog } = await create();
      const id =
        catalog.nextCatalogPointerId?.("tenant") ??
        `cptr_0000_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      await catalog.upsertCatalogPointer({
        catalog_pointer_id: id,
        locator: {
          cell_id: "cell-a",
          record_key: "rk",
          cell_pool_count: POOL,
        },
        content_hash: sha256HexLower(new TextEncoder().encode("x")),
        public_projection: {},
      });

      const resolved = await catalog.resolveCatalogPointer({
        catalog_pointer_id: id,
      });
      expect(resolved.locator.cell_id).toBe("cell-a");
      expect(resolved.locator.record_key).toBe("rk");
    });

    test("cell outbox append + fetch + inbox pointer drain", async () => {
      const { authorCell, recipientCell, authorCellId, recipientCellId } = await create();
      const payload = new TextEncoder().encode("hello-contract");

      const out = await authorCell.appendOutboxRecord({
        cell_id: authorCellId,
        tenant_key: "tenant",
        principal_id: "alice",
        record_key: "",
        payload_bytes: payload,
        metadata: {},
      });
      expect(out.content_hash).toBe(sha256HexLower(payload));

      const fetched = await authorCell.fetchOutboxPayload({
        cell_id: authorCellId,
        locator: {
          cell_id: authorCellId,
          record_key: out.record_key,
          cell_pool_count: POOL,
        },
        payload_format: "stored",
      });
      expect(fetched.bytes_available).toBe(true);
      expect(new TextDecoder().decode(fetched.payload_bytes)).toBe("hello-contract");

      const ptr = {
        source_cell_id: authorCellId,
        source_record_key: out.record_key,
        content_hash: out.content_hash,
        cell_pool_count: POOL,
      };
      const { inbox_entry_id } = await recipientCell.enqueueInboxDelivery({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        recipient_principal_id: "bob",
        staging: { kind: "pointer", pointer: { pointer: ptr } },
        correlation_id: "c1",
      });

      const listed = await recipientCell.listPendingInboxEntries({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        principal_id: "bob",
        limit: 10,
        cursor: "",
      });
      expect(listed.entries.some((e) => e.inbox_entry_id === inbox_entry_id)).toBe(true);

      const drain = await recipientCell.verifyAndDrainInboxBatch({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        principal_id: "bob",
        inbox_entry_ids: [inbox_entry_id],
        resolved_payloads: [
          {
            inbox_entry_id,
            pointer: ptr,
            verified_bytes: payload,
          },
        ],
      });
      expect(drain.failed_entry_ids.length).toBe(0);
      expect(drain.drained_entry_ids).toEqual([inbox_entry_id]);

      const after = await recipientCell.listPendingInboxEntries({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        principal_id: "bob",
        limit: 10,
        cursor: "",
      });
      expect(after.entries.some((e) => e.inbox_entry_id === inbox_entry_id)).toBe(false);
    });

    test("cell write log append + fetch + ack", async () => {
      const { authorCell, authorCellId } = await create();
      const appended = await authorCell.appendWriteLogEntry({
        cell_id: authorCellId,
        correlation_id: "wl-1",
        op: {
          kind: "append_outbox",
          append_outbox: {
            principal_id: "alice",
            record_key: "",
            payload_bytes: new Uint8Array([1, 2, 3]),
            metadata: {},
          },
        },
      });
      expect(appended.log_sequence.length).toBeGreaterThan(0);

      const batch = await authorCell.fetchWriteLogBatch({
        cell_id: authorCellId,
        after_sequence: "",
        limit: 10,
      });
      expect(batch.records.some((r) => r.correlation_id === "wl-1")).toBe(true);

      await authorCell.ackWriteLogApplied({
        cell_id: authorCellId,
        applied_through_sequence: appended.log_sequence,
      });
    });

    test("discardInboxEntries drops pending rows without drain", async () => {
      const { recipientCell, recipientCellId } = await create();
      const bytes = new TextEncoder().encode("inline");
      const { inbox_entry_id } = await recipientCell.enqueueInboxDelivery({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        recipient_principal_id: "bob",
        staging: {
          kind: "inline",
          inline: {
            bytes,
            content_hash: sha256HexLower(bytes),
          },
        },
        correlation_id: "disc-1",
      });
      await recipientCell.discardInboxEntries({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        principal_id: "bob",
        inbox_entry_ids: [inbox_entry_id],
      });
      const listed = await recipientCell.listPendingInboxEntries({
        cell_id: recipientCellId,
        tenant_key: "tenant",
        principal_id: "bob",
        limit: 10,
        cursor: "",
      });
      expect(listed.entries.some((e) => e.inbox_entry_id === inbox_entry_id)).toBe(false);
    });
  });
}
