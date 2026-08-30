import { describe, expect, mock, test } from "bun:test";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade";
import { principalHomeCellId } from "@khoralabs/colonnade";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade/crypto";
import {
  authorSubscriptionSearch,
  KHORA_EVENT_KIND,
  type KhoraPost,
  type KhoraProfile,
} from "@khoralabs/khora-contracts";
import { createPercolator } from "@khoralabs/percolator";
import { createInMemoryPercolatorPersistence } from "@khoralabs/percolator/persistence";
import { DEFAULT_HOST_SEARCH_NAMESPACE_ROOT } from "../discovery/search/config";
import type { HostRuntimeEventHandlerCtx } from "../host/runtime";
import { createHostPersistenceClient, type HostPersistence } from "../persistence/core";
import type { KhoraColonnadeCluster } from "../ports";
import { assignPostAddress, createKhoraRelayOnEvent, encodePostId } from "./on-event";

function createMinimalPersistence(profiles: Record<string, KhoraProfile>) {
  const persistence = {
    profiles: {
      upsert: () => {},
      getById: (id: string) => {
        const profile = Object.values(profiles).find((p) => p.id === id);
        return profile === undefined
          ? undefined
          : { id: profile.id, memoryId: null, bodyJson: JSON.stringify(profile), updatedAtMs: 0 };
      },
      getByUsername: () => undefined,
      delete: () => {},
    },
    registration: {
      exists: () => true,
      profileIdForPrincipal: (principalId: string) => profiles[principalId]?.id,
      principalForProfileId: (profileId: string) =>
        Object.entries(profiles).find(([, p]) => p.id === profileId)?.[0],
    },
    social: {
      createRelationship: () => {},
      getRelationship: () => undefined,
      bindPeer: () => {},
      refreshRelationshipTicketExpiry: () => {},
      listRelationshipsForPrincipal: () => [],
      deleteRelationship: () => undefined,
    },
    agentAccountStatus: {
      getStatus: () => undefined,
      setStatus: () => {},
      clearStatus: () => {},
    },
  } as unknown as HostPersistence;
  return { persistence, persistenceClient: createHostPersistenceClient(persistence) };
}

describe("POST_UPDATED cleanup", () => {
  test("deactivates previous subscription query and deletes prior outbox record", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const { persistence, persistenceClient } = createMinimalPersistence({
      "did:author": authorProfile,
    });
    const deletedRecordKeys: string[] = [];
    const cluster: KhoraColonnadeCluster = {
      cellPoolCount: 1,
      resolveCell() {
        return {
          deleteOutboxRecord: async (params: { record_key: string }) => {
            deletedRecordKeys.push(params.record_key);
          },
        } as never;
      },
      assignPrincipalToCell(principalId: string) {
        return principalHomeCellId(principalId);
      },
      close() {},
    };

    const percolatorPersistence = createInMemoryPercolatorPersistence();
    const subscriptions = {
      percolator: createPercolator({ persistence: percolatorPersistence }),
    };

    const authorPrincipalId = "did:author";
    const previousAddr = assignPostAddress({ cluster, authorPrincipalId });
    const previousId = encodePostId({
      authorPrincipalId,
      recordKey: previousAddr.recordKey,
      cellPoolCount: previousAddr.cellPoolCount,
    });
    const nextAddr = assignPostAddress({ cluster, authorPrincipalId });
    const nextId = encodePostId({
      authorPrincipalId,
      recordKey: nextAddr.recordKey,
      cellPoolCount: nextAddr.cellPoolCount,
    });

    const root = DEFAULT_HOST_SEARCH_NAMESPACE_ROOT;
    const previous: KhoraPost = {
      id: previousId,
      authorProfileId: authorProfile.id,
      kind: "subscription",
      search: authorSubscriptionSearch(authorProfile.id, root),
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public",
    };
    const post: KhoraPost = {
      id: nextId,
      authorProfileId: authorProfile.id,
      kind: "subscription",
      search: authorSubscriptionSearch(authorProfile.id, root),
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public",
    };

    await subscriptions.percolator.registerQuery({
      id: previousId,
      ownerId: authorPrincipalId,
      search: { content: {}, options: { labels: { some: ["khora_topic:old"] } } },
    });
    expect((await subscriptions.percolator.getQuery(previousId))?.active).toBe(true);

    const publicationClient = {
      postOperation: mock(async () => {}),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      registration: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      subscriptions,
      social: {
        listRelationshipsForPrincipal: () => [],
      } as never,
    });

    const ctx = { persistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_UPDATED,
      payload: { post, previous },
    } as never);

    expect((await subscriptions.percolator.getQuery(previousId))?.active).toBe(false);
    expect((await subscriptions.percolator.getQuery(nextId))?.active).toBe(true);
    expect(deletedRecordKeys).toEqual([previousAddr.recordKey]);
  });

  test("deletes prior outbox record on non-subscription visibility update", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const { persistence, persistenceClient } = createMinimalPersistence({
      "did:author": authorProfile,
    });
    const deletedRecordKeys: string[] = [];
    const cluster: KhoraColonnadeCluster = {
      cellPoolCount: 1,
      resolveCell() {
        return {
          deleteOutboxRecord: async (params: { record_key: string }) => {
            deletedRecordKeys.push(params.record_key);
          },
        } as never;
      },
      assignPrincipalToCell(principalId: string) {
        return principalHomeCellId(principalId);
      },
      close() {},
    };

    const authorPrincipalId = "did:author";
    const previousAddr = assignPostAddress({ cluster, authorPrincipalId });
    const previousId = encodePostId({
      authorPrincipalId,
      recordKey: previousAddr.recordKey,
      cellPoolCount: previousAddr.cellPoolCount,
    });
    const nextAddr = assignPostAddress({ cluster, authorPrincipalId });
    const nextId = encodePostId({
      authorPrincipalId,
      recordKey: nextAddr.recordKey,
      cellPoolCount: nextAddr.cellPoolCount,
    });

    const previous: KhoraPost = {
      id: previousId,
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["x"],
      body: "was public",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public",
    };
    const post: KhoraPost = {
      id: nextId,
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["x"],
      body: "now network",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "network",
    };

    const publicationClient = {
      postOperation: mock(async () => {}),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      registration: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
      social: {
        listRelationshipsForPrincipal: () => [],
      } as never,
    });

    const ctx = { persistence, persistenceClient } as HostRuntimeEventHandlerCtx;
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_UPDATED,
      payload: { post, previous },
    } as never);

    expect(deletedRecordKeys).toEqual([previousAddr.recordKey]);
  });
});
