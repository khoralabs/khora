import { describe, expect, test } from "bun:test";
import { InMemoryCatalogPersistence } from "@khoralabs/colonnade/persistence";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import { KHORA_ERROR_CODE, KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { KhoraHostContext } from "../..";
import { createMapBackedPublicPostFeedHarness } from "../../discovery/feed/public-post-feed.contract";
import type { HostRouteDeps } from "./deps";
import { handleOpsPostsList, handleOpsPostsNewerCount } from "./ops-posts";

const ROOT_TOKEN = "test-root-token-16chars";

describe("ops posts feed", () => {
  const adminTokenAuth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

  function harnessDeps() {
    const harness = createMapBackedPublicPostFeedHarness({
      catalog: new InMemoryCatalogPersistence(),
    });
    const deps: HostRouteDeps = {
      ctx: {
        publicPostFeed: harness.reader,
      } as unknown as KhoraHostContext,
      rateLimiters: {} as HostRouteDeps["rateLimiters"],
      adminTokenAuth,
    };
    return { harness, deps };
  }

  function bearer(url: string, method = "GET"): Request {
    return new Request(url, {
      method,
      headers: { Authorization: `Bearer ${ROOT_TOKEN}` },
    });
  }

  test("list rejects missing auth", async () => {
    const { deps } = harnessDeps();
    const url = new URL(`http://x${KHORA_HTTP_PATH.opsPosts}`);
    const res = await handleOpsPostsList(new Request(url), url, deps);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(KHORA_ERROR_CODE.unauthorized);
  });

  test("list returns 503 when admin auth not configured", async () => {
    const { deps } = harnessDeps();
    deps.adminTokenAuth = null;
    const url = new URL(`http://x${KHORA_HTTP_PATH.opsPosts}`);
    const res = await handleOpsPostsList(bearer(url.toString()), url, deps);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(KHORA_ERROR_CODE.admin_auth_not_configured);
  });

  test("list returns seeded posts with tag filter and order", async () => {
    const { harness, deps } = harnessDeps();
    await harness.seedPublicPost({
      authorDid: "did:author",
      recordKey: "rk1",
      topics: ["climate", "news"],
      publishedAtMs: 300,
      body: "newer",
    });
    await harness.seedPublicPost({
      authorDid: "did:author",
      recordKey: "rk2",
      topics: ["climate"],
      publishedAtMs: 100,
      body: "older",
    });
    await harness.seedPublicPost({
      authorDid: "did:author",
      recordKey: "rk3",
      topics: ["other"],
      publishedAtMs: 200,
      body: "skipped",
    });

    const url = new URL(`http://x${KHORA_HTTP_PATH.opsPosts}?tag=climate&tag=news&limit=10`);
    const res = await handleOpsPostsList(bearer(url.toString()), url, deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ body?: string; publishedAtMs: number }>;
    };
    expect(body.items.map((i) => i.body)).toEqual(["newer"]);
    expect(body.items[0]?.publishedAtMs).toBe(300);
  });

  test("list paginates via cursor and filters by authorDid", async () => {
    const { harness, deps } = harnessDeps();
    await harness.seedPublicPost({
      authorDid: "did:alice",
      recordKey: "a1",
      topics: [],
      publishedAtMs: 300,
      body: "a-new",
    });
    await harness.seedPublicPost({
      authorDid: "did:alice",
      recordKey: "a2",
      topics: [],
      publishedAtMs: 200,
      body: "a-old",
    });
    await harness.seedPublicPost({
      authorDid: "did:bob",
      recordKey: "b1",
      topics: [],
      publishedAtMs: 250,
      body: "bob",
    });

    const page1Url = new URL(`http://x${KHORA_HTTP_PATH.opsPosts}?authorDid=did:alice&limit=1`);
    const page1Res = await handleOpsPostsList(bearer(page1Url.toString()), page1Url, deps);
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as {
      items: Array<{ body?: string }>;
      nextCursor: string | null;
      hasMore: boolean;
    };
    expect(page1.items.map((i) => i.body)).toEqual(["a-new"]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2Url = new URL(
      `http://x${KHORA_HTTP_PATH.opsPosts}?authorDid=did:alice&limit=1&cursor=${encodeURIComponent(page1.nextCursor ?? "")}`,
    );
    const page2Res = await handleOpsPostsList(bearer(page2Url.toString()), page2Url, deps);
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as {
      items: Array<{ body?: string }>;
      hasMore: boolean;
    };
    expect(page2.items.map((i) => i.body)).toEqual(["a-old"]);
    expect(page2.hasMore).toBe(false);
  });

  test("list rejects bad limit", async () => {
    const { deps } = harnessDeps();
    const url = new URL(`http://x${KHORA_HTTP_PATH.opsPosts}?limit=nope`);
    const res = await handleOpsPostsList(bearer(url.toString()), url, deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(KHORA_ERROR_CODE.invalid_request);
  });

  test("newer-count requires afterMs and rejects bad values", async () => {
    const { deps } = harnessDeps();
    const missingUrl = new URL(`http://x${KHORA_HTTP_PATH.opsPostsNewerCount}`);
    const missing = await handleOpsPostsNewerCount(bearer(missingUrl.toString()), missingUrl, deps);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { code: string }).code).toBe(
      KHORA_ERROR_CODE.invalid_request,
    );

    const badUrl = new URL(`http://x${KHORA_HTTP_PATH.opsPostsNewerCount}?afterMs=abc`);
    const bad = await handleOpsPostsNewerCount(bearer(badUrl.toString()), badUrl, deps);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe(KHORA_ERROR_CODE.invalid_request);
  });

  test("newer-count returns count from catalog harness", async () => {
    const { harness, deps } = harnessDeps();
    await harness.seedPublicPost({
      authorDid: "did:author",
      recordKey: "rk1",
      topics: ["x"],
      publishedAtMs: 300,
      body: "new",
    });
    await harness.seedPublicPost({
      authorDid: "did:author",
      recordKey: "rk2",
      topics: ["x"],
      publishedAtMs: 100,
      body: "old",
    });

    const expected = await harness.reader.newerCount({ afterMs: 150, tags: ["x"] });
    const url = new URL(`http://x${KHORA_HTTP_PATH.opsPostsNewerCount}?afterMs=150&tag=x`);
    const res = await handleOpsPostsNewerCount(bearer(url.toString()), url, deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(expected.count);
    expect(body.count).toBe(1);
  });
});
