import { expect, test } from "bun:test";

import { createChannelRelayApp } from "./app";
import { createTestAgent, signedFetch, signedPath } from "./test-sign";

test("create → join → WS attach", async () => {
  const app = createChannelRelayApp();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) {
      return app.fetch(req, srv);
    },
    websocket: app.websocket,
  });

  const base = `http://127.0.0.1:${server.port}`;
  const creator = await createTestAgent();
  const peer = await createTestAgent();

  const createPath = signedPath("/v1/channels");
  const createRes = await signedFetch(base, {
    method: "POST",
    path: createPath,
    bodyText: "{}",
    privateKey: creator.privateKey,
    did: creator.did,
  });
  expect(createRes.ok).toBe(true);
  const created = (await createRes.json()) as {
    channelId: string;
    inviteToken: string;
    ticket: string;
    webSocketUrl: string;
  };
  expect(created.channelId.length).toBeGreaterThan(0);
  expect(created.inviteToken.length).toBeGreaterThan(0);

  const joinPath = signedPath("/v1/channels/join");
  const joinRes = await signedFetch(base, {
    method: "POST",
    path: joinPath,
    bodyText: JSON.stringify({ inviteToken: created.inviteToken }),
    privateKey: peer.privateKey,
    did: peer.did,
  });
  expect(joinRes.ok).toBe(true);
  const joined = (await joinRes.json()) as { webSocketUrl: string; creatorDid: string };
  expect(joined.creatorDid).toBe(creator.did);

  const wsUrl = new URL(joined.webSocketUrl.replace(/^ws/, "http"));
  wsUrl.protocol = "ws:";
  const ws = new WebSocket(wsUrl.toString());
  const opened = await new Promise<boolean>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws timeout")), 5_000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error("ws error"));
    };
  });
  expect(opened).toBe(true);
  ws.close();
  server.stop();
});
