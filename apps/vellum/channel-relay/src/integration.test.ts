import { expect, test } from "bun:test";
import {
  createTestAgent,
  createTestChannelRelayApp,
  signedFetch,
  signedPath,
} from "@khoralabs/vellum-channel-host";
import { vellumWsUpgradeProtocol } from "@khoralabs/vellum-contracts";

function serve(app: Awaited<ReturnType<typeof createTestChannelRelayApp>>["app"]) {
  return Bun.serve({
    port: 0,
    fetch(req, srv) {
      return app.fetch(req, srv);
    },
    websocket: app.websocket,
  });
}

test("create → invite join → WS attach", async () => {
  const { app, cleanup } = await createTestChannelRelayApp();
  const server = serve(app);

  const base = `http://127.0.0.1:${server.port}`;
  const creator = await createTestAgent();
  const peer = await createTestAgent();

  const createRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  expect(createRes.ok).toBe(true);
  const created = (await createRes.json()) as {
    channelId: string;
    inviteToken: string;
    policy: { admissionMode: string };
  };
  expect(created.policy.admissionMode).toBe("invite_only");
  expect(created.inviteToken.length).toBeGreaterThan(0);

  const joinRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels/join"),
    bodyText: JSON.stringify({ inviteToken: created.inviteToken }),
    privateKey: peer.privateKey,
    did: peer.did,
  });
  expect(joinRes.ok).toBe(true);
  const joined = (await joinRes.json()) as {
    webSocketUrl: string;
    upgradeNonce: string;
    creatorDid: string;
  };
  expect(joined.creatorDid).toBe(creator.did);
  expect(joined.webSocketUrl).not.toContain("ticket=");

  const wsUrl = new URL(joined.webSocketUrl.replace(/^ws/, "http"));
  wsUrl.protocol = "ws:";
  const ws = new WebSocket(wsUrl.toString(), [vellumWsUpgradeProtocol(joined.upgradeNonce)]);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws timeout")), 5_000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error("ws error"));
    };
  });
  ws.close();
  server.stop();
  cleanup();
});

test("upgrade nonce is single-use", async () => {
  const { app, cleanup } = await createTestChannelRelayApp();
  const server = serve(app);
  const base = `http://127.0.0.1:${server.port}`;
  const creator = await createTestAgent();

  const createRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  const created = (await createRes.json()) as {
    channelId: string;
    webSocketUrl: string;
    upgradeNonce: string;
  };

  const connect = () =>
    new Promise<void>((resolve, reject) => {
      const wsUrl = new URL(created.webSocketUrl.replace(/^ws/, "http"));
      wsUrl.protocol = "ws:";
      const ws = new WebSocket(wsUrl.toString(), [vellumWsUpgradeProtocol(created.upgradeNonce)]);
      const t = setTimeout(() => reject(new Error("ws timeout")), 5_000);
      ws.onopen = () => {
        clearTimeout(t);
        ws.close();
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("ws error"));
      };
    });

  await connect();
  await expect(connect()).rejects.toThrow();
  server.stop();
  cleanup();
});

test("non-member ticket mint → 403", async () => {
  const { app, cleanup } = await createTestChannelRelayApp();
  const server = serve(app);
  const base = `http://127.0.0.1:${server.port}`;
  const creator = await createTestAgent();
  const outsider = await createTestAgent();

  const createRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  const created = (await createRes.json()) as { channelId: string };

  const ticketPath = signedPath(`/v1/channels/${encodeURIComponent(created.channelId)}/ticket`);
  const ticketRes = await signedFetch(base, {
    method: "POST",
    path: ticketPath,
    bodyText: "{}",
    privateKey: outsider.privateKey,
    did: outsider.did,
  });
  expect(ticketRes.status).toBe(403);
  server.stop();
  cleanup();
});

test("principal chain allocate enforces per-member quota", async () => {
  const { app, cleanup } = await createTestChannelRelayApp();
  const server = serve(app);
  const base = `http://127.0.0.1:${server.port}`;
  const a = await createTestAgent();
  const b = await createTestAgent();

  const createRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: JSON.stringify({ maxChains: { mode: "principal", measure: 1 } }),
    privateKey: a.privateKey,
    did: a.did,
  });
  expect(createRes.ok).toBe(true);
  const created = (await createRes.json()) as { channelId: string; inviteToken: string };

  const joinRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels/join"),
    bodyText: JSON.stringify({ inviteToken: created.inviteToken }),
    privateKey: b.privateKey,
    did: b.did,
  });
  expect(joinRes.ok).toBe(true);

  const allocPath = signedPath(
    `/v1/channels/${encodeURIComponent(created.channelId)}/chains/allocate`,
  );
  const body = (sid: string) => JSON.stringify({ counterpartyDid: b.did, sessionId: sid });

  const ok1 = await signedFetch(base, {
    method: "POST",
    path: allocPath,
    bodyText: body("sess-1"),
    privateKey: a.privateKey,
    did: a.did,
  });
  expect(ok1.ok).toBe(true);

  const statusPath = signedPath(
    `/v1/channels/${encodeURIComponent(created.channelId)}/chains/sess-1`,
  );
  const statusRes = await signedFetch(base, {
    method: "GET",
    path: statusPath,
    bodyText: "",
    privateKey: a.privateKey,
    did: a.did,
  });
  expect(statusRes.ok).toBe(true);
  const status = (await statusRes.json()) as { allocated: boolean; sessionId: string };
  expect(status.allocated).toBe(true);
  expect(status.sessionId).toBe("sess-1");

  const fail = await signedFetch(base, {
    method: "POST",
    path: allocPath,
    bodyText: body("sess-2"),
    privateKey: a.privateKey,
    did: a.did,
  });
  expect(fail.status).toBe(409);
  server.stop();
  cleanup();
});

test("relay maxChannels → 503 on create", async () => {
  const { app, cleanup } = await createTestChannelRelayApp({
    relayProfile: { mode: "pool", maxRelayChannels: 1 },
  });
  const server = serve(app);
  const base = `http://127.0.0.1:${server.port}`;
  const a = await createTestAgent();
  const b = await createTestAgent();

  const first = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: "{}",
    privateKey: a.privateKey,
    did: a.did,
  });
  expect(first.ok).toBe(true);

  const second = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: "{}",
    privateKey: b.privateKey,
    did: b.did,
  });
  expect(second.status).toBe(503);
  server.stop();
  cleanup();
});

test("single-channel: bootstrap → join-tokens → join → WS", async () => {
  const channelId = crypto.randomUUID();
  const creator = await createTestAgent();
  const peer = await createTestAgent();

  const { app, cleanup } = await createTestChannelRelayApp({
    singleBootstrap: {
      channelId,
      creatorDid: creator.did,
      ttlMs: 3_600_000,
      maxPopulation: null,
      maxChains: { mode: "principal", measure: 8 },
    },
  });
  const server = serve(app);
  const base = `http://127.0.0.1:${server.port}`;

  const createRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels"),
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  expect(createRes.status).toBe(501);

  const mintPath = signedPath(`/v1/channels/${encodeURIComponent(channelId)}/join-tokens`);
  const mintRes = await signedFetch(base, {
    method: "POST",
    path: mintPath,
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  expect(mintRes.ok).toBe(true);
  const minted = (await mintRes.json()) as { channelId: string; joinToken: string };
  expect(minted.channelId).toBe(channelId);

  const joinRes = await signedFetch(base, {
    method: "POST",
    path: signedPath("/v1/channels/join"),
    bodyText: JSON.stringify({ joinToken: minted.joinToken }),
    privateKey: peer.privateKey,
    did: peer.did,
  });
  expect(joinRes.ok).toBe(true);
  const joined = (await joinRes.json()) as { webSocketUrl: string; upgradeNonce: string };
  expect(joined.webSocketUrl).toContain(channelId);

  const wsUrl = new URL(joined.webSocketUrl.replace(/^ws/, "http"));
  wsUrl.protocol = "ws:";
  const ws = new WebSocket(wsUrl.toString(), [vellumWsUpgradeProtocol(joined.upgradeNonce)]);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws timeout")), 5_000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error("ws error"));
    };
  });
  ws.close();
  server.stop();
  cleanup();
});

test("single-channel: wrong channel id in path → 404", async () => {
  const channelId = crypto.randomUUID();
  const creator = await createTestAgent();

  const { app, cleanup } = await createTestChannelRelayApp({
    singleBootstrap: {
      channelId,
      creatorDid: creator.did,
      ttlMs: 3_600_000,
      maxPopulation: null,
      maxChains: { mode: "principal", measure: 8 },
    },
  });
  const server = serve(app);
  const base = `http://127.0.0.1:${server.port}`;

  const otherId = crypto.randomUUID();
  const mintPath = signedPath(`/v1/channels/${encodeURIComponent(otherId)}/join-tokens`);
  const mintRes = await signedFetch(base, {
    method: "POST",
    path: mintPath,
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  expect(mintRes.status).toBe(404);

  server.stop();
  cleanup();
});
