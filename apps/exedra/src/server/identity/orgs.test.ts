import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { ensureExedraSchema } from "../db/schema";
import { createOrg } from "../db/sessions";
import { getOrCreateOrgIdentity } from "../identity/orgs";
import { getOrCreateUser } from "../identity/users";

let db: Database;

beforeAll(() => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterAll(() => {
  db.close();
});

test("getOrCreateOrgIdentity provisions and returns stable DID", async () => {
  const owner = await getOrCreateUser(db, "org-owner-id", "owner@example.com");
  const orgId = createOrg(db, { name: "Acme", ownerId: owner.id });

  const first = await getOrCreateOrgIdentity(db, orgId);
  const second = await getOrCreateOrgIdentity(db, orgId);

  expect(first.did.length).toBeGreaterThan(0);
  expect(second.did).toBe(first.did);
  expect(first.did.startsWith("did:")).toBe(true);
});
