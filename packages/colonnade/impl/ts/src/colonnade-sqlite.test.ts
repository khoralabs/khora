import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ColonnadePublicationClient } from "./colonnade-publication-client.ts";
import { parseCatalogPointerShardIndex } from "./sqlite/catalog-pointer-id.ts";
import { createSqliteColonnadeCluster } from "./sqlite/cluster.ts";
import { derivePoolHomeCell, perPrincipalCellId } from "./sqlite/principal-cell-id.ts";
import { catalogShardIndexForTenant } from "./sqlite/tenant-catalog-shard.ts";

describe("SQLite Colonnade cluster", () => {
  const root = mkdtempSync(join(tmpdir(), "colonnade-sqlite-test-"));
  const catalogPath = join(root, "catalog.sqlite");
  const cellsDir = join(root, "cells");

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("pool mode: deterministic home cells and publication fans out across cell files", async () => {
    const cluster = createSqliteColonnadeCluster({
      catalogPath,
      cellsDirectory: cellsDir,
      mode: { kind: "pool", cellCount: 2 },
    });
    try {
      const aliceCell = cluster.assignPrincipalToCell("alice");
      const bobCell = cluster.assignPrincipalToCell("bob");
      expect(aliceCell).toBe(derivePoolHomeCell("alice", 2));
      expect(bobCell).toBe(derivePoolHomeCell("bob", 2));

      const pub = new ColonnadePublicationClient(cluster.catalog, cluster.resolveCell);
      const body = new Uint8Array(2049).fill(3);
      const res = await pub.postOperation({
        author_principal_id: "alice",
        author_cell_id: aliceCell,
        tenant_key: "tenant",
        payload_bytes: body,
        payload_metadata: { kind: "sqlite-test" },
        routing: {
          replicate_to_catalog: false,
          catalog_envelope: {},
          fan_out_targets: [{ recipient_cell_id: bobCell, recipient_principal_id: "bob" }],
        },
      });
      expect(res.generated_inbox_refs.length).toBe(1);

      const bobStore = cluster.resolveCell(bobCell);
      const listed = await bobStore.listPendingInboxEntries({
        cell_id: bobCell,
        tenant_key: "tenant",
        principal_id: "bob",
        limit: 10,
        cursor: "",
      });
      expect(listed.entries.length).toBe(1);
      expect(listed.entries[0]?.staging.kind).toBe("pointer");

      const entry0 = listed.entries[0];
      if (entry0 === undefined) throw new Error("expected inbox entry");
      const aliceStore = cluster.resolveCell(aliceCell);
      const ptr = entry0.staging;
      if (ptr.kind !== "pointer") throw new Error("expected pointer");
      const fetched = await aliceStore.fetchOutboxPayload({
        cell_id: aliceCell,
        locator: {
          cell_id: ptr.pointer.pointer.source_cell_id,
          record_key: ptr.pointer.pointer.source_record_key,
        },
      });
      expect(fetched.bytes_available).toBe(true);

      const drain = await bobStore.verifyAndDrainInboxBatch({
        cell_id: bobCell,
        tenant_key: "tenant",
        principal_id: "bob",
        inbox_entry_ids: [entry0.inbox_entry_id],
        resolved_payloads: [
          {
            inbox_entry_id: entry0.inbox_entry_id,
            pointer: ptr.pointer.pointer,
            verified_bytes: fetched.payload_bytes,
          },
        ],
      });
      expect(drain.failed_entry_ids.length).toBe(0);
      expect(drain.drained_entry_ids.length).toBe(1);
    } finally {
      cluster.close();
    }
  });

  test("catalog shards: tenant-key routing stores pointers on the correct SQLite file", async () => {
    const catDir = join(root, "cat-shards");
    const cluster = createSqliteColonnadeCluster({
      catalogPath: catDir,
      catalogShardCount: 2,
      cellsDirectory: join(root, "cells-sharded"),
      mode: { kind: "per_principal" },
    });
    try {
      const authorCell = cluster.assignPrincipalToCell("author");
      const recipientCell = cluster.assignPrincipalToCell("recipient");
      const pub = new ColonnadePublicationClient(cluster.catalog, cluster.resolveCell);
      const body = new Uint8Array([1, 2, 3]);
      const tenant_key = "tenant-a";

      const res = await pub.postOperation({
        author_principal_id: "author",
        author_cell_id: authorCell,
        tenant_key,
        payload_bytes: body,
        payload_metadata: {},
        routing: {
          replicate_to_catalog: true,
          catalog_envelope: { title: "x" },
          fan_out_targets: [
            { recipient_cell_id: recipientCell, recipient_principal_id: "recipient" },
          ],
        },
      });
      const shardIdx = parseCatalogPointerShardIndex(res.catalog_pointer_id);
      expect(shardIdx).toBe(catalogShardIndexForTenant(tenant_key, 2));

      const idx = shardIdx!;
      const countOnShard = (si: number) =>
        Number(
          (
            cluster.catalogDatabases[si]
              ?.prepare("SELECT COUNT(*) AS c FROM catalog_pointers WHERE catalog_pointer_id = ?")
              .get(res.catalog_pointer_id) as { c: number }
          ).c,
        );

      expect(countOnShard(idx)).toBe(1);
      expect(countOnShard((idx + 1) % 2)).toBe(0);
    } finally {
      cluster.close();
    }
  });

  test("useCellWorkers: publication + inbox pointer staging round-trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colonnade-sqlite-worker-"));
    try {
      const cluster = createSqliteColonnadeCluster({
        catalogPath: join(dir, "catalog.sqlite"),
        cellsDirectory: join(dir, "cells"),
        mode: { kind: "pool", cellCount: 2 },
        useCellWorkers: true,
      });
      try {
        const aliceCell = cluster.assignPrincipalToCell("alice");
        const bobCell = cluster.assignPrincipalToCell("bob");
        const pub = new ColonnadePublicationClient(cluster.catalog, cluster.resolveCell);
        const body = new Uint8Array(2049).fill(9);
        const res = await pub.postOperation({
          author_principal_id: "alice",
          author_cell_id: aliceCell,
          tenant_key: "tenant",
          payload_bytes: body,
          payload_metadata: {},
          routing: {
            replicate_to_catalog: false,
            catalog_envelope: {},
            fan_out_targets: [{ recipient_cell_id: bobCell, recipient_principal_id: "bob" }],
          },
        });
        expect(res.generated_inbox_refs.length).toBe(1);

        const bobStore = cluster.resolveCell(bobCell);
        const listed = await bobStore.listPendingInboxEntries({
          cell_id: bobCell,
          tenant_key: "tenant",
          principal_id: "bob",
          limit: 10,
          cursor: "",
        });
        expect(listed.entries.length).toBe(1);
        expect(listed.entries[0]?.staging.kind).toBe("pointer");
      } finally {
        cluster.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("per_principal mode: deterministic dedicated cell id", () => {
    const dir = mkdtempSync(join(tmpdir(), "colonnade-sqlite-iso-"));
    try {
      const cluster = createSqliteColonnadeCluster({
        catalogPath: join(dir, "catalog.sqlite"),
        cellsDirectory: join(dir, "cells"),
        mode: { kind: "per_principal" },
      });
      try {
        const c1 = cluster.assignPrincipalToCell("user-a");
        const c2 = cluster.assignPrincipalToCell("user-b");
        expect(c1).toBe(perPrincipalCellId("user-a"));
        expect(c2).toBe(perPrincipalCellId("user-b"));
        expect(cluster.assignPrincipalToCell("user-a")).toBe(c1);
      } finally {
        cluster.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
