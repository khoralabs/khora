/**
 * End-to-end network test:
 *   1. Three agents spawn, subscribe, and make posts → inbox notifications flow
 *   2. Two agents open a vellum relay channel and establish an OBP chain
 *   3. The initiator sends an offer turn and the graph reflects it
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { loadIdentity } from "@khoralabs/agent-persisted-signer";
import type { KhoraClientEvent } from "@khoralabs/khora-client";
import { AgentStore } from "@khoralabs/khora-managed-agents";
import { RelayClient } from "@khoralabs/relay-client";
import { type NetworkHarnessHandle, startNetworkHarness } from "../harness";

// ── helpers ───────────────────────────────────────────────────────────────────

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  opts: { timeoutMs?: number; pollMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 10_000, pollMs = 200, label = "condition" } = opts;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`waitFor timed out: ${label}`);
    await Bun.sleep(pollMs);
  }
}

function inboxHasPost(events: KhoraClientEvent[], postId: string): boolean {
  return events.some((e) => {
    if (e.type === "inbox:notification") {
      const n = e.notification as { kind: string; payload: { postId: string } };
      return n.kind === "inbox_post" && n.payload.postId === postId;
    }
    if (e.type === "inbox:drain") {
      // Subscription fan-outs arrive via drain on WS connect
      return e.items.some((item) => {
        const proj = item.projection as Record<string, unknown> | null | undefined;
        return proj?.postId === postId;
      });
    }
    return false;
  });
}

// ── harness ───────────────────────────────────────────────────────────────────

const dataDir = path.join(os.tmpdir(), `khora-e2e-${process.pid}`);
let harness: NetworkHarnessHandle;

beforeAll(async () => {
  harness = await startNetworkHarness({ dataDir });
}, 30_000);

afterAll(() => harness?.stop());

// ── test ──────────────────────────────────────────────────────────────────────

describe("multi-agent OBP network", () => {
  test("agents subscribe → post → notify → open vellum → chain → send offer", async () => {
    // Agents' key files live at this path (matches ManagedAgentPool internals)
    const agentsDataDir = path.join(dataDir, "agents");

    // ── 1. Spawn three agents ─────────────────────────────────────────────
    const aliceDid = await harness.pool.spawn();
    const bobDid = await harness.pool.spawn();
    const charlieDid = await harness.pool.spawn();

    const alice = await harness.pool.focus(aliceDid);
    const bob = await harness.pool.focus(bobDid);
    const charlie = await harness.pool.focus(charlieDid);

    // ── 2. Each agent subscribes to posts matching "obp-test" ────────────
    const subscription = {
      visibility: "public" as const,
      search: { content: { text: "obp-test" } },
    };
    await Promise.all([
      alice.client.createSubscription(subscription),
      bob.client.createSubscription(subscription),
      charlie.client.createSubscription(subscription),
    ]);

    // ── 3. Connect inboxes ────────────────────────────────────────────────
    const aliceEvents: KhoraClientEvent[] = [];
    const bobEvents: KhoraClientEvent[] = [];
    const charlieEvents: KhoraClientEvent[] = [];

    const aliceConn = alice.connectInbox({ onEvent: (e) => aliceEvents.push(e) });
    const bobConn = bob.connectInbox({ onEvent: (e) => bobEvents.push(e) });
    const charlieConn = charlie.connectInbox({ onEvent: (e) => charlieEvents.push(e) });

    // Brief settle so WebSocket connections establish before posting
    await Bun.sleep(800);

    // ── 4. Charlie posts with "obp-test" keyword ─────────────────────────
    const post = await charlie.client.createPost({
      body: "obp-test handshake: looking for OBP peers",
    });
    expect(post.id).toBeTruthy();

    // Allow the server to process the post and fan-out to Alice & Bob's inboxes
    await Bun.sleep(500);

    // Reconnect Alice & Bob's inbox WS so the drain picks up the new subscription match
    aliceConn.close();
    bobConn.close();
    const aliceConn2 = alice.connectInbox({ onEvent: (e) => aliceEvents.push(e) });
    const bobConn2 = bob.connectInbox({ onEvent: (e) => bobEvents.push(e) });

    // ── 5. Alice and Bob receive inbox notifications for Charlie's post ───
    await waitFor(() => inboxHasPost(aliceEvents, post.id), {
      timeoutMs: 12_000,
      label: "alice inbox post",
    });
    await waitFor(() => inboxHasPost(bobEvents, post.id), {
      timeoutMs: 12_000,
      label: "bob inbox post",
    });

    // Charlie's own post doesn't generate a self-notification
    expect(inboxHasPost(charlieEvents, post.id)).toBe(false);

    // ── 6. Load agent identities for relay channel management ─────────────
    const aliceKeyPath = AgentStore.keyPath(agentsDataDir, aliceDid);
    const bobKeyPath = AgentStore.keyPath(agentsDataDir, bobDid);

    const aliceSigner = await loadIdentity(aliceKeyPath);
    const bobSigner = await loadIdentity(bobKeyPath);
    if (!aliceSigner || !bobSigner) throw new Error("failed to load agent signers");

    // ── 7. Alice creates a relay channel; Bob joins via invite token ──────
    const aliceRelayClient = new RelayClient({
      relayBaseUrl: harness.relayBaseUrl,
      signer: aliceSigner,
    });
    const bobRelayClient = new RelayClient({
      relayBaseUrl: harness.relayBaseUrl,
      signer: bobSigner,
    });

    const { channelId, inviteToken } = await aliceRelayClient.createChannel({});
    expect(channelId).toBeTruthy();
    if (inviteToken) {
      await bobRelayClient.joinChannel({ inviteToken });
    }

    // ── 8. Connect vellum daemons for Alice and Bob ───────────────────────
    const vellumDataDir = path.join(dataDir, "vellum");

    const aliceVellum = alice.vellum(channelId, {
      relayBaseUrl: harness.relayBaseUrl,
      dataDir: path.join(vellumDataDir, "alice"),
    });
    const bobVellum = bob.vellum(channelId, {
      relayBaseUrl: harness.relayBaseUrl,
      dataDir: path.join(vellumDataDir, "bob"),
    });

    const [aliceConnect, bobConnect] = await Promise.all([
      aliceVellum.connect(),
      bobVellum.connect(),
    ]);
    expect(aliceConnect).toBe("spawned");
    expect(bobConnect).toBe("spawned");

    // Allow daemons to publish KeyPackages and sync the roster
    await Bun.sleep(3_000);

    // ── 9. Alice creates an OBP chain with Bob ────────────────────────────
    const chainResp = await aliceVellum.chainCreate({ counterpartyDid: bobDid });
    expect(chainResp.ok).toBe(true);
    const sessionId = chainResp.session_id;
    expect(sessionId).toBeTruthy();

    // Alice's chain list updates synchronously after chainCreate returns
    await waitFor(() => aliceVellum.listChains().some((c) => c.session_id === sessionId), {
      timeoutMs: 5_000,
      label: "alice chain in store",
    });

    // Bob's daemon processes onSessionReady asynchronously; poll his control server
    await waitFor(
      async () => {
        const snap = await bobVellum.getChainSnapshot().catch(() => null);
        return snap?.chains.some((c) => c.session_id === sessionId) ?? false;
      },
      { timeoutMs: 20_000, pollMs: 500, label: "bob sees chain" },
    );

    // ── 10. Alice sends an offer turn on the chain ────────────────────────
    const offerTurn = {
      offer: {
        id: "offer-1",
        type: "service.slot",
        expires_turn: 100,
        expires_at_relay_ms: Date.now() + 60_000,
      },
      ports: [
        {
          id: "port-1",
          type: "slot",
          promise: "open",
          expires_turn: 100,
          expires_at_relay_ms: Date.now() + 60_000,
          bind_policy: null,
          ref: "",
        },
      ],
      bind_port_id: "",
      bind_payload: null,
    };
    await aliceVellum.sendTurn(sessionId, offerTurn);

    // Alice's graph should record the offer
    await waitFor(
      async () => {
        const snap = await aliceVellum.getChainSnapshot().catch(() => null);
        return (snap?.graphSummary?.offers ?? 0) >= 1;
      },
      { timeoutMs: 10_000, pollMs: 300, label: "alice graph has offer" },
    );

    // ── cleanup ───────────────────────────────────────────────────────────
    aliceVellum.disconnect();
    bobVellum.disconnect();
    aliceConn2.close();
    bobConn2.close();
    charlieConn.close();
  }, 90_000);
});
