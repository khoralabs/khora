import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade/crypto";
import {
  assignPostAddress,
  encodePostId,
  popRelayInboxDrainItemsForDid,
} from "@khoralabs/khora-host";
import { createTestKhoraHost } from "../test/bootstrap-sqlite";

const tmpRoot = mkdtempSync(join(tmpdir(), "khora-drain-"));
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
  const ctx = await createTestKhoraHost({
    hostDbPath: join(root, "c.sqlite"),
    cellsDir: join(root, "cells"),
    tenantKey: "tn",
    startPrincipalTeardownWorker: false,
    useCellWorkers: false,
  });
  ctx.applyProfileUsernameAndMaps({
    principalId: "did:author",
    username: "author",
    profileUpsert: { id: "prof-a", bodyJson: "{}" },
  });
  ctx.applyProfileUsernameAndMaps({
    principalId: "did:sub",
    username: "sub",
    profileUpsert: { id: "prof-s", bodyJson: "{}" },
  });

  const { recordKey, cellPoolCount } = assignPostAddress({
    cluster: ctx.cluster,
    authorPrincipalId: "did:author",
  });
  const postId = encodePostId({
    authorPrincipalId: "did:author",
    recordKey,
    cellPoolCount,
  });
  const post = {
    id: postId,
    kind: "post" as const,
    body: "hi",
    authorProfileId: "prof-a",
    authorSignature: TEST_POST_AUTHOR_SIGNATURE,
    topics: ["x"],
  };

  await ctx.publicationClient.postOperation({
    author_principal_id: "did:author",
    author_cell_id: ctx.cluster.assignPrincipalToCell("did:author"),
    tenant_key: ctx.tenantKey,
    cell_pool_count: cellPoolCount,
    payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
    payload_metadata: { postId, postKind: "post" },
    outbox_record_key: recordKey,
    routing: {
      replicate_to_catalog: false,
      catalog_envelope: {},
      fan_out_targets: [
        {
          recipient_cell_id: ctx.cluster.assignPrincipalToCell("did:sub"),
          recipient_principal_id: "did:sub",
          inbox_metadata: {
            postId,
            authorPrincipalId: "did:author",
            subscriptionMatches: [{ subscriptionId: "sub-x", score: 1 }],
            postKind: "post",
            createdAtMs: Date.now(),
          },
        },
      ],
    },
  });

  expect(await popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(1);

  ctx.phase1UnregisterPrincipal("did:author");

  expect(await popRelayInboxDrainItemsForDid(ctx, "did:sub")).toHaveLength(0);
  ctx.principalTeardownWorker.stop();
  ctx.cluster.close();
});
