import { expect, test } from "bun:test";

import { createChannelRelayApp } from "./app";
import { createRateLimiter } from "./rate-limit";
import { createChannelRelayRateLimiters } from "./rate-limit-buckets";
import { createTestChannelRelayApp } from "./test-app";
import { createTestAgent, signedFetch, signedPath } from "./test-sign";

test("rate limiter returns 429", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const first = limiter("k");
  const second = limiter("k");
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.retryAfterSec).toBeGreaterThan(0);
});

test("channels create rate limit → 429", async () => {
  const { app, cleanup } = await createTestChannelRelayApp();
  const limitedApp = createChannelRelayApp({
    registry: app.registry,
    hub: app.hub,
    auth: app.auth,
    rateLimiters: {
      ...createChannelRelayRateLimiters(),
      channelsCreateDid: createRateLimiter({ windowMs: 60_000, max: 1 }),
    },
  });
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) {
      return limitedApp.fetch(req, srv);
    },
    websocket: limitedApp.websocket,
  });

  const base = `http://127.0.0.1:${server.port}`;
  const agent = await createTestAgent();
  const path = signedPath("/v1/channels");

  const r1 = await signedFetch(base, {
    method: "POST",
    path,
    bodyText: "{}",
    privateKey: agent.privateKey,
    did: agent.did,
  });
  expect(r1.ok).toBe(true);

  const r2 = await signedFetch(base, {
    method: "POST",
    path,
    bodyText: "{}",
    privateKey: agent.privateKey,
    did: agent.did,
  });
  expect(r2.status).toBe(429);
  server.stop();
  cleanup();
});
