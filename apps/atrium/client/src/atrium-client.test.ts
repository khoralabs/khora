import { describe, expect, mock, test } from "bun:test";
import type { DidRegistrationRequest } from "@cfd/swarm-host";
import { AtriumClient } from "./atrium-client.ts";
import { AtriumClientError } from "./atrium-client-error.ts";

describe("AtriumClient", () => {
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
        metadata: { profileId: "u1" },
      });
      return Response.json({
        did: "did:key:x",
        profileId: "u1",
        profile: { id: "u1", displayName: "Hi" },
      });
    });
    const c = new AtriumClient({ baseUrl: "http://h", fetch: fetchMock });
    const req = {
      did: "did:key:x",
      metadata: { profileId: "u1" },
    } satisfies DidRegistrationRequest;
    const out = await c.register(req);
    expect(out).toEqual({
      did: "did:key:x",
      profileId: "u1",
      profile: { id: "u1", displayName: "Hi" },
    });
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
