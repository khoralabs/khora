import {
  type AtriumPost,
  type AtriumProfile,
  atriumPostObservationSummary,
} from "@khoralabs/atrium-contracts";
import { integrateNewMemoryIntoGraph } from "@khoralabs/memories-autolink";
import type { DefaultEntityMap, MemoriesClient } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import { SWARM_EVENT_KIND, type SwarmHostEventUnion } from "@khoralabs/swarm-host";
import type { AtriumMemoriesTEdge, AtriumMemoriesTNode } from "./atrium-memories-ontology.ts";
import { computePostAttachScopes, computeProfileAttachScopes } from "./atrium-memory-scopes.ts";
import {
  atriumPostMemoryFieldTexts,
  atriumPostRetrievalSummaryText,
  atriumProfileMemoryFieldTexts,
  atriumProfileRetrievalSummaryText,
  buildMultiFieldMergeContent,
} from "./atrium-memory-sync.ts";

type TNode = AtriumMemoriesTNode;
type TEdge = AtriumMemoriesTEdge;

/**
 * Optional second-pass merge that adds `retrieval_autolink` edges. Gated by `ATRIUM_MEMORY_AUTOLINK=1`.
 * Call only after the primary swarm memory sync merge for the same event.
 */
export async function maybeAtriumMemoryAutolinkAfterSync<E extends Record<string, unknown>>(
  client: MemoriesClient<TNode, TEdge, E>,
  embeddingModel: EmbeddingModel | undefined,
  profileNamespace: string,
  postNamespace: string,
  probeNamespace: string,
  event: SwarmHostEventUnion<AtriumProfile, AtriumPost, unknown, never>,
): Promise<void> {
  if (process.env.ATRIUM_MEMORY_AUTOLINK !== "1") return;

  const graphClient = client as unknown as MemoriesClient<TNode, TEdge, DefaultEntityMap>;

  const linkPlan = { topK: 8, minSimilarityScore: 0.35 } as const;
  const searchOptions = { topK: 25, minScore: 0.2 } as const;

  if (
    event.kind === SWARM_EVENT_KIND.PROFILE_CREATED ||
    event.kind === SWARM_EVENT_KIND.PROFILE_UPDATED
  ) {
    const profile = event.payload.profile;
    const fields = atriumProfileMemoryFieldTexts(profile);
    const content = await buildMultiFieldMergeContent(embeddingModel, fields);
    const attachScopes = computeProfileAttachScopes(profile.id);
    const retrievalText = atriumProfileRetrievalSummaryText(profile).trim();
    const baseText = retrievalText.length > 0 ? retrievalText : profile.id;
    let searchContent: { text: string; vector?: number[] } = { text: baseText };
    if (embeddingModel !== undefined && retrievalText.length > 0) {
      const [vec] = await embedTextChunks(embeddingModel, [retrievalText]);
      if (vec !== undefined && vec.length > 0) {
        searchContent = { text: retrievalText, vector: vec };
      }
    }
    await integrateNewMemoryIntoGraph(graphClient, {
      namespace: profileNamespace,
      key: profile.id,
      content,
      attachScopes,
      labels: [
        {
          kind: "person",
          props: { name: profile.displayName ?? profile.username },
        },
      ],
      searchContent,
      searchEntireDatabase: true,
      linkPlan,
      searchOptions,
    });
    return;
  }

  if (
    event.kind === SWARM_EVENT_KIND.POST_CREATED ||
    event.kind === SWARM_EVENT_KIND.POST_UPDATED
  ) {
    const post = event.payload.post;
    const fields = atriumPostMemoryFieldTexts(post);
    const content = await buildMultiFieldMergeContent(embeddingModel, fields);
    const attachScopes = computePostAttachScopes(post.authorProfileId, post.topics);
    const retrievalText = atriumPostRetrievalSummaryText(post).trim();
    const baseText = retrievalText.length > 0 ? retrievalText : post.id;
    let searchContent: { text: string; vector?: number[] } = { text: baseText };
    if (embeddingModel !== undefined && retrievalText.length > 0) {
      const [vec] = await embedTextChunks(embeddingModel, [retrievalText]);
      if (vec !== undefined && vec.length > 0) {
        searchContent = { text: retrievalText, vector: vec };
      }
    }

    if (post.kind === "probe") {
      await integrateNewMemoryIntoGraph(graphClient, {
        namespace: probeNamespace,
        key: post.id,
        content,
        attachScopes,
        labels: [
          {
            kind: "probe",
            props: {
              ownerProfileId: post.authorProfileId as string,
              ...(post.matchPostKinds !== undefined && post.matchPostKinds.length > 0
                ? { matchPostKinds: post.matchPostKinds }
                : {}),
            },
          },
        ],
        searchContent,
        searchEntireDatabase: true,
        linkPlan,
        searchOptions,
      });
      return;
    }

    await integrateNewMemoryIntoGraph(graphClient, {
      namespace: postNamespace,
      key: post.id,
      content,
      attachScopes,
      labels: [{ kind: "observation", props: { summary: atriumPostObservationSummary(post) } }],
      searchContent,
      searchEntireDatabase: true,
      linkPlan,
      searchOptions,
    });
  }
}
