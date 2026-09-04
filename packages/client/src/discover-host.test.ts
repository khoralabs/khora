import { describe, expect, test } from "bun:test";
import { discoverHost } from "./discover-host";
import { KhoraClient } from "./khora-client";
import { KhoraClientError } from "./transport";

const validDoc = {
  version: 1 as const,
  baseUrl: "http://h",
  endpoints: { health: "/health", ready: "/ready", register: "/v1/register" },
  population: { current: 0 },
  features: { search: true, invitesRequired: false, inbox: true },
};

describe("discoverHost", () => {
  test("parses well-known document", async () => {
    const doc = await discoverHost({
      baseUrl: "http://h",
      fetch: async () =>
        new Response(JSON.stringify(validDoc), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    expect(doc.features?.search).toBe(true);
  });

  test("strips trailing slash from baseUrl", async () => {
    let called = "";
    await discoverHost({
      baseUrl: "http://h/",
      fetch: async (input) => {
        called = String(input);
        return new Response(JSON.stringify(validDoc), { status: 200 });
      },
    });
    expect(called).toBe("http://h/.well-known/khora");
  });

  test("rejects empty baseUrl", async () => {
    try {
      await discoverHost({ baseUrl: "  ", fetch: async () => new Response("x") });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(400);
    }
  });

  test("rejects invalid JSON", async () => {
    try {
      await discoverHost({
        baseUrl: "http://h",
        fetch: async () =>
          new Response("not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).message).toContain("invalid JSON");
    }
  });

  test("rejects protocol version mismatch with 409", async () => {
    try {
      await discoverHost({
        baseUrl: "http://h",
        fetch: async () =>
          new Response(
            JSON.stringify({
              ...validDoc,
              version: 2,
            }),
            { status: 200 },
          ),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(409);
      expect((e as KhoraClientError).message).toContain("v2");
    }
  });

  test("rejects missing required features", async () => {
    try {
      await discoverHost({
        baseUrl: "http://h",
        requireFeatures: { search: true },
        fetch: async () =>
          new Response(
            JSON.stringify({
              ...validDoc,
              features: { search: false, invitesRequired: false, inbox: true },
            }),
            { status: 200 },
          ),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(409);
      expect((e as KhoraClientError).message).toContain("search");
    }
  });

  test("rejects when required false feature is true on host", async () => {
    try {
      await discoverHost({
        baseUrl: "http://h",
        requireFeatures: { invitesRequired: false },
        fetch: async () =>
          new Response(
            JSON.stringify({
              ...validDoc,
              features: { search: true, invitesRequired: true, inbox: true },
            }),
            { status: 200 },
          ),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(409);
      expect((e as KhoraClientError).message).toContain("invitesRequired");
    }
  });

  test("rejects non-OK HTTP", async () => {
    try {
      await discoverHost({
        baseUrl: "http://h",
        fetch: async () => new Response("nope", { status: 503 }),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(503);
    }
  });

  test("rejects when requireFeatures but host omits features", async () => {
    try {
      await discoverHost({
        baseUrl: "http://h",
        requireFeatures: { inbox: true },
        fetch: async () =>
          new Response(
            JSON.stringify({
              version: 1,
              baseUrl: "http://h",
              endpoints: validDoc.endpoints,
              population: { current: 0 },
            }),
            { status: 200 },
          ),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).message).toContain("features");
    }
  });

  test("KhoraClient.discover delegates to discoverHost", async () => {
    const doc = await KhoraClient.discover("http://h", {
      fetch: async () => new Response(JSON.stringify(validDoc), { status: 200 }),
    });
    expect(doc.version).toBe(1);
    expect(doc.baseUrl).toBe("http://h");
  });
});
