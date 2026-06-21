import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { grant, hasGrant, revokeGrant } from "./grants";
import { ensureAuthzSchema } from "./schema";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  ensureAuthzSchema(db);
});

afterEach(() => {
  db.close();
});

test("grant and hasGrant return true for active grant", () => {
  const scope = { type: "account", id: "user-1" };
  const resource = { type: "session", id: "session-1" };
  grant(db, scope, resource, "participant");
  expect(hasGrant(db, scope, resource, "participant")).toBe(true);
});

test("revokeGrant removes active grant", () => {
  const scope = { type: "account", id: "user-1" };
  const resource = { type: "session", id: "session-1" };
  grant(db, scope, resource, "participant");
  revokeGrant(db, scope, resource, "participant");
  expect(hasGrant(db, scope, resource, "participant")).toBe(false);
});

test("expired grant is not active", () => {
  const scope = { type: "account", id: "user-1" };
  const resource = { type: "session", id: "session-1" };
  const past = Date.now() - 1000;
  grant(db, scope, resource, "participant", past);
  expect(hasGrant(db, scope, resource, "participant")).toBe(false);
});

test("grant is idempotent for active grants", () => {
  const scope = { type: "account", id: "user-1" };
  const resource = { type: "session", id: "session-1" };
  const first = grant(db, scope, resource, "participant");
  const second = grant(db, scope, resource, "participant");
  expect(second).toBe(first);
});

test("re-grant after revoke reactivates same row", () => {
  const scope = { type: "account", id: "user-2" };
  const resource = { type: "session", id: "session-2" };
  const first = grant(db, scope, resource, "participant");
  revokeGrant(db, scope, resource, "participant");
  expect(hasGrant(db, scope, resource, "participant")).toBe(false);
  const second = grant(db, scope, resource, "participant");
  expect(second).toBe(first);
  expect(hasGrant(db, scope, resource, "participant")).toBe(true);
});

test("re-grant after expiry reactivates same row", () => {
  const scope = { type: "account", id: "user-3" };
  const resource = { type: "session", id: "session-3" };
  const past = Date.now() - 1000;
  const id = grant(db, scope, resource, "participant", past);
  expect(hasGrant(db, scope, resource, "participant")).toBe(false);
  const reactivated = grant(db, scope, resource, "participant");
  expect(reactivated).toBe(id);
  expect(hasGrant(db, scope, resource, "participant")).toBe(true);
});
