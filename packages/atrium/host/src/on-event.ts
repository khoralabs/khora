import type { Database } from "bun:sqlite";
import {
  AGENT_RELAY_EVENT_KIND,
  type AgentRelayEventHandlerCtx,
  type AgentRelayEventUnion,
  type InboxPostReason,
} from "@khoralabs/agent-relay";
import {
  type AtriumPost,
  type AtriumProfile,
  parseAtriumRegistrationMetadata,
  zAtriumProfile,
} from "@khoralabs/at2-contracts";
import {
  purgeRelayCatalogPostEntity,
  RELAY_CATALOG_SOURCE_POST,
  type RelayCatalogSourceMapStore,
  registerAgentOnColonnadePersistence,
  relaySyntheticPointer,
} from "@khoralabs/relay-colonnade";
import { RELAY_INBOX_SOURCE_MAP_ID } from "./relay-inbox.ts";
import {
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";

function fanOutPostToInbox(params: {
  ctx: AgentRelayEventHandlerCtx;
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  post: AtriumPost;
}): void {
  const { ctx, store, tenantKey, post } = params;
  const subs = params.ctx.persistence.agentSubjectSubscriptions;
  const authorPrincipalId =
    post.authorProfileId !== undefined && post.authorProfileId.length > 0
      ? ctx.persistence.agentRegistrations.principalForProfileId(post.authorProfileId)
      : undefined;

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

  if (post.topics !== undefined && post.topics.length > 0) {
    for (const slug of post.topics) {
      const subject = topicSubscriptionSubject(slug);
      for (const pid of subs.subscriberPrincipalsForSubject(subject, authorPrincipalId)) {
        addReason(pid, { kind: "topic", topic: slug });
      }
      if (authorPrincipalId !== undefined) {
        const tupleSubject = authorTopicSubscriptionSubject(authorPrincipalId, slug);
        for (const pid of subs.subscriberPrincipalsForSubject(tupleSubject, authorPrincipalId)) {
          addReason(pid, {
            kind: "author_topic",
            authorPrincipalId,
            topic: slug,
          });
        }
      }
    }
  }

  if (authorPrincipalId !== undefined) {
    const authorSub = authorSubscriptionSubject(authorPrincipalId);
    for (const pid of subs.subscriberPrincipalsForSubject(authorSub, authorPrincipalId)) {
      addReason(pid, { kind: "author" });
    }
  }

  const pointer = relaySyntheticPointer(tenantKey, RELAY_CATALOG_SOURCE_POST, post.id);
  const createdAtMs = Date.now();
  for (const [recipientId, reasons] of byRecipient) {
    store.upsertRow({
      tenant_key: tenantKey,
      source_map_id: RELAY_INBOX_SOURCE_MAP_ID,
      entry_key: `${recipientId}/${post.id}`,
      pointer,
      projection: {
        postId: post.id,
        authorPrincipalId,
        reasons,
        createdAtMs,
        postKind: post.kind,
      },
    });
  }
}

export function createAtriumRelayOnEvent(deps: {
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  catalogDb: Database;
}): (
  ctx: AgentRelayEventHandlerCtx,
  event: AgentRelayEventUnion<AtriumProfile, AtriumPost, unknown, never>,
) => void | Promise<void> {
  const { store, tenantKey, catalogDb } = deps;
  return async (
    ctx: AgentRelayEventHandlerCtx,
    event: AgentRelayEventUnion<AtriumProfile, AtriumPost, unknown, never>,
  ): Promise<void> => {
    if (event.kind === AGENT_RELAY_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
      const req = event.payload.request;
      try {
        const meta = parseAtriumRegistrationMetadata(req.metadata);
        const profile = zAtriumProfile.parse({
          id: crypto.randomUUID(),
          username: meta.username,
          displayName: meta.displayName,
          bio: meta.bio,
        });
        registerAgentOnColonnadePersistence(ctx.persistence, catalogDb, store, {
          principalId: req.principalId,
          profileUpsert: { id: profile.id, bodyJson: JSON.stringify(profile) },
          username: meta.username,
        });
        event.payload.fulfill(profile);
      } catch (e) {
        event.payload.reject(e);
      }
      return;
    }

    if (
      event.kind === AGENT_RELAY_EVENT_KIND.PROFILE_CREATED ||
      event.kind === AGENT_RELAY_EVENT_KIND.PROFILE_UPDATED
    ) {
      const profile = event.payload.profile;
      ctx.persistenceClient.upsertProfile({
        id: profile.id,
        bodyJson: JSON.stringify(profile),
      });
      return;
    }

    if (
      event.kind === AGENT_RELAY_EVENT_KIND.POST_CREATED ||
      event.kind === AGENT_RELAY_EVENT_KIND.POST_UPDATED
    ) {
      const post = event.payload.post;
      ctx.persistenceClient.upsertPost({
        id: post.id,
        bodyJson: JSON.stringify(post),
      });
      if (event.kind === AGENT_RELAY_EVENT_KIND.POST_CREATED) {
        fanOutPostToInbox({ ctx, store, tenantKey, post });
      }
      return;
    }

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      purgeRelayCatalogPostEntity(store, catalogDb, tenantKey, post.id, {
        sourceMapId: RELAY_INBOX_SOURCE_MAP_ID,
      });
    }
  };
}
