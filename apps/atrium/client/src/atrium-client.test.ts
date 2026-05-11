import { describe, expect, mock, test } from "bun:test";
import type { AtriumRegistrationRequestBody } from "@cfd/atrium-contracts";
import { AtriumClient } from "./atrium-client.ts";
import { AtriumClientError } from "./atrium-client-error.ts";
import type { AtriumClientEvent } from "./atrium-events.ts";

describe("AtriumClient", () => {
  test("fetchAgentSync GET /v1/agent/sync with X-Agent-Did", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/agent/sync");
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:a");
      return Response.json({
        profile: { id: "p1", displayName: "A" },
        topicSlugs: ["rust"],
        probes: [{ id: "pr1", kind: "probe", authorProfileId: "p1", body: "q" }],
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const snap = await c.fetchAgentSync("did:key:a");
    expect(snap.profile.displayName).toBe("A");
    expect(snap.topicSlugs).toEqual(["rust"]);
    expect(snap.probes[0]?.kind).toBe("probe");
  });

  test("getAgentStatus GET /v1/agent/status with X-Agent-Did", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/agent/status");
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:a");
      return Response.json({
        status: { id: "st1", kind: "status", authorProfileId: "p1", body: "On shift" },
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const st = await c.getAgentStatus("did:key:a");
    expect(st?.kind).toBe("status");
    expect(st?.body).toBe("On shift");
  });

  test("health requests GET /health on normalized base", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:8787/health");
      expect(init?.method ?? "GET").toBe("GET");
      return Response.json({ ok: true });
    });
    const c = new AtriumClient({ baseUrl: "http://localhost:8787/", fetch: fetchMock });
    await expect(c.health()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("register POST body and parses result", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        did: "did:key:x",
        metadata: { displayName: "Ada" },
      });
      return Response.json({
        did: "did:key:x",
        profileId: "prof_minted",
        profile: { id: "prof_minted", displayName: "Ada" },
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const req = {
      did: "did:key:x",
      metadata: { displayName: "Ada" },
    } satisfies AtriumRegistrationRequestBody;
    const out = await c.register(req);
    expect(out).toEqual({
      did: "did:key:x",
      profileId: "prof_minted",
      profile: { id: "prof_minted", displayName: "Ada" },
    });
  });

  test("subscribe receives registration:completed after register", async () => {
    const fetchMock = mock(async () =>
      Response.json({
        did: "did:key:x",
        profileId: "prof_minted",
        profile: { id: "prof_minted", displayName: "Ada" },
      }),
    );
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const events: AtriumClientEvent[] = [];
    const off = c.subscribe((e) => events.push(e));
    await c.register({ did: "did:key:x", metadata: { displayName: "Ada" } });
    off();
    await c.register({ did: "did:key:y", metadata: { displayName: "Bob" } });
    expect(events).toEqual([
      {
        type: "registration:completed",
        requestDid: "did:key:x",
        result: {
          did: "did:key:x",
          profileId: "prof_minted",
          profile: { id: "prof_minted", displayName: "Ada" },
        },
      },
    ]);
  });

  test("connectInbox emits inbox:notification and derived topic_post before legacy handler", async () => {
    type EvListener = (ev: { data: string }) => void;
    let messageHandler: EvListener | undefined;
    class FakeWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      constructor(public url: string) {
        queueMicrotask(() => {
          messageHandler?.({
            data: JSON.stringify({
              type: "notification",
              id: 42,
              notification: { kind: "topic_post", payload: { topicSlug: "t", postId: "p" } },
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
    const c = new AtriumClient({
      baseUrl: "http://h",
      fetch: mock(async () => new Response(null, { status: 500 })),
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    });
    const events: AtriumClientEvent[] = [];
    c.subscribe((e) => events.push(e));
    let legacyCalled = false;
    c.connectInbox("did:key:agent", {
      onNotification: () => {
        expect(events.some((e) => e.type === "inbox:notification")).toBe(true);
        expect(events.some((e) => e.type === "inbox:topic_post")).toBe(true);
        legacyCalled = true;
      },
    });
    await new Promise((r) => queueMicrotask(r));
    expect(legacyCalled).toBe(true);
    expect(events.filter((e) => e.type === "inbox:notification")).toHaveLength(1);
    expect(events.filter((e) => e.type === "inbox:topic_post")).toHaveLength(1);
  });

  test("updateProfile PATCH /v1/profile", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/profile");
      expect(init?.method).toBe("PATCH");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:me");
      expect(JSON.parse(String(init?.body))).toEqual({ displayName: "N" });
      return Response.json({ id: "prof1", displayName: "N" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const out = await c.updateProfile("did:key:me", { displayName: "N" });
    expect(out.displayName).toBe("N");
  });

  test("subscribeTopic sets X-Agent-Did and encodes slug", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/topics/rust-dev/subscribe");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:agent");
      return Response.json({ ok: true, topicSlug: "rust-dev" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    await c.subscribeTopic("did:key:agent", "rust-dev");
  });

  test("createPost sends creation body and X-Agent-Did", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:writer");
      expect(JSON.parse(String(init?.body))).toEqual({ body: "hello", title: "Hi" });
      return Response.json({
        id: "atrium_post_abc",
        authorProfileId: "u1",
        kind: "post",
        title: "Hi",
        body: "hello",
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const out = await c.createPost("did:key:writer", { body: "hello", title: "Hi" });
    expect(out.id).toBe("atrium_post_abc");
    expect(out.authorProfileId).toBe("u1");
  });

  test("updatePost sends X-Agent-Did", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts/p1");
      expect(init?.method).toBe("PATCH");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:w");
      expect(JSON.parse(String(init?.body))).toEqual({ body: "x" });
      return Response.json({
        id: "p1",
        authorProfileId: "u1",
        kind: "post",
        body: "x",
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    await c.updatePost("did:key:w", "p1", { body: "x" });
  });

  test("deletePost sends X-Agent-Did", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/posts/p1");
      expect(init?.method).toBe("DELETE");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:w");
      return new Response(null, { status: 204 });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    await c.deletePost("did:key:w", "p1");
  });

  test("listInbox builds query string", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      expect(u.pathname).toBe("/v1/inbox");
      expect(u.searchParams.get("did")).toBe("did:key:a");
      expect(u.searchParams.get("limit")).toBe("10");
      expect(u.searchParams.get("markRead")).toBe("1");
      return Response.json({
        notifications: [
          {
            id: 1,
            createdAtMs: 1,
            read: false,
            notification: { kind: "topic_post", payload: { topicSlug: "t", postId: "p" } },
          },
        ],
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const r = await c.listInbox({ did: "did:key:a", limit: 10, markRead: true });
    expect(r.notifications).toHaveLength(1);
    expect(r.notifications[0]?.notification.kind).toBe("topic_post");
  });

  test("listInvites GET /v1/invites", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/invites");
      expect(new Headers(init?.headers).get("X-Agent-Did")).toBe("did:key:a");
      return Response.json({ invites: [] });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    await expect(c.listInvites("did:key:a")).resolves.toEqual({ invites: [] });
  });

  test("previewInvite POST /v1/invite/preview", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/invite/preview");
      expect(JSON.parse(String(init?.body))).toEqual({ token: "tok" });
      return Response.json({ inviter: null, source: "seed" });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    await expect(c.previewInvite("tok")).resolves.toEqual({ inviter: null, source: "seed" });
  });

  test("non-OK throws AtriumClientError with parsed message", async () => {
    const fetchMock = mock(async () => Response.json({ error: "bad did" }, { status: 400 }));
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
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
