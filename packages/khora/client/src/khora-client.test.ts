import { describe, expect, mock, test } from "bun:test";
import {
  generateAgentIdentity,
  type PersistableRelaySigner,
  type RelaySigner,
} from "@khoralabs/khora-auth";
import { KhoraClientError, type KhoraClientEvent } from "@khoralabs/khora-transport";
import { KhoraClient } from "./khora-client";

const TEST_AUTHOR_SIGNATURE = "test-post-author-signature";

async function makeSigner(): Promise<PersistableRelaySigner> {
  return generateAgentIdentity();
}

/** Predictable mock signer for assertions that don't care about real crypto. */
function staticSigner(did = "did:key:test"): RelaySigner {
  return {
    did,
    async sign() {
      return new Uint8Array(64);
    },
  };
}

/**
 * Signer that records the second line of every canonical message it signs. The canonical message
 * shape is `METHOD\nPATH\nts\nnonce\nbodyHash` (see `canonicalAgentRequestMessage`), so
 * `recordedPaths` reflects exactly what the transport asked the signer to bind.
 */
function pathRecordingSigner(did = "did:key:rec"): RelaySigner & { recordedPaths: string[] } {
  const recordedPaths: string[] = [];
  return {
    did,
    recordedPaths,
    async sign(message) {
      const text = new TextDecoder().decode(message);
      const path = text.split("\n")[1] ?? "";
      recordedPaths.push(path);
      return new Uint8Array(64);
    },
  };
}

function expectAuthHeaders(init: RequestInit | undefined, did: string): void {
  const h = new Headers(init?.headers);
  expect(h.get("X-Agent-Did")).toBe(did);
  expect(h.get("X-Agent-Timestamp")).not.toBeNull();
  expect(h.get("X-Agent-Nonce")).not.toBeNull();
  expect(h.get("X-Agent-Signature")).not.toBeNull();
}

describe("KhoraClient", () => {
  test("getAgentStatus GET /v1/agent/status returns parsed status", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/agent/status");
      expect(init?.method ?? "GET").toBe("GET");
      expectAuthHeaders(init, "did:key:a");
      return Response.json({
        status: {
          id: "st1",
          kind: "status",
          authorProfileId: "p1",
          body: "On shift",
          authorSignature: TEST_AUTHOR_SIGNATURE,
        },
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const st = await c.getAgentStatus();
    expect(st?.kind).toBe("status");
    expect(st?.body).toBe("On shift");
  });

  test("health requests GET /health on normalized base (no auth headers)", async () => {
    const signer = staticSigner();
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:8787/health");
      expect(init?.method ?? "GET").toBe("GET");
      const h = new Headers(init?.headers);
      expect(h.get("X-Agent-Did")).toBeNull();
      return Response.json({ ok: true });
    });
    const c = new KhoraClient({
      baseUrl: "http://localhost:8787/",
      signer,
      fetch: fetchMock,
    });
    await expect(c.health()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("register POST body uses signer DID and signs request", async () => {
    const signer = await makeSigner();
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, signer.did);
      expect(JSON.parse(String(init?.body))).toEqual({
        did: signer.did,
        metadata: { username: "ada", displayName: "Ada" },
      });
      return Response.json({
        did: signer.did,
        profileId: "prof_minted",
        profile: { id: "prof_minted", username: "ada", displayName: "Ada" },
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.register({
      metadata: { username: "ada", displayName: "Ada" },
    });
    expect(out).toEqual({
      did: signer.did,
      profileId: "prof_minted",
      profile: { id: "prof_minted", username: "ada", displayName: "Ada" },
    });
  });

  test("subscribe receives registration:completed after register", async () => {
    const signer = await makeSigner();
    const fetchMock = mock(async () =>
      Response.json({
        did: signer.did,
        profileId: "prof_minted",
        profile: { id: "prof_minted", username: "ada", displayName: "Ada" },
      }),
    );
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const events: KhoraClientEvent[] = [];
    const off = c.subscribe((e) => events.push(e));
    await c.register({ metadata: { username: "ada", displayName: "Ada" } });
    off();
    await c.register({ metadata: { username: "ada-99", displayName: "Bob" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("registration:completed");
  });

  test("connectInbox emits inbox:notification and signs WS URL", async () => {
    type EvListener = (ev: { data: string }) => void;
    let messageHandler: EvListener | undefined;
    let createdUrl = "";
    class FakeWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      constructor(public url: string) {
        createdUrl = url;
        queueMicrotask(() => {
          messageHandler?.({
            data: JSON.stringify({
              type: "notification",
              id: 42,
              notification: {
                kind: "inbox_post",
                payload: {
                  postId: "p",
                  postKind: "post",
                  subscriptionMatches: [{ subscriptionId: "sub-1", score: 1 }],
                },
              },
            }),
          });
        });
      }
      addEventListener(type: string, fn: EvListener) {
        if (type === "message") messageHandler = fn;
      }
      removeEventListener() {}
      close() {}
    }
    const signer = staticSigner("did:key:agent");
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: mock(async () => new Response(null, { status: 500 })),
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    });
    const events: KhoraClientEvent[] = [];
    c.subscribe((e) => events.push(e));
    let legacyCalled = false;
    await c.connectInbox({
      onNotification: () => {
        expect(events.some((e) => e.type === "inbox:notification")).toBe(true);
        expect(events.some((e) => e.type === "inbox:post")).toBe(true);
        legacyCalled = true;
      },
    });
    await new Promise((r) => queueMicrotask(r));
    expect(legacyCalled).toBe(true);
    const u = new URL(createdUrl);
    expect(u.searchParams.get("did")).toBe("did:key:agent");
    expect(u.searchParams.get("ts")).not.toBeNull();
    expect(u.searchParams.get("nonce")).not.toBeNull();
    expect(u.searchParams.get("sig")).not.toBeNull();
  });

  test("updateProfile PATCH /v1/profile signs request", async () => {
    const signer = staticSigner("did:key:me");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/profile");
      expect(init?.method).toBe("PATCH");
      expectAuthHeaders(init, "did:key:me");
      expect(JSON.parse(String(init?.body))).toEqual({ displayName: "N" });
      return Response.json({
        id: "prof1",
        username: "ada",
        displayName: "N",
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.updateProfile({ displayName: "N" });
    expect(out.displayName).toBe("N");
    expect(out.username).toBe("ada");
  });

  test("updateProfile rename normalizes username via zUsername", async () => {
    const signer = staticSigner("did:key:me");
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ username: "ada-99" });
      return Response.json({ id: "prof1", username: "ada-99" });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.updateProfile({ username: " Ada-99 " });
    expect(out.username).toBe("ada-99");
  });

  test("lookupProfileByUsername GETs encoded path and returns parsed result", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/profile/by-username/ada-99");
      expect(init?.method ?? "GET").toBe("GET");
      return Response.json({
        id: "p2",
        username: "ada-99",
        displayName: "Ada",
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.lookupProfileByUsername(" Ada-99 ");
    expect(out?.did).toBeUndefined();
    expect(out?.profile.username).toBe("ada-99");
  });

  test("lookupProfileByUsername returns null on 404", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async () => Response.json({ error: "nope" }, { status: 404 }));
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    expect(await c.lookupProfileByUsername("ghost")).toBeNull();
  });

  test("listAuthorSubscriptions signs GET /v1/authors/subscriptions", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/authors/subscriptions");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({
        subscriptions: [
          { id: "sub-1", predicate: { authorDid: "did:key:bob" } },
          { id: "sub-2", predicate: { topicSlug: "rust" } },
        ],
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    expect(await c.listAuthorSubscriptions()).toEqual({
      subscriptions: [
        { id: "sub-1", predicate: { authorDid: "did:key:bob" } },
        { id: "sub-2", predicate: { topicSlug: "rust" } },
      ],
    });
  });

  test("createPost sends creation body and signs", async () => {
    const signer = staticSigner("did:key:writer");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:writer");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.body).toBe("hello");
      expect(body.title).toBe("Hi");
      expect(typeof body.authorSignature).toBe("string");
      expect((body.authorSignature as string).length).toBeGreaterThan(0);
      return Response.json({
        id: "khora_post_abc",
        authorProfileId: "u1",
        kind: "post",
        title: "Hi",
        body: "hello",
        authorSignature: TEST_AUTHOR_SIGNATURE,
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.createPost({ body: "hello", title: "Hi" });
    expect(out.id).toBe("khora_post_abc");
    expect(out.authorProfileId).toBe("u1");
  });

  test("createSubscription sends subscription body with kind subscription", async () => {
    const signer = staticSigner("did:key:writer");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:writer");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        kind: "subscription",
        body: "Looking for partners",
        search: { content: { text: "platform partners" } },
        topics: ["platform"],
        visibility: "public",
      });
      expect(typeof body.authorSignature).toBe("string");
      return Response.json({
        id: "khora_sub_abc",
        authorProfileId: "u1",
        kind: "subscription",
        body: "Looking for partners",
        search: { content: { text: "platform partners" } },
        topics: ["platform"],
        visibility: "public",
        authorSignature: TEST_AUTHOR_SIGNATURE,
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.createSubscription({
      body: "Looking for partners",
      search: { content: { text: "platform partners" } },
      topics: ["platform"],
      visibility: "public",
    });
    expect(out.kind).toBe("subscription");
  });

  test("updatePost signs request", async () => {
    const signer = staticSigner("did:key:w");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://h/v1/posts/p1" && init?.method === "GET") {
        return Response.json({
          id: "p1",
          authorProfileId: "u1",
          kind: "post",
          body: "old",
          authorSignature: TEST_AUTHOR_SIGNATURE,
        });
      }
      expect(url).toBe("http://h/v1/posts/p1");
      expect(init?.method).toBe("PATCH");
      expectAuthHeaders(init, "did:key:w");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.body).toBe("x");
      expect(typeof body.authorSignature).toBe("string");
      return Response.json({
        id: "p1",
        authorProfileId: "u1",
        kind: "post",
        body: "x",
        authorSignature: TEST_AUTHOR_SIGNATURE,
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    await c.updatePost("p1", { body: "x" });
  });

  test("deletePost signs request", async () => {
    const signer = staticSigner("did:key:w");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts/p1");
      expect(init?.method).toBe("DELETE");
      expectAuthHeaders(init, "did:key:w");
      return new Response(null, { status: 204 });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    await c.deletePost("p1");
  });

  test("getPost signs GET with encoded post id", async () => {
    const signer = staticSigner("did:key:w");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts/khora_post_abc");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:w");
      return Response.json({
        id: "khora_post_abc",
        authorProfileId: "u1",
        kind: "post",
        body: "hello",
        authorSignature: TEST_AUTHOR_SIGNATURE,
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.getPost("khora_post_abc");
    expect(out.id).toBe("khora_post_abc");
  });

  test("lookupProfileByDid signs GET with encoded did", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/profile/by-did/did%3Akey%3Abob");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({
        id: "p1",
        username: "bob",
        displayName: "Bob",
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.lookupProfileByDid("did:key:bob");
    expect(out?.did).toBe("did:key:bob");
    expect(out?.profile.username).toBe("bob");
  });

  test("non-inbox endpoints still sign pure pathnames", async () => {
    const signer = pathRecordingSigner("did:key:rec");
    const fetchMock = mock(async () => Response.json({ invites: [] }));
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    await c.listInvites();
    expect(signer.recordedPaths).toEqual(["/v1/invites"]);
  });

  test("listInvites signs GET /v1/invites", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/invites");
      expectAuthHeaders(init, "did:key:a");
      return Response.json({ invites: [] });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    await expect(c.listInvites()).resolves.toEqual({ invites: [] });
  });

  test("previewInvite POST /v1/invite/preview", async () => {
    const signer = staticSigner();
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/invite/preview");
      expect(JSON.parse(String(init?.body))).toEqual({ token: "tok" });
      return Response.json({ inviter: null, source: "seed" });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    await expect(c.previewInvite("tok")).resolves.toEqual({
      inviter: null,
      source: "seed",
    });
  });

  test("search GET /v1/search with query params and auth headers", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/search?q=hello&topK=5&neighbors=true");
      expect(init?.method ?? "GET").toBe("GET");
      expectAuthHeaders(init, "did:key:a");
      return Response.json({
        hits: [
          {
            score: 0.5,
            sourceKey: "body",
            original: {
              kind: "post",
              post: {
                id: "post-1",
                kind: "post",
                body: "hello world",
                authorProfileId: "p1",
                authorSignature: TEST_AUTHOR_SIGNATURE,
              },
              authorDid: "did:key:author",
            },
          },
        ],
      });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    const out = await c.search({ q: "hello", topK: 5, neighbors: true });
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0]?.original?.kind).toBe("post");
  });

  test("searchAdvanced POST /v1/search with JSON body", async () => {
    const signer = staticSigner("did:key:b");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/search");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:b");
      expect(JSON.parse(String(init?.body))).toEqual({
        content: { text: "vector query" },
        options: { topK: 3 },
      });
      return Response.json({ hits: [] });
    });
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    await expect(
      c.searchAdvanced({ content: { text: "vector query" }, options: { topK: 3 } }),
    ).resolves.toEqual({ hits: [] });
  });

  test("search throws KhoraClientError on 503 when memories not configured", async () => {
    const signer = staticSigner();
    const fetchMock = mock(async () =>
      Response.json(
        { error: "Memories search is disabled (set KHORA_MEMORIES=1)" },
        { status: 503 },
      ),
    );
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    try {
      await c.search({ q: "hello" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(503);
    }
  });

  test("non-OK throws KhoraClientError with parsed message", async () => {
    const signer = staticSigner();
    const fetchMock = mock(async () => Response.json({ error: "bad did" }, { status: 400 }));
    const c = new KhoraClient({
      baseUrl: "http://h",
      signer,
      fetch: fetchMock,
    });
    try {
      await c.health();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).message).toBe("bad did");
      expect((e as KhoraClientError).status).toBe(400);
    }
  });
});
