import type { ColonnadePublicationClient, PostOperationOutput } from "@khoralabs/colonnade";
import { randomId } from "@khoralabs/colonnade";
import {
  type InboxSubscriptionMatch,
  KHORA_EVENT_KIND,
  type KhoraHostAppEvent,
  type KhoraPost,
  type KhoraProfile,
  khoraPostIndexableLexicalText,
  parseKhoraRegistrationMetadata,
  zKhoraProfile,
} from "@khoralabs/khora-contracts";
import { embedTextChunks } from "@khoralabs/memories-node/helpers";
import type { StandingQuery } from "@khoralabs/percolator";
import type { HostSearch } from "../discovery/search/bootstrap";
import { toPercolatorSearch } from "../discovery/subscriptions/adapter";
import type { HostSubscriptions } from "../discovery/subscriptions/bootstrap";
import { buildPercolatorCandidateFromPost } from "../discovery/subscriptions/candidate";
import { HOST_EVENT_KIND, type HostEventUnion } from "../host/events";
import type { HostRuntimeEventHandlerCtx } from "../host/runtime";
import { deliverNotification } from "../inbox/deliver";
import { decodePostId } from "../lib/post-address-id";
import type { SocialRelationshipPersistence } from "../persistence/core/port";
import type { KhoraColonnadeCluster } from "../ports";
import type { KhoraRegistrationApi } from "../registration/api";
import { deletePostOutboxRecord } from "./resolve";
import { canDeliverPostToRecipient } from "./visibility";

const postEncoder = new TextEncoder();

async function postLexicalVector(
  post: KhoraPost,
  search: HostSearch | undefined,
): Promise<{ lexicalText: string; vector?: number[] }> {
  const lexicalText = khoraPostIndexableLexicalText(post);
  if (search?.embeddingModel === undefined || lexicalText.trim().length === 0) {
    return { lexicalText };
  }
  try {
    const vectors = await embedTextChunks(search.embeddingModel, [lexicalText]);
    const vector = vectors[0];
    return {
      lexicalText,
      ...(vector !== undefined && vector.length > 0 ? { vector } : {}),
    };
  } catch (err) {
    console.error("[khora-host] post embed failed, continuing without vector", err);
    return { lexicalText };
  }
}

async function publishPost(params: {
  ctx: HostRuntimeEventHandlerCtx;
  tenantKey: string;
  post: KhoraPost;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  fanOut: boolean;
  search?: HostSearch;
  subscriptions?: HostSubscriptions;
  social?: SocialRelationshipPersistence;
}): Promise<PostOperationOutput & { byRecipient: Map<string, InboxSubscriptionMatch[]> }> {
  const {
    ctx,
    tenantKey,
    post,
    cluster,
    publicationClient,
    fanOut,
    search,
    subscriptions,
    social,
  } = params;
  const address = decodePostId(post.id);
  if (address === undefined) {
    throw new Error("publishPost: post.id is not a valid address-encoded id");
  }
  if (address.cellPoolCount !== cluster.cellPoolCount) {
    throw new Error("publishPost: post id cell pool count does not match cluster");
  }

  const authorPrincipalId = address.authorPrincipalId;
  const authorCellId = address.authorCellId;
  const payload_bytes = postEncoder.encode(JSON.stringify(post));

  const byRecipient = new Map<string, InboxSubscriptionMatch[]>();
  if (fanOut && subscriptions !== undefined && search !== undefined && social !== undefined) {
    const addMatch = (recipientId: string, match: InboxSubscriptionMatch): void => {
      if (recipientId === authorPrincipalId) return;
      const cur = byRecipient.get(recipientId);
      if (cur === undefined) {
        byRecipient.set(recipientId, [match]);
        return;
      }
      if (cur.some((m) => m.subscriptionId === match.subscriptionId)) return;
      cur.push(match);
    };

    const authorProfileId =
      post.authorProfileId ?? ctx.persistenceClient.profileIdForPrincipal(authorPrincipalId);
    if (authorProfileId !== undefined) {
      const { lexicalText, vector } = await postLexicalVector(post, search);
      const candidate = buildPercolatorCandidateFromPost({
        post,
        authorPrincipalId,
        authorProfileId,
        namespaceRoot: search.namespaceRoot,
        lexicalText,
        vector,
      });
      const matches = await subscriptions.percolator.evaluateCandidate(candidate);
      for (const match of matches) {
        if (
          canDeliverPostToRecipient({
            post,
            recipientPrincipalId: match.ownerId,
            social,
          })
        ) {
          addMatch(match.ownerId, {
            subscriptionId: match.queryId,
            score: match.score,
          });
        }
      }
    }
  }

  const createdAtMs = Date.now();
  const fan_out_targets = fanOut
    ? [...byRecipient.entries()].map(([recipient_principal_id, subscriptionMatches]) => ({
        recipient_cell_id: cluster.assignPrincipalToCell(recipient_principal_id),
        recipient_principal_id,
        inbox_metadata: {
          postId: post.id,
          authorPrincipalId,
          subscriptionMatches,
          createdAtMs,
          postKind: post.kind,
        },
      }))
    : [];

  const output = await publicationClient.postOperation({
    author_principal_id: authorPrincipalId,
    author_cell_id: authorCellId,
    tenant_key: tenantKey,
    cell_pool_count: address.cellPoolCount,
    payload_bytes,
    payload_metadata: { postId: post.id, postKind: post.kind },
    outbox_record_key: address.recordKey,
    routing: {
      replicate_to_catalog: false,
      catalog_envelope: {},
      fan_out_targets,
    },
  });
  return { ...output, byRecipient };
}

function registerSubscriptionQuery(
  subscriptions: HostSubscriptions,
  post: KhoraPost,
  ownerPrincipalId: string,
): Promise<StandingQuery | undefined> {
  if (post.kind !== "subscription" || post.search === undefined) return Promise.resolve(undefined);
  return subscriptions.percolator.registerQuery({
    id: post.id,
    ownerId: ownerPrincipalId,
    search: toPercolatorSearch(post.search),
    ...(post.search.options?.minScore !== undefined
      ? { minScore: post.search.options.minScore }
      : {}),
    ...(post.expiresAtMs !== undefined ? { expiresAtMs: post.expiresAtMs } : {}),
  });
}

export function createKhoraRelayOnEvent(deps: {
  registration: KhoraRegistrationApi;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  search?: HostSearch;
  subscriptions?: HostSubscriptions;
  social?: SocialRelationshipPersistence;
}): (
  ctx: HostRuntimeEventHandlerCtx,
  event: HostEventUnion<KhoraProfile, KhoraHostAppEvent>,
) => void | Promise<void> {
  const { registration, tenantKey, cluster, publicationClient, search, subscriptions, social } =
    deps;
  return async (
    ctx: HostRuntimeEventHandlerCtx,
    event: HostEventUnion<KhoraProfile, KhoraHostAppEvent>,
  ): Promise<void> => {
    if (event.kind === HOST_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
      const req = event.payload.request;
      try {
        const meta = parseKhoraRegistrationMetadata(req.metadata);
        const profile = zKhoraProfile.parse({
          id: crypto.randomUUID(),
          username: meta.username,
          displayName: meta.displayName,
          bio: meta.bio,
        });
        registration.applyProfileUsernameAndMaps({
          principalId: req.principalId,
          username: meta.username,
          profileUpsert: { id: profile.id, bodyJson: JSON.stringify(profile) },
        });
        if (search !== undefined) {
          await search.indexer.indexProfile(profile);
        }
        event.payload.fulfill(profile);
      } catch (e) {
        event.payload.reject(e);
      }
      return;
    }

    if (
      event.kind === HOST_EVENT_KIND.PROFILE_CREATED ||
      event.kind === HOST_EVENT_KIND.PROFILE_UPDATED
    ) {
      const profile = event.payload.profile;
      ctx.persistenceClient.upsertProfile({
        id: profile.id,
        bodyJson: JSON.stringify(profile),
      });
      if (search !== undefined) {
        await search.indexer.indexProfile(profile);
      }
      return;
    }

    if (event.kind === KHORA_EVENT_KIND.POST_CREATED) {
      const post = event.payload.post;
      const address = decodePostId(post.id);
      if (post.kind === "subscription" && subscriptions !== undefined && address !== undefined) {
        await registerSubscriptionQuery(subscriptions, post, address.authorPrincipalId);
      }
      const result = await publishPost({
        ctx,
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOut: true,
        search,
        subscriptions,
        social,
      });
      // Push live inbox notifications to any connected WebSocket subscribers.
      const { inboxHub, notificationBuffer } = ctx;
      if (
        inboxHub !== undefined &&
        notificationBuffer !== undefined &&
        result.generated_inbox_refs.length > 0
      ) {
        const authorPrincipalId = address?.authorPrincipalId;
        await Promise.all(
          result.generated_inbox_refs.map((ref) =>
            deliverNotification(notificationBuffer, inboxHub, ref.recipient_principal_id, {
              kind: "inbox_post",
              payload: {
                postId: post.id,
                postKind: post.kind,
                authorPrincipalId,
                subscriptionMatches: result.byRecipient.get(ref.recipient_principal_id) ?? [],
              },
            }),
          ),
        );
      }
      if (search !== undefined) {
        await search.indexer.indexPost(post);
      }
      return;
    }

    if (event.kind === KHORA_EVENT_KIND.POST_UPDATED) {
      const post = event.payload.post;
      const previous = event.payload.previous;
      const address = decodePostId(post.id);
      if (previous.kind === "subscription" && subscriptions !== undefined) {
        await subscriptions.percolator.deactivateQuery(previous.id);
      }
      await deletePostOutboxRecord(cluster, previous.id);
      if (post.kind === "subscription" && subscriptions !== undefined && address !== undefined) {
        await registerSubscriptionQuery(subscriptions, post, address.authorPrincipalId);
      }
      await publishPost({
        ctx,
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOut: false,
      });
      if (search !== undefined) {
        await search.indexer.indexPost(post, previous.id);
      }
      return;
    }

    if (event.kind === KHORA_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      if (post.kind === "subscription" && subscriptions !== undefined) {
        await subscriptions.percolator.deactivateQuery(post.id);
      }
      await deletePostOutboxRecord(cluster, post.id);
      if (search !== undefined) {
        await search.indexer.deletePost(post);
      }
    }
  };
}

/** Assign a new address-encoded post id before create/update HTTP handlers notify the relay. */
export function assignPostAddress(params: {
  cluster: KhoraColonnadeCluster;
  authorPrincipalId: string;
}): { recordKey: string; cellPoolCount: number } {
  const recordKey = randomId("ob");
  return { recordKey, cellPoolCount: params.cluster.cellPoolCount };
}

export { encodePostId } from "../lib/post-address-id";
