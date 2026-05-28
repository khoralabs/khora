import type { AgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import { sha256HexLower } from "@khoralabs/colonnade-persistence";
import {
  type KhoraPost,
  type KhoraProfile,
  khoraPostLexicalText,
  khoraProfileLexicalText,
  khoraSubscriptionLexicalText,
} from "@khoralabs/khora-contracts";
import { ids, type MemoriesClient } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import { decodePostId } from "../post-address-id.ts";
import {
  ensureAgentScope,
  ensureTopicScope,
  PROFILE_MEMORY_KEY,
  postAttachScopes,
  postsMemoryNamespace,
  profileMemoryNamespace,
} from "./khora-namespace.ts";
import type { khoraOntology } from "./khora-ontology.ts";

export type KhoraMemoriesIndexer = {
  indexProfile(profile: KhoraProfile): Promise<string | undefined>;
  indexPost(post: KhoraPost, previousPostId?: string): Promise<void>;
  deletePost(post: KhoraPost): Promise<void>;
};

export function createKhoraMemoriesIndexer(deps: {
  client: MemoriesClient<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  persistence: MemoriesPersistence;
  persistenceClient: AgentRelayPersistenceClient;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  logError?: (message: string, err: unknown) => void;
}): KhoraMemoriesIndexer {
  const { client, persistence, persistenceClient, embeddingModel, namespaceRoot } = deps;
  const logError = deps.logError ?? ((msg, err) => console.error(msg, err));

  async function embedLexical(text: string): Promise<number[] | undefined> {
    if (embeddingModel === undefined) return undefined;
    const vectors = await embedTextChunks(embeddingModel, [text]);
    return vectors[0];
  }

  function resolveAuthorProfileId(post: KhoraPost): string | undefined {
    if (post.authorProfileId !== undefined && post.authorProfileId.length > 0) {
      return post.authorProfileId;
    }
    const address = decodePostId(post.id);
    if (address === undefined) return undefined;
    return persistenceClient.profileIdForPrincipal(address.authorPrincipalId);
  }

  return {
    async indexProfile(profile: KhoraProfile): Promise<string | undefined> {
      try {
        ensureAgentScope(persistence, namespaceRoot, profile.id);
        const ns = profileMemoryNamespace(namespaceRoot, profile.id);
        const text = khoraProfileLexicalText(profile);
        const vector = await embedLexical(text);
        const memoryId = ids.memory(ns, PROFILE_MEMORY_KEY);
        client.mergeMemory({
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
        ensureAgentScope(persistence, namespaceRoot, authorProfileId);
        if (post.topics !== undefined) {
          for (const slug of post.topics) {
            ensureTopicScope(persistence, namespaceRoot, authorProfileId, slug);
          }
        }
        if (previousPostId !== undefined && previousPostId !== post.id) {
          const prevNs = postsMemoryNamespace(namespaceRoot, authorProfileId);
          client.deleteMemory({ namespace: prevNs, key: previousPostId });
        }
        const ns = postsMemoryNamespace(namespaceRoot, authorProfileId);
        const text =
          post.kind === "subscription"
            ? khoraSubscriptionLexicalText(post)
            : khoraPostLexicalText(post);
        const vector = await embedLexical(text);
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
        client.mergeMemory({
          key: post.id,
          namespace: ns,
          content: [{ key: "body", text, ...(vector !== undefined ? { vector } : {}) }],
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
        client.deleteMemory({ namespace: ns, key: post.id });
      } catch (err) {
        logError("[khora-memories] deletePost failed", err);
      }
    },
  };
}
