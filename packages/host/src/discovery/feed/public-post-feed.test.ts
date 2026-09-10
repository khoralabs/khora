import { describe, expect, test } from "bun:test";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade/crypto";
import { InMemoryCatalogPersistence } from "@khoralabs/colonnade/persistence";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import { encodePostId } from "../../lib/post-address-id";
import type { PostResolver } from "../../ports";
import { createCatalogPublicPostFeedReader } from "./public-post-feed";

describe("catalog public post feed", () => {
  test("lists hydrated posts in published_at order with tag filter", async () => {
    const catalog = new InMemoryCatalogPersistence();
    const posts = new Map<string, KhoraPost>();
    const author = "did:author";
    const mk = async (n: number, topics: string[], at: number) => {
      const id = encodePostId({
        authorPrincipalId: author,
        recordKey: `rk${n}`,
        cellPoolCount: 1,
      });
      const post: KhoraPost = {
        id,
        authorProfileId: "prof",
        kind: "post",
        topics,
        body: `body-${n}`,
        authorSignature: TEST_POST_AUTHOR_SIGNATURE,
        visibility: "public",
      };
      posts.set(id, post);
      await catalog.upsertCatalogPointer({
        catalog_pointer_id: `cptr_0000_${String(n).padStart(24, "0")}`,
        tenant_key: "t",
        publication_key: id,
        publisher_principal_id: author,
        published_at_ms: at,
        tags: topics,
        locator: { cell_id: "c", record_key: `rk${n}`, cell_pool_count: 1 },
        content_hash: "a".repeat(64),
        public_projection: { kind: "post" },
      });
      return id;
    };
    await mk(1, ["a", "b"], 300);
    await mk(2, ["a"], 200);
    await mk(3, ["a", "b"], 100);

    const postResolver: PostResolver = {
      async resolvePostById(id) {
        return posts.get(id);
      },
      async listAuthorOutboxRecords() {
        return [];
      },
      async deletePostOutboxRecord() {
        return false;
      },
    };

    const reader = createCatalogPublicPostFeedReader({
      catalog,
      tenantKey: "t",
      postResolver,
    });

    const page = await reader.list({ limit: 10, tags: ["a", "b"] });
    expect(page.items.map((i) => i.body)).toEqual(["body-1", "body-3"]);
    expect(page.items[0]?.publishedAtMs).toBe(300);

    const newer = await reader.newerCount({ afterMs: 150, tags: ["a"] });
    expect(newer.count).toBe(2);
  });

  test("skips ghosts and deletes catalog rows", async () => {
    const catalog = new InMemoryCatalogPersistence();
    const ghostId = encodePostId({
      authorPrincipalId: "did:a",
      recordKey: "ghost",
      cellPoolCount: 1,
    });
    await catalog.upsertCatalogPointer({
      catalog_pointer_id: "cptr_0000_bbbbbbbbbbbbbbbbbbbbbbbb",
      tenant_key: "t",
      publication_key: ghostId,
      publisher_principal_id: "did:a",
      published_at_ms: 1,
      tags: [],
      locator: { cell_id: "c", record_key: "ghost", cell_pool_count: 1 },
      content_hash: "b".repeat(64),
      public_projection: {},
    });

    const reader = createCatalogPublicPostFeedReader({
      catalog,
      tenantKey: "t",
      postResolver: {
        async resolvePostById() {
          return undefined;
        },
        async listAuthorOutboxRecords() {
          return [];
        },
        async deletePostOutboxRecord() {
          return false;
        },
      },
    });

    const page = await reader.list({ limit: 10 });
    expect(page.items).toEqual([]);
    const remaining = await catalog.listPublicationPointers({ tenant_key: "t", limit: 10 });
    expect(remaining.entries).toEqual([]);
  });
});
