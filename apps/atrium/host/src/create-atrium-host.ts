import { ids, MemoriesClient, type MemoriesClient as MemoriesClientBare } from "@cfd/memories-core";
import { canonicalOntology } from "@cfd/memories-core/ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import {
  minimalSourceMapForResolve,
  SWARM_EVENT_KIND,
  SwarmHost,
  type SwarmMemoryOpMapper,
} from "@cfd/swarm-host";
import {
  type AtriumPost,
  atriumPostLexicalText,
  atriumPostObservationSummary,
  zAtriumPost,
} from "./atrium-post.ts";
import {
  type AtriumProfile,
  atriumProfileFromRegistrationRequest,
  atriumProfileLexicalText,
  zAtriumProfile,
} from "./atrium-profile.ts";
import {
  createSwarmHostDocumentStore,
  createSwarmHostSqlitePersistence,
  ensureSwarmHostSqliteSchema,
} from "./persistence/sqlite/index.ts";

type TNode = typeof canonicalOntology.nodeLabels;
type TEdge = typeof canonicalOntology.edgeLabels;

type EntityMap = { profile: AtriumProfile; post: AtriumPost };

/** {@link SwarmHost} / sync handler use the default entity-map parameter; cast at the boundary. */
type CanonicalMemoriesClient = MemoriesClientBare<TNode, TEdge>;

export type AtriumHostConfig = {
  dbPath: string;
  /** Memories namespace for profile nodes (memory key = profile id). */
  profileNamespace: string;
  /** Memories namespace for post nodes (memory key = post id). */
  postNamespace: string;
};

export type AtriumHostContext = {
  config: AtriumHostConfig;
  swarm: SwarmHost<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never>;
};

function createAtriumMemoryOpMapper(
  profileNamespace: string,
  postNamespace: string,
): SwarmMemoryOpMapper<TNode, TEdge, AtriumProfile, AtriumPost> {
  return (event) => {
    if (event.kind === SWARM_EVENT_KIND.PROFILE_CREATED) {
      const profile = event.payload.profile;
      const text = atriumProfileLexicalText(profile);
      return [
        {
          op: "merge" as const,
          params: {
            key: profile.id,
            namespace: profileNamespace,
            content: [{ key: `profile:${profile.id}`, text }],
            labels: [
              {
                kind: "person" as const,
                props: { name: profile.displayName ?? profile.id },
              },
            ],
          },
        },
      ];
    }

    if (
      event.kind === SWARM_EVENT_KIND.POST_CREATED ||
      event.kind === SWARM_EVENT_KIND.POST_UPDATED
    ) {
      const post = event.payload.post;
      const text = atriumPostLexicalText(post);
      return [
        {
          op: "merge" as const,
          params: {
            key: post.id,
            namespace: postNamespace,
            content: [{ key: `post:${post.id}`, text }],
            labels: [
              {
                kind: "observation" as const,
                props: { summary: atriumPostObservationSummary(post) },
              },
            ],
          },
        },
      ];
    }

    if (event.kind === SWARM_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      return [{ op: "delete" as const, params: { namespace: postNamespace, key: post.id } }];
    }

    return [];
  };
}

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

  const client = new MemoriesClient(persistence, canonicalOntology, {
    storeForNamespace: () => documentStore,
  });

  const swarm = new SwarmHost({
    memories: client as unknown as CanonicalMemoriesClient,
    persistence: hostPersistence,
    mapEvent: createAtriumMemoryOpMapper(config.profileNamespace, config.postNamespace),
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
    onEvent: async (ctx, event) => {
      if (event.kind === SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
        try {
          const profile = atriumProfileFromRegistrationRequest(event.payload.request);
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
          memoryId: ids.memory(config.profileNamespace, profile.id),
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
          memoryId: ids.memory(config.postNamespace, post.id),
          bodyJson: JSON.stringify(post),
        });
        return;
      }

      if (event.kind === SWARM_EVENT_KIND.POST_DELETED) {
        ctx.persistence.posts.deleteById(event.payload.post.id);
      }
    },
  });

  return { config, swarm };
}
