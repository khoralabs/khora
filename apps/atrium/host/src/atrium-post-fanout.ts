import type { Database } from "bun:sqlite";
import { type AtriumPost, normalizeTopicSlug, zAtriumPost } from "@cfd/atrium-contracts";
import type { DefaultEntityMap } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import type { AgentNotificationBufferPort, SwarmHostEventHandlerCtx } from "@cfd/swarm-host";
import { enqueueAndPush } from "./deliver-notification.ts";
import type { InboxWsHub } from "./inbox-ws-hub.ts";
import {
  didForProfileId,
  subscriberDidsForTopic,
} from "./persistence/sqlite/registrations-topics-sqlite.ts";

type SwarmHostOntology = typeof import("@cfd/swarm-host").swarmHostOntology;
type TNode = SwarmHostOntology["nodeLabels"];
type TEdge = SwarmHostOntology["edgeLabels"];

export type FanoutConfig = {
  probeNamespace: string;
  embeddingModel?: EmbeddingModel;
};

export async function fanOutTopicSubscriptions(params: {
  db: Database;
  buffer: AgentNotificationBufferPort;
  hub: InboxWsHub;
  post: AtriumPost;
}): Promise<void> {
  const topics = params.post.topics;
  if (topics === undefined || topics.length === 0) return;

  const authorDid =
    params.post.authorProfileId !== undefined
      ? didForProfileId(params.db, params.post.authorProfileId)
      : undefined;

  const seen = new Set<string>();
  for (const raw of topics) {
    let slug: string;
    try {
      slug = normalizeTopicSlug(raw);
    } catch {
      continue;
    }
    const dids = subscriberDidsForTopic(params.db, slug, authorDid);
    for (const did of dids) {
      const dedupeKey = `${did}\t${slug}\t${params.post.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      await enqueueAndPush(params.buffer, params.hub, did, {
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
  db: Database;
  buffer: AgentNotificationBufferPort;
  hub: InboxWsHub;
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>;
  config: FanoutConfig;
  incomingPost: AtriumPost;
}): Promise<void> {
  if (params.incomingPost.kind !== "post") return;
  if (params.config.embeddingModel === undefined) return;

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
    if (filters !== undefined && filters.length > 0 && !filters.includes("post")) {
      continue;
    }

    const ownerPid = probe.authorProfileId;
    if (ownerPid === undefined || ownerPid.length === 0) continue;

    const ownerDid = didForProfileId(params.db, ownerPid);
    if (ownerDid === undefined) continue;

    notified.add(dedupeKey);
    await enqueueAndPush(params.buffer, params.hub, ownerDid, {
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
