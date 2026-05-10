import {
  type AtriumPost,
  type AtriumProfile,
  atriumPostLexicalText,
  atriumPostObservationSummary,
  atriumProfileLexicalText,
} from "@cfd/atrium-contracts";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { embedTextChunks } from "@cfd/memories-core/helpers";
import {
  SWARM_EVENT_KIND,
  type SwarmHostEventUnion,
  type SwarmMemoryOpMapper,
  type swarmHostOntology,
} from "@cfd/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";

type TNode = typeof swarmHostOntology.nodeLabels;
type TEdge = typeof swarmHostOntology.edgeLabels;

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

/** Maps swarm profile/post events to Memories merge/delete ops (uses {@link AtriumHostAppContext} only). */
export function atriumSwarmMemoryOpMapper(
  ac: AtriumHostAppContext,
): SwarmMemoryOpMapper<TNode, TEdge, AtriumProfile, AtriumPost, unknown, never> {
  return async (event: SwarmHostEventUnion<AtriumProfile, AtriumPost, unknown, never>) => {
    if (event.kind === SWARM_EVENT_KIND.PROFILE_CREATED) {
      const profile = event.payload.profile;
      const text = atriumProfileLexicalText(profile);
      const content = await mergeContentWithOptionalVector(
        ac.embeddingModel,
        `profile:${profile.id}`,
        text,
      );
      return [
        {
          op: "merge" as const,
          params: {
            key: profile.id,
            namespace: ac.profileNamespace,
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
        ac.embeddingModel,
        `${post.kind}:${post.id}`,
        text,
      );

      if (post.kind === "probe") {
        return [
          {
            op: "merge" as const,
            params: {
              key: post.id,
              namespace: ac.probeNamespace,
              content,
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
      const ns = post.kind === "probe" ? ac.probeNamespace : ac.postNamespace;
      return [{ op: "delete" as const, params: { namespace: ns, key: post.id } }];
    }

    return [];
  };
}
