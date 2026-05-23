import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createAgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { ids, MemoriesClient } from "@khoralabs/memories-core";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import { RelayCatalogProjectionStore } from "@khoralabs/relay-colonnade";
import { encodePostId } from "../post-address-id.ts";
import { createColonnadePostResolver } from "../resolve-post.ts";
import { createAtriumCanonicalStore, hydrateMemoryLabels } from "./atrium-canonical-store.ts";
import {
  PROFILE_MEMORY_KEY,
  postsMemoryNamespace,
  profileMemoryNamespace,
} from "./atrium-namespace.ts";
import { atriumOntology } from "./atrium-ontology.ts";
import { createAtriumMemoriesIndexer } from "./indexer.ts";
import { DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT } from "./memories-config.ts";

ensureCustomSqliteForExtensions();

function setup(profile: AtriumProfile, post: AtriumPost) {
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
  const projectionStore = new RelayCatalogProjectionStore(catalogDb);
  const profileBody = JSON.stringify(profile);
  projectionStore.upsert({
    tenant_key: "relay",
    namespace: "relay:entity:profile",
    entry_key: profile.id,
    projection: { id: profile.id, memoryId: null, bodyJson: profileBody, updatedAtMs: Date.now() },
  });
  const persistenceClient = createAgentRelayPersistenceClient({
    profiles: {
      upsert: (record) => {
        projectionStore.upsert({
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
        const { found, projection } = projectionStore.lookupProjection(
          "relay",
          "relay:entity:profile",
          id,
        );
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
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: `/tmp/atrium-canonical-${crypto.randomUUID()}`,
    mode: { kind: "pool", cellCount: 2 },
    useCellWorkers: false,
  });
  const memoriesDb = openMemoriesDatabase(":memory:");
  const persistence = createMemoriesPersistence(memoriesDb);
  const postResolver = createColonnadePostResolver(cluster);
  const store = createAtriumCanonicalStore({ persistence, postResolver, persistenceClient });
  const client = new MemoriesClient(persistence, atriumOntology, { store });
  const indexer = createAtriumMemoriesIndexer({
    client,
    persistence,
    persistenceClient,
    namespaceRoot: DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT,
  });
  return { cluster, store, indexer, persistence, memoriesDb, post, profile };
}

describe("AtriumCanonicalStore", () => {
  test("resolves profile and post from indexed memories", async () => {
    const profile: AtriumProfile = {
      id: "prof-canonical-1",
      username: "bob",
      bio: "builder",
    };
    const recordKey = "ob_canonical123456789012345678901";
    const post: AtriumPost = {
      id: encodePostId({
        authorPrincipalId: "did:test:author",
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "post",
      body: "hello world post",
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
      metadata: {},
    });
    await indexer.indexPost(post);

    const postMemoryId = ids.memory(
      postsMemoryNamespace(DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT, profile.id),
      post.id,
    );
    const postNk = persistence.loadMemoryNamespaceKey(postMemoryId);
    expect(postNk).toBeDefined();
    const postLabels = persistence.loadNodeLabelsForMemory(postNk?.namespace, postNk?.key);
    const postHydrated = await hydrateMemoryLabels(store, postLabels, postMemoryId);
    expect(postHydrated?.kind).toBe("post");
    if (postHydrated?.kind === "post") {
      expect(postHydrated.entity.body).toBe("hello world post");
    }

    const profileMemoryId = ids.memory(
      profileMemoryNamespace(DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT, profile.id),
      PROFILE_MEMORY_KEY,
    );
    const profileLabels = persistence.loadNodeLabelsForMemory(
      profileMemoryNamespace(DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT, profile.id),
      PROFILE_MEMORY_KEY,
    );
    const profileHydrated = await hydrateMemoryLabels(store, profileLabels, profileMemoryId);
    expect(profileHydrated?.kind).toBe("profile");

    memoriesDb.close();
    cluster.close();
  });

  test("hydrates probe from indexed memories", async () => {
    const profile: AtriumProfile = {
      id: "prof-canonical-probe",
      username: "carol",
    };
    const recordKey = "ob_probecanonical123456789012345";
    const probe: AtriumPost = {
      id: encodePostId({
        authorPrincipalId: "did:test:author",
        recordKey,
        cellPoolCount: 2,
      }),
      authorProfileId: profile.id,
      kind: "probe",
      title: "Fintech pilots",
      body: "Looking for design partners in payments.",
      attributes: { domains: ["fintech"], engagementType: "pilots" },
    };
    const { cluster, store, indexer, persistence, memoriesDb } = setup(profile, probe);

    await indexer.indexProfile(profile);
    const authorCellId = cluster.assignPrincipalToCell("did:test:author");
    await cluster.resolveCell(authorCellId).appendOutboxRecord({
      cell_id: authorCellId,
      tenant_key: "relay",
      principal_id: "did:test:author",
      record_key: recordKey,
      payload_bytes: new TextEncoder().encode(JSON.stringify(probe)),
      metadata: {},
    });
    await indexer.indexPost(probe);

    const probeMemoryId = ids.memory(
      postsMemoryNamespace(DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT, profile.id),
      probe.id,
    );
    const probeNk = persistence.loadMemoryNamespaceKey(probeMemoryId);
    expect(probeNk).toBeDefined();
    const probeLabels = persistence.loadNodeLabelsForMemory(probeNk?.namespace, probeNk?.key);
    const probeHydrated = await hydrateMemoryLabels(store, probeLabels, probeMemoryId);
    expect(probeHydrated?.kind).toBe("probe");
    if (probeHydrated?.kind === "probe") {
      expect(probeHydrated.entity.attributes?.domains).toEqual(["fintech"]);
    }

    memoriesDb.close();
    cluster.close();
  });
});
