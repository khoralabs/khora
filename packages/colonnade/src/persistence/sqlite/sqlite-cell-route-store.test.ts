import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type CellRoute, encodeCellId, principalHomeCellId } from "../../core";
import { SqliteCellRouteStore } from "./sqlite-cell-route-store";

const paths: string[] = [];

afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { force: true });
});

describe("SqliteCellRouteStore", () => {
  test("persists default virtual partitions and principal overrides", async () => {
    const path = join(tmpdir(), `colonnade-routes-${crypto.randomUUID()}.sqlite`);
    paths.push(path);
    const defaultRoute: CellRoute = {
      nodeId: "node-a",
      endpoint: "https://a",
      partitionId: "p-a",
      backendKind: "sqlite",
      epoch: 1,
    };
    const overrideRoute: CellRoute = { ...defaultRoute, nodeId: "node-b", partitionId: "p-b" };
    const alice = principalHomeCellId("alice");
    const bob = principalHomeCellId("bob");
    const channel = encodeCellId({ kind: "channel", ownerKey: "shared" });

    let db = new Database(path);
    const first = new SqliteCellRouteStore(db);
    first.setDefaultRoutes([defaultRoute]);
    first.setPrincipalRoute("bob", overrideRoute);
    db.close();

    db = new Database(path);
    const reopened = new SqliteCellRouteStore(db);
    const routes = await reopened.resolveMany([alice, bob, channel, "invalid"]);
    expect(routes.get(alice)).toEqual(defaultRoute);
    expect(routes.get(bob)).toEqual(overrideRoute);
    expect(routes.get(channel)).toEqual(defaultRoute);
    expect(routes.get("invalid")).toEqual(defaultRoute);
    db.close();
  });
});
