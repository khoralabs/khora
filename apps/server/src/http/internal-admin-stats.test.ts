import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  decodeCellId,
  principalHomeCellId,
  resolveEncodedDatabasePath,
} from "@khoralabs/colonnade";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import {
  type HostRouteDeps,
  handleAdminStatsCell,
  handleAdminStatsInactiveMembers,
  handleAdminStatsPrincipal,
  handleAdminStatsSummary,
} from "@khoralabs/khora-host/http";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";
import { createKhoraAdminStatsPort } from "../ops/admin-stats-port";

const ROOT_TOKEN = "test-root-token-16chars";
const TEST_SQLCIPHER_KEY = "test-khora-sqlcipher-key!!";

const REG_BY_PRINCIPAL = "khora:reg:by-principal";
const testRoot = mkdtempSync(join(tmpdir(), "admin-stats-test-"));
const cellsDir = join(testRoot, "cells");
mkdirSync(cellsDir, { recursive: true });

const hostDb = new Database(":memory:");
hostDb.run(`
  CREATE TABLE khora_host_projections (
    tenant_key TEXT NOT NULL,
    namespace TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    projection JSON NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (tenant_key, namespace, entry_key)
  );
`);

const percolatorDb = new Database(":memory:");
percolatorDb.run(`
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

function seedCatalog(): void {
  hostDb.run("DELETE FROM khora_host_projections");
  percolatorDb.run("DELETE FROM standing_queries");
  hostDb
    .prepare(
      `INSERT INTO khora_host_projections (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, '{}', ?)`,
    )
    .run("relay", REG_BY_PRINCIPAL, "did:key:alice", Date.now());
  hostDb
    .prepare(
      `INSERT INTO khora_host_projections (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, '{}', ?)`,
    )
    .run("relay", "khora:social:username-to-principal", "alice", Date.now());
  percolatorDb
    .prepare(
      `INSERT INTO standing_queries (id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms)
       VALUES (?, ?, '{}', 0, 1, ?, ?)`,
    )
    .run("sub-1", "did:key:alice", Date.now(), Date.now());
}

function seedCellForPrincipal(
  principalId: string,
  outboxRows: number,
  inboxRows: number,
  committedAtMs = Date.now(),
): void {
  const cellId = principalHomeCellId(principalId);
  const path = resolveEncodedDatabasePath(cellsDir, decodeCellId(cellId));
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { force: true });
  const db = openEncryptedDatabaseSync(path, { create: true }, TEST_SQLCIPHER_KEY);
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
      `out-${principalId}-${i}`,
      i % 2 === 0 ? principalId : "did:key:bob",
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
      `in-${principalId}-${i}`,
      "relay",
      principalId,
      new Uint8Array([1]),
      Date.now(),
      "corr",
    );
  }
  db.close();
}

function deps(
  adminTokenAuth: HostRouteDeps["adminTokenAuth"],
  overrides?: Partial<KhoraHostContext>,
): HostRouteDeps {
  const cluster = {
    cellPoolCount: 1,
    assignPrincipalToCell: (principalId: string) => principalHomeCellId(principalId),
    resolveCell: () => {
      throw new Error("resolveCell not used in admin stats tests");
    },
    close: () => {},
    ...(overrides?.cluster ?? {}),
  };
  const lookupNormalizedUsernameForPrincipal =
    overrides?.lookupNormalizedUsernameForPrincipal ?? (() => undefined);
  const adminStats = createKhoraAdminStatsPort({
    hostDb,
    percolatorDb,
    cellsDir,
    tenantKey: "relay",
    cluster,
    lookupNormalizedUsernameForPrincipal,
    sqlCipherKey: TEST_SQLCIPHER_KEY,
  });
  return {
    ctx: {
      tenantKey: "relay",
      cellPoolCount: 1,
      cluster,
      adminStats,
      health: { ping() {} },
      lookupNormalizedUsernameForPrincipal,
      ...overrides,
    } as unknown as KhoraHostContext,
    rateLimiters: {} as HostRouteDeps["rateLimiters"],
    adminTokenAuth,
  };
}

async function loginCookie(auth: ReturnType<typeof createRootTokenAdminAuth>): Promise<string> {
  const loginRes = await auth.route?.(
    new Request("http://x/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ROOT_TOKEN }),
    }),
    new URL("http://x/admin/api/login"),
  );
  const setCookie = loginRes?.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
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
  hostDb.close();
  percolatorDb.close();
  rmSync(testRoot, { recursive: true, force: true });
});

describe("admin stats", () => {
  test("summary returns 503 when console disabled", async () => {
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary"),
      deps(null),
    );
    expect(res.status).toBe(503);
  });

  test("summary returns 401 without session", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary"),
      deps(auth),
    );
    expect(res.status).toBe(401);
  });

  test("summary includes catalog and cell aggregates", async () => {
    seedCatalog();
    seedCellForPrincipal("did:key:alice", 2, 1);

    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    await withCellsDir(async () => {
      const res = await handleAdminStatsSummary(
        new Request("http://x/admin/api/stats/summary", { headers: { cookie } }),
        deps(auth),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        registeredUsers: number;
        catalog: { projectionRows: number; standingQueries: number; registeredUsers: number };
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
      expect(body.cells.poolCount).toBe(1);
      expect(body.cells.inUseCount).toBe(1);
      expect(body.cells.shards).toHaveLength(1);
      expect(body.cells.shards[0]).toMatchObject({
        cellId: principalHomeCellId("did:key:alice"),
        provisioned: true,
        outboxCount: 2,
        inboxCount: 1,
        homePrincipals: 1,
      });
      expect(body.networkActivity).toBeDefined();
      expect(body.networkActivity.heartbeat.registeredAgents).toBe(1);
    });
  });

  test("inactive-members returns registered stale principals", async () => {
    seedCatalog();
    const staleMs = Date.now() - 10 * 24 * 60 * 60 * 1000;
    seedCellForPrincipal("did:key:alice", 1, 0, staleMs);

    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    await withCellsDir(async () => {
      const url = new URL("http://x/admin/api/stats/inactive-members?days=7");
      const res = await handleAdminStatsInactiveMembers(
        new Request(url, { headers: { cookie } }),
        url,
        deps(auth),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { members: Array<{ did: string }> };
      expect(body.members.some((m) => m.did === "did:key:alice")).toBe(true);
    });
  });

  test("cell returns 401 without session", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const url = new URL(
      `http://x/admin/api/stats/cell?cellId=${principalHomeCellId("did:key:alice")}`,
    );
    const res = await handleAdminStatsCell(new Request(url), url, deps(auth));
    expect(res.status).toBe(401);
  });

  test("cell returns 400 when cellId is missing", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const url = new URL("http://x/admin/api/stats/cell");
    const res = await handleAdminStatsCell(
      new Request(url, { headers: { cookie } }),
      url,
      deps(auth),
    );
    expect(res.status).toBe(400);
  });

  test("cell returns 400 for unknown shard id", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const url = new URL("http://x/admin/api/stats/cell?cellId=colonnade-shard-99");
    const res = await handleAdminStatsCell(
      new Request(url, { headers: { cookie } }),
      url,
      deps(auth),
    );
    expect(res.status).toBe(400);
  });

  test("cell returns detail for a provisioned shard", async () => {
    seedCatalog();
    seedCellForPrincipal("did:key:alice", 3, 2);

    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    await withCellsDir(async () => {
      const cellId = principalHomeCellId("did:key:alice");
      const url = new URL(`http://x/admin/api/stats/cell?cellId=${cellId}`);
      const res = await handleAdminStatsCell(
        new Request(url, { headers: { cookie } }),
        url,
        deps(auth),
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
    });
  });

  test("principal returns 401 without session", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const res = await handleAdminStatsPrincipal(
      new Request("http://x/admin/api/stats/principal?did=did:key:abc"),
      new URL("http://x/admin/api/stats/principal?did=did:key:abc"),
      deps(auth),
    );
    expect(res.status).toBe(401);
  });

  test("principal returns 400 when did is missing", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const res = await handleAdminStatsPrincipal(
      new Request("http://x/admin/api/stats/principal", { headers: { cookie } }),
      new URL("http://x/admin/api/stats/principal"),
      deps(auth),
    );
    expect(res.status).toBe(400);
  });
});
