import type { Database } from "bun:sqlite";
import {
  type AtriumPost,
  type AtriumProfile,
  parseAtriumRegistrationMetadata,
  zAtriumPost,
  zAtriumProfile,
} from "@cfd/atrium-contracts";
import { ids, MemoriesClient, stableId } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
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
  createSqliteAgentNotificationBuffer,
  createSwarmHostDocumentStore,
  createSwarmHostSqlitePersistence,
  ensureSwarmHostSqliteSchema,
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
};

export type AtriumHostContext = {
  config: AtriumHostConfig;
  host: SwarmHost<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never, EntityMap>;
  db: Database;
  notificationBuffer: AgentNotificationBufferPort;
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

  const appContext: AtriumHostAppContext = {
    db,
    profileNamespace: config.profileNamespace,
    postNamespace: config.postNamespace,
    probeNamespace: config.probeNamespace,
    ...(config.topicNamespace !== undefined ? { topicNamespace: config.topicNamespace } : {}),
    embeddingModel: config.embeddingModel,
  };

  const mapMemoryOps = atriumSwarmMemoryOpMapper(appContext);

  const host = new SwarmHost({
    memories,
    persistence: hostPersistence,
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

      if (event.kind === SWARM_EVENT_KIND.PROFILE_CREATED) {
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

        if (event.kind === SWARM_EVENT_KIND.POST_CREATED) {
          await fanOutTopicSubscriptions({ ctx, post });
          await fanOutProbeHits({
            ctx,
            config: {
              probeNamespace: ac.probeNamespace,
              embeddingModel: ac.embeddingModel,
            },
            incomingPost: post,
          });
        }
        return;
      }

      if (event.kind === SWARM_EVENT_KIND.POST_DELETED) {
        ctx.persistence.posts.deleteById(event.payload.post.id);
      }
    }),
  });

  return { config, host, db, notificationBuffer };
}
