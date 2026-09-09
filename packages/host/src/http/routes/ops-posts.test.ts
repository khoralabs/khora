import { describe, expect, mock, test } from "bun:test";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { OperatorPostFeedReader } from "../../discovery/search/operator-post-feed";
import { OperatorPostFeedBadRequest } from "../../discovery/search/operator-post-feed";
import type { HostRouteDeps } from "./deps";
import { handleOpsPostsList, handleOpsPostsNewerCount } from "./ops-posts";

function hostDeps(
  auth: "ok" | "unauthorized" | "disabled",
  reader: OperatorPostFeedReader | null,
): HostRouteDeps {
  return {
    ctx: {
      search:
        reader === null
          ? undefined
          : ({ operatorPostFeed: reader } as HostRouteDeps["ctx"]["search"]),
    } as HostRouteDeps["ctx"],
    rateLimiters: {} as HostRouteDeps["rateLimiters"],
    adminTokenAuth:
      auth === "disabled"
        ? null
        : {
            async authenticate() {
              return auth === "ok" ? { id: "root", role: "root" } : null;
            },
          },
  };
}

function readerStub(overrides?: Partial<OperatorPostFeedReader>): OperatorPostFeedReader {
  return {
    async list() {
      return { items: [], nextCursor: null, hasMore: false, watermarkMs: 1 };
    },
    async newerCount() {
      return { count: 0 };
    },
    ...overrides,
  };
}

describe("ops posts routes", () => {
  test("401 when admin auth fails", async () => {
    const res = await handleOpsPostsList(
      new Request(`http://x${KHORA_HTTP_PATH.opsPosts}`),
      new URL(`http://x${KHORA_HTTP_PATH.opsPosts}`),
      hostDeps("unauthorized", readerStub()),
    );
    expect(res.status).toBe(401);
  });

  test("503 when feed disabled", async () => {
    const res = await handleOpsPostsList(
      new Request(`http://x${KHORA_HTTP_PATH.opsPosts}`),
      new URL(`http://x${KHORA_HTTP_PATH.opsPosts}`),
      hostDeps("ok", null),
    );
    expect(res.status).toBe(503);
  });

  test("lists with filters; 400 on bad cursor", async () => {
    const list = mock(async (params) => {
      expect(params.authorDid).toBe("did:key:a");
      expect(params.tags).toEqual(["buy", "ltl"]);
      return { items: [], nextCursor: null, hasMore: false, watermarkMs: 9 };
    });
    const ok = await handleOpsPostsList(
      new Request(
        `http://x${KHORA_HTTP_PATH.opsPosts}?limit=5&authorDid=did:key:a&tag=buy&tag=ltl`,
      ),
      new URL(`http://x${KHORA_HTTP_PATH.opsPosts}?limit=5&authorDid=did:key:a&tag=buy&tag=ltl`),
      hostDeps("ok", readerStub({ list })),
    );
    expect(ok.status).toBe(200);

    const bad = await handleOpsPostsList(
      new Request(`http://x${KHORA_HTTP_PATH.opsPosts}?cursor=bad`),
      new URL(`http://x${KHORA_HTTP_PATH.opsPosts}?cursor=bad`),
      hostDeps(
        "ok",
        readerStub({
          async list() {
            throw new OperatorPostFeedBadRequest("malformed cursor");
          },
        }),
      ),
    );
    expect(bad.status).toBe(400);
  });

  test("newer-count forwards afterMs", async () => {
    const newerCount = mock(async (params) => {
      expect(params.afterMs).toBe(42);
      return { count: 3 };
    });
    const res = await handleOpsPostsNewerCount(
      new Request(`http://x${KHORA_HTTP_PATH.opsPostsNewerCount}?afterMs=42`),
      new URL(`http://x${KHORA_HTTP_PATH.opsPostsNewerCount}?afterMs=42`),
      hostDeps("ok", readerStub({ newerCount })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 3 });
  });
});
