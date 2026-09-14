import type { ColonnadePublicationClient, PostOperationOutput } from "@khoralabs/colonnade";
import { randomId } from "@khoralabs/colonnade";
import {
  KHORA_EVENT_KIND,
  type KhoraHostAppEvent,
  type KhoraPost,
  type KhoraProfile,
  parseKhoraRegistrationMetadata,
  zKhoraProfile,
} from "@khoralabs/khora-contracts";
import type { StandingQuery } from "@khoralabs/percolator";
import type { HostSearch } from "../discovery/search/bootstrap";
import { toPercolatorSearch } from "../discovery/subscriptions/adapter";
import type { HostSubscriptions } from "../discovery/subscriptions/bootstrap";
import { HOST_EVENT_KIND, type HostEventUnion } from "../host/events";
import type { HostRuntimeEventHandlerCtx } from "../host/runtime";
import { decodePostId } from "../lib/post-address-id";
import { fanOutJobId } from "../persistence/core/fan-out-job-id";
import type { FanOutQueuePort } from "../persistence/core/port";
import type { KhoraColonnadeCluster } from "../ports";
import type { KhoraRegistrationApi } from "../registration/api";
import { deletePostOutboxRecord } from "./resolve";

const postEncoder = new TextEncoder();

async function publishPost(params: {
  tenantKey: string;
  post: KhoraPost;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  fanOutJobId?: string;
}): Promise<PostOperationOutput> {
  const { tenantKey, post, cluster, publicationClient } = params;
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

  const visibility = post.visibility ?? "public";
  const catalog_publication =
    visibility === "public"
      ? {
          publication_key: post.id,
          tags: post.topics ?? [],
          public_projection: {
            kind: post.kind,
            ...(typeof post.title === "string" ? { title: post.title } : {}),
          },
        }
      : undefined;

  const output = await publicationClient.postOperation({
    author_principal_id: authorPrincipalId,
    author_cell_id: authorCellId,
    tenant_key: tenantKey,
    cell_pool_count: address.cellPoolCount,
    payload_bytes,
    payload_metadata: { postId: post.id, postKind: post.kind },
    outbox_record_key: address.recordKey,
    ...(params.fanOutJobId !== undefined ? { fan_out_job_id: params.fanOutJobId } : {}),
    routing: {
      ...(catalog_publication !== undefined ? { catalog_publication } : {}),
    },
  });
  return output;
}

function registerSubscriptionQuery(
  subscriptions: HostSubscriptions,
  post: KhoraPost,
  ownerPrincipalId: string,
  ownerOrdinal: number,
): Promise<StandingQuery | undefined> {
  if (post.kind !== "subscription" || post.search === undefined) return Promise.resolve(undefined);
  return subscriptions.percolator.registerQuery({
    id: post.id,
    ownerId: ownerPrincipalId,
    ownerOrdinal,
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
  fanOutQueue: FanOutQueuePort;
}): (
  ctx: HostRuntimeEventHandlerCtx,
  event: HostEventUnion<KhoraProfile, KhoraHostAppEvent>,
) => void | Promise<void> {
  const { registration, tenantKey, cluster, publicationClient, search, subscriptions } = deps;
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
        await registerSubscriptionQuery(
          subscriptions,
          post,
          address.authorPrincipalId,
          registration.ordinalForPrincipal(address.authorPrincipalId),
        );
      }
      const expectedFanOutJobId = fanOutJobId(tenantKey, post.id);
      const result = await publishPost({
        tenantKey,
        post,
        cluster,
        publicationClient,
        fanOutJobId: expectedFanOutJobId,
      });
      if (address === undefined) {
        throw new Error("POST_CREATED: post.id is not a valid address-encoded id");
      }
      const enqueuedId = deps.fanOutQueue.enqueuePlanning(
        {
          tenantKey,
          postId: post.id,
          sourceCellId: address.authorCellId,
          sourceRecordKey: result.outbox_record_key,
          sourceContentHash: result.content_hash,
          cellPoolCount: address.cellPoolCount,
          authorPrincipalId: address.authorPrincipalId,
          postKind: post.kind,
          postMetadata: post,
          visibility: post.visibility ?? "public",
          fanOutPolicy: post.fanOutPolicy ?? "push",
        },
        Date.now(),
      );
      if (enqueuedId !== result.fan_out_job_id || enqueuedId !== expectedFanOutJobId) {
        throw new Error("POST_CREATED: fan-out job id mismatch");
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
      await cluster.catalog.deletePublicationPointer({
        tenant_key: tenantKey,
        publication_key: previous.id,
      });
      if (post.kind === "subscription" && subscriptions !== undefined && address !== undefined) {
        await registerSubscriptionQuery(
          subscriptions,
          post,
          address.authorPrincipalId,
          registration.ordinalForPrincipal(address.authorPrincipalId),
        );
      }
      await publishPost({
        tenantKey,
        post,
        cluster,
        publicationClient,
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
      await cluster.catalog.deletePublicationPointer({
        tenant_key: tenantKey,
        publication_key: post.id,
      });
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
