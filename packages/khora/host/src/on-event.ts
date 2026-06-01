import {
  AGENT_RELAY_EVENT_KIND,
  type AgentRelayEventHandlerCtx,
  type AgentRelayEventUnion,
  type InboxPostReason,
} from "@khoralabs/agent-relay";
import type {
  ColonnadePublicationClient,
  PostOperationOutput,
} from "@khoralabs/colonnade-persistence";
import { randomId } from "@khoralabs/colonnade-persistence";
import {
  type KhoraPost,
  type KhoraProfile,
  khoraPostLexicalText,
  khoraSubscriptionLexicalText,
  parseKhoraRegistrationMetadata,
  zKhoraProfile,
} from "@khoralabs/khora-contracts";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import type { SocialRelationshipPersistence } from "@khoralabs/relay-colonnade";
import type { KhoraHostCatalogApi } from "./catalog-facade";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import { toPercolatorSearch } from "./percolator/adapter";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import { buildPercolatorCandidateFromPost } from "./percolator/candidate";
import type { KhoraColonnadeCluster } from "./ports";
import { decodePostId } from "./post-address-id";
import { canDeliverPostToRecipient } from "./post-visibility";
import { deletePostOutboxRecord } from "./resolve-post";

const postEncoder = new TextEncoder();

async function postLexicalVector(
  post: KhoraPost,
  memories: KhoraMemoriesHost | undefined,
): Promise<{ lexicalText: string; vector?: number[] }> {
  const lexicalText =
    post.kind === "subscription" ? khoraSubscriptionLexicalText(post) : khoraPostLexicalText(post);
  if (memories?.embeddingModel === undefined) {
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
  ctx: AgentRelayEventHandlerCtx;
  tenantKey: string;
  post: KhoraPost;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  fanOut: boolean;
  memories?: KhoraMemoriesHost;
  percolator?: KhoraPercolatorHost;
  social?: SocialRelationshipPersistence;
}): Promise<PostOperationOutput> {
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

  const byRecipient = new Map<string, InboxPostReason[]>();
  if (fanOut && percolator !== undefined && memories !== undefined && social !== undefined) {
    const addReason = (recipientId: string, reason: InboxPostReason): void => {
      if (recipientId === authorPrincipalId) return;
      const cur = byRecipient.get(recipientId);
      if (cur === undefined) {
        byRecipient.set(recipientId, [reason]);
      } else {
        cur.push(reason);
      }
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
          addReason(match.ownerId, {
            kind: "standing_query",
            queryPostId: match.queryId,
            score: match.score,
          });
        }
      }
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

  return publicationClient.postOperation({
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
}

function registerSubscriptionQuery(
  percolator: KhoraPercolatorHost,
  post: KhoraPost,
  ownerPrincipalId: string,
): void {
  if (post.kind !== "subscription" || post.search === undefined) return;
  percolator.percolator.registerQuery({
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
  ctx: AgentRelayEventHandlerCtx,
  event: AgentRelayEventUnion<KhoraProfile, KhoraPost, unknown, never>,
) => void | Promise<void> {
  const { catalog, tenantKey, cluster, publicationClient, memories, percolator, social } = deps;
  return async (
    ctx: AgentRelayEventHandlerCtx,
    event: AgentRelayEventUnion<KhoraProfile, KhoraPost, unknown, never>,
  ): Promise<void> => {
    if (event.kind === AGENT_RELAY_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
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
      event.kind === AGENT_RELAY_EVENT_KIND.PROFILE_CREATED ||
      event.kind === AGENT_RELAY_EVENT_KIND.PROFILE_UPDATED
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

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_CREATED) {
      const post = event.payload.post;
      const address = decodePostId(post.id);
      if (post.kind === "subscription" && percolator !== undefined && address !== undefined) {
        registerSubscriptionQuery(percolator, post, address.authorPrincipalId);
      }
      await publishPost({
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
      if (memories !== undefined) {
        await memories.indexer.indexPost(post);
      }
      return;
    }

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_UPDATED) {
      const post = event.payload.post;
      const previous = event.payload.previous;
      const address = decodePostId(post.id);
      if (post.kind === "subscription" && percolator !== undefined && address !== undefined) {
        registerSubscriptionQuery(percolator, post, address.authorPrincipalId);
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

    if (event.kind === AGENT_RELAY_EVENT_KIND.POST_DELETED) {
      const post = event.payload.post;
      if (post.kind === "subscription" && percolator !== undefined) {
        percolator.percolator.deactivateQuery(post.id);
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
