import { Database } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import {
  AGENT_RELAY_EVENT_KIND,
  type AgentRelayEventHandlerCtx,
  type AgentRelayPersistence,
  createAgentRelayPersistenceClient,
} from "@khoralabs/agent-relay";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import type { KhoraPost, KhoraProfile } from "@khoralabs/khora-contracts";
import { authorSubscriptionSearch } from "@khoralabs/khora-contracts";
import { createInMemoryPercolatorPersistence, createPercolator } from "@khoralabs/percolator";
import type { SocialRelationshipPersistence } from "@khoralabs/relay-colonnade";
import { RelayCatalogProjectionStore } from "@khoralabs/relay-colonnade";
import { createTestEncryptionMaterial, TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/sqlite-crypto";
import { DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT } from "./memories/memories-config.ts";
import { assignPostAddress, createKhoraRelayOnEvent, encodePostId } from "./on-event.ts";
import { toPercolatorSearch } from "./percolator/adapter.ts";

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
  const store = new RelayCatalogProjectionStore(catalogDb);
  for (const profile of Object.values(profiles)) {
    store.upsert({
      tenant_key: "relay",
      namespace: "relay:entity:profile",
      entry_key: profile.id,
      projection: {
        id: profile.id,
        memoryId: null,
        bodyJson: JSON.stringify(profile),
        updatedAtMs: Date.now(),
      },
    });
  }

  const principalForProfile = Object.fromEntries(
    Object.entries(profiles).map(([principalId, profile]) => [profile.id, principalId]),
  );

  const persistenceClient = createAgentRelayPersistenceClient({
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
          bodyJson: typeof o.bodyJson === "string" ? o.bodyJson : "{}",
          updatedAtMs: typeof o.updatedAtMs === "number" ? o.updatedAtMs : 0,
        };
      },
      deleteById: () => {},
    },
    topics: { upsert: () => {}, getById: () => undefined, deleteById: () => {} },
    agentRegistrations: {
      upsert: () => {},
      exists: () => true,
      profileIdForPrincipal: (principalId) => profiles[principalId]?.id,
      principalForProfileId: (profileId) => principalForProfile[profileId],
    },
    frameChannelHubPersistence: {} as never,
  });

  const persistence = {} as unknown as AgentRelayPersistence;

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
    namespaceRoot: DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT,
    embeddingModel: undefined,
    indexer: {
      indexPost: async () => {},
      indexProfile: async () => {},
      deletePost: async () => {},
    },
    close: () => {},
  } as unknown as import("./memories/bootstrap.ts").KhoraMemoriesHost;
}

describe("percolator inbox reasons", () => {
  test("tagged post fan-out adds standing_query for matching subscription", async () => {
    const _root = DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT;
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
      inbox_metadata: { reasons: unknown[] };
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

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:sub");
    const standingQuery = (fanOutTargets[0]?.inbox_metadata.reasons ?? []).find(
      (r) => r && typeof r === "object" && "kind" in r && r.kind === "standing_query",
    ) as { kind: "standing_query"; queryPostId: string; score: number } | undefined;
    expect(standingQuery).toBeDefined();
    expect(standingQuery?.queryPostId).toBe("sub-query-1");

    cluster.close();
  });

  test("public subscription fan-out adds standing_query for matching topic query", async () => {
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
      title: "Follow climate-tech",
      body: "Notify me",
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

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:sub");

    cluster.close();
  });

  test("author-follow standing query matches subscription in author posts namespace", async () => {
    const root = DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT;
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
      title: "Author updates",
      body: "All posts",
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

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
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

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
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

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    expect(fanOutTargets[0]?.recipient_principal_id).toBe("did:peer");

    cluster.close();
  });

  test("post without matching subscription does not fan out standing_query", async () => {
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

    let fanOutTargets: Array<{ inbox_metadata: { reasons: unknown[] } }> = [];
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

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    expect(fanOutTargets).toHaveLength(0);

    cluster.close();
  });
});
