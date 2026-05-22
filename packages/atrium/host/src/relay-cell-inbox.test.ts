import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discardCellInboxRoomTickets, enqueueCellInboxInline } from "./relay-cell-inbox.ts";
import { popRelayInboxDrainItemsForDid } from "./relay-inbox-drain.ts";
import { createTestAtriumHost } from "./test/bootstrap-sqlite.ts";

const tmpRoot = mkdtempSync(join(tmpdir(), "atrium-cell-inbox-"));
let seq = 0;
function nextHostDir(): string {
  const d = join(tmpRoot, `h${seq++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("enqueueCellInboxInline room ticket drains with kind room_ticket", async () => {
  const root = nextHostDir();
  const ctx = await createTestAtriumHost({
    catalogPath: join(root, "c.sqlite"),
    framesDbPath: join(root, "f.sqlite"),
    cellsDir: join(root, "cells"),
    tenantKey: "tn",
    startPrincipalTeardownWorker: false,
  });
  await enqueueCellInboxInline(ctx, "did:peer", {
    kind: "room_ticket",
    channelId: "room-1",
    ticket: "tkt",
    webSocketUrl: "wss://example/ws",
    expiresAtMs: Date.now() + 60_000,
    issuedAtMs: Date.now(),
    fromPrincipalId: "did:creator",
  });

  const items = await popRelayInboxDrainItemsForDid(ctx, "did:peer");
  expect(items).toHaveLength(1);
  expect(items[0]?.projection).toMatchObject({
    kind: "room_ticket",
    channelId: "room-1",
    ticket: "tkt",
  });
  expect(await popRelayInboxDrainItemsForDid(ctx, "did:peer")).toHaveLength(0);

  ctx.principalTeardownWorker.stop();
  ctx.cluster.close();
});

test("discardCellInboxRoomTickets removes matching inline rows only", async () => {
  const root = nextHostDir();
  const ctx = await createTestAtriumHost({
    catalogPath: join(root, "c.sqlite"),
    framesDbPath: join(root, "f.sqlite"),
    cellsDir: join(root, "cells"),
    tenantKey: "tn",
    startPrincipalTeardownWorker: false,
  });
  await enqueueCellInboxInline(ctx, "did:peer", {
    kind: "room_ticket",
    channelId: "room-a",
    ticket: "a",
  });
  await enqueueCellInboxInline(ctx, "did:peer", {
    kind: "room_ticket",
    channelId: "room-b",
    ticket: "b",
  });

  await discardCellInboxRoomTickets(ctx, "did:peer", "room-a");

  const items = await popRelayInboxDrainItemsForDid(ctx, "did:peer");
  expect(items).toHaveLength(1);
  expect(items[0]?.projection).toMatchObject({ channelId: "room-b" });

  ctx.principalTeardownWorker.stop();
  ctx.cluster.close();
});
