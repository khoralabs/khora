import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_POST_AUTHOR_SIGNATURE } from "@khoralabs/colonnade/crypto";
import { KHORA_EVENT_KIND, type KhoraPost } from "@khoralabs/khora-contracts";
import { assignPostAddress, encodePostId } from "@khoralabs/khora-host";
import { createTestKhoraHost } from "./test-host";

const tmpRoot = mkdtempSync(join(tmpdir(), "khora-catalog-feed-"));
let seq = 0;

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("public posts appear on catalog feed; private do not; delete removes", async () => {
  const root = join(tmpRoot, `h${seq++}`);
  mkdirSync(root, { recursive: true });
  const ctx = await createTestKhoraHost({
    hostDbPath: join(root, "host.sqlite"),
    catalogDbPath: join(root, "catalog.sqlite"),
    cellsDir: join(root, "cells"),
    tenantKey: "tn",
    startPrincipalTeardownWorker: false,
    useCellWorkers: false,
  });

  const authorDid = "did:author";
  ctx.applyProfileUsernameAndMaps({
    principalId: authorDid,
    username: "feedauthor",
    profileUpsert: {
      id: "prof-feed",
      bodyJson: JSON.stringify({
        id: "prof-feed",
        username: "feedauthor",
        displayName: "Feed Author",
      }),
    },
  });

  const publicAddr = assignPostAddress({
    cluster: ctx.cluster,
    authorPrincipalId: authorDid,
  });
  const publicId = encodePostId({
    authorPrincipalId: authorDid,
    recordKey: publicAddr.recordKey,
    cellPoolCount: publicAddr.cellPoolCount,
  });
  const publicPost: KhoraPost = {
    id: publicId,
    authorProfileId: "prof-feed",
    kind: "post",
    topics: ["climate"],
    body: "public hello",
    authorSignature: TEST_POST_AUTHOR_SIGNATURE,
    visibility: "public",
  };

  await ctx.host.notify({
    kind: KHORA_EVENT_KIND.POST_CREATED,
    payload: { post: publicPost },
  } as never);

  const listed = await ctx.publicPostFeed.list({ limit: 10, tags: ["climate"] });
  expect(listed.items).toHaveLength(1);
  expect(listed.items[0]?.body).toBe("public hello");
  expect(listed.items[0]?.publishedAtMs).toBeGreaterThan(0);

  const privateAddr = assignPostAddress({
    cluster: ctx.cluster,
    authorPrincipalId: authorDid,
  });
  const privateId = encodePostId({
    authorPrincipalId: authorDid,
    recordKey: privateAddr.recordKey,
    cellPoolCount: privateAddr.cellPoolCount,
  });
  await ctx.host.notify({
    kind: KHORA_EVENT_KIND.POST_CREATED,
    payload: {
      post: {
        id: privateId,
        authorProfileId: "prof-feed",
        kind: "post",
        topics: ["secret"],
        body: "private",
        authorSignature: TEST_POST_AUTHOR_SIGNATURE,
        visibility: "private",
      } satisfies KhoraPost,
    },
  } as never);

  const all = await ctx.publicPostFeed.list({ limit: 10 });
  expect(all.items.every((i) => i.id !== privateId)).toBe(true);
  expect(all.items.some((i) => i.id === publicId)).toBe(true);

  await ctx.host.notify({
    kind: KHORA_EVENT_KIND.POST_DELETED,
    payload: { post: publicPost },
  } as never);

  const afterDelete = await ctx.publicPostFeed.list({ limit: 10 });
  expect(afterDelete.items.every((i) => i.id !== publicId)).toBe(true);

  ctx.principalTeardownWorker.stop();
  ctx.cluster.close();
});
