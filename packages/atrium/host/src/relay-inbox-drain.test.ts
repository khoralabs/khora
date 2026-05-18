import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  phase1UnregisterColonnadePrincipal,
  RELAY_CATALOG_SOURCE_POST,
  registerAgentOnColonnadePersistence,
  relaySyntheticPointer,
} from "@khoralabs/relay-colonnade";
import { createAtriumHost } from "./at2-host.ts";
import { RELAY_INBOX_SOURCE_MAP_ID } from "./relay-inbox.ts";
import { popRelayInboxDrainItemsForDid } from "./relay-inbox-drain.ts";

const tmpRoot = mkdtempSync(join(tmpdir(), "at2-drain-"));
let seq = 0;
function nextPair(): { catalogPath: string; framesPath: string } {
  const d = join(tmpRoot, `h${seq++}`);
  mkdirSync(d, { recursive: true });
  return { catalogPath: join(d, "c.sqlite"), framesPath: join(d, "f.sqlite") };
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("popRelayInboxDrainItemsForDid drops row when author unregistered (phase1)", async () => {
  const { catalogPath, framesPath } = nextPair();
  const ctx = await createAtriumHost({
    catalogPath,
    framesDbPath: framesPath,
    tenantKey: "tn",
  });
  registerAgentOnColonnadePersistence(ctx.host.persistence, ctx.catalogDb, ctx.store, {
    principalId: "did:author",
    username: "author",
    profileUpsert: { id: "prof-a", bodyJson: "{}" },
  });
  registerAgentOnColonnadePersistence(ctx.host.persistence, ctx.catalogDb, ctx.store, {
    principalId: "did:sub",
    username: "sub",
    profileUpsert: { id: "prof-s", bodyJson: "{}" },
  });
  ctx.host.persistence.posts.upsert({
    id: "post-1",
    bodyJson: JSON.stringify({
      id: "post-1",
      kind: "post",
      body: "hi",
      authorProfileId: "prof-a",
    }),
  });

  const pointer = relaySyntheticPointer(ctx.tenantKey, RELAY_CATALOG_SOURCE_POST, "post-1");
  ctx.store.upsertRow({
    tenant_key: ctx.tenantKey,
    source_map_id: RELAY_INBOX_SOURCE_MAP_ID,
    entry_key: "did:sub/post-1",
    pointer,
    projection: {
      postId: "post-1",
      authorPrincipalId: "did:author",
      reasons: [{ kind: "topic", topic: "x" }],
      createdAtMs: Date.now(),
      postKind: "post",
    },
  });

  expect(popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(1);

  ctx.store.upsertRow({
    tenant_key: ctx.tenantKey,
    source_map_id: RELAY_INBOX_SOURCE_MAP_ID,
    entry_key: "did:sub/post-1",
    pointer,
    projection: {
      postId: "post-1",
      authorPrincipalId: "did:author",
      reasons: [{ kind: "topic", topic: "x" }],
      createdAtMs: Date.now(),
      postKind: "post",
    },
  });

  phase1UnregisterColonnadePrincipal({
    persistence: ctx.host.persistence,
    store: ctx.store,
    catalogDb: ctx.catalogDb,
    tenantKey: ctx.tenantKey,
    principalId: "did:author",
  });

  expect(popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(0);
  expect(popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(0);
});
