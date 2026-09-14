import { describe, expect, test } from "bun:test";

import type { CellPersistence } from "../persistence/core/cell-persistence";
import {
  GroupedPartitionPersistence,
  InProcessCellNodeClient,
  RoutedInboxDelivery,
  StaleCellRouteEpochError,
} from "./cell-node";
import { createCellNodeHttpHandler, HttpCellNodeClient } from "./cell-node-http";
import { type CellRoute, createInMemoryPlacementStore } from "./placement";
import { principalHomeCellId } from "./routing/principal-cell-id";

const routeA: CellRoute = {
  nodeId: "node-a",
  endpoint: "http://node-a",
  partitionId: "p-a",
  backendKind: "sqlite",
  epoch: 4,
};
const routeB: CellRoute = { ...routeA, nodeId: "node-b", partitionId: "p-b" };

function fakeHome(_cellId: string, seen: string[]): CellPersistence {
  return {
    async enqueueInboxDelivery(input) {
      seen.push(input.recipient_principal_id);
      return { inbox_entry_id: `ib-${seen.length}` };
    },
  } as CellPersistence;
}

describe("cell-node placement", () => {
  test("resolveMany uses stable virtual routes and principal overrides", async () => {
    const placement = createInMemoryPlacementStore({
      defaultStrategy: { kind: "sqlite", dataDir: "." },
      defaultRoutes: [routeA],
    });
    const alice = principalHomeCellId("alice");
    const bob = principalHomeCellId("bob");
    await placement.setPrincipalRoute?.("bob", routeB);
    const routes = await placement.resolveMany?.([alice, bob]);
    expect(routes?.get(alice)).toEqual(routeA);
    expect(routes?.get(bob)).toEqual(routeB);
    expect(principalHomeCellId("alice")).toBe(alice);
  });

  test("groups mixed routes, caps batches at 512, and bounds concurrency", async () => {
    const alice = principalHomeCellId("alice");
    const bob = principalHomeCellId("bob");
    let active = 0;
    let peak = 0;
    const sizes: number[] = [];
    const delivery = new RoutedInboxDelivery({
      concurrency: 2,
      placement: {
        async resolveMany() {
          return new Map([
            [alice, routeA],
            [bob, routeB],
          ]);
        },
      },
      client: {
        async enqueueMany(_route, batch) {
          active++;
          peak = Math.max(peak, active);
          sizes.push(batch.deliveries.length);
          await Promise.resolve();
          active--;
          return batch.deliveries.map((_, i) => ({ inbox_entry_id: `ib-${i}` }));
        },
      },
    });
    const targets = Array.from({ length: 1_026 }, (_, i) => ({
      recipient_cell_id: i % 2 === 0 ? alice : bob,
      recipient_principal_id: i % 2 === 0 ? "alice" : "bob",
    }));
    const result = await delivery.deliver({
      tenant_key: "t",
      pointer: {
        source_cell_id: alice,
        source_record_key: "r",
        content_hash: "a".repeat(64),
        cell_pool_count: 1,
      },
      targets,
    });
    expect(result.generated_inbox_refs).toHaveLength(1_026);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(512);
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("grouped persistence supports in-process and authenticated HTTP delivery", async () => {
    const seen: string[] = [];
    const partition = new GroupedPartitionPersistence({
      partitionId: "p-a",
      epoch: 4,
      openHome: (cellId) => fakeHome(cellId, seen),
    });
    const alice = principalHomeCellId("alice");
    const batch = {
      partitionId: "p-a",
      epoch: 4,
      deliveries: [
        {
          cell_id: alice,
          tenant_key: "t",
          recipient_principal_id: "alice",
          staging: {
            kind: "inline" as const,
            inline: { bytes: new Uint8Array([1, 2]), content_hash: "x" },
          },
          correlation_id: "c",
        },
      ],
    };
    await new InProcessCellNodeClient(new Map([["p-a", partition]])).enqueueMany(routeA, batch);
    const handler = createCellNodeHttpHandler({
      token: "secret",
      resolvePartition: () => partition,
    });
    const http = new HttpCellNodeClient({
      token: "secret",
      fetch: (url, init) => handler(new Request(url, init)),
    });
    await http.enqueueMany(routeA, batch);
    expect(seen).toEqual(["alice", "alice"]);

    const unauthorized = await createCellNodeHttpHandler({
      token: "secret",
      resolvePartition: () => partition,
    })(
      new Request("http://node-a/v1/cell-node/inbox-deliveries", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(unauthorized.status).toBe(401);
    const invalid = await handler(
      new Request("http://node-a/v1/cell-node/inbox-deliveries", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: "null",
      }),
    );
    expect(invalid.status).toBe(400);
    const gateway = new HttpCellNodeClient({
      token: "secret",
      fetch: async () => new Response("bad gateway", { status: 502 }),
    });
    await expect(gateway.enqueueMany(routeA, batch)).rejects.toThrow(
      "Cell node HTTP 502: non-JSON response",
    );
  });

  test("stale epochs are retryable locally and over HTTP", async () => {
    const partition = new GroupedPartitionPersistence({
      partitionId: "p-a",
      epoch: 5,
      openHome: (cellId) => fakeHome(cellId, []),
    });
    const stale = { partitionId: "p-a", epoch: 4, deliveries: [] };
    await expect(partition.enqueueMany(stale)).rejects.toBeInstanceOf(StaleCellRouteEpochError);
    const handler = createCellNodeHttpHandler({
      token: "secret",
      resolvePartition: () => partition,
    });
    const http = new HttpCellNodeClient({
      token: "secret",
      fetch: (url, init) => handler(new Request(url, init)),
    });
    await expect(http.enqueueMany(routeA, stale)).rejects.toMatchObject({ retryable: true });
  });
});
