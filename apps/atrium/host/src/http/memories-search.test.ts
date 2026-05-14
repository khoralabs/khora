import { describe, expect, mock, test } from "bun:test";
import type { HostRouteDeps } from "./deps.ts";
import { handleMemoriesSearch } from "./memories-search.ts";

describe("handleMemoriesSearch", () => {
  test("uses lexical-only search when host has no embedding model", async () => {
    let searchArg: unknown;
    const hybrid = mock(async (_mem: unknown, _params: unknown, arg: unknown) => {
      searchArg = arg;
      return [
        {
          memory_key: "m1",
          kind: "node" as const,
          score: 0.9,
          labels: [{ kind: "person", props: { name: "Ada" } }],
          source_key: "username",
        },
      ];
    });
    const deps = {
      ctx: {
        auth: {
          requireAuthenticatedRequest: async () => ({ did: "did:key:agent" }),
        },
        memories: {},
        host: {
          persistenceClient: {
            profileIdForPrincipal: () => "profile-row-id",
          },
        },
        config: {
          embeddingModel: undefined,
          topicNamespace: undefined,
          profileNamespace: "atrium/profiles",
          postNamespace: "atrium/posts",
          probeNamespace: "atrium/probes",
        },
      },
      memoriesHybridSearchImpl: hybrid,
      invitesRepo: undefined,
      rateLimiters: {
        memoriesSearchDid: () => ({ ok: true, retryAfterSec: 0 }),
      },
      loadPublicProfileForDid: () => null,
    } as unknown as HostRouteDeps;

    const body = JSON.stringify({
      query: "@ada",
      scope: { kind: "posts" },
      limit: 5,
    });
    const req = new Request("http://localhost/v1/memories/search", {
      method: "POST",
      body,
    });
    const res = await handleMemoriesSearch(req, new URL(req.url), deps);
    expect(res.status).toBe(200);
    expect(hybrid).toHaveBeenCalledTimes(1);
    const arg = searchArg as {
      scope: { kind: string };
      options?: { arms?: { lexical?: number; vector?: number } };
    };
    expect(arg.scope.kind).toBe("posts");
    expect(arg.options?.arms).toEqual({ lexical: 1, vector: 0 });
    const json = (await res.json()) as unknown[];
    expect(json).toHaveLength(1);
    expect((json[0] as { memory_key: string }).memory_key).toBe("m1");
  });

  test("rejects topic scope when topicNamespace unset", async () => {
    const hybrid = mock(() => Promise.resolve([]));
    const deps = {
      ctx: {
        auth: {
          requireAuthenticatedRequest: async () => ({ did: "did:key:agent" }),
        },
        memories: {},
        host: { persistenceClient: { profileIdForPrincipal: () => "p1" } },
        config: {
          embeddingModel: undefined,
          topicNamespace: undefined,
          profileNamespace: "a",
          postNamespace: "b",
          probeNamespace: "c",
        },
      },
      memoriesHybridSearchImpl: hybrid,
      invitesRepo: undefined,
      rateLimiters: {
        memoriesSearchDid: () => ({ ok: true, retryAfterSec: 0 }),
      },
      loadPublicProfileForDid: () => null,
    } as unknown as HostRouteDeps;

    const req = new Request("http://localhost/v1/memories/search", {
      method: "POST",
      body: JSON.stringify({ query: "x", scope: { kind: "topics" } }),
    });
    const res = await handleMemoriesSearch(req, new URL(req.url), deps);
    expect(res.status).toBe(400);
    expect(hybrid).toHaveBeenCalledTimes(0);
  });

  test("forwards searchScopeMode to hybrid search", async () => {
    let searchArg: unknown;
    const hybrid = mock(async (_mem: unknown, _params: unknown, arg: unknown) => {
      searchArg = arg;
      return [];
    });
    const deps = {
      ctx: {
        auth: {
          requireAuthenticatedRequest: async () => ({ did: "did:key:agent" }),
        },
        memories: {},
        host: {
          persistenceClient: { profileIdForPrincipal: () => "p1" },
        },
        config: {
          embeddingModel: undefined,
          topicNamespace: undefined,
          profileNamespace: "a",
          postNamespace: "b",
          probeNamespace: "c",
        },
      },
      memoriesHybridSearchImpl: hybrid,
      invitesRepo: undefined,
      rateLimiters: {
        memoriesSearchDid: () => ({ ok: true, retryAfterSec: 0 }),
      },
      loadPublicProfileForDid: () => null,
    } as unknown as HostRouteDeps;

    const req = new Request("http://localhost/v1/memories/search", {
      method: "POST",
      body: JSON.stringify({
        query: "x",
        scope: { kind: "raw", namespace: "atrium/p1" },
        searchScopeMode: "scopeDag",
      }),
    });
    const res = await handleMemoriesSearch(req, new URL(req.url), deps);
    expect(res.status).toBe(200);
    expect(hybrid).toHaveBeenCalledTimes(1);
    expect((searchArg as { searchScopeMode?: string }).searchScopeMode).toBe("scopeDag");
  });
});
