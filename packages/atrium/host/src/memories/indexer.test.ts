import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createAgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { MemoriesClient, search } from "@khoralabs/memories-core";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import { RelayCatalogProjectionStore } from "@khoralabs/relay-colonnade";
import { encodePostId } from "../post-address-id.ts";
import { createAtriumCanonicalStore } from "./atrium-canonical-store.ts";
import {
  agentScope,
  PROFILE_MEMORY_KEY,
  postsMemoryNamespace,
  profileMemoryNamespace,
  topicScope,
} from "./atrium-namespace.ts";
import { atriumOntology } from "./atrium-ontology.ts";
import { createAtriumMemoriesIndexer } from "./indexer.ts";
import { DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT } from "./memories-config.ts";

ensureCustomSqliteForExtensions();

function createTestRelayPersistence(profile: AtriumProfile) {
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
  const store = new RelayCatalogProjectionStore(catalogDb);
  const profileBody = JSON.stringify(profile);
  store.upsert({
    tenant_key: "relay",
    namespace: "relay:entity:profile",
    entry_key: profile.id,
    projection: { id: profile.id, memoryId: null, bodyJson: profileBody, updatedAtMs: Date.now() },
  });
  return createAgentRelayPersistenceClient({
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
    topics: { upsert: () => {}, getById: () => undefined, deleteById: () => {} },
    agentRegistrations: {
      upsert: () => {},
      exists: () => true,
      profileIdForPrincipal: () => profile.id,
      principalForProfileId: () => "did:test:author",
    },
    agentSubjectSubscriptions: {
      subscribe: () => {},
      unsubscribe: () => {},
      listSubjectsForPrincipal: () => [],
      subscriberPrincipalsForSubject: () => [],
    },
    frameChannelHubPersistence: {} as never,
  });
}

describe("atrium memories indexer", () => {
  test("indexes profile and topic-scoped post; scopeDag finds post by topic", async () => {
    const root = DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT;
    const profile: AtriumProfile = {
      id: "prof-index-1",
      username: "alice",
      displayName: "Alice",
      bio: "climate investor",
    };
    const persistenceClient = createTestRelayPersistence(profile);
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/atrium-mem-test-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
    });
    const memoriesDb = openMemoriesDatabase(":memory:");
    const persistence = createMemoriesPersistence(memoriesDb);
    const store = createAtriumCanonicalStore({ persistence, cluster, persistenceClient });
    const client = new MemoriesClient(persistence, atriumOntology, { store });
    const indexer = createAtriumMemoriesIndexer({
      client,
      persistence,
      persistenceClient,
      namespaceRoot: root,
    });

    await indexer.indexProfile(profile);

    const authorPrincipalId = "did:test:author";
    const recordKey = "ob_test123456789012345678901234";
    const post: AtriumPost = {
      id: encodePostId({
        authorPrincipalId,
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "post",
      topics: ["climate"],
      title: "Series A climate fund",
      body: "Looking for founders in carbon removal.",
    };

    const authorCellId = cluster.assignPrincipalToCell(authorPrincipalId);
    const cell = cluster.resolveCell(authorCellId);
    await cell.appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: authorPrincipalId,
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
      metadata: {},
    });

    await indexer.indexPost(post);

    const globalHits = search(
      { persistence },
      {
        namespace: root,
        content: { text: "carbon removal" },
        options: { topK: 5 },
      },
    );
    expect(globalHits.some((h) => h.memory.key === post.id)).toBe(true);

    const topicHits = search(
      { persistence },
      {
        namespace: topicScope(root, profile.id, "climate"),
        content: { text: "carbon removal" },
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
        content: { text: "carbon" },
        options: { topK: 5 },
      },
    );
    expect(afterDelete.some((h) => h.memory.key === post.id)).toBe(false);

    memoriesDb.close();
    cluster.close();
  });
});
