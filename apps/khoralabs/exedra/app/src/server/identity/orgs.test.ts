import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { ensureExedraSchema } from "../db/schema";
import { createOrg } from "../db/sessions";
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

test("createOrg provisions org with DID as primary key", async () => {
  const owner = await getOrCreateUser(db, "org-owner-id", "owner@example.com");
  const orgId = await createOrg(db, { name: "Acme", ownerId: owner.id });

  expect(orgId.startsWith("did:")).toBe(true);

  const second = await createOrg(db, { name: "Beta", ownerId: owner.id });
  expect(second).not.toBe(orgId);
  expect(second.startsWith("did:")).toBe(true);
});
