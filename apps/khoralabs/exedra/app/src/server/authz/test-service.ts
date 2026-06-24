import type { SQLQueryBindings } from "bun:sqlite";
import { Database } from "bun:sqlite";
import { type AuthzClient, createAuthzClient } from "@khoralabs/exedra-authz";
import {
  createAuthzRoutes,
  dispatchAuthzRoute,
  ensureAuthzServiceSchema,
} from "@khoralabs/exedra-authz/routes";
import type { SqlDatabase } from "@khoralabs/exedra-authz/sql";

import { resetAuthzServiceClient, setAuthzServiceClientForTests } from "./service-client";

class BunSqliteDatabase implements SqlDatabase {
  constructor(private readonly db: Database) {}

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      run: async (args: unknown[] = []) => {
        stmt.run(...(args as SQLQueryBindings[]));
      },
      all: async <T>(args: unknown[] = []) => stmt.all(...(args as SQLQueryBindings[])) as T[],
      get: async <T>(args: unknown[] = []) =>
        (stmt.get(...(args as SQLQueryBindings[])) as T | null) ?? null,
    };
  }

  exec(sql: string) {
    this.db.run(sql);
  }
}

const TEST_TOKEN = "test-authz-token";

export function createTestAuthzClient(db: Database): AuthzClient {
  const authzDb = new BunSqliteDatabase(db);
  void ensureAuthzServiceSchema(authzDb);
  const routes = createAuthzRoutes(authzDb, TEST_TOKEN);
  return createAuthzClient({
    baseUrl: "http://authz.test",
    token: TEST_TOKEN,
    fetchFn: (req, init) => {
      const request =
        req instanceof Request ? new Request(req, init) : new Request(req.toString(), init);
      return dispatchAuthzRoute(routes, request);
    },
  });
}

export function installTestAuthzService(db: Database): AuthzClient {
  const client = createTestAuthzClient(db);
  setAuthzServiceClientForTests(client);
  return client;
}

export function uninstallTestAuthzService(): void {
  resetAuthzServiceClient();
}

export function createIsolatedAuthzDatabase(): Database {
  return new Database(":memory:");
}
