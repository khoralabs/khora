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
} from "@khoralabs/atrium-contracts";
import type {
  ColonnadePublicationClient,
  SqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import {
  purgeRelayCatalogPostEntity,
  type RelayCatalogSourceMapStore,
  registerAgentOnColonnadePersistence,
} from "@khoralabs/relay-colonnade";
import {
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";

const postEncoder = new TextEncoder();

async function fanOutPostToCellInbox(params: {
  ctx: AgentRelayEventHandlerCtx;
  tenantKey: string;
  post: AtriumPost;
  cluster: SqliteColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
}): Promise<void> {
  const { ctx, tenantKey, post, cluster, publicationClient } = params;
  const subs = ctx.persistence.agentSubjectSubscriptions;
  const authorPrincipalId =
    post.authorProfileId !== undefined && post.authorProfileId.length > 0
      ? ctx.persistence.agentRegistrations.principalForProfileId(post.authorProfileId)
      : undefined;

  if (authorPrincipalId === undefined || authorPrincipalId.length === 0) {
    return;
  }

  const byRecipient = new Map<string, InboxPostReason[]>();
  const addReason = (recipientId: string, reason: InboxPostReason): void => {
    if (recipientId === authorPrincipalId) return;
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

  const authorSub = authorSubscriptionSubject(authorPrincipalId);
  for (const pid of subs.subscriberPrincipalsForSubject(authorSub, authorPrincipalId)) {
    addReason(pid, { kind: "author" });
  }

  if (byRecipient.size === 0) {
    return;
  }

  const authorCellId = cluster.assignPrincipalToCell(authorPrincipalId);
  const payload_bytes = postEncoder.encode(JSON.stringify(post));
  const createdAtMs = Date.now();
  const fan_out_targets = [...byRecipient.entries()].map(([recipient_principal_id, reasons]) => ({
    recipient_cell_id: cluster.assignPrincipalToCell(recipient_principal_id),
    recipient_principal_id,
    inbox_metadata: {
      postId: post.id,
      authorPrincipalId,
      reasons,
      createdAtMs,
      postKind: post.kind,
    },
  }));

  await publicationClient.postOperation({
    author_principal_id: authorPrincipalId,
    author_cell_id: authorCellId,
    tenant_key: tenantKey,
    payload_bytes,
    payload_metadata: { postId: post.id, postKind: post.kind },
    routing: {
      replicate_to_catalog: true,
      catalog_envelope: { postId: post.id },
      fan_out_targets,
    },
  });
}

export function createAtriumRelayOnEvent(deps: {
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  catalogDb: Database;
  cluster: SqliteColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
}): (
  ctx: AgentRelayEventHandlerCtx,
  event: AgentRelayEventUnion<AtriumProfile, AtriumPost, unknown, never>,
) => void | Promise<void> {
  const { store, tenantKey, catalogDb, cluster, publicationClient } = deps;
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
        await fanOutPostToCellInbox({
          ctx,
          tenantKey,
          post,
          cluster,
          publicationClient,
        });
      }
      return;
    }

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      purgeRelayCatalogPostEntity(store, catalogDb, tenantKey, post.id);
    }
  };
}
