import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { entitle, hasEntitlement, revokeEntitlement } from "./entitlements";
import { ensureAuthzSchema } from "./schema";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  ensureAuthzSchema(db);
});

afterEach(() => {
  db.close();
});

test("entitle and hasEntitlement return true for active entitlement", () => {
  const scope = { type: "team", id: "team-1" };
  entitle(db, scope, "create_session");
  expect(hasEntitlement(db, scope, "create_session")).toBe(true);
});

test("revokeEntitlement removes active entitlement", () => {
  const scope = { type: "team", id: "team-1" };
  entitle(db, scope, "create_session");
  revokeEntitlement(db, scope, "create_session");
  expect(hasEntitlement(db, scope, "create_session")).toBe(false);
});

test("entitle is idempotent for active entitlements", () => {
  const scope = { type: "team", id: "team-2" };
  const first = entitle(db, scope, "create_session");
  const second = entitle(db, scope, "create_session");
  expect(second).toBe(first);
});

test("re-entitle after revoke reactivates same row", () => {
  const scope = { type: "team", id: "team-3" };
  const first = entitle(db, scope, "create_session");
  revokeEntitlement(db, scope, "create_session");
  const second = entitle(db, scope, "create_session");
  expect(second).toBe(first);
  expect(hasEntitlement(db, scope, "create_session")).toBe(true);
});

test("expired entitlement is not active", () => {
  const scope = { type: "team", id: "team-1" };
  entitle(db, scope, "create_session", Date.now() - 1000);
  expect(hasEntitlement(db, scope, "create_session")).toBe(false);
});
