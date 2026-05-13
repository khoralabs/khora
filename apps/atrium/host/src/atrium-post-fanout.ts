import { type AtriumPost, normalizeTopicSlug } from "@khoralabs/atrium-contracts";
import type { DefaultEntityMap } from "@khoralabs/memories-core";
import { type EmbeddingModel, embedTextChunks } from "@khoralabs/memories-core/helpers";
import type { SwarmHostEventHandlerCtx } from "@khoralabs/swarm-host";
import { deliverAgentNotification, type InboxPostReason } from "@khoralabs/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import type { atriumMemoriesOntology } from "./atrium-memories-ontology.ts";
import type { ProbeSubscribersRepo } from "./persistence/sqlite/index.ts";
import {
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";

type TNode = (typeof atriumMemoriesOntology)["nodeLabels"];
type TEdge = (typeof atriumMemoriesOntology)["edgeLabels"];

function appCtxOrThrow<TEntityMap extends Record<string, unknown>>(
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>,
): AtriumHostAppContext {
  const ac = ctx.appContext as AtriumHostAppContext | undefined;
  if (ac === undefined) {
    throw new Error("Atrium: SwarmHostEventHandlerCtx.appContext is required for fan-out");
  }
  return ac;
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
 * Fan-out topic subscribers, author followers, and probe hits for a new post into a single
 * `inbox_post` notification per recipient DID (merged `reasons[]`).
 */
export async function fanOutPostMatches<
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
>(params: {
  ctx: SwarmHostEventHandlerCtx<TNode, TEdge, TEntityMap>;
  probeSubscribers: ProbeSubscribersRepo;
  embeddingModel?: EmbeddingModel;
  post: AtriumPost;
}): Promise<void> {
  const buffer = params.ctx.notificationBuffer;
  const hub = params.ctx.inboxHub;
  if (buffer === undefined || hub === undefined) return;

  appCtxOrThrow(params.ctx);

  const authorDid =
    params.post.authorProfileId !== undefined
      ? params.ctx.persistence.agentRegistrations.didForProfileId(params.post.authorProfileId)
      : undefined;

  const subs = params.ctx.persistence.agentSubjectSubscriptions;
  const byDid = new Map<string, InboxPostReason[]>();

  const addReason = (did: string, reason: InboxPostReason): void => {
    if (authorDid !== undefined && did === authorDid) return;
    const cur = byDid.get(did);
    if (cur === undefined) {
      byDid.set(did, [reason]);
    } else {
      cur.push(reason);
    }
  };

  const topics = params.post.topics;
  if (topics !== undefined && topics.length > 0) {
    for (const raw of topics) {
      let slug: string;
      try {
        slug = normalizeTopicSlug(raw);
      } catch {
        continue;
      }
      const subject = topicSubscriptionSubject(slug);
      const dids = subs.subscriberDidsForSubject(subject, authorDid);
      for (const did of dids) {
        addReason(did, { kind: "topic", topic: slug });
      }
      if (authorDid !== undefined) {
        const tupleSubject = authorTopicSubscriptionSubject(authorDid, slug);
        const tupleDids = subs.subscriberDidsForSubject(tupleSubject, authorDid);
        for (const did of tupleDids) {
          addReason(did, { kind: "author_topic", authorDid, topic: slug });
        }
      }
    }
  }

  if (authorDid !== undefined) {
    const authorSub = authorSubscriptionSubject(authorDid);
    const followers = subs.subscriberDidsForSubject(authorSub, authorDid);
    for (const did of followers) {
      addReason(did, { kind: "author" });
    }
  }

  if (params.post.kind === "post" || params.post.kind === "status") {
    const subscribers = params.probeSubscribers.listActive(Date.now());
    if (subscribers.length > 0) {
      const text = lexicalTextForProbeSearch(params.post).trim();
      let postVec: Float32Array | null = null;
      if (params.embeddingModel !== undefined && text.length > 0) {
        const [vec] = await embedTextChunks(params.embeddingModel, [text]);
        if (vec !== undefined && vec.length > 0) {
          postVec = Float32Array.from(vec);
        }
      }

      const incomingTopics = normalizedTopicSet(params.post.topics);

      for (const sub of subscribers) {
        if (sub.matchPostKinds !== null && sub.matchPostKinds.length > 0) {
          if (!sub.matchPostKinds.includes(params.post.kind)) continue;
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

        const ownerDid = params.ctx.persistence.agentRegistrations.didForProfileId(
          sub.ownerProfileId,
        );
        if (ownerDid === undefined) continue;

        addReason(ownerDid, { kind: "probe-hit", probePostId: sub.probePostId, score });
      }
    }
  }

  for (const [did, reasons] of byDid) {
    if (reasons.length === 0) continue;
    await deliverAgentNotification(buffer, hub, did, {
      kind: "inbox_post",
      payload: {
        postId: params.post.id,
        postKind: params.post.kind,
        ...(authorDid !== undefined ? { authorDid } : {}),
        reasons,
      },
    });
  }
}
