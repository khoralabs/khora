import { describe, expect, test } from "bun:test";
import { CellPersistenceClient } from "./cell-persistence-client.ts";
import type { ResolveCellStrategy } from "./cell-persistence-strategy.ts";
import { ColonnadePublicationClient } from "./colonnade-publication-client.ts";
import { ColonnadeRouter } from "./colonnade-router.ts";
import type { RoutedWrite, WriteOp } from "./colonnade-types.ts";
import { canonicalSourceMapRowBytes, sha256HexLower } from "./hash.ts";
import { InMemoryCatalogPersistenceStrategy } from "./in-memory-catalog-strategy.ts";
import { InMemoryCellPersistenceStrategy } from "./in-memory-cell-strategy.ts";

describe("InMemoryCellPersistenceStrategy", () => {
  test("append outbox, fetch, inbox pointer, drain with verified bytes", async () => {
    const cellA = new InMemoryCellPersistenceStrategy("cell-a");
    const cellB = new InMemoryCellPersistenceStrategy("cell-b");

    const out = await cellA.appendOutboxRecord({
      cell_id: "cell-a",
      tenant_key: "tenant",
      principal_id: "alice",
      record_key: "",
      payload_bytes: new TextEncoder().encode("hello"),
      metadata: { k: 1 },
    });
    expect(out.content_hash).toBe(sha256HexLower(new TextEncoder().encode("hello")));

    const fetchA = await cellA.fetchOutboxPayload({
      cell_id: "cell-a",
      locator: { cell_id: "cell-a", record_key: out.record_key },
    });
    expect(fetchA.bytes_available).toBe(true);
    expect(new TextDecoder().decode(fetchA.payload_bytes)).toBe("hello");

    const ptr = {
      source_cell_id: "cell-a",
      source_record_key: out.record_key,
      content_hash: out.content_hash,
    };
    const { inbox_entry_id } = await cellB.enqueueInboxDelivery({
      cell_id: "cell-b",
      tenant_key: "tenant",
      recipient_principal_id: "bob",
      staging: { kind: "pointer", pointer: { pointer: ptr } },
      correlation_id: "c1",
    });

    const listed = await cellB.listPendingInboxEntries({
      cell_id: "cell-b",
      tenant_key: "tenant",
      principal_id: "bob",
      limit: 10,
      cursor: "",
    });
    expect(listed.entries.some((e) => e.inbox_entry_id === inbox_entry_id)).toBe(true);

    const drain = await cellB.verifyAndDrainInboxBatch({
      cell_id: "cell-b",
      tenant_key: "tenant",
      principal_id: "bob",
      inbox_entry_ids: [inbox_entry_id],
      resolved_payloads: [
        {
          inbox_entry_id,
          pointer: ptr,
          verified_bytes: new TextEncoder().encode("hello"),
        },
      ],
    });
    expect(drain.failed_entry_ids.length).toBe(0);
    expect(drain.drained_entry_ids).toEqual([inbox_entry_id]);
  });
});

describe("ColonnadeRouter", () => {
  test("routes writes to distinct cell logs", async () => {
    const cellA = new InMemoryCellPersistenceStrategy("cell-a");
    const cellB = new InMemoryCellPersistenceStrategy("cell-b");
    const map = new Map([
      ["cell-a", cellA],
      ["cell-b", cellB],
    ]);
    const resolve: ResolveCellStrategy = (id) => {
      const s = map.get(id);
      if (s === undefined) throw new Error("missing");
      return new CellPersistenceClient(s);
    };

    const router = new ColonnadeRouter(resolve);
    const op: WriteOp = {
      kind: "append_outbox",
      append_outbox: {
        principal_id: "alice",
        record_key: "",
        payload_bytes: new Uint8Array([1]),
        metadata: {},
      },
    };
    const writes: RoutedWrite[] = [
      { target_cell_id: "cell-a", correlation_id: "w1", op },
      { target_cell_id: "cell-b", correlation_id: "w2", op },
    ];
    const out = await router.submitRoutedWrites({ writes });
    expect(out.accepted_correlation_ids).toEqual(["w1", "w2"]);
    expect(cellA.logLength()).toBe(1);
    expect(cellB.logLength()).toBe(1);
  });
});

describe("CatalogRead model (in-memory)", () => {
  test("source map upsert, lookup, batch, and canonical row hash", async () => {
    const catalog = new InMemoryCatalogPersistenceStrategy();
    const pointer = {
      source_cell_id: "cell-src",
      source_record_key: "rk1",
      content_hash: sha256HexLower(new TextEncoder().encode("payload")),
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
    expect(one.source_row_content_hash).toBe(rowOut.source_row_content_hash);

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
});

describe("ColonnadePublicationClient", () => {
  test("replicates to catalog and fans out pointer rows", async () => {
    const catalog = new InMemoryCatalogPersistenceStrategy();
    const cellA = new InMemoryCellPersistenceStrategy("cell-a");
    const cellB = new InMemoryCellPersistenceStrategy("cell-b");
    const map = new Map([
      ["cell-a", cellA],
      ["cell-b", cellB],
    ]);
    const resolve: ResolveCellStrategy = (id) =>
      map.get(id) ??
      (() => {
        throw new Error(`no cell ${id}`);
      })();

    const pub = new ColonnadePublicationClient(catalog, resolve);
    const body = new Uint8Array(2049).fill(7);
    const res = await pub.postOperation({
      author_principal_id: "alice",
      author_cell_id: "cell-a",
      tenant_key: "tenant",
      payload_bytes: body,
      payload_metadata: { kind: "test" },
      routing: {
        replicate_to_catalog: true,
        catalog_envelope: { title: "t" },
        fan_out_targets: [{ recipient_cell_id: "cell-b", recipient_principal_id: "bob" }],
      },
    });
    expect(res.catalog_pointer_id.length).toBeGreaterThan(0);
    expect(res.generated_inbox_refs.length).toBe(1);

    const resolved = await catalog.resolveCatalogPointer({
      catalog_pointer_id: res.catalog_pointer_id,
    });
    expect(resolved.locator.record_key).toBe(res.outbox_record_key);

    const listed = await cellB.listPendingInboxEntries({
      cell_id: "cell-b",
      tenant_key: "tenant",
      principal_id: "bob",
      limit: 5,
      cursor: "",
    });
    expect(listed.entries.length).toBe(1);
    expect(listed.entries[0]?.staging.kind).toBe("pointer");
  });

  test("resolveCell-only constructor uses noop catalog when replicate_to_catalog is false", async () => {
    const cellA = new InMemoryCellPersistenceStrategy("cell-a");
    const resolve: ResolveCellStrategy = (id) => {
      if (id === "cell-a") return cellA;
      throw new Error(`no cell ${id}`);
    };
    const pub = new ColonnadePublicationClient(resolve);
    const res = await pub.postOperation({
      author_principal_id: "alice",
      author_cell_id: "cell-a",
      tenant_key: "tenant",
      payload_bytes: new TextEncoder().encode("{}"),
      routing: { replicate_to_catalog: false, catalog_envelope: {}, fan_out_targets: [] },
    });
    expect(res.catalog_pointer_id).toBe("");
    expect(res.outbox_record_key.length).toBeGreaterThan(0);
  });
});
