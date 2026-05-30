import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { RelayCatalogProjectionStore } from "./catalog-projection-store";
import {
  RELAY_NAMESPACE_ROOM_REGISTRY,
  RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./relay-id-conventions";
import { ensureRelayCatalogProjectionsSchema } from "./sqlite-setup";

test("RelayCatalogProjectionStore upsert and lookup", () => {
  const db = new Database(":memory:");
  ensureRelayCatalogProjectionsSchema(db);
  const store = new RelayCatalogProjectionStore(db);
  store.upsert({
    tenant_key: "relay",
    namespace: "relay:entity:profile",
    entry_key: "prof-1",
    projection: { id: "prof-1", bodyJson: "{}", updatedAtMs: 1 },
  });
  const hit = store.lookupProjection("relay", "relay:entity:profile", "prof-1");
  expect(hit.found).toBe(true);
  expect(hit.projection).toMatchObject({ id: "prof-1" });
});

test("RelayCatalogProjectionStore listByPrefix", () => {
  const db = new Database(":memory:");
  ensureRelayCatalogProjectionsSchema(db);
  const store = new RelayCatalogProjectionStore(db);
  store.upsert({
    tenant_key: "tn",
    namespace: "relay:subs:by-subject",
    entry_key: "author_topic:did:a\trust",
    projection: { principals: ["did:b"] },
  });
  store.upsert({
    tenant_key: "tn",
    namespace: "relay:subs:by-subject",
    entry_key: "topic:rust",
    projection: { principals: [] },
  });
  const rows = store.listByPrefix("tn", "relay:subs:by-subject", "author_topic:did:a\t");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.entry_key).toBe("author_topic:did:a\trust");
});

test("username index JSON expression index is usable", () => {
  const db = new Database(":memory:");
  ensureRelayCatalogProjectionsSchema(db);
  const store = new RelayCatalogProjectionStore(db);
  store.upsert({
    tenant_key: USERNAME_INDEX_TENANT_KEY,
    namespace: RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
    entry_key: "alice",
    projection: { principalId: "did:alice" },
  });
  const row = db
    .prepare(
      `SELECT entry_key FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ?
       AND json_extract(projection, '$.principalId') = ?`,
    )
    .get(USERNAME_INDEX_TENANT_KEY, RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL, "did:alice") as
    | { entry_key: string }
    | undefined;
  expect(row?.entry_key).toBe("alice");
});

test("room registry creator index is usable", () => {
  const db = new Database(":memory:");
  ensureRelayCatalogProjectionsSchema(db);
  const store = new RelayCatalogProjectionStore(db);
  store.upsert({
    tenant_key: "relay",
    namespace: RELAY_NAMESPACE_ROOM_REGISTRY,
    entry_key: "room-1",
    projection: { creatorDid: "did:creator", inviteTargetDid: null, expiresAtMs: 1 },
  });
  const row = db
    .prepare(
      `SELECT entry_key FROM relay_catalog_projections
       WHERE tenant_key = ? AND namespace = ?
       AND json_extract(projection, '$.creatorDid') = ?`,
    )
    .get("relay", RELAY_NAMESPACE_ROOM_REGISTRY, "did:creator") as
    | { entry_key: string }
    | undefined;
  expect(row?.entry_key).toBe("room-1");
});
