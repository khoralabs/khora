import { describe, expect, test } from "bun:test";
import type { AtriumHostContext } from "../create-atrium-host.ts";
import type { HostRouteDeps } from "../http/deps.ts";
import { routeUnary } from "../http/router.ts";
import { createHostRateLimiters } from "../rate-limit-buckets.ts";
import { unaryIngressWireToResponseJson } from "./stdio-unary-listener.ts";
import {
  ATRIUM_UNARY_INGRESS_ORIGIN,
  dispatchHttpLikeUnary,
  mergeUnaryPeerIp,
} from "./unary-dispatch.ts";

function stubDeps(): HostRouteDeps {
  return {
    ctx: null as unknown as AtriumHostContext,
    invitesRepo: undefined,
    rateLimiters: createHostRateLimiters(),
    loadPublicProfileForDid: () => null,
  };
}

describe("mergeUnaryPeerIp", () => {
  test("sets X-Real-IP when absent", () => {
    const h = mergeUnaryPeerIp(new Headers(), "10.0.1.2");
    expect(h.get("X-Real-IP")).toBe("10.0.1.2");
  });

  test("preserves existing X-Real-IP", () => {
    const h = mergeUnaryPeerIp(new Headers({ "x-real-ip": "9.9.9.9" }), "10.0.1.2");
    expect(h.get("x-real-ip")).toBe("9.9.9.9");
  });
});

describe("dispatchHttpLikeUnary", () => {
  test("GET /health mirrors HTTP handler", async () => {
    const res = await dispatchHttpLikeUnary({ method: "GET", pathname: "/health" }, stubDeps());
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("pathname may omit leading slash", async () => {
    const res = await dispatchHttpLikeUnary({ method: "GET", pathname: "health" }, stubDeps());
    expect(res.ok).toBe(true);
  });

  test("unknown path returns 404 Response", async () => {
    const res = await dispatchHttpLikeUnary(
      { method: "GET", pathname: "/v1/no-such-route" },
      stubDeps(),
    );
    expect(res.status).toBe(404);
  });

  test("room WS path returns 501 without Bun Server", async () => {
    const res = await dispatchHttpLikeUnary(
      { method: "GET", pathname: "/v1/atrium/rooms/rid/ws" },
      stubDeps(),
    );
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({
      error: "WebSocket upgrade requires HTTP transport",
    });
  });

  test("inbox WS path returns 501 without Bun Server", async () => {
    const res = await dispatchHttpLikeUnary(
      { method: "GET", pathname: "/v1/inbox/ws" },
      stubDeps(),
    );
    expect(res.status).toBe(501);
  });
});

describe("routeUnary", () => {
  test("matches synthetic Request URL host", async () => {
    const url = new URL(`${ATRIUM_UNARY_INGRESS_ORIGIN}/health`);
    const req = new Request(url.toString());
    const res = await routeUnary(req, url, stubDeps());
    expect(res?.ok).toBe(true);
  });
});

describe("unaryIngressWireToResponseJson", () => {
  test("round-trip GET /health", async () => {
    const json = await unaryIngressWireToResponseJson(
      { method: "GET", path: "/health" },
      stubDeps(),
    );
    const o = JSON.parse(json) as { status: number; body: string };
    expect(o.status).toBe(200);
    expect(JSON.parse(o.body)).toEqual({ ok: true });
  });
});
