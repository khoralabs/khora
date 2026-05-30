import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { poolShardCellId } from "@khoralabs/colonnade-persistence";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import { openEncryptedDatabaseSync, TEST_KHORA_SQLCIPHER_KEY } from "@khoralabs/sqlite-crypto";
import { createKhoraAdminStatsPort } from "../ops/admin-stats-port";
import type { HostRouteDeps } from "./deps";
import {
  handleInternalAdminStatsCell,
  handleInternalAdminStatsInactiveMembers,
  handleInternalAdminStatsPrincipal,
  handleInternalAdminStatsSummary,
} from "./internal-admin-stats";

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
  CREATE TABLE standing_queries (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    search_json TEXT NOT NULL,
    min_score REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER
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
  catalogDb.run("DELETE FROM standing_queries");
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
      `INSERT INTO standing_queries (id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms)
       VALUES (?, ?, '{}', 0, 1, ?, ?)`,
    )
    .run("sub-1", "did:key:alice", Date.now(), Date.now());
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
  framesDb
    .prepare(`INSERT INTO room_frames (channel_id, bytes) VALUES (?, ?)`)
    .run("room-active", new Uint8Array([1]));
  framesDb
    .prepare(`INSERT INTO room_frames (channel_id, bytes) VALUES (?, ?)`)
    .run("room-active", new Uint8Array([2]));
}

function seedCellShard(
  shardIndex: number,
  outboxRows: number,
  inboxRows: number,
  committedAtMs = Date.now(),
): void {
  const cellId = poolShardCellId(shardIndex);
  const path = join(cellsDir, `${cellId}.sqlite`);
  rmSync(path, { force: true });
  const db = openEncryptedDatabaseSync(path, { create: true }, TEST_KHORA_SQLCIPHER_KEY);
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
      committedAtMs,
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

function deps(overrides?: Partial<KhoraHostContext>): HostRouteDeps {
  const cluster = {
    cellPoolCount: 2 as number | undefined,
    assignPrincipalToCell: (principalId: string) =>
      principalId === "did:key:alice" ? poolShardCellId(0) : poolShardCellId(1),
    resolveCell: () => {
      throw new Error("resolveCell not used in admin stats tests");
    },
    close: () => {},
    ...(overrides?.cluster ?? {}),
  };
  const lookupNormalizedUsernameForPrincipal =
    overrides?.lookupNormalizedUsernameForPrincipal ?? (() => undefined);
  const adminStats = createKhoraAdminStatsPort({
    catalogDb,
    framesDb,
    cellsDir,
    tenantKey: "relay",
    cellPoolCount: 2,
    cluster,
    lookupNormalizedUsernameForPrincipal,
    sqlCipherKey: TEST_KHORA_SQLCIPHER_KEY,
  });
  return {
    ctx: {
      tenantKey: "relay",
      cellPoolCount: 2,
      cluster,
      adminStats,
      health: { ping() {} },
      lookupNormalizedUsernameForPrincipal,
      ...overrides,
    } as unknown as KhoraHostContext,
    rateLimiters: {} as HostRouteDeps["rateLimiters"],
    consoleAuth: null,
  };
}

function withSecret<T>(fn: () => T): T {
  const prev = process.env.KHORA_INTERNAL_SECRET;
  process.env.KHORA_INTERNAL_SECRET = "test-secret";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.KHORA_INTERNAL_SECRET;
    else process.env.KHORA_INTERNAL_SECRET = prev;
  }
}

function withCellsDir<T>(fn: () => T): T {
  const prev = process.env.KHORA_CELLS_DIR;
  process.env.KHORA_CELLS_DIR = cellsDir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.KHORA_CELLS_DIR;
    else process.env.KHORA_CELLS_DIR = prev;
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
          catalog: { projectionRows: number; standingQueries: number; registeredUsers: number };
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
          networkActivity: {
            heartbeat: { registeredAgents: number };
          };
        };

        expect(body.registeredUsers).toBe(1);
        expect(body.catalog.projectionRows).toBe(2);
        expect(body.catalog.standingQueries).toBe(1);
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
        expect(body.networkActivity).toBeDefined();
        expect(body.networkActivity.heartbeat.registeredAgents).toBe(1);
      }),
    );
  });

  test("inactive-members returns registered stale principals", async () => {
    seedCatalog();
    const staleMs = Date.now() - 10 * 24 * 60 * 60 * 1000;
    seedCellShard(0, 1, 0, staleMs);

    await withSecret(() =>
      withCellsDir(async () => {
        const url = new URL("http://x/inactive-members?days=7");
        const res = handleInternalAdminStatsInactiveMembers(
          new Request(url, { headers: { Authorization: "Bearer test-secret" } }),
          url,
          deps(),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { members: Array<{ did: string }> };
        expect(body.members.some((m) => m.did === "did:key:alice")).toBe(true);
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
