import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ensureRelayCatalogProjectionsSchema } from "./sqlite-setup.ts";
import { RelaySubscriptionEdgeStore } from "./relay-subscription-edge-store.ts";

function memStore(): RelaySubscriptionEdgeStore {
  const db = new Database(":memory:");
  ensureRelayCatalogProjectionsSchema(db);
  return new RelaySubscriptionEdgeStore(db);
}

test("RelaySubscriptionEdgeStore insert and list both directions", () => {
  const store = memStore();
  store.insertEdge("tn", "did:a", "topic:rust", 1);
  store.insertEdge("tn", "did:b", "topic:rust", 2);
  expect(store.listSubjectsForPrincipal("tn", "did:a")).toEqual(["topic:rust"]);
  expect(store.listPrincipalsForSubject("tn", "topic:rust")).toEqual(["did:a", "did:b"]);
});

test("RelaySubscriptionEdgeStore listSubjectsWithPrefix", () => {
  const store = memStore();
  store.insertEdge("tn", "did:b", "author_topic:did:a\trust", 1);
  store.insertEdge("tn", "did:c", "author_topic:did:a\tgo", 2);
  store.insertEdge("tn", "did:d", "topic:other", 3);
  expect(store.listSubjectsWithPrefix("tn", "author_topic:did:a\t")).toEqual([
    "author_topic:did:a\tgo",
    "author_topic:did:a\trust",
  ]);
});

test("RelaySubscriptionEdgeStore two principals on same subject both visible", () => {
  const store = memStore();
  store.insertEdge("tn", "did:p1", "author:did:author", 1);
  store.insertEdge("tn", "did:p2", "author:did:author", 2);
  expect(store.listPrincipalsForSubject("tn", "author:did:author")).toEqual(["did:p1", "did:p2"]);
});

test("RelaySubscriptionEdgeStore deleteEdge", () => {
  const store = memStore();
  store.insertEdge("tn", "did:a", "topic:rust", 1);
  store.deleteEdge("tn", "did:a", "topic:rust");
  expect(store.listSubjectsForPrincipal("tn", "did:a")).toEqual([]);
  expect(store.listPrincipalsForSubject("tn", "topic:rust")).toEqual([]);
});
