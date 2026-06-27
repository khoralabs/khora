import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade-crypto";
import {
  assignPostAddress,
  deletePostOutboxRecord,
  encodePostId,
  resolvePostById,
} from "@khoralabs/khora-host";
import { createTestKhoraHost } from "../test/bootstrap-sqlite";

const tmpRoot = mkdtempSync(join(tmpdir(), "khora-post-outbox-"));
let seq = 0;

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("resolvePostById reads author outbox; delete leaves ghost", async () => {
  const root = join(tmpRoot, `h${seq++}`);
  mkdirSync(root, { recursive: true });
  const ctx = await createTestKhoraHost({
    catalogPath: join(root, "c.sqlite"),
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
    body: "hello outbox",
    authorProfileId: "prof-a",
    authorSignature: TEST_POST_AUTHOR_SIGNATURE,
  };

  await ctx.publicationClient.postOperation({
    author_principal_id: "did:author",
    author_cell_id: ctx.cluster.assignPrincipalToCell("did:author"),
    tenant_key: ctx.tenantKey,
    cell_pool_count: cellPoolCount,
    payload_bytes: new TextEncoder().encode(JSON.stringify(post)),
    payload_metadata: { postId, postKind: "post" },
    outbox_record_key: recordKey,
    routing: { replicate_to_catalog: false, catalog_envelope: {}, fan_out_targets: [] },
  });

  const loaded = await resolvePostById(ctx.cluster, postId);
  expect(loaded?.body).toBe("hello outbox");

  await deletePostOutboxRecord(ctx.cluster, postId);
  expect(await resolvePostById(ctx.cluster, postId)).toBeUndefined();

  ctx.principalTeardownWorker.stop();
  ctx.cluster.close();
});
