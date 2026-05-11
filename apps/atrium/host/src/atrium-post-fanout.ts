import { type AtriumPost, normalizeTopicSlug, zAtriumPost } from "@cfd/atrium-contracts";
import type { DefaultEntityMap } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import type { SwarmHostEventHandlerCtx } from "@cfd/swarm-host";
import { deliverAgentNotification } from "@cfd/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";

type SwarmHostOntology = typeof import("@cfd/swarm-host").swarmHostOntology;
type TNode = SwarmHostOntology["nodeLabels"];
type TEdge = SwarmHostOntology["edgeLabels"];

export type FanoutConfig = {
  probeNamespace: string;
  embeddingModel?: EmbeddingModel;
};

function appCtxOrThrow<TEntityMap extends Record<string, unknown>>(
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>,
): AtriumHostAppContext {
  const ac = ctx.appContext as AtriumHostAppContext | undefined;
  if (ac === undefined) {
    throw new Error("Atrium: SwarmHostEventHandlerCtx.appContext is required for fan-out");
  }
  return ac;
}

export async function fanOutTopicSubscriptions<
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
>(params: {
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>;
  post: AtriumPost;
}): Promise<void> {
  const topics = params.post.topics;
  if (topics === undefined || topics.length === 0) return;

  const buffer = params.ctx.notificationBuffer;
  const hub = params.ctx.inboxHub;
  if (buffer === undefined || hub === undefined) return;

  appCtxOrThrow(params.ctx);

  const authorDid =
    params.post.authorProfileId !== undefined
      ? params.ctx.persistence.agentRegistrations.didForProfileId(params.post.authorProfileId)
      : undefined;

  const seen = new Set<string>();
  for (const raw of topics) {
    let slug: string;
    try {
      slug = normalizeTopicSlug(raw);
    } catch {
      continue;
    }
    const dids = params.ctx.persistence.agentTopicSubscriptions.subscriberDidsForTopic(
      slug,
      authorDid,
    );
    for (const did of dids) {
      const dedupeKey = `${did}\t${slug}\t${params.post.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      await deliverAgentNotification(buffer, hub, did, {
        kind: "topic_post",
        payload: {
          topicSlug: slug,
          postId: params.post.id,
          authorProfileId: params.post.authorProfileId,
        },
      });
    }
  }
}

export async function fanOutProbeHits<
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
>(params: {
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>;
  config: FanoutConfig;
  incomingPost: AtriumPost;
}): Promise<void> {
  if (params.incomingPost.kind !== "post" && params.incomingPost.kind !== "status") return;
  if (params.config.embeddingModel === undefined) return;

  const buffer = params.ctx.notificationBuffer;
  const hub = params.ctx.inboxHub;
  if (buffer === undefined || hub === undefined) return;

  appCtxOrThrow(params.ctx);

  const hits = await params.ctx.searchMemories({
    namespace: params.config.probeNamespace,
    content: { text: lexicalTextForProbeSearch(params.incomingPost) },
    embeddingModel: params.config.embeddingModel,
    options: {
      labels: { some: ["probe"] },
      topK: 64,
      arms: { lexical: 1, vector: 1 },
    },
  });

  const notified = new Set<string>();

  for (const hit of hits) {
    const probePostId = hit.memory_key;
    const dedupeKey = `${probePostId}:${params.incomingPost.id}`;
    if (notified.has(dedupeKey)) continue;

    const row = params.ctx.persistenceClient.getPostById(probePostId);
    if (row === undefined) continue;
    let probe: AtriumPost;
    try {
      probe = zAtriumPost.parse(JSON.parse(row.bodyJson));
    } catch {
      continue;
    }
    if (probe.kind !== "probe") continue;

    const filters = probe.matchPostKinds;
    if (
      filters !== undefined &&
      filters.length > 0 &&
      !filters.includes(params.incomingPost.kind)
    ) {
      continue;
    }

    const ownerPid = probe.authorProfileId;
    if (ownerPid === undefined || ownerPid.length === 0) continue;

    const ownerDid = params.ctx.persistence.agentRegistrations.didForProfileId(ownerPid);
    if (ownerDid === undefined) continue;

    notified.add(dedupeKey);
    await deliverAgentNotification(buffer, hub, ownerDid, {
      kind: "probe_hit",
      payload: {
        probePostId,
        matchedPostId: params.incomingPost.id,
        score: hit.score,
      },
    });
  }
}

function lexicalTextForProbeSearch(p: AtriumPost): string {
  const parts = [p.title, p.body].filter((s) => s !== undefined && s.length > 0);
  return parts.join("\n\n");
}
