import { AGENT_RELAY_EVENT_KIND, type AgentRelayEventUnion } from "@khoralabs/agent-relay";
import {
  type AtriumPost,
  type AtriumProfile,
  atriumPostLexicalText,
  atriumPostObservationSummary,
} from "@khoralabs/atrium-contracts";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import type { atriumMemoriesOntology } from "./atrium-memories-ontology.ts";
import { computePostAttachScopes, computeProfileAttachScopes } from "./atrium-memory-scopes.ts";
import type { SwarmMemoryOpMapper } from "./atrium-swarm-memory-ops.ts";

type TNode = typeof atriumMemoriesOntology.nodeLabels;
type TEdge = typeof atriumMemoriesOntology.edgeLabels;

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

/** Per-field text rows for profile memory (`username` is `@handle` for search UX). */
export function atriumProfileMemoryFieldTexts(
  profile: AtriumProfile,
): Array<{ key: string; text: string }> {
  const fields: Array<{ key: string; text: string }> = [];
  if (profile.username.trim().length > 0) {
    fields.push({ key: "username", text: `@${profile.username}` });
  }
  if (profile.displayName !== undefined && profile.displayName.trim().length > 0) {
    fields.push({ key: "displayName", text: profile.displayName });
  }
  if (profile.bio !== undefined && profile.bio.trim().length > 0) {
    fields.push({ key: "bio", text: profile.bio });
  }
  if (fields.length === 0) {
    fields.push({ key: "id", text: profile.id });
  }
  return fields;
}

/** Per-field text rows for post / probe memory. */
export function atriumPostMemoryFieldTexts(post: AtriumPost): Array<{ key: string; text: string }> {
  const fields: Array<{ key: string; text: string }> = [];
  if (post.title !== undefined && post.title.trim().length > 0) {
    fields.push({ key: "title", text: post.title });
  }
  const topicLine =
    post.topics !== undefined && post.topics.length > 0
      ? post.topics.map((t) => `#${t}`).join(" ")
      : "";
  if (topicLine.length > 0) {
    fields.push({ key: "topics", text: topicLine });
  }
  if (post.body.trim().length > 0) {
    fields.push({ key: "body", text: post.body });
  }
  if (
    post.kind === "probe" &&
    post.matchPostKinds !== undefined &&
    post.matchPostKinds.length > 0
  ) {
    fields.push({ key: "matchKinds", text: post.matchPostKinds.join(" ") });
  }
  if (fields.length === 0) {
    fields.push({ key: "id", text: post.id });
  }
  return fields;
}

/** Summary string for hybrid / autolink retrieval (aligned with indexed profile fields). */
export function atriumProfileRetrievalSummaryText(profile: AtriumProfile): string {
  return atriumProfileMemoryFieldTexts(profile)
    .map((f) => f.text)
    .join("\n\n");
}

/** Summary string for hybrid / autolink retrieval on posts (matches legacy lexical join). */
export function atriumPostRetrievalSummaryText(post: AtriumPost): string {
  return atriumPostLexicalText(post).trim().length > 0 ? atriumPostLexicalText(post) : post.id;
}

export async function buildMultiFieldMergeContent(
  embeddingModel: EmbeddingModel | undefined,
  fields: Array<{ key: string; text: string }>,
): Promise<Array<{ key: string; text: string; vector?: number[] }>> {
  const out: Array<{ key: string; text: string; vector?: number[] }> = [];
  for (const f of fields) {
    const items = await mergeContentWithOptionalVector(embeddingModel, f.key, f.text);
    out.push(...items);
  }
  return out;
}

/** Maps swarm profile/post events to Memories merge/delete ops (uses {@link AtriumHostAppContext} only). */
export function atriumSwarmMemoryOpMapper(
  ac: AtriumHostAppContext,
): SwarmMemoryOpMapper<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never> {
  return async (event: AgentRelayEventUnion<AtriumProfile, AtriumPost, unknown, never>) => {
    if (
      event.kind === AGENT_RELAY_EVENT_KIND.PROFILE_CREATED ||
      event.kind === AGENT_RELAY_EVENT_KIND.PROFILE_UPDATED
    ) {
      const profile = event.payload.profile;
      const fields = atriumProfileMemoryFieldTexts(profile);
      const content = await buildMultiFieldMergeContent(ac.embeddingModel, fields);
      const attachScopes = computeProfileAttachScopes(profile.id);
      return [
        {
          op: "merge" as const,
          params: {
            key: profile.id,
            namespace: ac.profileNamespace,
            content,
            attachScopes,
            labels: [
              {
                kind: "person" as const,
                props: { name: profile.displayName ?? profile.username },
              },
            ],
          },
        },
      ];
    }

    if (
      event.kind === AGENT_RELAY_EVENT_KIND.POST_CREATED ||
      event.kind === AGENT_RELAY_EVENT_KIND.POST_UPDATED
    ) {
      const post = event.payload.post;
      const fields = atriumPostMemoryFieldTexts(post);
      const content = await buildMultiFieldMergeContent(ac.embeddingModel, fields);
      const attachScopes = computePostAttachScopes(post.authorProfileId, post.topics);

      if (post.kind === "probe") {
        return [
          {
            op: "merge" as const,
            params: {
              key: post.id,
              namespace: ac.probeNamespace,
              content,
              attachScopes,
              labels: [
                {
                  kind: "probe" as const,
                  props: {
                    ownerProfileId: post.authorProfileId as string,
                    ...(post.matchPostKinds !== undefined && post.matchPostKinds.length > 0
                      ? { matchPostKinds: post.matchPostKinds }
                      : {}),
                  },
                },
              ],
            },
          },
        ];
      }

      return [
        {
          op: "merge" as const,
          params: {
            key: post.id,
            namespace: ac.postNamespace,
            content,
            attachScopes,
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

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      const ns = post.kind === "probe" ? ac.probeNamespace : ac.postNamespace;
      return [{ op: "delete" as const, params: { namespace: ns, key: post.id } }];
    }

    return [];
  };
}
