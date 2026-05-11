import type { Database } from "bun:sqlite";
import type { AtriumDidAuth } from "@cfd/atrium-auth";
import {
  type AtriumPost,
  type AtriumProfile,
  normalizeTopicSlug,
  parseAtriumRegistrationMetadata,
  zAtriumPost,
  zAtriumProfile,
} from "@cfd/atrium-contracts";
import { ids, MemoriesClient, stableId } from "@cfd/memories-core";
import { type EmbeddingModel, embedTextChunks } from "@cfd/memories-core/helpers";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import {
  type AgentNotificationBufferPort,
  composeOnEventWithMemorySync,
  createInboxWsHub,
  minimalSourceMapForResolve,
  SWARM_EVENT_KIND,
  SwarmHost,
  swarmHostOntology,
} from "@cfd/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import { atriumSwarmMemoryOpMapper } from "./atrium-memory-sync.ts";
import { fanOutProbeHits, fanOutTopicSubscriptions } from "./atrium-post-fanout.ts";
import {
  createProbeSubscribersRepo,
  createSqliteAgentNotificationBuffer,
  createSwarmHostDocumentStore,
  createSwarmHostSqlitePersistence,
  ensureSwarmHostSqliteSchema,
  type ProbeSubscribersRepo,
} from "./persistence/sqlite/index.ts";

type TNode = typeof swarmHostOntology.nodeLabels;
type TEdge = typeof swarmHostOntology.edgeLabels;

type EntityMap = { profile: AtriumProfile; post: AtriumPost };

export type AtriumHostConfig = {
  dbPath: string;
  profileNamespace: string;
  postNamespace: string;
  probeNamespace: string;
  topicNamespace?: string;
  embeddingModel?: EmbeddingModel;
  /**
   * DID authentication lifecycle. Pass a factory if the auth implementation needs the opened
   * SQLite database (e.g. the default {@link createAtriumDidAuth} uses it for its nonce store).
   */
  auth: AtriumDidAuth | ((db: Database) => AtriumDidAuth);
};

export type AtriumHostContext = {
  config: AtriumHostConfig;
  host: SwarmHost<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never, EntityMap>;
  db: Database;
  notificationBuffer: AgentNotificationBufferPort;
  auth: AtriumDidAuth;
};

export function createAtriumHostContext(config: AtriumHostConfig): AtriumHostContext {
  const db = openMemoriesDatabase(config.dbPath);
  ensureSwarmHostSqliteSchema(db);
  const hostPersistence = createSwarmHostSqlitePersistence(db);
  const persistence = createMemoriesPersistence(db);
  const documentStore = createSwarmHostDocumentStore<EntityMap>(db, {
    parsers: {
      profile: (raw) => zAtriumProfile.parse(raw),
      post: (raw) => zAtriumPost.parse(raw),
    },
  });

  const memories = new MemoriesClient(persistence, swarmHostOntology, {
    storeForNamespace: () => documentStore,
  });

  const notificationBuffer = createSqliteAgentNotificationBuffer(db);
  const inboxHub = createInboxWsHub();
  const probeSubscribers = createProbeSubscribersRepo(db);

  const appContext: AtriumHostAppContext = {
    db,
    profileNamespace: config.profileNamespace,
    postNamespace: config.postNamespace,
    probeNamespace: config.probeNamespace,
    ...(config.topicNamespace !== undefined ? { topicNamespace: config.topicNamespace } : {}),
    embeddingModel: config.embeddingModel,
  };

  const mapMemoryOps = atriumSwarmMemoryOpMapper(appContext);

  const auth = typeof config.auth === "function" ? config.auth(db) : config.auth;
  const host = new SwarmHost({
    memories,
    persistence: hostPersistence,
    didVerifier: auth.verifier,
    notificationBuffer,
    inboxHub,
    appContext,
    memoryNamespaces: {
      profileNamespace: config.profileNamespace,
      postNamespace: config.postNamespace,
      ...(config.topicNamespace !== undefined ? { topicNamespace: config.topicNamespace } : {}),
      probeNamespace: config.probeNamespace,
    },
    embeddingModel: config.embeddingModel,
    stores: {
      profile: {
        async resolve(ref) {
          const r = await documentStore.resolve(minimalSourceMapForResolve(ref));
          if (r.kind === "record" && r.domain === "profile") {
            return r.value;
          }
          return undefined;
        },
      },
      post: {
        async resolve(ref) {
          const r = await documentStore.resolve(minimalSourceMapForResolve(ref));
          if (r.kind === "record" && r.domain === "post") {
            return r.value;
          }
          return undefined;
        },
      },
    },

    onEvent: composeOnEventWithMemorySync(memories, mapMemoryOps, async (ctx, event) => {
      const ac = ctx.appContext as AtriumHostAppContext;

      if (event.kind === SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
        try {
          const req = event.payload.request;
          const meta = parseAtriumRegistrationMetadata(req.metadata);
          const profile = zAtriumProfile.parse({
            id: stableId("atrium_profile", req.did),
            ...meta,
          });
          event.payload.fulfill(profile);
        } catch (e) {
          event.payload.reject(e);
        }
        return;
      }

      if (
        event.kind === SWARM_EVENT_KIND.PROFILE_CREATED ||
        event.kind === SWARM_EVENT_KIND.PROFILE_UPDATED
      ) {
        const profile = event.payload.profile;
        ctx.persistenceClient.upsertProfile({
          id: profile.id,
          memoryId: ids.memory(ac.profileNamespace, profile.id),
          bodyJson: JSON.stringify(profile),
        });
        return;
      }

      if (
        event.kind === SWARM_EVENT_KIND.POST_CREATED ||
        event.kind === SWARM_EVENT_KIND.POST_UPDATED
      ) {
        const post = event.payload.post;
        ctx.persistenceClient.upsertPost({
          id: post.id,
          memoryId: ids.memory(
            post.kind === "probe" ? ac.probeNamespace : ac.postNamespace,
            post.id,
          ),
          bodyJson: JSON.stringify(post),
        });

        if (post.kind === "probe") {
          await syncProbeSubscriber(probeSubscribers, ac, post);
        }

        if (event.kind === SWARM_EVENT_KIND.POST_CREATED) {
          await fanOutTopicSubscriptions({ ctx, post });
          await fanOutProbeHits({
            ctx,
            probeSubscribers,
            embeddingModel: ac.embeddingModel,
            incomingPost: post,
          });
        }
        return;
      }

      if (event.kind === SWARM_EVENT_KIND.POST_DELETED) {
        const post = event.payload.post;
        if (post.kind === "probe") {
          probeSubscribers.delete(post.id);
        }
        ctx.persistence.posts.deleteById(post.id);
      }
    }),
  });

  return { config, host, db, notificationBuffer, auth };
}

function probeLexicalText(p: AtriumPost): string {
  const parts = [p.title, p.body].filter((s) => s !== undefined && s.length > 0);
  return parts.join("\n\n");
}

function normalizedTopicSlugs(topics: readonly string[] | undefined): string[] | null {
  if (topics === undefined || topics.length === 0) return null;
  const out: string[] = [];
  for (const raw of topics) {
    try {
      out.push(normalizeTopicSlug(raw));
    } catch {
      /* skip invalid slugs */
    }
  }
  return out.length === 0 ? null : out;
}

async function syncProbeSubscriber(
  repo: ProbeSubscribersRepo,
  ac: AtriumHostAppContext,
  post: AtriumPost,
): Promise<void> {
  if (post.kind !== "probe") return;
  if (post.authorProfileId === undefined || post.authorProfileId.length === 0) return;

  let embeddingF32: Float32Array | null = null;
  const text = probeLexicalText(post).trim();
  if (ac.embeddingModel !== undefined && text.length > 0) {
    const [vec] = await embedTextChunks(ac.embeddingModel, [text]);
    if (vec !== undefined && vec.length > 0) {
      embeddingF32 = Float32Array.from(vec);
    }
  }

  repo.upsert({
    probePostId: post.id,
    ownerProfileId: post.authorProfileId,
    embeddingF32,
    minHitScore: post.minHitScore ?? null,
    topicSlugs: normalizedTopicSlugs(post.topics),
    matchPostKinds: post.matchPostKinds ?? null,
    expiresAtMs: post.expiresAtMs ?? null,
  });
}
