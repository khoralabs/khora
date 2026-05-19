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
import { randomId } from "@khoralabs/colonnade-persistence";
import {
  type RelayCatalogProjectionStore,
  registerAgentOnColonnadePersistence,
} from "@khoralabs/relay-colonnade";
import { decodePostId } from "./post-address-id.ts";
import { deletePostOutboxRecord } from "./resolve-post.ts";
import {
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";

const postEncoder = new TextEncoder();

async function publishPost(params: {
  ctx: AgentRelayEventHandlerCtx;
  tenantKey: string;
  post: AtriumPost;
  cluster: SqliteColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  fanOut: boolean;
}): Promise<void> {
  const { ctx, tenantKey, post, cluster, publicationClient, fanOut } = params;
  const address = decodePostId(post.id);
  if (address === undefined) {
    throw new Error("publishPost: post.id is not a valid address-encoded id");
  }

  const authorPrincipalId = address.authorPrincipalId;
  const authorCellId = address.authorCellId;
  const payload_bytes = postEncoder.encode(JSON.stringify(post));

  const byRecipient = new Map<string, InboxPostReason[]>();
  if (fanOut) {
    const subs = ctx.persistence.agentSubjectSubscriptions;
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
  }

  const createdAtMs = Date.now();
  const fan_out_targets = fanOut
    ? [...byRecipient.entries()].map(([recipient_principal_id, reasons]) => ({
        recipient_cell_id: cluster.assignPrincipalToCell(recipient_principal_id),
        recipient_principal_id,
        inbox_metadata: {
          postId: post.id,
          authorPrincipalId,
          reasons,
          createdAtMs,
          postKind: post.kind,
        },
      }))
    : [];

  await publicationClient.postOperation({
    author_principal_id: authorPrincipalId,
    author_cell_id: authorCellId,
    tenant_key: tenantKey,
    payload_bytes,
    payload_metadata: { postId: post.id, postKind: post.kind },
    outbox_record_key: address.recordKey,
    routing: {
      replicate_to_catalog: false,
      catalog_envelope: {},
      fan_out_targets,
    },
  });
}

export function createAtriumRelayOnEvent(deps: {
  projectionStore: RelayCatalogProjectionStore;
  tenantKey: string;
  catalogDb: Database;
  cluster: SqliteColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
}): (
  ctx: AgentRelayEventHandlerCtx,
  event: AgentRelayEventUnion<AtriumProfile, AtriumPost, unknown, never>,
) => void | Promise<void> {
  const { projectionStore, tenantKey, catalogDb, cluster, publicationClient } = deps;
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
        registerAgentOnColonnadePersistence(ctx.persistence, catalogDb, projectionStore, {
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

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_CREATED) {
      const post = event.payload.post;
      await publishPost({
        ctx,
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOut: true,
      });
      return;
    }

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_UPDATED) {
      const post = event.payload.post;
      await publishPost({
        ctx,
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOut: false,
      });
      return;
    }

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      await deletePostOutboxRecord(cluster, post.id);
    }
  };
}

/** Assign a new address-encoded post id before create/update HTTP handlers notify the relay. */
export function assignPostAddress(params: {
  cluster: SqliteColonnadeCluster;
  authorPrincipalId: string;
}): { recordKey: string; authorCellId: string } {
  const authorCellId = params.cluster.assignPrincipalToCell(params.authorPrincipalId);
  const recordKey = randomId("ob");
  return { recordKey, authorCellId };
}

export { encodePostId } from "./post-address-id.ts";
