import { describe, expect, mock, test } from "bun:test";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade";
import { principalHomeCellId } from "@khoralabs/colonnade";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade/crypto";
import { InMemoryCatalogPersistence } from "@khoralabs/colonnade/persistence";
import { KHORA_EVENT_KIND, type KhoraPost, type KhoraProfile } from "@khoralabs/khora-contracts";
import type { HostRuntimeEventHandlerCtx } from "../host/runtime";
import { createHostPersistenceClient } from "../persistence/core/client";
import { createInMemoryKhoraHostPersistence } from "../persistence/core/in-memory";
import type { KhoraColonnadeCluster } from "../ports";
import { assignPostAddress, createKhoraRelayOnEvent, encodePostId } from "./on-event";

function stubCluster(): KhoraColonnadeCluster {
  return {
    cellPoolCount: 1,
    catalog: new InMemoryCatalogPersistence(),
    resolveCell() {
      throw new Error("unused");
    },
    assignPrincipalToCell(principalId: string) {
      return principalHomeCellId(principalId);
    },
    close() {},
  };
}

describe("catalog publication lifecycle", () => {
  test("public post sets catalog_publication; private omits it", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const persistence = createInMemoryKhoraHostPersistence();
    persistence.profiles.upsert({
      id: authorProfile.id,
      bodyJson: JSON.stringify(authorProfile),
    });
    persistence.registrations.upsert("did:author", authorProfile.id);
    const persistenceClient = createHostPersistenceClient(persistence);
    const cluster = stubCluster();
    const authorPrincipalId = "did:author";

    const captured: Array<{ catalog_publication?: unknown }> = [];
    const publicationClient = {
      postOperation: mock(async (op) => {
        captured.push({ catalog_publication: op.routing.catalog_publication });
        return {
          outbox_record_key: "rk",
          content_hash: "0".repeat(64),
          catalog_pointer_id: "",
          generated_inbox_refs: [],
        };
      }),
    } as unknown as ColonnadePublicationClient;

    const onEvent = createKhoraRelayOnEvent({
      registration: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient,
    });
    const ctx = { persistence, persistenceClient } as HostRuntimeEventHandlerCtx;

    const publicAddr = assignPostAddress({ cluster, authorPrincipalId });
    const publicPost: KhoraPost = {
      id: encodePostId({
        authorPrincipalId,
        recordKey: publicAddr.recordKey,
        cellPoolCount: publicAddr.cellPoolCount,
      }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["climate"],
      title: "Hello",
      body: "world",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "public",
    };
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post: publicPost },
    } as never);

    expect(captured[0]?.catalog_publication).toEqual({
      publication_key: publicPost.id,
      tags: ["climate"],
      public_projection: { kind: "post", title: "Hello" },
    });

    const privateAddr = assignPostAddress({ cluster, authorPrincipalId });
    const privatePost: KhoraPost = {
      id: encodePostId({
        authorPrincipalId,
        recordKey: privateAddr.recordKey,
        cellPoolCount: privateAddr.cellPoolCount,
      }),
      authorProfileId: authorProfile.id,
      kind: "post",
      topics: ["secret"],
      body: "nope",
      authorSignature: TEST_POST_AUTHOR_SIGNATURE,
      visibility: "private",
    };
    await onEvent(ctx, {
      kind: KHORA_EVENT_KIND.POST_CREATED,
      payload: { post: privatePost },
    } as never);
    expect(captured[1]?.catalog_publication).toBeUndefined();
  });

  test("POST_DELETED removes catalog publication by previous id", async () => {
    const authorProfile: KhoraProfile = {
      id: "prof-author",
      username: "author",
      displayName: "Author",
    };
    const persistence = createInMemoryKhoraHostPersistence();
    persistence.profiles.upsert({
      id: authorProfile.id,
      bodyJson: JSON.stringify(authorProfile),
    });
    persistence.registrations.upsert("did:author", authorProfile.id);
    const persistenceClient = createHostPersistenceClient(persistence);
    const catalog = new InMemoryCatalogPersistence();
    const cluster: KhoraColonnadeCluster = {
      cellPoolCount: 1,
      catalog,
      resolveCell() {
        return {
          deleteOutboxRecord: async () => {},
        } as never;
      },
      assignPrincipalToCell(principalId: string) {
        return principalHomeCellId(principalId);
      },
      close() {},
    };

    const authorPrincipalId = "did:author";
    const addr = assignPostAddress({ cluster, authorPrincipalId });
    const postId = encodePostId({
      authorPrincipalId,
      recordKey: addr.recordKey,
      cellPoolCount: addr.cellPoolCount,
    });
    await catalog.upsertCatalogPointer({
      catalog_pointer_id: "cptr_0000_aaaaaaaaaaaaaaaaaaaaaaaa",
      tenant_key: "relay",
      publication_key: postId,
      publisher_principal_id: authorPrincipalId,
      published_at_ms: 1,
      tags: ["x"],
      locator: { cell_id: "c", record_key: addr.recordKey, cell_pool_count: 1 },
      content_hash: "0".repeat(64),
      public_projection: {},
    });

    const onEvent = createKhoraRelayOnEvent({
      registration: {} as never,
      tenantKey: "relay",
      cluster,
      publicationClient: {
        postOperation: mock(async () => ({
          outbox_record_key: "rk",
          content_hash: "0".repeat(64),
          catalog_pointer_id: "",
          generated_inbox_refs: [],
        })),
      } as unknown as ColonnadePublicationClient,
    });

    await onEvent(
      { persistence, persistenceClient } as HostRuntimeEventHandlerCtx,
      {
        kind: KHORA_EVENT_KIND.POST_DELETED,
        payload: {
          post: {
            id: postId,
            authorProfileId: authorProfile.id,
            kind: "post",
            topics: ["x"],
            body: "bye",
            authorSignature: TEST_POST_AUTHOR_SIGNATURE,
            visibility: "public",
          },
        },
      } as never,
    );

    const listed = await catalog.listPublicationPointers({
      tenant_key: "relay",
      limit: 10,
    });
    expect(listed.entries).toEqual([]);
  });
});
