import { Database } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import {
  createTestEncryptionMaterial,
  TEST_POST_AUTHOR_SIGNATURE,
} from "@khoralabs/colonnade-crypto";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import type { SocialRelationshipPersistence } from "@khoralabs/host-runtime";
import {
  createHostPersistenceClient,
  type HostPersistence,
  type HostRuntimeEventHandlerCtx,
} from "@khoralabs/host-runtime";
import {
  authorSubscriptionSearch,
  KHORA_EVENT_KIND,
  type KhoraPost,
  type KhoraProfile,
} from "@khoralabs/khora-contracts";
import { createInMemoryPercolatorPersistence, createPercolator } from "@khoralabs/percolator";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories/memories-config";
import { assignPostAddress, createKhoraRelayOnEvent, encodePostId } from "./on-event";
import { toPercolatorSearch } from "./percolator/adapter";

function createRelayPersistence(profiles: Record<string, KhoraProfile>) {
  const catalogDb = new Database(":memory:");
  catalogDb.run(`
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
  for (const profile of Object.values(profiles)) {
    upsert("relay", "relay:entity:profile", profile.id, {
      id: profile.id,
      memoryId: null,
      bodyJson: JSON.stringify(profile),
      updatedAtMs: Date.now(),
    });
  }

  const principalForProfile = Object.fromEntries(
    Object.entries(profiles).map(([principalId, profile]) => [profile.id, principalId]),
  );

  const persistence: HostPersistence = {
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
          bodyJson: typeof o.bodyJson === "string" ? o.bodyJson : "{}",
          updatedAtMs: typeof o.updatedAtMs === "number" ? o.updatedAtMs : 0,
        };
      },
      deleteById: () => {},
    },
    registrations: {
      upsert: () => {},
      delete: () => {},
      exists: () => true,
      profileIdForPrincipal: (principalId) => profiles[principalId]?.id,
      principalForProfileId: (profileId) => principalForProfile[profileId],
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
  };
  const persistenceClient = createHostPersistenceClient(persistence);

  return { persistence, persistenceClient };
}

function createSocialMock(
  relationships: Record<
    string,
    Array<{ peerPrincipalId: string | null; creatorPrincipalId: string }>
  >,
): SocialRelationshipPersistence {
  return {
    listRelationshipsForPrincipal: (principalId) =>
      (relationships[principalId] ?? []).map((row) => ({
        peerPrincipalId: row.peerPrincipalId,
        creatorPrincipalId: row.creatorPrincipalId,
        channelId: "ch-test",
      })),
  } as SocialRelationshipPersistence;
}

function createMemoriesStub() {
  return {
    namespaceRoot: DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT,
    embeddingModel: undefined,
    indexer: {
      indexPost: async () => {},
      indexProfile: async () => {},
      deletePost: async () => {},
    },
    close: () => {},
  } as unknown as import("./memories/bootstrap.ts").KhoraMemoriesHost;
}

describe("percolator inbox subscriptionMatches", () => {
  test("tagged post fan-out adds subscription match for matching subscription", async () => {
    const _root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const subProfile: KhoraProfile = {
      id: "prof-sub",
      username: "sub",
      displayName: "Sub",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
      "did:sub": subProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-percolator-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memories = createMemoriesStub();
    const percolator = {
      percolator: createPercolator({ persistence: createInMemoryPercolatorPersistence() }),
    };
    percolator.percolator.registerQuery({
      id: "sub-query-1",
      ownerId: "did:sub",
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:platform"] } },
      },
    });

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const post: KhoraPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["platform"],
      body: "hello platform",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };

    let fanOutTargets: Array<{
      recipient_principal_id: string;
      inbox_metadata: { subscriptionMatches: { subscriptionId: string; score: number }[] };
    }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories,
      percolator,
      social: createSocialMock({}),
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:sub");
    expect(fanOutTargets[0]?.inbox_metadata.subscriptionMatches).toEqual([
      { subscriptionId: "sub-query-1", score: expect.any(Number) },
    ]);

    cluster.close();
  });

  test("public subscription fan-out adds subscription match for matching topic query", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const subProfile: KhoraProfile = {
      id: "prof-sub",
      username: "sub",
      displayName: "Sub",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
      "did:sub": subProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-percolator-sub-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memories = createMemoriesStub();
    const percolator = {
      percolator: createPercolator({ persistence: createInMemoryPercolatorPersistence() }),
    };
    percolator.percolator.registerQuery({
      id: "sub-query-topic",
      ownerId: "did:sub",
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:climate-tech"] } },
      },
    });

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const post: KhoraPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "subscription",
      topics: ["climate-tech"],
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:climate-tech"] } },
      },
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };

    let fanOutTargets: Array<{ recipient_principal_id: string }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories,
      percolator,
      social: createSocialMock({}),
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:sub");

    cluster.close();
  });

  test("author-follow standing query matches subscription in author posts namespace", async () => {
    const root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const subProfile: KhoraProfile = {
      id: "prof-sub",
      username: "sub",
      displayName: "Sub",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
      "did:sub": subProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-percolator-author-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memories = createMemoriesStub();
    const percolator = {
      percolator: createPercolator({ persistence: createInMemoryPercolatorPersistence() }),
    };
    percolator.percolator.registerQuery({
      id: "sub-query-author",
      ownerId: "did:sub",
      search: toPercolatorSearch(authorSubscriptionSearch(authorProfile.id, root)),
    });

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const post: KhoraPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "subscription",
      search: authorSubscriptionSearch(authorProfile.id, root),
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };

    let fanOutTargets: Array<{ recipient_principal_id: string }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories,
      percolator,
      social: createSocialMock({}),
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:sub");

    cluster.close();
  });

  test("private post with matching query does not fan out to non-author", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const subProfile: KhoraProfile = {
      id: "prof-sub",
      username: "sub",
      displayName: "Sub",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
      "did:sub": subProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-percolator-private-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memories = createMemoriesStub();
    const percolator = {
      percolator: createPercolator({ persistence: createInMemoryPercolatorPersistence() }),
    };
    percolator.percolator.registerQuery({
      id: "sub-query-private",
      ownerId: "did:sub",
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:secret"] } },
      },
    });

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const post: KhoraPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["secret"],
      body: "private note",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "private" as const,
    };

    let fanOutTargets: Array<{ recipient_principal_id: string }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories,
      percolator,
      social: createSocialMock({}),
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(0);

    cluster.close();
  });

  test("network post fans out only to connected peer with matching query", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const peerProfile: KhoraProfile = {
      id: "prof-peer",
      username: "peer",
      displayName: "Peer",
    };
    const strangerProfile: KhoraProfile = {
      id: "prof-stranger",
      username: "stranger",
      displayName: "Stranger",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
      "did:peer": peerProfile,
      "did:stranger": strangerProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-percolator-network-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memories = createMemoriesStub();
    const percolator = {
      percolator: createPercolator({ persistence: createInMemoryPercolatorPersistence() }),
    };
    percolator.percolator.registerQuery({
      id: "sub-query-peer",
      ownerId: "did:peer",
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:network"] } },
      },
    });
    percolator.percolator.registerQuery({
      id: "sub-query-stranger",
      ownerId: "did:stranger",
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:network"] } },
      },
    });

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const post: KhoraPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["network"],
      body: "network only",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "network" as const,
    };

    let fanOutTargets: Array<{ recipient_principal_id: string }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories,
      percolator,
      social: createSocialMock({
        "did:author": [{ peerPrincipalId: "did:peer", creatorPrincipalId: "did:author" }],
      }),
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:peer");

    cluster.close();
  });

  test("post without matching subscription does not fan out subscriptionMatches", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/khora-percolator-post-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const post: KhoraPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["platform"],
      body: "hello",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public" as const,
    };

    let fanOutTargets: Array<{ inbox_metadata: { subscriptionMatches: unknown[] } }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const percolator = {
      percolator: createPercolator({ persistence: createInMemoryPercolatorPersistence() }),
    };

    const onEvent = createKhoraRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories: undefined,
      percolator,
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(0);

    cluster.close();
  });
});
