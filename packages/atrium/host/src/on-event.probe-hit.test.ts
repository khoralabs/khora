import { Database } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import {
  AGENT_RELAY_EVENT_KIND,
  type AgentRelayEventHandlerCtx,
  type AgentRelayPersistence,
  createAgentRelayPersistenceClient,
} from "@khoralabs/agent-relay";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createTestEncryptionMaterial, TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/sqlite-crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { MemoriesClient } from "@khoralabs/memories-core";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openTestMemoriesDatabase,
} from "@khoralabs/memories-sqlite";
import { RelayCatalogProjectionStore } from "@khoralabs/relay-colonnade";
import { createAtriumCanonicalStore } from "./memories/atrium-canonical-store.ts";
import { atriumOntology } from "./memories/atrium-ontology.ts";
import { createAtriumMemoriesIndexer } from "./memories/indexer.ts";
import { DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT } from "./memories/memories-config.ts";
import { assignPostAddress, createAtriumRelayOnEvent, encodePostId } from "./on-event.ts";
import { createColonnadePostResolver } from "./resolve-post.ts";
import { topicSubscriptionSubject } from "./subject-keys.ts";

ensureCustomSqliteForExtensions();

function createRelayPersistence(profiles: Record<string, AtriumProfile>) {
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

  const agentSubjectSubscriptions = {
    subscribe: () => {},
    unsubscribe: () => {},
    listSubjectsForPrincipal: () => [],
    subscriberPrincipalsForSubject: (subject: string) =>
      subject === topicSubscriptionSubject("platform") ? ["did:sub"] : [],
  };

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
    agentSubjectSubscriptions,
    frameChannelHubPersistence: {} as never,
  });

  const persistence = {
    agentSubjectSubscriptions,
  } as unknown as AgentRelayPersistence;

  return { persistence, persistenceClient };
}

describe("probe-hit inbox reasons", () => {
  test("probe fan-out adds probe-hit when recipient profile matches probe text", async () => {
    const root = DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT;
    const authorProfile: AtriumProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const subProfile: AtriumProfile = {
      id: "prof-sub",
      username: "sub",
      displayName: "Sub",
      bio: "Interested in platform design partners and beta programs.",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
      "did:sub": subProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/atrium-probe-hit-${crypto.randomUUID()}`,
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    });
    const memoriesDb = openTestMemoriesDatabase();
    const memoriesPersistence = createMemoriesPersistence(memoriesDb);
    const postResolver = createColonnadePostResolver(cluster);
    const store = createAtriumCanonicalStore({
      persistence: memoriesPersistence,
      postResolver,
      persistenceClient,
    });
    const client = new MemoriesClient(memoriesPersistence, atriumOntology, { store });
    const indexer = createAtriumMemoriesIndexer({
      client,
      persistence: memoriesPersistence,
      persistenceClient,
      namespaceRoot: root,
    });
    const memories = {
      client,
      store,
      persistence: memoriesPersistence,
      namespaceRoot: root,
      indexer,
      close: () => memoriesDb.close(),
    };

    await indexer.indexProfile(authorProfile);
    await indexer.indexProfile(subProfile);

    const authorPrincipalId = "did:author";
    const { recordKey, cellPoolCount } = assignPostAddress({ cluster, authorPrincipalId });
    const probe: AtriumPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "probe",
      topics: ["platform"],
      title: "Design partners",
      body: "Seeking teams for a platform beta.",
      attributes: { domains: ["platform"], engagementType: "beta" },
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
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

    const onEvent = createAtriumRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories,
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      payload: { post: probe },
    } as never);

    expect(fanOutTargets).toHaveLength(1);
    const reasons = fanOutTargets[0]?.inbox_metadata.reasons ?? [];
    expect(
      reasons.some((r) => r && typeof r === "object" && "kind" in r && r.kind === "topic"),
    ).toBe(true);
    const probeHit = reasons.find(
      (r) => r && typeof r === "object" && "kind" in r && r.kind === "probe-hit",
    ) as { kind: "probe-hit"; probePostId: string; score: number } | undefined;
    expect(probeHit).toBeDefined();
    expect(probeHit?.probePostId).toBe(probe.id);
    expect(typeof probeHit?.score).toBe("number");

    memories.close();
    cluster.close();
  });

  test("regular post fan-out does not add probe-hit", async () => {
    const authorProfile: AtriumProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const { persistence: relayPersistence, persistenceClient } = createRelayPersistence({
      "did:author": authorProfile,
    });
    const encryption = createTestEncryptionMaterial();
    const cluster = createSqliteColonnadeCluster({
      cellsDirectory: `/tmp/atrium-probe-hit-post-${crypto.randomUUID()}`,
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
    const post: AtriumPost = {
      id: encodePostId({ authorPrincipalId, recordKey, cellPoolCount }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["platform"],
      body: "hello",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
    };

    let fanOutTargets: Array<{ inbox_metadata: { reasons: unknown[] } }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        fanOutTargets = op.routing.fan_out_targets ?? [];
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createAtriumRelayOnEvent({
      catalog: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      memories: undefined,
    });

    const ctx = { persistence: relayPersistence, persistenceClient } as AgentRelayEventHandlerCtx;
    await onEvent(ctx, {
      kind: AGENT_RELAY_EVENT_KIND.POST_CREATED,
      payload: { post },
    } as never);

    const reasons = fanOutTargets[0]?.inbox_metadata.reasons ?? [];
    expect(
      reasons.some((r) => r && typeof r === "object" && "kind" in r && r.kind === "probe-hit"),
    ).toBe(false);

    cluster.close();
  });
});
