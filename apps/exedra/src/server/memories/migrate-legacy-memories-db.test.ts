import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ids, zNamespacePath } from "@khoralabs/memories-core";
import { createMemoriesPersistence, openMemoriesDatabase } from "@khoralabs/memories-sqlite";

import { closeDb, getDb } from "../db/index";
import { ensureExedraSchema } from "../db/schema";
import { getOrCreateUser } from "../identity/users";
import { getMemoriesSqlCipherKey } from "./config";
import { encodePrincipalIdForMemories } from "./encode-principal-id";
import {
  buildPrincipalSegmentMigrationMap,
  encodePrincipalIdForMemoriesLegacy,
  migrateNamespacePathWithSegmentMap,
} from "./encode-principal-id-legacy";
import { migrateLegacyMemoriesDatabase } from "./migrate-legacy-memories-db";
import { migrateMemoriesStore } from "./migrate-memories-store";
import { orgTeamScope, userTeamScope } from "./namespaces";
import { resetMemoriesStoreForTests } from "./store";

const DID = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440000";

function legacyOrgTeamScope(orgId: string, teamId: string): string {
  const encoded = encodePrincipalIdForMemoriesLegacy(orgId);
  return `org/${encoded}/team/${teamId}`;
}

function legacyUserTeamScope(userId: string, orgId: string, teamId: string): string {
  const encodedUser = encodePrincipalIdForMemoriesLegacy(userId);
  const encodedOrg = encodePrincipalIdForMemoriesLegacy(orgId);
  return `${encodedUser}/org/${encodedOrg}/team/${teamId}`;
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-memories-migrate-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
  resetMemoriesStoreForTests();
  mkdirSync(path.join(dataDir, "memories"), { recursive: true });
});

afterEach(() => {
  closeDb();
  resetMemoriesStoreForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("migrateLegacyMemoriesDatabase rewrites scope chains and memory namespaces", () => {
  const segmentMap = buildPrincipalSegmentMigrationMap([DID]);
  const legacyNamespace = legacyOrgTeamScope(DID, TEAM_ID);
  const db = openMemoriesDatabase(path.join(dataDir, "memories", "legacy-org.db"), {
    sqlCipherKey: getMemoriesSqlCipherKey(),
  });
  const persistence = createMemoriesPersistence(db);

  persistence.withTransaction(() => {
    persistence.upsertScope({ now: Date.now() }, { scopeId: "_global_" });
    persistence.upsertScope({ now: Date.now() }, { scopeId: legacyNamespace });
    persistence.linkScopes(
      { now: Date.now() },
      { parentScopeId: "_global_", childScopeId: legacyNamespace },
    );
  });

  const summaryText = "Legacy onboarding summary text";
  const memoryId = ids.memory(legacyNamespace, "onboarding/summary");
  const nodeId = ids.node(legacyNamespace, "onboarding/summary");
  const sourceMapId = ids.sourceMap(memoryId, "text");
  const textFeatureId = ids.textFeature(sourceMapId);
  const now = Date.now();

  db.run(
    `INSERT INTO memories (_id, _ts_created, namespace, key, kind, edge_id, ns_prefix_1, ns_prefix_2, ns_prefix_3)
     VALUES (?, ?, ?, ?, 'node', NULL, ?, ?, ?)`,
    [
      memoryId,
      now,
      legacyNamespace,
      "onboarding/summary",
      legacyNamespace.split("/")[0] ?? null,
      legacyNamespace.split("/").slice(0, 2).join("/"),
      legacyNamespace,
    ],
  );
  db.run(
    `INSERT INTO nodes (_id, _ts_created, memory_id, value, properties) VALUES (?, ?, ?, ?, NULL)`,
    [nodeId, now, memoryId, "onboarding/summary"],
  );
  db.run(
    `INSERT INTO source_maps (_id, _ts_created, memory_id, source_key, content_hash) VALUES (?, ?, ?, 'text', NULL)`,
    [sourceMapId, now, memoryId],
  );
  db.run(
    `INSERT INTO text_features (_id, _ts_created, memory_id, source_map_id, text) VALUES (?, ?, ?, ?, ?)`,
    [textFeatureId, now, memoryId, sourceMapId, summaryText],
  );
  db.run(`INSERT INTO memory_scopes (_id, _ts_created, memory_id, scope_id) VALUES (?, ?, ?, ?)`, [
    `ms:${memoryId}:${legacyNamespace}`,
    now,
    memoryId,
    legacyNamespace,
  ]);

  expect(migrateLegacyMemoriesDatabase(db, segmentMap)).toBe(true);

  const migratedNamespace = orgTeamScope(DID, TEAM_ID);
  expect(migratedNamespace.length).toBeLessThanOrEqual(128);
  expect(zNamespacePath.parse(migratedNamespace)).toBe(migratedNamespace);

  const migratedMemoryId = ids.memory(migratedNamespace, "onboarding/summary");
  const row = db
    .query<{ namespace: string; key: string }, [string]>(
      `SELECT namespace, key FROM memories WHERE _id = ?`,
    )
    .get(migratedMemoryId);
  expect(row?.namespace).toBe(migratedNamespace);

  const text = db
    .query<{ text: string }, [string]>(`SELECT text FROM text_features WHERE memory_id = ?`)
    .get(migratedMemoryId)?.text;
  expect(text).toBe(summaryText);

  const scopes = db
    .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
    .all()
    .map((scope) => scope._id);
  expect(scopes).toContain("_global_");
  expect(scopes).toContain(migratedNamespace);
  expect(scopes.some((scope) => scope === legacyNamespace)).toBe(false);

  db.close();
});

test("migrateMemoriesStore renames legacy db files and migrates user scope chains", async () => {
  const appDb = new Database(path.join(dataDir, "exedra.db"));
  ensureExedraSchema(appDb);
  const user = await getOrCreateUser(appDb, "registry-migrate-store");
  appDb.close();

  const legacyBasename = encodePrincipalIdForMemoriesLegacy(user.id);
  const legacyPath = path.join(dataDir, "memories", `${legacyBasename}.db`);
  const newPath = path.join(dataDir, "memories", `${encodePrincipalIdForMemories(user.id)}.db`);

  const db = openMemoriesDatabase(legacyPath, { sqlCipherKey: getMemoriesSqlCipherKey() });
  const persistence = createMemoriesPersistence(db);
  const legacyScope = legacyUserTeamScope(user.id, user.id, TEAM_ID);

  persistence.withTransaction(() => {
    persistence.upsertScope({ now: Date.now() }, { scopeId: "_global_" });
    persistence.upsertScope({ now: Date.now() }, { scopeId: legacyScope });
    persistence.linkScopes(
      { now: Date.now() },
      { parentScopeId: "_global_", childScopeId: legacyScope },
    );
  });
  db.close();

  migrateMemoriesStore(getDb());

  expect(existsSync(legacyPath)).toBe(false);
  expect(existsSync(newPath)).toBe(true);

  const migratedDb = openMemoriesDatabase(newPath, { sqlCipherKey: getMemoriesSqlCipherKey() });
  const migratedScope = userTeamScope(user.id, user.id, TEAM_ID);
  expect(migratedScope.length).toBeLessThanOrEqual(128);

  const scopeIds = migratedDb
    .query<{ _id: string }, []>(`SELECT _id FROM scopes`)
    .all()
    .map((scope) => scope._id);
  expect(scopeIds).toContain(migratedScope);
  expect(scopeIds.some((scope) => scope === legacyScope)).toBe(false);
  migratedDb.close();
});

test("migrateNamespacePathWithSegmentMap rewrites known legacy principal segments", () => {
  const segmentMap = buildPrincipalSegmentMigrationMap([DID]);
  expect(
    migrateNamespacePathWithSegmentMap(legacyUserTeamScope(DID, DID, TEAM_ID), segmentMap),
  ).toBe(userTeamScope(DID, DID, TEAM_ID));
  expect(migrateNamespacePathWithSegmentMap(userTeamScope(DID, DID, TEAM_ID), segmentMap)).toBe(
    userTeamScope(DID, DID, TEAM_ID),
  );
});
