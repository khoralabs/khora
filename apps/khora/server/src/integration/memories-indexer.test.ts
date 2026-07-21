import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  createTestEncryptionMaterial,
  TEST_POST_AUTHOR_SIGNATURE,
} from "@khoralabs/colonnade-crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence-sqlite";
import type { KhoraPost, KhoraProfile } from "@khoralabs/khora-contracts";
import {
  agentScope,
  createColonnadePostResolver,
  createHostPersistenceClient,
  createKhoraCanonicalStore,
  createKhoraMemoriesIndexer,
  DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT,
  encodePostId,
  khoraOntology,
  PROFILE_MEMORY_KEY,
  postsMemoryNamespace,
  profileMemoryNamespace,
  topicScope,
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
  return createHostPersistenceClient({
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
      deleteById: () => {},
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
}

describe("khora memories indexer", () => {
  memoriesTest("indexes profile and topic-scoped post; scopeDag finds post by topic", async () => {
    const root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
    const profile: KhoraProfile = {
      id: "prof-index-1",
      username: "alice",
      displayName: "Alice",
      bio: "works on platform tooling",
    };
    const persistenceClient = createTestRelayPersistence(profile);
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-mem-test-${crypto.randomUUID()}`,
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

    const authorPrincipalId = "did:test:author";
    const recordKey = "ob_test123456789012345678901234";
    const post: KhoraPost = {
      id: encodePostId({
        authorPrincipalId,
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "post",
      topics: ["design"],
      title: "Beta program",
      body: "Looking for teams building developer tools.",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };

    const authorCellId = cluster.assignPrincipalToCell(authorPrincipalId);
    const cell = cluster.resolveCell(authorCellId);
    await cell.appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: authorPrincipalId,
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
      metadata: { postId: post.id, postKind: post.kind },
    });

    await indexer.indexPost(post);

    const { hits: globalHits } = await client.search({
      namespace: root,
      content: { text: "developer tools" },
      options: { topK: 5 },
    });
    expect(globalHits.some((h) => h.memory.key === post.id)).toBe(true);

    const { hits: topicHits } = await client.search({
      namespace: topicScope(root, profile.id, "design"),
      content: { text: "developer tools" },
      searchScopeMode: "scopeDag",
      options: { topK: 5 },
    });
    expect(topicHits.some((h) => h.memory.key === post.id)).toBe(true);

    const { hits: profHits } = await client.search({
      namespace: agentScope(root, profile.id),
      content: { text: "Alice" },
      options: { topK: 5 },
    });
    expect(profHits.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(true);

    await indexer.deletePost(post);
    const { hits: afterDelete } = await client.search({
      namespace: postsMemoryNamespace(root, profile.id),
      content: { text: "developer" },
      options: { topK: 5 },
    });
    expect(afterDelete.some((h) => h.memory.key === post.id)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });

  memoriesTest("deleteProfile removes profile and indexed post memories", async () => {
    const root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
    const profile: KhoraProfile = {
      id: "prof-delete-1",
      username: "dana",
      displayName: "Dana",
      bio: "platform engineer",
    };
    const persistenceClient = createTestRelayPersistence(profile);
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-mem-delete-${crypto.randomUUID()}`,
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
    const authorPrincipalId = "did:test:author";
    const recordKey = "ob_delete123456789012345678901";
    const post: KhoraPost = {
      id: encodePostId({
        authorPrincipalId,
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "post",
      body: "delete me from search",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };
    const authorCellId = cluster.assignPrincipalToCell(authorPrincipalId);
    await cluster.resolveCell(authorCellId).appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: authorPrincipalId,
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
      metadata: { postId: post.id, postKind: post.kind },
    });
    await indexer.indexPost(post);

    await indexer.deleteProfile(profile.id);

    const { hits: profileHits } = await client.search({
      namespace: profileMemoryNamespace(root, profile.id),
      content: { text: "Dana" },
      options: { topK: 5 },
    });
    expect(profileHits.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(false);

    const { hits: postHits } = await client.search({
      namespace: postsMemoryNamespace(root, profile.id),
      content: { text: "delete" },
      options: { topK: 5 },
    });
    expect(postHits.some((h) => h.memory.key === post.id)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });

  memoriesTest("indexes subscription with search; label filter finds subscription", async () => {
    const root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
    const profile: KhoraProfile = {
      id: "prof-probe-1",
      username: "bob",
      displayName: "Bob",
    };
    const persistenceClient = createTestRelayPersistence(profile);
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-mem-probe-${crypto.randomUUID()}`,
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

    const authorPrincipalId = "did:test:author";
    const recordKey = "ob_probe123456789012345678901";
    const subscription: KhoraPost = {
      id: encodePostId({
        authorPrincipalId,
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "subscription",
      topics: ["platform"],
      body: "Seeking pilots with enterprise buyers.",
      search: {
        content: { text: "platform pilots" },
        options: { labels: { some: ["khora_topic:platform"] } },
      },
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };

    const authorCellId = cluster.assignPrincipalToCell(authorPrincipalId);
    const cell = cluster.resolveCell(authorCellId);
    await cell.appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: authorPrincipalId,
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(subscription)),
      metadata: { postId: subscription.id, postKind: subscription.kind },
    });

    await indexer.indexPost(subscription);

    const { hits: subscriptionHits } = await client.search({
      namespace: root,
      content: { text: "platform" },
      options: { topK: 5, labels: { some: ["khora_subscription"] } },
    });
    expect(subscriptionHits.some((h) => h.memory.key === subscription.id)).toBe(true);
    expect(
      subscriptionHits.every((h) => h.labels.some((l) => l.kind === "khora_subscription")),
    ).toBe(true);

    const { hits: postOnlyHits } = await client.search({
      namespace: root,
      content: { text: "platform" },
      options: { topK: 5, labels: { some: ["khora_post"] } },
    });
    expect(postOnlyHits.some((h) => h.memory.key === subscription.id)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });
});
