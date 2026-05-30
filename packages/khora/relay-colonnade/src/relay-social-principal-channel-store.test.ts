import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store";
import { ensureRelayCatalogProjectionsSchema } from "./sqlite-setup";

function memStore(): RelaySocialPrincipalChannelStore {
  const db = new Database(":memory:");
  ensureRelayCatalogProjectionsSchema(db);
  return new RelaySocialPrincipalChannelStore(db);
}

test("RelaySocialPrincipalChannelStore insert list delete", () => {
  const store = memStore();
  store.insertChannel("tn", "did:a", "ch-1");
  store.insertChannel("tn", "did:a", "ch-2");
  expect(store.listChannelIds("tn", "did:a")).toEqual(["ch-1", "ch-2"]);
  store.deleteChannel("tn", "did:a", "ch-1");
  expect(store.listChannelIds("tn", "did:a")).toEqual(["ch-2"]);
});

test("RelaySocialPrincipalChannelStore insert is idempotent", () => {
  const store = memStore();
  store.insertChannel("tn", "did:a", "ch-1");
  store.insertChannel("tn", "did:a", "ch-1");
  expect(store.listChannelIds("tn", "did:a")).toEqual(["ch-1"]);
});
