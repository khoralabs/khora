import { Database } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_KHORA_SQLCIPHER_KEY } from "@khoralabs/colonnade-crypto";
import { poolShardCellId } from "@khoralabs/colonnade-persistence";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";
import { createKhoraAdminStatsPort } from "./admin-stats-port";

const REG_BY_PRINCIPAL = "relay:reg:by-principal";
const testRoot = mkdtempSync(join(tmpdir(), "admin-network-test-"));
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
`);

const framesDb = new Database(":memory:");
framesDb.run(`
  CREATE TABLE rooms (
    channel_id TEXT PRIMARY KEY NOT NULL,
    pairing_secret_hex TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
  );
`);

function registerPrincipal(did: string, username?: string): void {
  catalogDb
    .prepare(
      `INSERT OR REPLACE INTO relay_catalog_projections
       (tenant_key, namespace, entry_key, projection, updated_at_ms)
       VALUES (?, ?, ?, '{}', ?)`,
    )
    .run("relay", REG_BY_PRINCIPAL, did, Date.now());
  if (username !== undefined) {
    catalogDb
      .prepare(
        `INSERT OR REPLACE INTO relay_catalog_projections
         (tenant_key, namespace, entry_key, projection, updated_at_ms)
         VALUES (?, ?, ?, '{}', ?)`,
      )
      .run("relay", "relay:social:username-to-principal", username, Date.now());
  }
}

function seedOutbox(
  shardIndex: number,
  rows: Array<{
    recordKey: string;
    principalId: string;
    postKind?: string;
    committedAtMs: number;
  }>,
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
  `);
  const insert = db.prepare(
    `INSERT INTO outbox (record_key, principal_id, tenant_key, payload, metadata, content_hash, committed_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    const metadata = row.postKind !== undefined ? JSON.stringify({ postKind: row.postKind }) : "{}";
    insert.run(
      row.recordKey,
      row.principalId,
      "relay",
      new Uint8Array([1]),
      metadata,
      "hash",
      row.committedAtMs,
    );
  }
  db.close();
}

function makePort(lookup?: (did: string) => string | undefined) {
  return createKhoraAdminStatsPort({
    catalogDb,
    framesDb,
    cellsDir,
    tenantKey: "relay",
    cellPoolCount: 2,
    cluster: {
      cellPoolCount: 2,
      assignPrincipalToCell: (did) =>
        did === "did:key:active" ? poolShardCellId(0) : poolShardCellId(1),
      resolveCell: () => {
        throw new Error("not used");
      },
      close: () => {},
    },
    lookupNormalizedUsernameForPrincipal: lookup ?? (() => undefined),
    sqlCipherKey: TEST_KHORA_SQLCIPHER_KEY,
  });
}

beforeEach(() => {
  catalogDb.run("DELETE FROM relay_catalog_projections");
  framesDb.run("DELETE FROM rooms");
  rmSync(cellsDir, { recursive: true, force: true });
  mkdirSync(cellsDir, { recursive: true });
});

afterAll(() => {
  catalogDb.close();
  framesDb.close();
  rmSync(testRoot, { recursive: true, force: true });
});

describe("admin network activity", () => {
  test("counts subscriptions this week and room creation", () => {
    const now = Date.now();
    registerPrincipal("did:key:active", "active");
    registerPrincipal("did:key:quiet", "quiet");

    seedOutbox(0, [
      {
        recordKey: "probe-1",
        principalId: "did:key:active",
        postKind: "subscription",
        committedAtMs: now - 1_000,
      },
      {
        recordKey: "probe-old",
        principalId: "did:key:active",
        postKind: "subscription",
        committedAtMs: now - 8 * 24 * 60 * 60 * 1000,
      },
      {
        recordKey: "status-recent",
        principalId: "did:key:active",
        postKind: "status",
        committedAtMs: now - 60_000,
      },
    ]);
    seedOutbox(1, [
      {
        recordKey: "post-old",
        principalId: "did:key:quiet",
        postKind: "post",
        committedAtMs: now - 10 * 24 * 60 * 60 * 1000,
      },
    ]);

    framesDb
      .prepare(
        `INSERT INTO rooms (channel_id, pairing_secret_hex, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?)`,
      )
      .run("room-new", "aa", now - 2_000, now + 60_000);
    framesDb
      .prepare(
        `INSERT INTO rooms (channel_id, pairing_secret_hex, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?)`,
      )
      .run("room-old", "bb", now - 10 * 24 * 60 * 60 * 1000, now + 60_000);

    const summary = makePort((did) =>
      did === "did:key:active" ? "active" : did === "did:key:quiet" ? "quiet" : undefined,
    ).summary();

    expect(summary.networkActivity.subscriptionsThisWeek).toBe(1);
    expect(summary.networkActivity.roomsCreatedThisWeek).toBe(1);
    expect(summary.networkActivity.totalRoomsCreated).toBe(2);
    expect(summary.networkActivity.heartbeat.registeredAgents).toBe(2);
    expect(summary.networkActivity.heartbeat.withStatusPost).toBe(1);
    expect(summary.networkActivity.heartbeat.activeLast24h).toBe(1);
    expect(summary.networkActivity.heartbeat.silent7dPlus).toBe(1);
  });

  test("inactiveMembers lists principals with stale post or heartbeat", () => {
    const now = Date.now();
    registerPrincipal("did:key:active", "active");
    registerPrincipal("did:key:quiet", "quiet");

    seedOutbox(0, [
      {
        recordKey: "status-recent",
        principalId: "did:key:active",
        postKind: "status",
        committedAtMs: now - 60_000,
      },
      {
        recordKey: "post-recent",
        principalId: "did:key:active",
        postKind: "post",
        committedAtMs: now - 60_000,
      },
    ]);
    seedOutbox(1, [
      {
        recordKey: "post-old",
        principalId: "did:key:quiet",
        postKind: "post",
        committedAtMs: now - 10 * 24 * 60 * 60 * 1000,
      },
    ]);

    const result = makePort().inactiveMembers({ inactiveDays: 7 });

    expect(result.inactiveDays).toBe(7);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.did).toBe("did:key:quiet");
    expect(result.members[0]?.reasons).toContain("no_post_7d");
    expect(result.members[0]?.reasons).toContain("silent_heartbeat_7d");
  });
});
