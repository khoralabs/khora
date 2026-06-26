import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  createTestEncryptionMaterial,
  TEST_POST_AUTHOR_SIGNATURE,
} from "@khoralabs/colonnade-crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { createHostPersistenceClient } from "@khoralabs/host-runtime";
import type { KhoraPost, KhoraProfile } from "@khoralabs/khora-contracts";
import { MemoriesClient, search } from "@khoralabs/memories-core";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import { CatalogProjectionStore } from "../persistence/catalog-projection-store";
import { encodePostId } from "../post-address-id";
import { createColonnadePostResolver } from "../resolve-post";
import { createKhoraMemoriesIndexer } from "./indexer";
import { createKhoraCanonicalStore } from "./khora-canonical-store";
import {
  agentScope,
  PROFILE_MEMORY_KEY,
  postsMemoryNamespace,
  topicScope,
} from "./khora-namespace";
import { khoraOntology } from "./khora-ontology";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories-config";

ensureCustomSqliteForExtensions();

function createTestRelayPersistence(profile: KhoraProfile) {
  const catalogDb = new Database(":memory:");
  catalogDb.exec(`
    CREATE TABLE relay_catalog_projections (
      tenant_key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      projection TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (tenant_key, namespace, entry_key)
    );
  `);
  const store = new CatalogProjectionStore(catalogDb);
  const profileBody = JSON.stringify(profile);
  store.upsert({
    tenant_key: "relay",
    namespace: "relay:entity:profile",
    entry_key: profile.id,
    projection: { id: profile.id, memoryId: null, bodyJson: profileBody, updatedAtMs: Date.now() },
  });
  return createHostPersistenceClient({
    profiles: {
      upsert: (record) => {
        store.upsert({
          tenant_key: "relay",
          namespace: "relay:entity:profile",
          entry_key: record.id,
          projection: {
            id: record.id,
            memoryId: record.memoryId ?? null,
            bodyJson: record.bodyJson,
            updatedAtMs: Date.now(),
          },
        });
      },
      getById: (id) => {
        const { found, projection } = store.lookupProjection("relay", "relay:entity:profile", id);
        if (!found || projection === null || typeof projection !== "object") return undefined;
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
  test("indexes profile and topic-scoped post; scopeDag finds post by topic", async () => {
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
    const persistence = createMemoriesPersistence(memoriesDb);
    const postResolver = createColonnadePostResolver(cluster);
    const store = createKhoraCanonicalStore({ persistence, postResolver, persistenceClient });
    const client = new MemoriesClient(persistence, khoraOntology, { store });
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

    const globalHits = search(
      { persistence },
      {
        namespace: root,
        content: { text: "developer tools" },
        options: { topK: 5 },
      },
    );
    expect(globalHits.some((h) => h.memory.key === post.id)).toBe(true);

    const topicHits = search(
      { persistence },
      {
        namespace: topicScope(root, profile.id, "design"),
        content: { text: "developer tools" },
        searchScopeMode: "scopeDag",
        options: { topK: 5 },
      },
    );
    expect(topicHits.some((h) => h.memory.key === post.id)).toBe(true);

    const profHits = search(
      { persistence },
      {
        namespace: agentScope(root, profile.id),
        content: { text: "Alice" },
        options: { topK: 5 },
      },
    );
    expect(profHits.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(true);

    await indexer.deletePost(post);
    const afterDelete = search(
      { persistence },
      {
        namespace: postsMemoryNamespace(root, profile.id),
        content: { text: "developer" },
        options: { topK: 5 },
      },
    );
    expect(afterDelete.some((h) => h.memory.key === post.id)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });

  test("indexes subscription with search; label filter finds subscription", async () => {
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
    const persistence = createMemoriesPersistence(memoriesDb);
    const postResolver = createColonnadePostResolver(cluster);
    const store = createKhoraCanonicalStore({ persistence, postResolver, persistenceClient });
    const client = new MemoriesClient(persistence, khoraOntology, { store });
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

    const subscriptionHits = search(
      { persistence },
      {
        namespace: root,
        content: { text: "platform" },
        options: { topK: 5, labels: { some: ["khora_subscription"] } },
      },
    );
    expect(subscriptionHits.some((h) => h.memory.key === subscription.id)).toBe(true);
    expect(
      subscriptionHits.every((h) => h.labels.some((l) => l.kind === "khora_subscription")),
    ).toBe(true);

    const postOnlyHits = search(
      { persistence },
      {
        namespace: root,
        content: { text: "platform" },
        options: { topK: 5, labels: { some: ["khora_post"] } },
      },
    );
    expect(postOnlyHits.some((h) => h.memory.key === subscription.id)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });
});
