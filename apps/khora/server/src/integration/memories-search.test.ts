import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createTestEncryptionMaterial } from "@khoralabs/colonnade-crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence-sqlite";
import type { KhoraProfile } from "@khoralabs/khora-contracts";
import {
  agentScope,
  createColonnadePostResolver,
  createHostPersistenceClient,
  createKhoraCanonicalStore,
  createKhoraMemoriesIndexer,
  DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT,
  executeKhoraMemoriesSearch,
  khoraOntology,
  PROFILE_MEMORY_KEY,
} from "@khoralabs/khora-host";
import { MemoriesClientAsync } from "@khoralabs/memories-node";
import {
  createMemoriesPersistenceAsync,
  memoriesSqliteVecAvailable,
  openMemoriesDatabase,
} from "@khoralabs/memories-node/sqlite";

function memoriesTest(name: string, fn: () => Promise<void>): void {
  test.skipIf(!memoriesSqliteVecAvailable())(name, fn);
}

function createTestRelayPersistence(profile: KhoraProfile) {
  const hostDb = new Database(":memory:");
  hostDb.exec(`
    CREATE TABLE khora_host_projections (
      tenant_key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      projection TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (tenant_key, namespace, entry_key)
    );
  `);
  const upsertStmt = hostDb.prepare(
    `INSERT OR REPLACE INTO khora_host_projections (tenant_key, namespace, entry_key, projection, updated_at_ms) VALUES (?, ?, ?, ?, ?)`,
  );
  const lookupStmt = hostDb.prepare(
    `SELECT projection FROM khora_host_projections WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
  );
  function upsert(tenantKey: string, ns: string, key: string, value: unknown) {
    upsertStmt.run(tenantKey, ns, key, JSON.stringify(value), Date.now());
  }
  function lookup(tenantKey: string, ns: string, key: string): unknown | undefined {
    const row = lookupStmt.get(tenantKey, ns, key) as { projection: string } | null | undefined;
    return row != null ? JSON.parse(row.projection) : undefined;
  }
  const profileBody = JSON.stringify(profile);
  upsert("relay", "relay:entity:profile", profile.id, {
    id: profile.id,
    memoryId: null,
    bodyJson: profileBody,
    updatedAtMs: Date.now(),
  });
  const persistenceClient = createHostPersistenceClient({
    profiles: {
      upsert: (record) => {
        upsert("relay", "relay:entity:profile", record.id, {
          id: record.id,
          memoryId: record.memoryId ?? null,
          bodyJson: record.bodyJson,
          updatedAtMs: Date.now(),
        });
      },
      getById: (id) => {
        const projection = lookup("relay", "relay:entity:profile", id);
        if (projection === null || typeof projection !== "object" || Array.isArray(projection))
          return undefined;
        const o = projection as Record<string, unknown>;
        return {
          id: typeof o.id === "string" ? o.id : id,
          memoryId: typeof o.memoryId === "string" ? o.memoryId : null,
          bodyJson: typeof o.bodyJson === "string" ? o.bodyJson : profileBody,
          updatedAtMs: typeof o.updatedAtMs === "number" ? o.updatedAtMs : 0,
        };
      },
      deleteById: (id) => {
        hostDb
          .prepare(
            `DELETE FROM khora_host_projections WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
          )
          .run("relay", "relay:entity:profile", id);
      },
    },
    registrations: {
      upsert: () => {},
      delete: () => {},
      exists: () => true,
      profileIdForPrincipal: () => profile.id,
      principalForProfileId: () => "did:test:author",
    },
    social: {
      createRelationship: () => {},
      getRelationship: () => undefined,
      bindPeer: () => {},
      refreshRelationshipTicketExpiry: () => {},
      listRelationshipsForPrincipal: () => [],
      deleteRelationship: () => undefined,
    },
    agentAccountStatus: {
      getStatus: () => undefined,
      setStatus: () => {},
      clearStatus: () => {},
    },
  });
  return {
    persistenceClient,
    removeProfile: () => {
      hostDb
        .prepare(
          `DELETE FROM khora_host_projections WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
        )
        .run("relay", "relay:entity:profile", profile.id);
    },
  };
}

describe("executeKhoraMemoriesSearch", () => {
  memoriesTest("filters and purges profile memories whose catalog row was removed", async () => {
    const root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
    const profile: KhoraProfile = {
      id: "e4a2c87d-141d-4bc8-a347-337fca92e3ce",
      username: "zach",
      displayName: "Zach",
      bio: "CEO and Co-Founder of Khora Labs",
    };
    const { persistenceClient, removeProfile } = createTestRelayPersistence(profile);
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-search-orphan-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memoriesDb = openMemoriesDatabase(":memory:", { sqlCipherKey: encryption.sqlCipherKey });
    const persistence = createMemoriesPersistenceAsync(memoriesDb);
    const postResolver = createColonnadePostResolver(cluster);
    const store = createKhoraCanonicalStore({ persistence, postResolver, persistenceClient });
    const client = new MemoriesClientAsync(persistence, khoraOntology, { store });
    const indexer = createKhoraMemoriesIndexer({
      client,
      persistence,
      persistenceClient,
      namespaceRoot: root,
    });

    await indexer.indexProfile(profile);
    removeProfile();

    const { hits: before } = await client.search({
      namespace: agentScope(root, profile.id),
      content: { text: "Zach" },
      options: { topK: 5 },
    });
    expect(before.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(true);

    const result = await executeKhoraMemoriesSearch({
      client,
      persistence,
      store,
      namespaceRoot: root,
      params: {
        namespace: agentScope(root, profile.id),
        content: { text: "Zach" },
        options: { topK: 5 },
      },
    });
    expect(result.hits).toHaveLength(0);

    const { hits: after } = await client.search({
      namespace: agentScope(root, profile.id),
      content: { text: "Zach" },
      options: { topK: 5 },
    });
    expect(after.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });
});
