import type { SQLQueryBindings } from "bun:sqlite";
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { createAuthzClient } from "./client";
import { decide } from "./policy";
import { AuthzRepository } from "./repository";
import { createAuthzRoutes, dispatchAuthzRoute } from "./routes";
import { ensureAuthzServiceSchema } from "./schema";
import type { SqlDatabase } from "./sql";
import { AuthAction, EntityType, Feature, Relation } from "./taxonomy";

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

let sqlite: Database;
let db: SqlDatabase;
let repo: AuthzRepository;

beforeEach(async () => {
  sqlite = new Database(":memory:");
  db = new BunSqliteDatabase(sqlite);
  await ensureAuthzServiceSchema(db);
  repo = new AuthzRepository(db);
});

afterEach(() => {
  sqlite.close();
});

test("grant and decide allow direct session participant", async () => {
  await repo.grant(
    { type: EntityType.Account, id: "user-1" },
    { type: EntityType.Session, id: "session-1" },
    Feature.Participant,
  );

  const result = await decide(repo, {
    subject: { type: EntityType.Account, id: "user-1" },
    action: AuthAction.SessionView,
    resource: { type: EntityType.Session, id: "session-1" },
  });

  expect(result.allowed).toBe(true);
});

test("team scoped session participant grant inherits through team membership", async () => {
  await repo.grant(
    { type: EntityType.Account, id: "user-1" },
    { type: EntityType.Team, id: "team-1" },
    Feature.Member,
  );
  await repo.relate({ type: EntityType.Account, id: "user-1" }, Relation.MemberOf, {
    type: EntityType.Team,
    id: "team-1",
  });
  await repo.grant(
    { type: EntityType.Team, id: "team-1" },
    { type: EntityType.Session, id: "session-1" },
    Feature.Participant,
  );

  const result = await decide(repo, {
    subject: { type: EntityType.Account, id: "user-1" },
    action: AuthAction.SessionView,
    resource: { type: EntityType.Session, id: "session-1" },
  });

  expect(result.allowed).toBe(true);
});

test("query endpoints return org and team membership", async () => {
  const routes = createAuthzRoutes(db, "test-token");
  const client = createAuthzClient({
    baseUrl: "http://authz.test",
    token: "test-token",
    fetchFn: (req, init) => {
      const request =
        req instanceof Request ? new Request(req, init) : new Request(req.toString(), init);
      return dispatchAuthzRoute(routes, request);
    },
  });

  await client.grant({
    scope: { type: EntityType.Team, id: "team-1" },
    resource: { type: EntityType.Organization, id: "org-1" },
    feature: Feature.Member,
  });
  await client.relate({
    from: { type: EntityType.Team, id: "team-1" },
    relation: Relation.MemberOf,
    to: { type: EntityType.Organization, id: "org-1" },
  });

  const orgForTeam = await client.getOrgIdForTeam({ teamId: "team-1" });
  expect(orgForTeam.orgId).toBe("org-1");

  const teamsForOrg = await client.listTeamIdsForOrg({ orgId: "org-1" });
  expect(teamsForOrg.teamIds).toContain("team-1");
});

test("batch decide returns per-request results", async () => {
  await repo.grant(
    { type: EntityType.Account, id: "user-2" },
    { type: EntityType.Team, id: "team-2" },
    Feature.Member,
  );

  const routes = createAuthzRoutes(db, "test-token");
  const client = createAuthzClient({
    baseUrl: "http://authz.test",
    token: "test-token",
    fetchFn: (req, init) => {
      const request =
        req instanceof Request ? new Request(req, init) : new Request(req.toString(), init);
      return dispatchAuthzRoute(routes, request);
    },
  });

  const batch = await client.decideBatch({
    requests: [
      {
        subject: { type: EntityType.Account, id: "user-2" },
        action: AuthAction.TeamMember,
        resource: { type: EntityType.Team, id: "team-2" },
      },
      {
        subject: { type: EntityType.Account, id: "user-2" },
        action: AuthAction.TeamMember,
        resource: { type: EntityType.Team, id: "missing-team" },
      },
    ],
  });

  expect(batch.results.map((result) => result.allowed)).toEqual([true, false]);
});
