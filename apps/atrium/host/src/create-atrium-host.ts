import type { Database } from "bun:sqlite";
import type { AtriumDidAuth } from "@khoralabs/atrium-auth";
import {
  type AtriumPost,
  type AtriumProfile,
  normalizeTopicSlug,
  parseAtriumRegistrationMetadata,
  zAtriumPost,
  zAtriumProfile,
} from "@khoralabs/atrium-contracts";
import { ids, MemoriesClient, stableId } from "@khoralabs/memories-core";
import { type EmbeddingModel, embedTextChunks } from "@khoralabs/memories-core/helpers";
import { createMemoriesPersistence, openMemoriesDatabase } from "@khoralabs/memories-sqlite";
import {
  type AgentNotificationBufferPort,
  composeOnEventWithMemorySync,
  createFrameChannelHub,
  createInboxWsHub,
  type FrameChannelHubPort,
  minimalSourceMapForResolve,
  SWARM_EVENT_KIND,
  SwarmHost,
} from "@khoralabs/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import { atriumMemoriesOntology } from "./atrium-memories-ontology.ts";
import { maybeAtriumMemoryAutolinkAfterSync } from "./atrium-memory-autolink.ts";
import { atriumSwarmMemoryOpMapper } from "./atrium-memory-sync.ts";
import { fanOutPostMatches } from "./atrium-post-fanout.ts";
import {
  ensureAtriumScopeLinksForPost,
  ensureAtriumScopeLinksForProfile,
} from "./atrium-scope-links.ts";
import {
  createProbeSubscribersRepo,
  createSqliteAgentNotificationBuffer,
  createSwarmHostDocumentStore,
  createSwarmHostSqlitePersistence,
  migrateAtriumHostDb,
  type ProbeSubscribersRepo,
  type SqliteMaintenanceHandle,
  type SqliteMaintenanceOptions,
  startSqliteMaintenance,
} from "./persistence/sqlite/index.ts";
import {
  type AtriumUsernamesRepo,
  createAtriumUsernamesRepo,
} from "./usernames/atrium-usernames.ts";

type TNode = typeof atriumMemoriesOntology.nodeLabels;
type TEdge = typeof atriumMemoriesOntology.edgeLabels;

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
  /** Periodic SQLite maintenance (WAL truncation + ANALYZE). Set `false` to disable entirely. */
  sqliteMaintenance?: SqliteMaintenanceOptions | false;
};

export type AtriumHostContext = {
  config: AtriumHostConfig;
  host: SwarmHost<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never, EntityMap>;
  db: Database;
  notificationBuffer: AgentNotificationBufferPort;
  auth: AtriumDidAuth;
  usernamesRepo: AtriumUsernamesRepo;
  /** Atrium rooms: ticket-gated WebSockets backed by {@link SwarmHost.frameChannelHub}. */
  roomHub: FrameChannelHubPort;
  /** Periodic SQLite maintenance handle. `undefined` when explicitly disabled via config. */
  sqliteMaintenance?: SqliteMaintenanceHandle;
};

/** Error thrown from REGISTRATION_PROFILE_BUILD when the requested username is already taken. */
export const USERNAME_TAKEN_REASON = "USERNAME_TAKEN" as const;

export function createAtriumHostContext(config: AtriumHostConfig): AtriumHostContext {
  const db = openMemoriesDatabase(config.dbPath);
  migrateAtriumHostDb(db);
  const hostPersistence = createSwarmHostSqlitePersistence(db);
  const persistence = createMemoriesPersistence(db);
  const documentStore = createSwarmHostDocumentStore<EntityMap>(db, {
    parsers: {
      profile: (raw) => zAtriumProfile.parse(raw),
      post: (raw) => zAtriumPost.parse(raw),
    },
  });

  const memories = new MemoriesClient(persistence, atriumMemoriesOntology, {
    storeForNamespace: () => documentStore,
  });

  const notificationBuffer = createSqliteAgentNotificationBuffer(db);
  const inboxHub = createInboxWsHub();
  const roomHub = createFrameChannelHub({
    hubPersistence: hostPersistence.frameChannelHubPersistence,
  });
  const probeSubscribers = createProbeSubscribersRepo(db);
  const usernamesRepo = createAtriumUsernamesRepo(db);

  const sqliteMaintenance =
    config.sqliteMaintenance === false
      ? undefined
      : startSqliteMaintenance(db, config.sqliteMaintenance ?? {});

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
    frameChannelHub: roomHub,
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
      try {
        if (event.kind === SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
          try {
            const req = event.payload.request;
            const meta = parseAtriumRegistrationMetadata(req.metadata);
            const profile = zAtriumProfile.parse({
              id: stableId("atrium_profile", req.did),
              ...meta,
            });
            // Reserve username atomically. Handle the re-registration path
            // (`ATRIUM_ALLOW_REREGISTER=1`) where the DID may already own a row.
            const current = usernamesRepo.lookupByDid(req.did);
            if (current === undefined) {
              if (!usernamesRepo.tryReserve(req.did, profile.username)) {
                event.payload.reject(new Error(USERNAME_TAKEN_REASON));
                return;
              }
            } else if (current.username !== profile.username) {
              const r = usernamesRepo.rename(req.did, profile.username);
              if (!r.ok) {
                event.payload.reject(new Error(USERNAME_TAKEN_REASON));
                return;
              }
            }
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
          memories.persistence.withTransaction(() => {
            ensureAtriumScopeLinksForProfile(memories.persistence, profile.id);
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
            await fanOutPostMatches({
              ctx,
              probeSubscribers,
              embeddingModel: ac.embeddingModel,
              post,
            });
          }
          memories.persistence.withTransaction(() => {
            ensureAtriumScopeLinksForPost(memories.persistence, post.authorProfileId, post.topics);
          });
          return;
        }

        if (event.kind === SWARM_EVENT_KIND.POST_DELETED) {
          const post = event.payload.post;
          if (post.kind === "probe") {
            probeSubscribers.delete(post.id);
          }
          ctx.persistence.posts.deleteById(post.id);
        }
      } finally {
        await maybeAtriumMemoryAutolinkAfterSync(
          memories,
          ac.embeddingModel,
          ac.profileNamespace,
          ac.postNamespace,
          ac.probeNamespace,
          event,
        );
      }
    }),
  });

  return {
    config,
    host,
    db,
    notificationBuffer,
    auth,
    usernamesRepo,
    roomHub,
    ...(sqliteMaintenance !== undefined ? { sqliteMaintenance } : {}),
  };
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
