import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import { getUsersDatabase, resetUsersDatabase, seedDefaultHost } from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import { queueAccessTokenWorkflow } from "./access-token";

describe("queueAccessTokenWorkflow", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    seedDefaultHost(getUsersDatabase(), { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("returns null when hostSlug is missing", () => {
    expect(queueAccessTokenWorkflow({ email: "a@b.com" })).toBeNull();
  });

  test("queues when hostSlug is provided", () => {
    const result = queueAccessTokenWorkflow({ email: "a@b.com", hostSlug: "khora-local" });
    expect(result).not.toBeNull();
    expect(result?.inserted).toBe(true);
  });
});
