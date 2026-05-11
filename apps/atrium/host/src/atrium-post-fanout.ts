import type { Database } from "bun:sqlite";
import { type AtriumPost, normalizeTopicSlug } from "@cfd/atrium-contracts";
import type { DefaultEntityMap } from "@cfd/memories-core";
import { type EmbeddingModel, embedTextChunks } from "@cfd/memories-core/helpers";
import type { SwarmHostEventHandlerCtx } from "@cfd/swarm-host";
import { deliverAgentNotification } from "@cfd/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import { listActiveProbeSubscribers } from "./persistence/sqlite/index.ts";

type SwarmHostOntology = typeof import("@cfd/swarm-host").swarmHostOntology;
type TNode = SwarmHostOntology["nodeLabels"];
type TEdge = SwarmHostOntology["edgeLabels"];

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

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function normalizedTopicSet(topics: readonly string[] | null | undefined): Set<string> | null {
  if (topics === undefined || topics === null || topics.length === 0) return null;
  const out = new Set<string>();
  for (const raw of topics) {
    try {
      out.add(normalizeTopicSlug(raw));
    } catch {
      /* skip invalid slugs */
    }
  }
  return out.size === 0 ? null : out;
}

function lexicalTextForProbeSearch(p: AtriumPost): string {
  const parts = [p.title, p.body].filter((s) => s !== undefined && s.length > 0);
  return parts.join("\n\n");
}

/**
 * Exact similarity scan over `probe_subscribers`: embed the incoming post once,
 * dot-product against every active subscriber, apply per-probe predicates, deliver.
 */
export async function fanOutProbeHits<
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
>(params: {
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>;
  db: Database;
  embeddingModel?: EmbeddingModel;
  incomingPost: AtriumPost;
}): Promise<void> {
  if (params.incomingPost.kind !== "post" && params.incomingPost.kind !== "status") return;

  const buffer = params.ctx.notificationBuffer;
  const hub = params.ctx.inboxHub;
  if (buffer === undefined || hub === undefined) return;

  appCtxOrThrow(params.ctx);

  const subscribers = listActiveProbeSubscribers(params.db, Date.now());
  if (subscribers.length === 0) return;

  const text = lexicalTextForProbeSearch(params.incomingPost).trim();
  let postVec: Float32Array | null = null;
  if (params.embeddingModel !== undefined && text.length > 0) {
    const [vec] = await embedTextChunks(params.embeddingModel, [text]);
    if (vec !== undefined && vec.length > 0) {
      postVec = Float32Array.from(vec);
    }
  }

  const incomingTopics = normalizedTopicSet(params.incomingPost.topics);

  for (const sub of subscribers) {
    if (sub.matchPostKinds !== null && sub.matchPostKinds.length > 0) {
      if (!sub.matchPostKinds.includes(params.incomingPost.kind)) continue;
    }

    if (sub.topicSlugs !== null && sub.topicSlugs.length > 0) {
      if (incomingTopics === null) continue;
      let overlap = false;
      for (const t of sub.topicSlugs) {
        if (incomingTopics.has(t)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) continue;
    }

    let score = 0;
    if (sub.embeddingF32 !== null && postVec !== null) {
      score = cosineSimilarity(postVec, sub.embeddingF32);
    }

    if (sub.minHitScore !== null && score < sub.minHitScore) continue;

    const ownerDid = params.ctx.persistence.agentRegistrations.didForProfileId(sub.ownerProfileId);
    if (ownerDid === undefined) continue;

    await deliverAgentNotification(buffer, hub, ownerDid, {
      kind: "probe_hit",
      payload: {
        probePostId: sub.probePostId,
        matchedPostId: params.incomingPost.id,
        score,
      },
    });
  }
}
