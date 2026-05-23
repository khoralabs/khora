import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  createAccessTokenRequest,
  findAccessTokenRequest,
  getUsersDatabase,
  initUsersSchema,
  resetUsersDatabase,
  seedDefaultHost,
  subscribeMarketing,
} from "@khoralabs/users";

describe("registry domain", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getUsersDatabase();
    await initUsersSchema(db);
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("access-token request dedupes by email and host", () => {
    const db = getUsersDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const first = createAccessTokenRequest(db, { email: "a@b.com", hostId: host.id });
    const second = createAccessTokenRequest(db, { email: "a@b.com", hostId: host.id });
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(findAccessTokenRequest(db, "a@b.com", host.id)?.status).toBe("pending");
  });

  test("marketing subscribe stores consent", () => {
    const db = getUsersDatabase();
    const consent = subscribeMarketing(db, {
      email: "a@b.com",
      listSlug: "atrium-waitlist",
      sourceApp: "test",
    });
    expect(consent.listSlug).toBe("atrium-waitlist");
    expect(consent.sourceApp).toBe("test");
  });
});
