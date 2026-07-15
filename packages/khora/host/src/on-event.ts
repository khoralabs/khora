import type {
  ColonnadePublicationClient,
  PostOperationOutput,
} from "@khoralabs/colonnade-persistence";
import { randomId } from "@khoralabs/colonnade-persistence";
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
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import type { StandingQuery } from "@khoralabs/percolator";
import type { KhoraHostCatalogApi } from "./catalog-facade";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import { toPercolatorSearch } from "./percolator/adapter";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import { buildPercolatorCandidateFromPost } from "./percolator/candidate";
import type { KhoraColonnadeCluster } from "./ports";
import { decodePostId } from "./post-address-id";
import { canDeliverPostToRecipient } from "./post-visibility";
import { deletePostOutboxRecord } from "./resolve-post";
import {
  deliverNotification,
  HOST_EVENT_KIND,
  type HostEventUnion,
  type HostRuntimeEventHandlerCtx,
  type SocialRelationshipPersistence,
} from "./runtime";

const postEncoder = new TextEncoder();

async function postLexicalVector(
  post: KhoraPost,
  memories: KhoraMemoriesHost | undefined,
): Promise<{ lexicalText: string; vector?: number[] }> {
  const lexicalText = khoraPostIndexableLexicalText(post);
  if (memories?.embeddingModel === undefined || lexicalText.trim().length === 0) {
    return { lexicalText };
  }
  try {
    const vectors = await embedTextChunks(memories.embeddingModel, [lexicalText]);
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
  memories?: KhoraMemoriesHost;
  percolator?: KhoraPercolatorHost;
  social?: SocialRelationshipPersistence;
}): Promise<PostOperationOutput & { byRecipient: Map<string, InboxSubscriptionMatch[]> }> {
  const { ctx, tenantKey, post, cluster, publicationClient, fanOut, memories, percolator, social } =
    params;
  const address = decodePostId(post.id);
  if (address === undefined) {
    throw new Error("publishPost: post.id is not a valid address-encoded id");
  }
  if (cluster.cellPoolCount !== undefined && address.cellPoolCount !== cluster.cellPoolCount) {
    throw new Error("publishPost: post id cell pool count does not match cluster");
  }

  const authorPrincipalId = address.authorPrincipalId;
  const authorCellId = address.authorCellId;
  const payload_bytes = postEncoder.encode(JSON.stringify(post));

  const byRecipient = new Map<string, InboxSubscriptionMatch[]>();
  if (fanOut && percolator !== undefined && memories !== undefined && social !== undefined) {
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
      const { lexicalText, vector } = await postLexicalVector(post, memories);
      const candidate = buildPercolatorCandidateFromPost({
        post,
        authorPrincipalId,
        authorProfileId,
        namespaceRoot: memories.namespaceRoot,
        lexicalText,
        vector,
      });
      const matches = await percolator.percolator.evaluateCandidate(candidate);
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
  percolator: KhoraPercolatorHost,
  post: KhoraPost,
  ownerPrincipalId: string,
): Promise<StandingQuery | undefined> {
  if (post.kind !== "subscription" || post.search === undefined) return Promise.resolve(undefined);
  return percolator.percolator.registerQuery({
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
  catalog: KhoraHostCatalogApi;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  memories?: KhoraMemoriesHost;
  percolator?: KhoraPercolatorHost;
  social?: SocialRelationshipPersistence;
}): (
  ctx: HostRuntimeEventHandlerCtx,
  event: HostEventUnion<KhoraProfile, KhoraHostAppEvent>,
) => void | Promise<void> {
  const { catalog, tenantKey, cluster, publicationClient, memories, percolator, social } = deps;
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
        catalog.applyProfileUsernameAndMaps({
          principalId: req.principalId,
          username: meta.username,
          profileUpsert: { id: profile.id, bodyJson: JSON.stringify(profile) },
        });
        if (memories !== undefined) {
          await memories.indexer.indexProfile(profile);
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
      if (memories !== undefined) {
        await memories.indexer.indexProfile(profile);
      }
      return;
    }

    if (event.kind === KHORA_EVENT_KIND.POST_CREATED) {
      const post = event.payload.post;
      const address = decodePostId(post.id);
      if (post.kind === "subscription" && percolator !== undefined && address !== undefined) {
        await registerSubscriptionQuery(percolator, post, address.authorPrincipalId);
      }
      const result = await publishPost({
        ctx,
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOut: true,
        memories,
        percolator,
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
      if (memories !== undefined) {
        await memories.indexer.indexPost(post);
      }
      return;
    }

    if (event.kind === KHORA_EVENT_KIND.POST_UPDATED) {
      const post = event.payload.post;
      const previous = event.payload.previous;
      const address = decodePostId(post.id);
      if (post.kind === "subscription" && percolator !== undefined && address !== undefined) {
        await registerSubscriptionQuery(percolator, post, address.authorPrincipalId);
      }
      await publishPost({
        ctx,
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOut: false,
      });
      if (memories !== undefined) {
        await memories.indexer.indexPost(post, previous.id);
      }
      return;
    }

    if (event.kind === KHORA_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      if (post.kind === "subscription" && percolator !== undefined) {
        await percolator.percolator.deactivateQuery(post.id);
      }
      await deletePostOutboxRecord(cluster, post.id);
      if (memories !== undefined) {
        await memories.indexer.deletePost(post);
      }
    }
  };
}

/** Assign a new address-encoded post id before create/update HTTP handlers notify the relay. */
export function assignPostAddress(params: {
  cluster: KhoraColonnadeCluster;
  authorPrincipalId: string;
}): { recordKey: string; cellPoolCount: number } {
  const cellPoolCount = params.cluster.cellPoolCount;
  if (cellPoolCount === undefined) {
    throw new Error("assignPostAddress requires a pool-mode Colonnade cluster");
  }
  const recordKey = randomId("ob");
  return { recordKey, cellPoolCount };
}

export { encodePostId } from "./post-address-id";
