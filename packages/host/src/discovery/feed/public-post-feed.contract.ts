import { describe, expect, test } from "bun:test";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade/crypto";
import type { CatalogPersistence } from "@khoralabs/colonnade/persistence";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import { encodePostId } from "../../lib/post-address-id";
import type { PostResolver } from "../../ports";
import {
  createCatalogPublicPostFeedReader,
  PublicPostFeedBadRequest,
  type PublicPostFeedReader,
} from "./public-post-feed";

export type PublicPostFeedContractHarness = {
  tenantKey: string;
  catalog: CatalogPersistence;
  reader: PublicPostFeedReader;
  seedPublicPost(input: {
    authorDid: string;
    recordKey: string;
    topics: string[];
    publishedAtMs: number;
    body: string;
  }): Promise<{ postId: string }>;
  ghostPost(postId: string): Promise<void>;
};

export type PublicPostFeedContractFactory = () =>
  | PublicPostFeedContractHarness
  | Promise<PublicPostFeedContractHarness>;

/**
 * Map-backed post resolver + catalog pointer seeder for feed contract entrypoints
 * and ops HTTP success-path tests.
 */
export function createMapBackedPublicPostFeedHarness(opts: {
  catalog: CatalogPersistence;
  tenantKey?: string;
}): PublicPostFeedContractHarness {
  const tenantKey = opts.tenantKey ?? "t";
  const posts = new Map<string, KhoraPost>();
  let seq = 0;

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

  const catalog = opts.catalog;
  const reader = createCatalogPublicPostFeedReader({
    catalog,
    tenantKey,
    postResolver,
  });

  return {
    tenantKey,
    catalog,
    reader,
    async seedPublicPost(input) {
      const postId = encodePostId({
        authorPrincipalId: input.authorDid,
        recordKey: input.recordKey,
        cellPoolCount: 1,
      });
      const post: KhoraPost = {
        id: postId,
        authorProfileId: "prof",
        kind: "post",
        topics: input.topics,
        body: input.body,
        authorSignature: TEST_POST_AUTHOR_SIGNATURE,
        visibility: "public",
      };
      posts.set(postId, post);
      const catalog_pointer_id =
        catalog.nextCatalogPointerId?.(tenantKey) ?? `cptr_0000_${String(++seq).padStart(24, "0")}`;
      await catalog.upsertCatalogPointer({
        catalog_pointer_id,
        tenant_key: tenantKey,
        publication_key: postId,
        publisher_principal_id: input.authorDid,
        published_at_ms: input.publishedAtMs,
        tags: input.topics,
        locator: {
          cell_id: "c",
          record_key: input.recordKey,
          cell_pool_count: 1,
        },
        content_hash: "a".repeat(64),
        public_projection: { kind: "post" },
      });
      return { postId };
    },
    async ghostPost(postId) {
      posts.delete(postId);
    },
  };
}

/**
 * Shared host public-feed contract: hydrate + list/count semantics over any
 * {@link CatalogPersistence}. Call from each backend entrypoint test file.
 */
export function runPublicPostFeedContractTests(
  name: string,
  create: PublicPostFeedContractFactory,
): void {
  describe(`public post feed contract: ${name}`, () => {
    test("lists hydrated posts in published_at order with tag AND filter", async () => {
      const h = await create();
      const author = "did:author";
      await h.seedPublicPost({
        authorDid: author,
        recordKey: "rk1",
        topics: ["a", "b"],
        publishedAtMs: 300,
        body: "body-1",
      });
      await h.seedPublicPost({
        authorDid: author,
        recordKey: "rk2",
        topics: ["a"],
        publishedAtMs: 200,
        body: "body-2",
      });
      await h.seedPublicPost({
        authorDid: author,
        recordKey: "rk3",
        topics: ["a", "b"],
        publishedAtMs: 100,
        body: "body-3",
      });

      const page = await h.reader.list({ limit: 10, tags: ["a", "b"] });
      expect(page.items.map((i) => i.body)).toEqual(["body-1", "body-3"]);
      expect(page.items[0]?.publishedAtMs).toBe(300);
    });

    test("filters by authorDid", async () => {
      const h = await create();
      await h.seedPublicPost({
        authorDid: "did:alice",
        recordKey: "a1",
        topics: [],
        publishedAtMs: 200,
        body: "alice",
      });
      await h.seedPublicPost({
        authorDid: "did:bob",
        recordKey: "b1",
        topics: [],
        publishedAtMs: 100,
        body: "bob",
      });

      const page = await h.reader.list({ limit: 10, authorDid: "did:alice" });
      expect(page.items.map((i) => i.body)).toEqual(["alice"]);
    });

    test("paginates with cursor", async () => {
      const h = await create();
      const author = "did:author";
      await h.seedPublicPost({
        authorDid: author,
        recordKey: "rk1",
        topics: [],
        publishedAtMs: 300,
        body: "body-1",
      });
      await h.seedPublicPost({
        authorDid: author,
        recordKey: "rk2",
        topics: [],
        publishedAtMs: 200,
        body: "body-2",
      });
      await h.seedPublicPost({
        authorDid: author,
        recordKey: "rk3",
        topics: [],
        publishedAtMs: 100,
        body: "body-3",
      });

      const page1 = await h.reader.list({ limit: 2 });
      expect(page1.items.map((i) => i.body)).toEqual(["body-1", "body-2"]);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await h.reader.list({
        limit: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.items.map((i) => i.body)).toEqual(["body-3"]);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();
    });

    test("newerCount respects afterMs, authorDid, and tags AND", async () => {
      const h = await create();
      await h.seedPublicPost({
        authorDid: "did:alice",
        recordKey: "a1",
        topics: ["a", "b"],
        publishedAtMs: 300,
        body: "a1",
      });
      await h.seedPublicPost({
        authorDid: "did:alice",
        recordKey: "a2",
        topics: ["a"],
        publishedAtMs: 200,
        body: "a2",
      });
      await h.seedPublicPost({
        authorDid: "did:bob",
        recordKey: "b1",
        topics: ["a", "b"],
        publishedAtMs: 250,
        body: "b1",
      });

      const newer = await h.reader.newerCount({
        afterMs: 150,
        authorDid: "did:alice",
        tags: ["a", "b"],
      });
      expect(newer.count).toBe(1);
    });

    test("skips ghosts and deletes catalog rows", async () => {
      const h = await create();
      const { postId } = await h.seedPublicPost({
        authorDid: "did:a",
        recordKey: "ghost",
        topics: [],
        publishedAtMs: 1,
        body: "gone",
      });
      await h.ghostPost(postId);

      const page = await h.reader.list({ limit: 10 });
      expect(page.items).toEqual([]);
      const remaining = await h.catalog.listPublicationPointers({
        tenant_key: h.tenantKey,
        limit: 10,
      });
      expect(remaining.entries).toEqual([]);
    });

    test("validation rejects empty authorDid, empty tag, bad limit, bad afterMs", async () => {
      const h = await create();

      await expect(h.reader.list({ limit: 10, authorDid: "  " })).rejects.toBeInstanceOf(
        PublicPostFeedBadRequest,
      );
      await expect(h.reader.list({ limit: 10, tags: [""] })).rejects.toBeInstanceOf(
        PublicPostFeedBadRequest,
      );
      await expect(h.reader.list({ limit: 0 })).rejects.toBeInstanceOf(PublicPostFeedBadRequest);
      await expect(h.reader.newerCount({ afterMs: Number.NaN })).rejects.toBeInstanceOf(
        PublicPostFeedBadRequest,
      );
      await expect(h.reader.newerCount({ afterMs: 1, authorDid: "" })).rejects.toBeInstanceOf(
        PublicPostFeedBadRequest,
      );
    });
  });
}
