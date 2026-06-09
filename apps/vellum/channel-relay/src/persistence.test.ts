import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFrameRelayHub } from "@khoralabs/obp-frame-relay";

import {
  createChannelRegistry,
  createChannelRelayApp,
  createFrameStore,
  createTestAgent,
  DEV_SQLCIPHER_KEY,
  openRelayDatabase,
  signedFetch,
  signedPath,
} from "@khoralabs/vellum-channel-host";

test("restart survival: registry + chain slots", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vellum-relay-persist-"));
  const dbPath = join(dir, "relay.sqlite");

  const creator = await createTestAgent();
  const peer = await createTestAgent();
  let channelId = "";
  let inviteToken = "";

  {
    const db = openRelayDatabase(dbPath, DEV_SQLCIPHER_KEY);
    const hub = createFrameRelayHub({ store: createFrameStore(db) });
    const registry = createChannelRegistry(db);
    const app = createChannelRelayApp({ registry, hub });
    const server = Bun.serve({
      port: 0,
      fetch(req, srv) {
        return app.fetch(req, srv);
      },
      websocket: app.websocket,
    });
    const base = `http://127.0.0.1:${server.port}`;

    const createRes = await signedFetch(base, {
      method: "POST",
      path: signedPath("/v1/channels"),
      bodyText: JSON.stringify({ maxChains: { mode: "principal", measure: 4 } }),
      privateKey: creator.privateKey,
      did: creator.did,
    });
    const created = (await createRes.json()) as { channelId: string; inviteToken: string };
    channelId = created.channelId;
    inviteToken = created.inviteToken;

    const joinRes = await signedFetch(base, {
      method: "POST",
      path: signedPath("/v1/channels/join"),
      bodyText: JSON.stringify({ inviteToken }),
      privateKey: peer.privateKey,
      did: peer.did,
    });
    expect(joinRes.ok).toBe(true);

    const allocPath = signedPath(`/v1/channels/${encodeURIComponent(channelId)}/chains/allocate`);
    const allocRes = await signedFetch(base, {
      method: "POST",
      path: allocPath,
      bodyText: JSON.stringify({ counterpartyDid: peer.did, sessionId: "persist-s1" }),
      privateKey: creator.privateKey,
      did: creator.did,
    });
    expect(allocRes.ok).toBe(true);

    server.stop();
    db.close();
  }

  {
    const db = openRelayDatabase(dbPath, DEV_SQLCIPHER_KEY);
    const registry = createChannelRegistry(db);
    expect(registry.isActiveMember(channelId, creator.did)).toBe(true);
    expect(registry.isActiveMember(channelId, peer.did)).toBe(true);
    expect(registry.isChainAllocated(channelId, "persist-s1")).toBe(true);
    db.close();
  }

  rmSync(dir, { recursive: true, force: true });
});
