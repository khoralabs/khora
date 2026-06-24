import { requireRegistrySessionResponse } from "../auth/require-session";
import { canReadPersonalKg } from "../authz/policy.js";
import { getDb } from "../db/index";
import { getOrCreateUser } from "../identity/users";
import { authorizePersonalNamespaceRead } from "./access.js";
import {
  handleMemoriesEdgePreview,
  handleMemoriesGraph,
  handleMemoriesNamespaces,
  handleMemoriesSearch,
  memoriesUnavailableResponse,
  openMemoriesAccess,
} from "./api-handlers.js";
import { userScope } from "./namespaces.js";
import { openUserMemories } from "./store.js";

async function resolveUserMemoriesSession(
  req: Request,
  ownerId: string,
): Promise<
  | {
      access: ReturnType<typeof openMemoriesAccess>;
      viewerId: string;
      db: ReturnType<typeof getDb>;
    }
  | { response: Response }
> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { response: auth.response };

  const db = getDb();
  const viewer = await getOrCreateUser(db, auth.session.user.id);

  if (!(await canReadPersonalKg(viewer.id, ownerId))) {
    return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  try {
    const persistence = openUserMemories(ownerId);
    return { access: openMemoriesAccess(persistence), viewerId: viewer.id, db };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Memories unavailable";
    return { response: memoriesUnavailableResponse(message) };
  }
}

async function requireAuthorizedSharedPersonalNamespace(
  db: ReturnType<typeof getDb>,
  viewerId: string,
  ownerId: string,
  namespace: string | undefined,
): Promise<Response | null> {
  if (namespace === undefined || namespace.length === 0) {
    return Response.json({ error: "missing required query namespace" }, { status: 400 });
  }
  if (!(await authorizePersonalNamespaceRead(db, viewerId, namespace, ownerId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function handleUserMemoriesNamespaces(
  req: Request,
  ownerId: string,
): Promise<Response> {
  const resolved = await resolveUserMemoriesSession(req, ownerId);
  if ("response" in resolved) return resolved.response;

  return handleMemoriesNamespaces(resolved.access, [userScope(ownerId)]);
}

export async function handleUserMemoriesGraph(req: Request, ownerId: string): Promise<Response> {
  const resolved = await resolveUserMemoriesSession(req, ownerId);
  if ("response" in resolved) return resolved.response;

  const namespace = new URL(req.url).searchParams.get("namespace")?.trim();
  const authError = await requireAuthorizedSharedPersonalNamespace(
    resolved.db,
    resolved.viewerId,
    ownerId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesGraph(req, resolved.access);
}

export async function handleUserMemoriesEdgePreview(
  req: Request,
  ownerId: string,
): Promise<Response> {
  const resolved = await resolveUserMemoriesSession(req, ownerId);
  if ("response" in resolved) return resolved.response;

  const namespace = new URL(req.url).searchParams.get("namespace")?.trim();
  const authError = await requireAuthorizedSharedPersonalNamespace(
    resolved.db,
    resolved.viewerId,
    ownerId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesEdgePreview(req, resolved.access);
}

export async function handleUserMemoriesSearch(req: Request, ownerId: string): Promise<Response> {
  const resolved = await resolveUserMemoriesSession(req, ownerId);
  if ("response" in resolved) return resolved.response;

  const body = (await req.clone().json()) as { namespace?: string };
  const namespace = body.namespace?.trim();
  const authError = await requireAuthorizedSharedPersonalNamespace(
    resolved.db,
    resolved.viewerId,
    ownerId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesSearch(req, resolved.access);
}
