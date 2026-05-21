import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { poolShardCellId } from "@khoralabs/colonnade-persistence";
import type { AtriumHostContext } from "@khoralabs/atrium-host";
import type { HostRouteDeps } from "./deps.ts";
import {
  handleInternalAdminStatsCell,
  handleInternalAdminStatsPrincipal,
  handleInternalAdminStatsSummary,
} from "./internal-admin-stats.ts";

const REG_BY_PRINCIPAL = "relay:reg:by-principal";
const testRoot = mkdtempSync(join(tmpdir(), "admin-stats-test-"));
const cellsDir = join(testRoot, "cells");
mkdirSync(cellsDir, { recursive: true });

const catalogDb = new Database(":memory:");
catalogDb.run(`
  CREATE TABLE relay_catalog_projections (
    tenant_key TEXT NOT NULL,
    namespace TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    projection JSON NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (tenant_key, namespace, entry_key)
  );
  CREATE TABLE relay_subscription_edges (
    tenant_key TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (tenant_key, principal_id, subject)
  );
`);

const framesDb = new Database(":memory:");
framesDb.run(`
  CREATE TABLE rooms (
    channel_id TEXT PRIMARY KEY NOT NULL,
    pairing_secret_hex TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
  );
  CREATE TABLE room_frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    bytes BLOB NOT NULL
  );
`);

function seedCatalog(): void {
  catalogDb.run("DELETE FROM relay_catalog_projections");
  catalogDb.run("DELETE FROM relay_subscription_edges");
  catalogDb
    .prepare(
      `INSERT INTO relay_catalog_projections (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, '{}', ?)`,
    )
    .run("relay", REG_BY_PRINCIPAL, "did:key:alice", Date.now());
  catalogDb
    .prepare(
      `INSERT INTO relay_catalog_projections (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, '{}', ?)`,
    )
    .run("relay", "relay:social:username-to-principal", "alice", Date.now());
  catalogDb
    .prepare(
      `INSERT INTO relay_subscription_edges (tenant_key, principal_id, subject, created_at_ms)
       VALUES (?, ?, ?, ?)`,
    )
    .run("relay", "did:key:alice", "did:key:bob", Date.now());
}

function seedFrames(): void {
  framesDb.run("DELETE FROM rooms");
  framesDb.run("DELETE FROM room_frames");
  const now = Date.now();
  framesDb
    .prepare(
      `INSERT INTO rooms (channel_id, pairing_secret_hex, created_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?)`,
    )
    .run("room-active", "aa", now, now + 60_000);
  framesDb
    .prepare(
      `INSERT INTO rooms (channel_id, pairing_secret_hex, created_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?)`,
    )
    .run("room-expired", "bb", now, now - 60_000);
  framesDb.prepare(`INSERT INTO room_frames (channel_id, bytes) VALUES (?, ?)`).run("room-active", new Uint8Array([1]));
  framesDb.prepare(`INSERT INTO room_frames (channel_id, bytes) VALUES (?, ?)`).run("room-active", new Uint8Array([2]));
}

function seedCellShard(shardIndex: number, outboxRows: number, inboxRows: number): void {
  const cellId = poolShardCellId(shardIndex);
  const path = join(cellsDir, `${cellId}.sqlite`);
  rmSync(path, { force: true });
  const db = new Database(path, { create: true });
  db.run(`
    CREATE TABLE outbox (
      record_key TEXT PRIMARY KEY NOT NULL,
      principal_id TEXT NOT NULL,
      tenant_key TEXT NOT NULL,
      payload BLOB NOT NULL,
      metadata TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      committed_at_ms INTEGER NOT NULL
    );
    CREATE TABLE inbox (
      inbox_entry_id TEXT PRIMARY KEY NOT NULL,
      tenant_key TEXT NOT NULL,
      recipient_principal_id TEXT NOT NULL,
      staging BLOB NOT NULL,
      enqueued_at_ms INTEGER NOT NULL,
      correlation_id TEXT NOT NULL
    );
  `);
  const insertOutbox = db.prepare(
    `INSERT INTO outbox (record_key, principal_id, tenant_key, payload, metadata, content_hash, committed_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < outboxRows; i++) {
    insertOutbox.run(
      `out-${shardIndex}-${i}`,
      i % 2 === 0 ? "did:key:alice" : "did:key:bob",
      "relay",
      new Uint8Array([1]),
      "{}",
      "hash",
      Date.now(),
    );
  }
  const insertInbox = db.prepare(
    `INSERT INTO inbox (inbox_entry_id, tenant_key, recipient_principal_id, staging, enqueued_at_ms, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < inboxRows; i++) {
    insertInbox.run(
      `in-${shardIndex}-${i}`,
      "relay",
      "did:key:alice",
      new Uint8Array([1]),
      Date.now(),
      "corr",
    );
  }
  db.close();
}

function deps(overrides?: Partial<AtriumHostContext>): HostRouteDeps {
  return {
    ctx: {
      catalogDb,
      framesDb,
      tenantKey: "relay",
      cellPoolCount: 2,
      cluster: {
        assignPrincipalToCell: (principalId: string) =>
          principalId === "did:key:alice" ? poolShardCellId(0) : poolShardCellId(1),
      },
      lookupNormalizedUsernameForPrincipal: () => undefined,
      ...overrides,
    } as unknown as AtriumHostContext,
    rateLimiters: {} as HostRouteDeps["rateLimiters"],
  };
}

function withSecret<T>(fn: () => T): T {
  const prev = process.env.ATRIUM_INTERNAL_SECRET;
  process.env.ATRIUM_INTERNAL_SECRET = "test-secret";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ATRIUM_INTERNAL_SECRET;
    else process.env.ATRIUM_INTERNAL_SECRET = prev;
  }
}

function withCellsDir<T>(fn: () => T): T {
  const prev = process.env.ATRIUM_CELLS_DIR;
  process.env.ATRIUM_CELLS_DIR = cellsDir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ATRIUM_CELLS_DIR;
    else process.env.ATRIUM_CELLS_DIR = prev;
  }
}

afterAll(() => {
  catalogDb.close();
  framesDb.close();
  rmSync(testRoot, { recursive: true, force: true });
});

describe("internal admin stats", () => {
  test("summary returns 401 without bearer secret", () => {
    withSecret(() => {
      const res = handleInternalAdminStatsSummary(new Request("http://x/summary"), deps());
      expect(res.status).toBe(401);
    });
  });

  test("summary includes catalog, frames, and cell aggregates", async () => {
    seedCatalog();
    seedFrames();
    seedCellShard(0, 2, 1);
    seedCellShard(1, 0, 0);

    await withSecret(() =>
      withCellsDir(async () => {
        const res = handleInternalAdminStatsSummary(
          new Request("http://x/summary", {
            headers: { Authorization: "Bearer test-secret" },
          }),
          deps(),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          registeredUsers: number;
          catalog: { projectionRows: number; subscriptionEdges: number; registeredUsers: number };
          frames: { activeRooms: number; totalFrames: number };
          cells: {
            poolCount: number;
            inUseCount: number;
            shards: Array<{
              cellId: string;
              provisioned: boolean;
              outboxCount: number;
              inboxCount: number;
              homePrincipals: number;
            }>;
          };
        };

        expect(body.registeredUsers).toBe(1);
        expect(body.catalog.projectionRows).toBe(2);
        expect(body.catalog.subscriptionEdges).toBe(1);
        expect(body.catalog.registeredUsers).toBe(1);
        expect(body.frames.activeRooms).toBe(1);
        expect(body.frames.totalFrames).toBe(2);
        expect(body.cells.poolCount).toBe(2);
        expect(body.cells.inUseCount).toBe(1);
        expect(body.cells.shards).toHaveLength(2);
        expect(body.cells.shards[0]).toMatchObject({
          cellId: poolShardCellId(0),
          provisioned: true,
          outboxCount: 2,
          inboxCount: 1,
          homePrincipals: 1,
        });
        expect(body.cells.shards[1]).toMatchObject({
          cellId: poolShardCellId(1),
          provisioned: true,
          outboxCount: 0,
          inboxCount: 0,
          homePrincipals: 0,
        });
      }),
    );
  });

  test("cell returns 401 without bearer secret", () => {
    withSecret(() => {
      const url = new URL(`http://x/cell?cellId=${poolShardCellId(0)}`);
      const res = handleInternalAdminStatsCell(new Request(url), url, deps());
      expect(res.status).toBe(401);
    });
  });

  test("cell returns 400 when cellId is missing", () => {
    withSecret(() => {
      const url = new URL("http://x/cell");
      const res = handleInternalAdminStatsCell(
        new Request(url, { headers: { Authorization: "Bearer test-secret" } }),
        url,
        deps(),
      );
      expect(res.status).toBe(400);
    });
  });

  test("cell returns 400 for unknown shard id", () => {
    withSecret(() => {
      const url = new URL("http://x/cell?cellId=colonnade-shard-99");
      const res = handleInternalAdminStatsCell(
        new Request(url, { headers: { Authorization: "Bearer test-secret" } }),
        url,
        deps(),
      );
      expect(res.status).toBe(400);
    });
  });

  test("cell returns detail for a provisioned shard", async () => {
    seedCatalog();
    seedCellShard(0, 3, 2);

    await withSecret(() =>
      withCellsDir(async () => {
        const cellId = poolShardCellId(0);
        const url = new URL(`http://x/cell?cellId=${cellId}`);
        const res = handleInternalAdminStatsCell(
          new Request(url, { headers: { Authorization: "Bearer test-secret" } }),
          url,
          deps(),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          cellId: string;
          provisioned: boolean;
          fileSizeBytes: number | null;
          outboxCount: number;
          inboxCount: number;
          outboxPrincipals: number;
          inboxRecipients: number;
          homePrincipals: number;
          topOutboxAuthors: Array<{ principalId: string; count: number }>;
        };

        expect(body.cellId).toBe(cellId);
        expect(body.provisioned).toBe(true);
        expect(body.fileSizeBytes).toBeGreaterThan(0);
        expect(body.outboxCount).toBe(3);
        expect(body.inboxCount).toBe(2);
        expect(body.outboxPrincipals).toBe(2);
        expect(body.inboxRecipients).toBe(1);
        expect(body.homePrincipals).toBe(1);
        expect(body.topOutboxAuthors.length).toBeGreaterThan(0);
      }),
    );
  });

  test("principal returns 401 without bearer secret", () => {
    withSecret(() => {
      const res = handleInternalAdminStatsPrincipal(
        new Request("http://x/principal?did=did:key:abc"),
        new URL("http://x/principal?did=did:key:abc"),
        deps(),
      );
      expect(res.status).toBe(401);
    });
  });

  test("principal returns 400 when did is missing", () => {
    withSecret(() => {
      const res = handleInternalAdminStatsPrincipal(
        new Request("http://x/principal", {
          headers: { Authorization: "Bearer test-secret" },
        }),
        new URL("http://x/principal"),
        deps(),
      );
      expect(res.status).toBe(400);
    });
  });
});
