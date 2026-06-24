import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createIsolatedAuthzDatabase, installTestAuthzService } from "../authz/test-service";
import { getOrg } from "../db/membership";
import { ensureExedraSchema } from "../db/schema";
import { createOrg } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { resolveMessageAuthor } from "./resolve-author";

let db: Database;
let authzDb: Database;
let orgId: string;
let userDid: string;
let org: NonNullable<ReturnType<typeof getOrg>>;

beforeAll(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  authzDb = createIsolatedAuthzDatabase();

  installTestAuthzService(authzDb);

  db = new Database(":memory:");
  ensureExedraSchema(db);

  const user = await getOrCreateUser(db, "author-user-id", "author@example.com");
  userDid = user.id;
  orgId = await createOrg(db, { name: "Acme", ownerId: user.id });
  org = getOrg(db, orgId) as NonNullable<ReturnType<typeof getOrg>>;
  if (org === null) throw new Error("org not found");
});

afterAll(() => {
  db.close();
});

test("resolveMessageAuthor returns org agent for org DID", () => {
  const author = resolveMessageAuthor(db, { authorDid: orgId, org });
  expect(author?.kind).toBe("org_agent");
  expect(author?.name).toBe("Acme via Agent");
  expect(author?.did).toBe(orgId);
});

test("resolveMessageAuthor returns user for user DID", () => {
  const author = resolveMessageAuthor(db, { authorDid: userDid, org });
  expect(author?.kind).toBe("user");
  expect(author?.did).toBe(userDid);
});
