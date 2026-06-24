import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { getOrCreateUser } from "../identity/users";
import { authorizeOrgNamespaceRead, listReadableOrgNamespaces } from "./access.js";
import {
  handleMemoriesEdgePreview,
  handleMemoriesGraph,
  handleMemoriesNamespaces,
  handleMemoriesSearch,
  memoriesUnavailableResponse,
  openMemoriesAccess,
} from "./api-handlers.js";
import { openOrgMemories } from "./store.js";

async function resolveOrgMemoriesSession(
  req: Request,
  orgId: string,
): Promise<
  | {
      access: ReturnType<typeof openMemoriesAccess>;
      userId: string;
      db: ReturnType<typeof getDb>;
    }
  | { response: Response }
> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { response: auth.response };

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  try {
    const persistence = openOrgMemories(orgId);
    return { access: openMemoriesAccess(persistence), userId: user.id, db };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Memories unavailable";
    return { response: memoriesUnavailableResponse(message) };
  }
}

function namespaceForbiddenResponse(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

async function requireAuthorizedOrgNamespace(
  db: ReturnType<typeof getDb>,
  userId: string,
  orgId: string,
  namespace: string | undefined,
): Promise<Response | null> {
  if (namespace === undefined || namespace.length === 0) {
    return Response.json({ error: "missing required query namespace" }, { status: 400 });
  }
  if (!(await authorizeOrgNamespaceRead(db, userId, orgId, namespace))) {
    return namespaceForbiddenResponse();
  }
  return null;
}

export async function handleOrgMemoriesNamespaces(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesSession(req, orgId);
  if ("response" in resolved) return resolved.response;

  const namespaces = await listReadableOrgNamespaces(resolved.db, resolved.userId, orgId);
  return handleMemoriesNamespaces(resolved.access, namespaces);
}

export async function handleOrgMemoriesGraph(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesSession(req, orgId);
  if ("response" in resolved) return resolved.response;

  const namespace = new URL(req.url).searchParams.get("namespace")?.trim();
  const authError = await requireAuthorizedOrgNamespace(
    resolved.db,
    resolved.userId,
    orgId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesGraph(req, resolved.access);
}

export async function handleOrgMemoriesEdgePreview(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesSession(req, orgId);
  if ("response" in resolved) return resolved.response;

  const namespace = new URL(req.url).searchParams.get("namespace")?.trim();
  const authError = await requireAuthorizedOrgNamespace(
    resolved.db,
    resolved.userId,
    orgId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesEdgePreview(req, resolved.access);
}

export async function handleOrgMemoriesSearch(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesSession(req, orgId);
  if ("response" in resolved) return resolved.response;

  const body = (await req.clone().json()) as { namespace?: string };
  const namespace = body.namespace?.trim();
  const authError = await requireAuthorizedOrgNamespace(
    resolved.db,
    resolved.userId,
    orgId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesSearch(req, resolved.access);
}
