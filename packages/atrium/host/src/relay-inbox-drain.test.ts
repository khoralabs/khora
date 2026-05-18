import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  phase1UnregisterColonnadePrincipal,
  registerAgentOnColonnadePersistence,
} from "@khoralabs/relay-colonnade";
import { createAtriumHost } from "./atrium-host.ts";
import { popRelayInboxDrainItemsForDid } from "./relay-inbox-drain.ts";

const tmpRoot = mkdtempSync(join(tmpdir(), "atrium-drain-"));
let seq = 0;
function nextHostDir(): string {
  const d = join(tmpRoot, `h${seq++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("popRelayInboxDrainItemsForDid drops cell inbox row when author unregistered (phase1)", async () => {
  const root = nextHostDir();
  const ctx = await createAtriumHost({
    catalogPath: join(root, "c.sqlite"),
    framesDbPath: join(root, "f.sqlite"),
    cellsDir: join(root, "cells"),
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
  const post = {
    id: "post-1",
    kind: "post" as const,
    body: "hi",
    authorProfileId: "prof-a",
    topics: ["x"],
  };
  ctx.host.persistence.posts.upsert({
    id: "post-1",
    bodyJson: JSON.stringify(post),
  });
  await ctx.publicationClient.postOperation({
    author_principal_id: "did:author",
    author_cell_id: ctx.cluster.assignPrincipalToCell("did:author"),
    tenant_key: ctx.tenantKey,
    payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
    payload_metadata: { postId: "post-1", postKind: "post" },
    routing: {
      replicate_to_catalog: true,
      catalog_envelope: { postId: "post-1" },
      fan_out_targets: [
        {
          recipient_cell_id: ctx.cluster.assignPrincipalToCell("did:sub"),
          recipient_principal_id: "did:sub",
          inbox_metadata: {
            postId: "post-1",
            authorPrincipalId: "did:author",
            reasons: [{ kind: "topic", topic: "x" }],
            postKind: "post",
            createdAtMs: Date.now(),
          },
        },
      ],
    },
  });

  expect(await popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(1);

  await ctx.publicationClient.postOperation({
    author_principal_id: "did:author",
    author_cell_id: ctx.cluster.assignPrincipalToCell("did:author"),
    tenant_key: ctx.tenantKey,
    payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
    payload_metadata: { postId: "post-1", postKind: "post" },
    routing: {
      replicate_to_catalog: true,
      catalog_envelope: { postId: "post-1" },
      fan_out_targets: [
        {
          recipient_cell_id: ctx.cluster.assignPrincipalToCell("did:sub"),
          recipient_principal_id: "did:sub",
          inbox_metadata: {
            postId: "post-1",
            authorPrincipalId: "did:author",
            reasons: [{ kind: "topic", topic: "x" }],
            postKind: "post",
            createdAtMs: Date.now(),
          },
        },
      ],
    },
  });

  phase1UnregisterColonnadePrincipal({
    persistence: ctx.host.persistence,
    store: ctx.store,
    catalogDb: ctx.catalogDb,
    tenantKey: ctx.tenantKey,
    principalId: "did:author",
  });

  expect(await popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(0);
  expect(await popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(0);
  ctx.cluster.close();
});
