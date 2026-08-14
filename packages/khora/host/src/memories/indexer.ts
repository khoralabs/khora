import { sha256HexLower } from "@khoralabs/colonnade";
import {
  type KhoraPost,
  type KhoraProfile,
  khoraPostIndexableFeatures,
  khoraProfileLexicalText,
} from "@khoralabs/khora-contracts";
import type { MemoriesPersistenceAsync } from "@khoralabs/memories-node";
import { ids, type MemoriesClientAsync } from "@khoralabs/memories-node";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import { embedTextChunks } from "@khoralabs/memories-node/helpers";
import { decodePostId } from "../post-address-id";
import type { HostPersistenceClient } from "../runtime";
import {
  ensureAgentScope,
  ensureTopicScope,
  PROFILE_MEMORY_KEY,
  postAttachScopes,
  postsMemoryNamespace,
  profileMemoryNamespace,
} from "./khora-namespace";
import type { khoraOntology } from "./khora-ontology";

export type KhoraMemoriesIndexer = {
  indexProfile(profile: KhoraProfile): Promise<string | undefined>;
  indexPost(post: KhoraPost, previousPostId?: string): Promise<void>;
  deletePost(post: KhoraPost): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
};

export function createKhoraMemoriesIndexer(deps: {
  client: MemoriesClientAsync<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  persistence: MemoriesPersistenceAsync;
  persistenceClient: HostPersistenceClient;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  logError?: (message: string, err: unknown) => void;
  onEmbeddingFailure?: (input: { namespace: string; memoryKey: string; text: string }) => void;
}): KhoraMemoriesIndexer {
  const { client, persistence, persistenceClient, embeddingModel, namespaceRoot } = deps;
  const logError = deps.logError ?? ((msg, err) => console.error(msg, err));

  async function embedLexical(input: {
    text: string;
    namespace: string;
    memoryKey: string;
  }): Promise<number[] | undefined> {
    if (embeddingModel === undefined || input.text.trim().length === 0) return undefined;
    try {
      const vectors = await embedTextChunks(embeddingModel, [input.text]);
      return vectors[0];
    } catch (err) {
      logError("[khora-memories] embed failed, falling back to lexical-only", err);
      try {
        deps.onEmbeddingFailure?.(input);
      } catch (queueErr) {
        logError("[khora-memories] queueing pending embedding failed", queueErr);
      }
      return undefined;
    }
  }

  function resolveAuthorProfileId(post: KhoraPost): string | undefined {
    if (post.authorProfileId !== undefined && post.authorProfileId.length > 0) {
      return post.authorProfileId;
    }
    const address = decodePostId(post.id);
    if (address === undefined) return undefined;
    return persistenceClient.profileIdForPrincipal(address.authorPrincipalId);
  }

  async function ensureProfileIndexed(profileId: string): Promise<void> {
    const ns = profileMemoryNamespace(namespaceRoot, profileId);
    const existing = await persistence.findMemoryIdByKey(ns, PROFILE_MEMORY_KEY);
    if (existing !== undefined) return;
    const projection = persistenceClient.getProfileById(profileId);
    if (!projection?.bodyJson) return;
    try {
      const profile = JSON.parse(projection.bodyJson) as KhoraProfile;
      if (typeof profile.id !== "string" || profile.id !== profileId) return;
      await indexer.indexProfile(profile);
    } catch (err) {
      logError("[khora-memories] ensureProfileIndexed parse failed", err);
    }
  }

  const indexer: KhoraMemoriesIndexer = {
    async indexProfile(profile: KhoraProfile): Promise<string | undefined> {
      try {
        await ensureAgentScope(persistence, namespaceRoot, profile.id);
        const ns = profileMemoryNamespace(namespaceRoot, profile.id);
        const text = khoraProfileLexicalText(profile);
        const vector = await embedLexical({
          text,
          namespace: ns,
          memoryKey: PROFILE_MEMORY_KEY,
        });
        const memoryId = ids.memory(ns, PROFILE_MEMORY_KEY);
        await client.mergeMemory({
          key: PROFILE_MEMORY_KEY,
          namespace: ns,
          content: [{ key: "body", text, ...(vector !== undefined ? { vector } : {}) }],
          labels: [
            {
              kind: "khora_profile",
              props: { profileId: profile.id, username: profile.username },
            },
          ],
          edges: [],
        });
        const existing = persistenceClient.getProfileById(profile.id);
        if (existing?.memoryId !== memoryId) {
          persistenceClient.upsertProfile({
            id: profile.id,
            bodyJson: JSON.stringify(profile),
            memoryId,
          });
        }
        return memoryId;
      } catch (err) {
        logError("[khora-memories] indexProfile failed", err);
        return undefined;
      }
    },

    async indexPost(post: KhoraPost, previousPostId?: string): Promise<void> {
      try {
        const authorProfileId = resolveAuthorProfileId(post);
        if (authorProfileId === undefined) {
          logError("[khora-memories] indexPost skipped: no authorProfileId", post.id);
          return;
        }
        await ensureProfileIndexed(authorProfileId);
        await ensureAgentScope(persistence, namespaceRoot, authorProfileId);
        if (post.topics !== undefined) {
          for (const slug of post.topics) {
            await ensureTopicScope(persistence, namespaceRoot, authorProfileId, slug);
          }
        }
        if (previousPostId !== undefined && previousPostId !== post.id) {
          const prevNs = postsMemoryNamespace(namespaceRoot, authorProfileId);
          await client.deleteMemory({ namespace: prevNs, key: previousPostId });
        }
        const ns = postsMemoryNamespace(namespaceRoot, authorProfileId);
        const features = khoraPostIndexableFeatures(post);
        if (features.length === 0) {
          return;
        }
        const content: Array<{ key: string; text: string; vector?: number[] }> = [];
        for (const feature of features) {
          const vector = await embedLexical({
            text: feature.text,
            namespace: ns,
            memoryKey: post.id,
          });
          content.push({
            key: feature.key,
            text: feature.text,
            ...(vector !== undefined ? { vector } : {}),
          });
        }
        const payloadHash = sha256HexLower(new TextEncoder().encode(JSON.stringify(post)));
        const profileNs = profileMemoryNamespace(namespaceRoot, authorProfileId);
        const profileMemoryId = ids.memory(profileNs, PROFILE_MEMORY_KEY);
        const labels =
          post.kind === "subscription"
            ? [
                {
                  kind: "khora_subscription" as const,
                  props: {
                    postId: post.id,
                    authorProfileId,
                    contentHash: payloadHash,
                    ...(post.topics !== undefined && post.topics.length > 0
                      ? { topics: post.topics }
                      : {}),
                  },
                },
              ]
            : [
                {
                  kind: "khora_post" as const,
                  props: {
                    postId: post.id,
                    kind: post.kind,
                    authorProfileId,
                    contentHash: payloadHash,
                    ...(post.topics !== undefined && post.topics.length > 0
                      ? { topics: post.topics }
                      : {}),
                  },
                },
              ];
        await client.mergeMemory({
          key: post.id,
          namespace: ns,
          content,
          labels,
          attachScopes: postAttachScopes(namespaceRoot, authorProfileId, post.topics),
          edges: [
            {
              peer_memory_id: profileMemoryId,
              direction: "out",
              label: { kind: "authored_by", props: {} },
            },
          ],
        });
      } catch (err) {
        logError("[khora-memories] indexPost failed", err);
      }
    },

    async deletePost(post: KhoraPost): Promise<void> {
      try {
        const authorProfileId = resolveAuthorProfileId(post);
        if (authorProfileId === undefined) return;
        const ns = postsMemoryNamespace(namespaceRoot, authorProfileId);
        await client.deleteMemory({ namespace: ns, key: post.id });
      } catch (err) {
        logError("[khora-memories] deletePost failed", err);
      }
    },

    async deleteProfile(profileId: string): Promise<void> {
      try {
        const postsNs = postsMemoryNamespace(namespaceRoot, profileId);
        const labelsByKey = await persistence.loadNodeLabelsForNamespace(postsNs);
        for (const key of labelsByKey.keys()) {
          await client.deleteMemory({ namespace: postsNs, key });
        }
        const profileNs = profileMemoryNamespace(namespaceRoot, profileId);
        await client.deleteMemory({ namespace: profileNs, key: PROFILE_MEMORY_KEY });
      } catch (err) {
        logError("[khora-memories] deleteProfile failed", err);
      }
    },
  };
  return indexer;
}
