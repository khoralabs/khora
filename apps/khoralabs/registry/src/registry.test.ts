import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
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

  test("marketing subscribe stores consent", () => {
    const db = getUsersDatabase();
    const consent = subscribeMarketing(db, {
      email: "a@b.com",
      listSlug: "khora-waitlist",
      sourceApp: "test",
    });
    expect(consent.listSlug).toBe("khora-waitlist");
    expect(consent.sourceApp).toBe("test");
  });
});
