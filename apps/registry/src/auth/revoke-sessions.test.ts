import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { reloadRegistryAuth, revokeBetterAuthSessionsForUser } from "./auth";

describe("revokeBetterAuthSessionsForUser", () => {
  let sqlite: Database;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-32chars-min";
    sqlite = new Database(":memory:");
    sqlite.run(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        token TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);
    reloadRegistryAuth({ database: sqlite });
  });

  afterEach(() => {
    reloadRegistryAuth({ database: undefined });
    sqlite.close();
    delete process.env.BETTER_AUTH_SECRET;
  });

  test("deletes all sessions for the user id", async () => {
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("s1", "user-a", "tok-1", now + 60_000, now, now);
    sqlite
      .prepare(
        `INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("s2", "user-a", "tok-2", now + 60_000, now, now);
    sqlite
      .prepare(
        `INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("s3", "user-b", "tok-3", now + 60_000, now, now);

    await revokeBetterAuthSessionsForUser("user-a");

    const remaining = sqlite.prepare(`SELECT id, userId FROM session ORDER BY id`).all() as {
      id: string;
      userId: string;
    }[];
    expect(remaining).toEqual([{ id: "s3", userId: "user-b" }]);
  });
});
