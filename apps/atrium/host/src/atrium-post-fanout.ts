import { type AtriumPost, normalizeTopicSlug } from "@khoralabs/atrium-contracts";
import { type EmbeddingModel, embedTextChunks } from "@khoralabs/memories-core/helpers";
import type { SwarmHostEventHandlerCtx } from "@khoralabs/swarm-host";
import { deliverAgentNotification, type InboxPostReason } from "@khoralabs/swarm-host";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import type { ProbeSubscribersRepo } from "./persistence/sqlite/index.ts";
import {
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";
function appCtxOrThrow(
  ctx: SwarmHostEventHandlerCtx,
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
 * `inbox_post` notification per recipient principal (merged `reasons[]`).
 */
export async function fanOutPostMatches(params: {
  ctx: SwarmHostEventHandlerCtx;
  probeSubscribers: ProbeSubscribersRepo;
  embeddingModel?: EmbeddingModel;
  post: AtriumPost;
}): Promise<void> {
  const buffer = params.ctx.notificationBuffer;
  const hub = params.ctx.inboxHub;
  if (buffer === undefined || hub === undefined) return;

  appCtxOrThrow(params.ctx);

  const authorPrincipalId =
    params.post.authorProfileId !== undefined
      ? params.ctx.persistence.agentRegistrations.principalForProfileId(params.post.authorProfileId)
      : undefined;

  const subs = params.ctx.persistence.agentSubjectSubscriptions;
  const byRecipient = new Map<string, InboxPostReason[]>();

  const addReason = (recipientId: string, reason: InboxPostReason): void => {
    if (authorPrincipalId !== undefined && recipientId === authorPrincipalId) return;
    const cur = byRecipient.get(recipientId);
    if (cur === undefined) {
      byRecipient.set(recipientId, [reason]);
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
      const principals = subs.subscriberPrincipalsForSubject(subject, authorPrincipalId);
      for (const pid of principals) {
        addReason(pid, { kind: "topic", topic: slug });
      }
      if (authorPrincipalId !== undefined) {
        const tupleSubject = authorTopicSubscriptionSubject(authorPrincipalId, slug);
        const tuplePrincipals = subs.subscriberPrincipalsForSubject(
          tupleSubject,
          authorPrincipalId,
        );
        for (const pid of tuplePrincipals) {
          addReason(pid, { kind: "author_topic", authorPrincipalId, topic: slug });
        }
      }
    }
  }

  if (authorPrincipalId !== undefined) {
    const authorSub = authorSubscriptionSubject(authorPrincipalId);
    const followers = subs.subscriberPrincipalsForSubject(authorSub, authorPrincipalId);
    for (const pid of followers) {
      addReason(pid, { kind: "author" });
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

        const ownerPrincipalId = params.ctx.persistence.agentRegistrations.principalForProfileId(
          sub.ownerProfileId,
        );
        if (ownerPrincipalId === undefined) continue;

        addReason(ownerPrincipalId, { kind: "probe-hit", probePostId: sub.probePostId, score });
      }
    }
  }

  for (const [principalId, reasons] of byRecipient) {
    if (reasons.length === 0) continue;
    await deliverAgentNotification(buffer, hub, principalId, {
      kind: "inbox_post",
      payload: {
        postId: params.post.id,
        postKind: params.post.kind,
        ...(authorPrincipalId !== undefined ? { authorPrincipalId } : {}),
        reasons,
      },
    });
  }
}
