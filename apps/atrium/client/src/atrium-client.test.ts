import { describe, expect, mock, test } from "bun:test";
import {
  type AgentSigner,
  generateAgentIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/atrium-auth";
import { AtriumClient } from "./atrium-client.ts";
import { AtriumClientError } from "./atrium-client-error.ts";
import type { AtriumClientEvent } from "./atrium-events.ts";

async function makeSigner(): Promise<PersistableAgentSigner> {
  return generateAgentIdentity();
}

/** Predictable mock signer for assertions that don't care about real crypto. */
function staticSigner(did = "did:key:test"): AgentSigner {
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
function pathRecordingSigner(did = "did:key:rec"): AgentSigner & { recordedPaths: string[] } {
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

describe("AtriumClient", () => {
  test("fetchAgentSync GET /v1/agent/sync signed with X-Agent-* headers", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/agent/sync");
      expect(init?.method ?? "GET").toBe("GET");
      expectAuthHeaders(init, "did:key:a");
      return Response.json({
        profile: { id: "p1", username: "ada", displayName: "A" },
        topicSlugs: ["rust"],
        authorTopics: [],
        probes: [{ id: "pr1", kind: "probe", authorProfileId: "p1", body: "q" }],
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const snap = await c.fetchAgentSync();
    expect(snap.profile.username).toBe("ada");
    expect(snap.profile.displayName).toBe("A");
    expect(snap.topicSlugs).toEqual(["rust"]);
    expect(snap.authorTopics).toEqual([]);
    expect(snap.probes[0]?.kind).toBe("probe");
  });

  test("getAgentStatus GET /v1/agent/status returns parsed status", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/agent/status");
      expect(init?.method ?? "GET").toBe("GET");
      expectAuthHeaders(init, "did:key:a");
      return Response.json({
        status: { id: "st1", kind: "status", authorProfileId: "p1", body: "On shift" },
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
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
    const c = new AtriumClient({ baseUrl: "http://localhost:8787/", signer, fetch: fetchMock });
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
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.register({ metadata: { username: "ada", displayName: "Ada" } });
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
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const events: AtriumClientEvent[] = [];
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
                  reasons: [{ kind: "topic", topic: "t" }],
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
    const c = new AtriumClient({
      baseUrl: "http://h",
      signer,
      fetch: mock(async () => new Response(null, { status: 500 })),
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    });
    const events: AtriumClientEvent[] = [];
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
      return Response.json({ id: "prof1", username: "ada", displayName: "N" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
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
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.updateProfile({ username: " Ada-99 " });
    expect(out.username).toBe("ada-99");
  });

  test("lookupProfileByUsername GETs encoded path and returns parsed result", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/profile/by-username/ada-99");
      expect(init?.method ?? "GET").toBe("GET");
      return Response.json({
        did: "did:key:other",
        profile: { id: "p2", username: "ada-99", displayName: "Ada" },
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.lookupProfileByUsername(" Ada-99 ");
    expect(out?.did).toBe("did:key:other");
    expect(out?.profile.username).toBe("ada-99");
  });

  test("lookupProfileByUsername returns null on 404", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async () => Response.json({ error: "nope" }, { status: 404 }));
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    expect(await c.lookupProfileByUsername("ghost")).toBeNull();
  });

  test("listProbes signs request, no query by default, adds active=1 when requested", async () => {
    const signer = staticSigner("did:key:agent");
    const probeRow = {
      id: "probe-1",
      authorProfileId: "p-1",
      kind: "probe" as const,
      body: "watch for X",
      expiresAtMs: 9_999_999_999_999,
    };
    const seen: string[] = [];
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({ probes: [probeRow] });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const all = await c.listProbes();
    expect(all).toEqual([probeRow]);
    await c.listProbes({ active: true });
    expect(seen).toEqual(["http://h/v1/probes", "http://h/v1/probes?active=1"]);
  });

  test("listTopicSubscriptions signs request and returns slug array", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/topics");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({ topicSlugs: ["rust-dev", "zig"] });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    expect(await c.listTopicSubscriptions()).toEqual(["rust-dev", "zig"]);
  });

  test("subscribeTopic signs request and encodes slug", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/topics/rust-dev/subscribe");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({ ok: true, topicSlug: "rust-dev" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await c.subscribeTopic("rust-dev");
  });

  test("listAuthorSubscriptions signs GET /v1/authors/subscriptions", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/authors/subscriptions");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({ authorDids: ["did:key:bob"], authorTopics: [] });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    expect(await c.listAuthorSubscriptions()).toEqual({
      authorDids: ["did:key:bob"],
      authorTopics: [],
    });
  });

  test("subscribeAuthor signs POST with encoded username", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/authors/ada-99/subscribe");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({ ok: true, username: "ada-99", authorDid: "did:key:bob" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.subscribeAuthor("ada-99");
    expect(out).toEqual({ ok: true, username: "ada-99", authorDid: "did:key:bob" });
  });

  test("unsubscribeAuthor signs DELETE", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/authors/ada-99/subscribe");
      expect(init?.method).toBe("DELETE");
      expectAuthHeaders(init, "did:key:agent");
      return new Response(null, { status: 204 });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await c.unsubscribeAuthor("ada-99");
  });

  test("subscribeAuthorTopic signs POST with encoded username and slug", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/authors/ada-99/topics/rust-dev/subscribe");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({
        ok: true,
        username: "ada-99",
        authorDid: "did:key:bob",
        topicSlug: "rust-dev",
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.subscribeAuthorTopic("ada-99", "rust-dev");
    expect(out).toEqual({
      ok: true,
      username: "ada-99",
      authorDid: "did:key:bob",
      topicSlug: "rust-dev",
    });
  });

  test("unsubscribeAuthorTopic signs DELETE", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/authors/ada-99/topics/zig/subscribe");
      expect(init?.method).toBe("DELETE");
      expectAuthHeaders(init, "did:key:agent");
      return new Response(null, { status: 204 });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await c.unsubscribeAuthorTopic("ada-99", "zig");
  });

  test("createPost sends creation body and signs", async () => {
    const signer = staticSigner("did:key:writer");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts");
      expect(init?.method).toBe("POST");
      expectAuthHeaders(init, "did:key:writer");
      expect(JSON.parse(String(init?.body))).toEqual({ body: "hello", title: "Hi" });
      return Response.json({
        id: "atrium_post_abc",
        authorProfileId: "u1",
        kind: "post",
        title: "Hi",
        body: "hello",
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.createPost({ body: "hello", title: "Hi" });
    expect(out.id).toBe("atrium_post_abc");
    expect(out.authorProfileId).toBe("u1");
  });

  test("updatePost signs request", async () => {
    const signer = staticSigner("did:key:w");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts/p1");
      expect(init?.method).toBe("PATCH");
      expectAuthHeaders(init, "did:key:w");
      expect(JSON.parse(String(init?.body))).toEqual({ body: "x" });
      return Response.json({
        id: "p1",
        authorProfileId: "u1",
        kind: "post",
        body: "x",
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
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
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await c.deletePost("p1");
  });

  test("getPost signs GET with encoded post id", async () => {
    const signer = staticSigner("did:key:w");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts/atrium_post_abc");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:w");
      return Response.json({
        id: "atrium_post_abc",
        authorProfileId: "u1",
        kind: "post",
        body: "hello",
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.getPost("atrium_post_abc");
    expect(out.id).toBe("atrium_post_abc");
  });

  test("lookupProfileByDid signs GET with encoded did", async () => {
    const signer = staticSigner("did:key:agent");
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/profile/by-did/did%3Akey%3Abob");
      expect(init?.method).toBe("GET");
      expectAuthHeaders(init, "did:key:agent");
      return Response.json({
        did: "did:key:bob",
        profile: { id: "p1", username: "bob", displayName: "Bob" },
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const out = await c.lookupProfileByDid("did:key:bob");
    expect(out?.did).toBe("did:key:bob");
    expect(out?.profile.username).toBe("bob");
  });

  test("listInbox builds query string from non-did params", async () => {
    const signer = staticSigner("did:key:a");
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      expect(u.pathname).toBe("/v1/inbox");
      expect(u.searchParams.get("limit")).toBe("10");
      expect(u.searchParams.get("markRead")).toBe("1");
      return Response.json({
        notifications: [
          {
            id: 1,
            createdAtMs: 1,
            read: false,
            notification: {
              kind: "inbox_post",
              payload: {
                postId: "p",
                postKind: "post",
                reasons: [{ kind: "topic", topic: "t" }],
              },
            },
          },
        ],
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const r = await c.listInbox({ limit: 10, markRead: true });
    expect(r.notifications).toHaveLength(1);
    expect(r.notifications[0]?.notification.kind).toBe("inbox_post");
  });

  test("listInbox signs canonical /v1/inbox?limit=10&markRead=1 path", async () => {
    const signer = pathRecordingSigner("did:key:rec");
    const fetchMock = mock(async () => Response.json({ notifications: [] }));
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await c.listInbox({ limit: 10, markRead: true });
    expect(signer.recordedPaths).toEqual(["/v1/inbox?limit=10&markRead=1"]);
  });

  test("listInbox signs canonical /v1/inbox (no query) when params are omitted", async () => {
    const signer = pathRecordingSigner("did:key:rec");
    const fetchMock = mock(async () => Response.json({ notifications: [] }));
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await c.listInbox();
    expect(signer.recordedPaths).toEqual(["/v1/inbox"]);
  });

  test("non-inbox endpoints still sign pure pathnames", async () => {
    const signer = pathRecordingSigner("did:key:rec");
    const fetchMock = mock(async () => Response.json({ invites: [] }));
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
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
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await expect(c.listInvites()).resolves.toEqual({ invites: [] });
  });

  test("previewInvite POST /v1/invite/preview", async () => {
    const signer = staticSigner();
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/invite/preview");
      expect(JSON.parse(String(init?.body))).toEqual({ token: "tok" });
      return Response.json({ inviter: null, source: "seed" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    await expect(c.previewInvite("tok")).resolves.toEqual({ inviter: null, source: "seed" });
  });

  test("non-OK throws AtriumClientError with parsed message", async () => {
    const signer = staticSigner();
    const fetchMock = mock(async () => Response.json({ error: "bad did" }, { status: 400 }));
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    try {
      await c.health();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AtriumClientError);
      expect((e as AtriumClientError).message).toBe("bad did");
      expect((e as AtriumClientError).status).toBe(400);
    }
  });
});
