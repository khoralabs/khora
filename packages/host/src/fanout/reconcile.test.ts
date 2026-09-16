import { expect, test } from "bun:test";
import type { OutboxListedRecord } from "@khoralabs/colonnade";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import { encodePostId } from "../lib/post-address-id";
import { fanOutJobId } from "../persistence/core/fan-out-job-id";
import { createInMemoryKhoraHostPersistence } from "../persistence/core/in-memory";
import { createInMemoryFanOutQueue } from "../persistence/core/in-memory-fan-out-queue";
import { runFanOutMissingJobReconciliation } from "./reconcile";

const hash = "a".repeat(64);

test("reconciliation enqueues missing jobs for committed outbox posts and is idempotent", async () => {
  const persistence = createInMemoryKhoraHostPersistence();
  persistence.registerAgent({
    principalId: "did:author",
    username: "author",
    profileUpsert: { id: "p-author", bodyJson: "{}" },
  });
  const postId = encodePostId({
    authorPrincipalId: "did:author",
    recordKey: "rec-1",
    cellPoolCount: 1,
  });
  const post = {
    id: postId,
    authorProfileId: "p-author",
    authorSignature: "sig",
    kind: "post",
    visibility: "public",
    body: "hello",
  } as KhoraPost;
  const outbox: OutboxListedRecord[] = [
    {
      record_key: "rec-1",
      content_hash: hash,
      metadata: { postId, postKind: "post" },
      committed_at_ms: 1,
    },
  ];
  const queue = createInMemoryFanOutQueue();
  const first = await runFanOutMissingJobReconciliation({
    tenantKey: "tenant",
    queue,
    listPrincipals: (opts) => persistence.usernameIndex.listPrincipals(opts),
    listOutbox: async () => outbox,
    resolvePost: async (id) => (id === postId ? post : undefined),
    now: () => 10,
  });
  expect(first.enqueued).toBe(1);
  expect(queue.getJob(fanOutJobId("tenant", postId))?.sourceRecordKey).toBe("rec-1");
  const second = await runFanOutMissingJobReconciliation({
    tenantKey: "tenant",
    queue,
    listPrincipals: (opts) => persistence.usernameIndex.listPrincipals(opts),
    listOutbox: async () => outbox,
    resolvePost: async (id) => (id === postId ? post : undefined),
    now: () => 11,
  });
  expect(second.enqueued).toBe(0);
});

test("reconciliation pages principals with a durable cursor", async () => {
  const persistence = createInMemoryKhoraHostPersistence();
  persistence.registerAgent({
    principalId: "did:alice",
    username: "alice",
    profileUpsert: { id: "p-a", bodyJson: "{}" },
  });
  persistence.registerAgent({
    principalId: "did:bob",
    username: "bob",
    profileUpsert: { id: "p-b", bodyJson: "{}" },
  });
  const queue = createInMemoryFanOutQueue();
  const seen: string[] = [];
  await runFanOutMissingJobReconciliation({
    tenantKey: "tenant",
    queue,
    listPrincipals: (opts) => persistence.usernameIndex.listPrincipals(opts),
    listOutbox: async (principalId) => {
      seen.push(principalId);
      return [];
    },
    resolvePost: async () => undefined,
    principalLimit: 1,
    now: () => 0,
  });
  expect(seen).toEqual(["did:alice"]);
  expect(queue.getReconcileAfterPrincipalId()).toBe("did:alice");
  await runFanOutMissingJobReconciliation({
    tenantKey: "tenant",
    queue,
    listPrincipals: (opts) => persistence.usernameIndex.listPrincipals(opts),
    listOutbox: async (principalId) => {
      seen.push(principalId);
      return [];
    },
    resolvePost: async () => undefined,
    principalLimit: 1,
    now: () => 0,
  });
  expect(seen).toEqual(["did:alice", "did:bob"]);
});

test("reconciliation resets the cursor after wrapping onto a short page", async () => {
  const persistence = createInMemoryKhoraHostPersistence();
  persistence.registerAgent({
    principalId: "did:alice",
    username: "alice",
    profileUpsert: { id: "p-a", bodyJson: "{}" },
  });
  persistence.registerAgent({
    principalId: "did:bob",
    username: "bob",
    profileUpsert: { id: "p-b", bodyJson: "{}" },
  });
  const queue = createInMemoryFanOutQueue();
  queue.setReconcileAfterPrincipalId("did:bob");
  const result = await runFanOutMissingJobReconciliation({
    tenantKey: "tenant",
    queue,
    listPrincipals: (opts) => persistence.usernameIndex.listPrincipals(opts),
    listOutbox: async () => [],
    resolvePost: async () => undefined,
    principalLimit: 32,
    now: () => 0,
  });
  expect(result.wrapped).toBe(true);
  expect(result.principalsScanned).toBe(2);
  expect(queue.getReconcileAfterPrincipalId()).toBeUndefined();
});
