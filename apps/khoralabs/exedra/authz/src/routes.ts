import { decide } from "./policy";
import {
  getOrgIdForTeam,
  listAccountIdsForOrgAdmin,
  listAccountIdsForTeam,
  listTeamIdsForAccount,
  listTeamIdsForOrg,
} from "./read-models";
import { AuthzRepository } from "./repository";
import { ensureAuthzServiceSchema } from "./schema";
import type { SqlDatabase } from "./sql";
import { Feature } from "./taxonomy";
import type { DecideRequest, EntityRef, GrantRequest, RelationshipRequest } from "./types";

type RouteHandler = (req: Request) => Promise<Response> | Response;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function requireBearer(req: Request, token: string): Response | null {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (match?.[1]?.trim() !== token) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function isEntityRef(value: unknown): value is EntityRef {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.type === "string" &&
    record.type.length > 0 &&
    typeof record.id === "string" &&
    record.id.length > 0
  );
}

function isGrantRequest(value: unknown): value is GrantRequest {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isEntityRef(record.scope) && isEntityRef(record.resource) && typeof record.feature === "string"
  );
}

function isRelationshipRequest(value: unknown): value is RelationshipRequest {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return isEntityRef(record.from) && isEntityRef(record.to) && typeof record.relation === "string";
}

function isDecideRequest(value: unknown): value is DecideRequest {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isEntityRef(record.subject) && isEntityRef(record.resource) && typeof record.action === "string"
  );
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createAuthzRoutes(db: SqlDatabase, token: string): Record<string, RouteHandler> {
  const repo = new AuthzRepository(db);

  async function authorized(req: Request): Promise<Response | null> {
    return requireBearer(req, token);
  }

  return {
    "GET /health": () => json({ ok: true }),

    "POST /schema/ensure": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      await ensureAuthzServiceSchema(db);
      return json({ ok: true });
    },

    "POST /grants": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<GrantRequest>(req);
      if (!isGrantRequest(body)) return json({ error: "Invalid grant request" }, { status: 400 });
      const id = await repo.grant(body.scope, body.resource, body.feature, body.expiresAtMs);
      return json({ id });
    },

    "DELETE /grants": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<GrantRequest>(req);
      if (!isGrantRequest(body)) return json({ error: "Invalid grant request" }, { status: 400 });
      await repo.revokeGrant(body.scope, body.resource, body.feature);
      return json({ ok: true });
    },

    "POST /grants/revoke-for-scope-feature": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (body === null || !isEntityRef(body.scope) || typeof body.feature !== "string") {
        return json({ error: "Invalid revoke request" }, { status: 400 });
      }
      const resourceType = typeof body.resourceType === "string" ? body.resourceType : undefined;
      await repo.revokeActiveGrantsForScopeFeature(body.scope, body.feature, resourceType);
      return json({ ok: true });
    },

    "POST /grants/revoke-referencing-resource": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (body === null || !isEntityRef(body.resource)) {
        return json({ error: "Invalid revoke request" }, { status: 400 });
      }
      await repo.revokeAllGrantsReferencingResource(body.resource);
      return json({ ok: true });
    },

    "POST /relationships": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<RelationshipRequest>(req);
      if (!isRelationshipRequest(body)) {
        return json({ error: "Invalid relationship request" }, { status: 400 });
      }
      const id = await repo.relate(body.from, body.relation, body.to, body.expiresAtMs);
      return json({ id });
    },

    "DELETE /relationships": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<RelationshipRequest>(req);
      if (!isRelationshipRequest(body)) {
        return json({ error: "Invalid relationship request" }, { status: 400 });
      }
      await repo.revokeRelationship(body.from, body.relation, body.to);
      return json({ ok: true });
    },

    "POST /decide": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<DecideRequest>(req);
      if (!isDecideRequest(body)) return json({ error: "Invalid decide request" }, { status: 400 });
      return json(await decide(repo, body));
    },

    "POST /decide/batch": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<{ requests?: unknown }>(req);
      if (body === null || !Array.isArray(body.requests)) {
        return json({ error: "Invalid batch decide request" }, { status: 400 });
      }
      const results = [];
      for (const request of body.requests) {
        if (!isDecideRequest(request)) {
          return json({ error: "Invalid decide request in batch" }, { status: 400 });
        }
        results.push(await decide(repo, request));
      }
      return json({ results });
    },

    "POST /query/grants/for-scope": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (body === null || !isEntityRef(body.scope)) {
        return json({ error: "Invalid query request" }, { status: 400 });
      }
      return json({ grants: await repo.listGrantsForScope(body.scope) });
    },

    "POST /query/grants/scopes-for-resource": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (
        body === null ||
        !isEntityRef(body.resource) ||
        typeof body.feature !== "string" ||
        typeof body.scopeType !== "string"
      ) {
        return json({ error: "Invalid query request" }, { status: 400 });
      }
      return json({
        scopeIds: await repo.listGrantScopeIdsForResource(
          body.resource,
          body.feature,
          body.scopeType,
        ),
      });
    },

    "POST /query/grants/has": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (
        body === null ||
        !isEntityRef(body.scope) ||
        !isEntityRef(body.resource) ||
        typeof body.feature !== "string"
      ) {
        return json({ error: "Invalid query request" }, { status: 400 });
      }
      return json({
        hasGrant: await repo.hasGrant(body.scope, body.resource, body.feature),
      });
    },

    "POST /query/grants/scope-has-any": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (
        body === null ||
        !isEntityRef(body.scope) ||
        typeof body.resourceType !== "string" ||
        typeof body.feature !== "string"
      ) {
        return json({ error: "Invalid query request" }, { status: 400 });
      }
      return json({
        hasGrant: await repo.scopeHasAnyGrant(body.scope, body.resourceType, body.feature),
      });
    },

    "POST /query/relationships/related-from": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (body === null || !isEntityRef(body.entity) || typeof body.relation !== "string") {
        return json({ error: "Invalid query request" }, { status: 400 });
      }
      const filterType = typeof body.filterType === "string" ? body.filterType : undefined;
      return json({
        entities: await repo.listRelatedFrom(body.entity, body.relation, filterType),
      });
    },

    "POST /query/relationships/related-to": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      if (body === null || !isEntityRef(body.entity) || typeof body.relation !== "string") {
        return json({ error: "Invalid query request" }, { status: 400 });
      }
      const filterType = typeof body.filterType === "string" ? body.filterType : undefined;
      return json({
        entities: await repo.getRelatedTo(body.entity, body.relation, filterType),
      });
    },

    "POST /query/org-for-team": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      const teamId = body === null ? null : stringField(body, "teamId");
      if (teamId === null) return json({ error: "teamId is required" }, { status: 400 });
      return json({ orgId: await getOrgIdForTeam(repo, teamId) });
    },

    "POST /query/teams-for-org": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      const orgId = body === null ? null : stringField(body, "orgId");
      if (orgId === null) return json({ error: "orgId is required" }, { status: 400 });
      return json({ teamIds: await listTeamIdsForOrg(repo, orgId) });
    },

    "POST /query/accounts-for-team": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      const teamId = body === null ? null : stringField(body, "teamId");
      if (teamId === null) return json({ error: "teamId is required" }, { status: 400 });
      const feature = typeof body?.feature === "string" ? body.feature : Feature.Member;
      return json({ accountIds: await listAccountIdsForTeam(repo, teamId, feature) });
    },

    "POST /query/accounts-for-org-admin": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      const orgId = body === null ? null : stringField(body, "orgId");
      if (orgId === null) return json({ error: "orgId is required" }, { status: 400 });
      return json({ accountIds: await listAccountIdsForOrgAdmin(repo, orgId) });
    },

    "POST /query/teams-for-account": async (req) => {
      const error = await authorized(req);
      if (error !== null) return error;
      const body = await readJson<Record<string, unknown>>(req);
      const accountId = body === null ? null : stringField(body, "accountId");
      if (accountId === null) return json({ error: "accountId is required" }, { status: 400 });
      return json({ teamIds: await listTeamIdsForAccount(repo, accountId) });
    },
  };
}

export async function dispatchAuthzRoute(
  routes: Record<string, RouteHandler>,
  req: Request,
): Promise<Response> {
  const url = new URL(req.url);
  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];
  if (handler === undefined) return json({ error: "Not found" }, { status: 404 });
  return handler(req);
}

export { ensureAuthzServiceSchema } from "./schema";
