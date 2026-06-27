import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  createTestEncryptionMaterial,
  TEST_POST_AUTHOR_SIGNATURE,
} from "@khoralabs/colonnade-crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { createHostPersistenceClient } from "@khoralabs/host-runtime";
import type { KhoraPost, KhoraProfile } from "@khoralabs/khora-contracts";
import { ids, MemoriesClient } from "@khoralabs/memories-core";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import { encodePostId } from "../post-address-id";
import { createColonnadePostResolver } from "../resolve-post";
import { createKhoraMemoriesIndexer } from "./indexer";
import { createKhoraCanonicalStore, hydrateMemoryLabels } from "./khora-canonical-store";
import {
  PROFILE_MEMORY_KEY,
  postsMemoryNamespace,
  profileMemoryNamespace,
} from "./khora-namespace";
import { khoraOntology } from "./khora-ontology";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories-config";

ensureCustomSqliteForExtensions();

function setup(profile: KhoraProfile, post: KhoraPost) {
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
  const upsertStmt = catalogDb.prepare(
    `INSERT OR REPLACE INTO relay_catalog_projections (tenant_key, namespace, entry_key, projection, updated_at_ms) VALUES (?, ?, ?, ?, ?)`,
  );
  const lookupStmt = catalogDb.prepare(
    `SELECT projection FROM relay_catalog_projections WHERE tenant_key = ? AND namespace = ? AND entry_key = ?`,
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
  const encryption = createTestEncryptionMaterial();
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: `/tmp/khora-canonical-${crypto.randomUUID()}`,
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
    namespaceRoot: DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT,
  });
  return { cluster, store, indexer, persistence, memoriesDb, post, profile };
}

describe("KhoraCanonicalStore", () => {
  test("resolves profile and post from indexed memories", async () => {
    const profile: KhoraProfile = {
      id: "prof-canonical-1",
      username: "bob",
      bio: "builder",
    };
    const recordKey = "ob_canonical123456789012345678901";
    const post: KhoraPost = {
      id: encodePostId({
        authorPrincipalId: "did:test:author",
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "post",
      body: "hello world post",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };
    const { cluster, store, indexer, persistence, memoriesDb } = setup(profile, post);

    await indexer.indexProfile(profile);
    const authorCellId = cluster.assignPrincipalToCell("did:test:author");
    await cluster.resolveCell(authorCellId).appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: "did:test:author",
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
      metadata: { postId: post.id, postKind: post.kind },
    });
    await indexer.indexPost(post);

    const postMemoryId = ids.memory(
      postsMemoryNamespace(DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT, profile.id),
      post.id,
    );
    const postNk = persistence.loadMemoryNamespaceKey(postMemoryId);
    expect(postNk).toBeDefined();
    const postLabels = persistence.loadNodeLabelsForMemory(
      postNk?.namespace ?? "",
      postNk?.key ?? "",
    );
    const postHydrated = await hydrateMemoryLabels(store, postLabels, postMemoryId);
    expect(postHydrated?.kind).toBe("post");
    if (postHydrated?.kind === "post") {
      expect(postHydrated.entity.body).toBe("hello world post");
    }

    const profileMemoryId = ids.memory(
      profileMemoryNamespace(DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT, profile.id),
      PROFILE_MEMORY_KEY,
    );
    const profileLabels = persistence.loadNodeLabelsForMemory(
      profileMemoryNamespace(DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT, profile.id),
      PROFILE_MEMORY_KEY,
    );
    const profileHydrated = await hydrateMemoryLabels(store, profileLabels, profileMemoryId);
    expect(profileHydrated?.kind).toBe("profile");

    memoriesDb.close();
    cluster.close();
  });

  test("hydrates subscription from indexed memories", async () => {
    const profile: KhoraProfile = {
      id: "prof-canonical-sub",
      username: "carol",
    };
    const recordKey = "ob_subcanonical123456789012345";
    const subscription: KhoraPost = {
      id: encodePostId({
        authorPrincipalId: "did:test:author",
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "subscription",
      body: "Looking for design partners in payments.",
      search: { content: { text: "fintech payments" } },
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };
    const { cluster, store, indexer, persistence, memoriesDb } = setup(profile, subscription);

    await indexer.indexProfile(profile);
    const authorCellId = cluster.assignPrincipalToCell("did:test:author");
    await cluster.resolveCell(authorCellId).appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: "did:test:author",
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(subscription)),
      metadata: { postId: subscription.id, postKind: subscription.kind },
    });
    await indexer.indexPost(subscription);

    const subMemoryId = ids.memory(
      postsMemoryNamespace(DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT, profile.id),
      subscription.id,
    );
    const subNk = persistence.loadMemoryNamespaceKey(subMemoryId);
    expect(subNk).toBeDefined();
    const subLabels = persistence.loadNodeLabelsForMemory(subNk?.namespace ?? "", subNk?.key ?? "");
    const subHydrated = await hydrateMemoryLabels(store, subLabels, subMemoryId);
    expect(subHydrated?.kind).toBe("subscription");
    if (subHydrated?.kind === "subscription") {
      expect(subHydrated.entity.search?.content.text).toBe("fintech payments");
    }

    memoriesDb.close();
    cluster.close();
  });
});
