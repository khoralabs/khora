import { ids, MemoriesClient, type MemoriesClient as MemoriesClientBare } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { embedTextChunks } from "@cfd/memories-core/helpers";
import { canonicalOntology } from "@cfd/memories-core/ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import { minimalSourceMapForResolve, SWARM_EVENT_KIND, SwarmHost } from "@cfd/swarm-host";
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

async function mergeContentWithOptionalVector(
  embeddingModel: EmbeddingModel | undefined,
  sourceKey: string,
  text: string,
): Promise<Array<{ key: string; text: string; vector?: number[] }>> {
  const trimmed = text.trim();
  if (embeddingModel === undefined || trimmed.length === 0) {
    return [{ key: sourceKey, text }];
  }
  const embeddings = await embedTextChunks(embeddingModel, [trimmed]);
  const vector = embeddings[0];
  if (vector === undefined || vector.length === 0) {
    return [{ key: sourceKey, text }];
  }
  return [{ key: sourceKey, text, vector }];
}

export type AtriumHostConfig = {
  dbPath: string;
  /** Memories namespace for profile nodes (memory key = profile id). */
  profileNamespace: string;
  /** Memories namespace for post nodes (memory key = post id). */
  postNamespace: string;
  /**
   * When set, profile/post merges include embedding vectors for hybrid search (same model as query-time search).
   */
  embeddingModel?: EmbeddingModel;
};

export type AtriumHostContext = {
  config: AtriumHostConfig;
  host: SwarmHost<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never>;
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

  const client = new MemoriesClient(persistence, canonicalOntology, {
    storeForNamespace: () => documentStore,
  });

  const host = new SwarmHost({
    memories: client as unknown as CanonicalMemoriesClient,
    persistence: hostPersistence,
    memoryNamespaces: {
      profileNamespace: config.profileNamespace,
      postNamespace: config.postNamespace,
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

    mapMemoryOps: async (event) => {
      if (event.kind === SWARM_EVENT_KIND.PROFILE_CREATED) {
        const profile = event.payload.profile;
        const text = atriumProfileLexicalText(profile);
        const content = await mergeContentWithOptionalVector(
          config.embeddingModel,
          `profile:${profile.id}`,
          text,
        );
        return [
          {
            op: "merge" as const,
            params: {
              key: profile.id,
              namespace: config.profileNamespace,
              content,
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
        const content = await mergeContentWithOptionalVector(
          config.embeddingModel,
          `post:${post.id}`,
          text,
        );
        return [
          {
            op: "merge" as const,
            params: {
              key: post.id,
              namespace: config.postNamespace,
              content,
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
        return [
          { op: "delete" as const, params: { namespace: config.postNamespace, key: post.id } },
        ];
      }

      return [];
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

  return { config, host };
}
