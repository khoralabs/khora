import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { getOrCreateUser } from "../identity/users";
import { authorizePersonalNamespaceRead, listReadablePersonalNamespaces } from "./access.js";
import {
  handleMemoriesEdgePreview,
  handleMemoriesGraph,
  handleMemoriesNamespaces,
  handleMemoriesSearch,
  memoriesUnavailableResponse,
  openMemoriesAccess,
} from "./api-handlers.js";
import { openUserMemories } from "./store.js";

async function resolveMeMemoriesSession(req: Request): Promise<
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
    const persistence = openUserMemories(user.id);
    return { access: openMemoriesAccess(persistence), userId: user.id, db };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Memories unavailable";
    return { response: memoriesUnavailableResponse(message) };
  }
}

function requireAuthorizedPersonalNamespace(
  db: ReturnType<typeof getDb>,
  userId: string,
  ownerId: string,
  namespace: string | undefined,
): Response | null {
  if (namespace === undefined || namespace.length === 0) {
    return Response.json({ error: "missing required query namespace" }, { status: 400 });
  }
  if (!authorizePersonalNamespaceRead(db, userId, namespace, ownerId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function handleMeMemoriesNamespaces(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesSession(req);
  if ("response" in resolved) return resolved.response;

  const namespaces = listReadablePersonalNamespaces(resolved.db, resolved.userId);
  return handleMemoriesNamespaces(resolved.access, namespaces);
}

export async function handleMeMemoriesGraph(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesSession(req);
  if ("response" in resolved) return resolved.response;

  const namespace = new URL(req.url).searchParams.get("namespace")?.trim();
  const authError = requireAuthorizedPersonalNamespace(
    resolved.db,
    resolved.userId,
    resolved.userId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesGraph(req, resolved.access);
}

export async function handleMeMemoriesEdgePreview(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesSession(req);
  if ("response" in resolved) return resolved.response;

  const namespace = new URL(req.url).searchParams.get("namespace")?.trim();
  const authError = requireAuthorizedPersonalNamespace(
    resolved.db,
    resolved.userId,
    resolved.userId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesEdgePreview(req, resolved.access);
}

export async function handleMeMemoriesSearch(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesSession(req);
  if ("response" in resolved) return resolved.response;

  const body = (await req.clone().json()) as { namespace?: string };
  const namespace = body.namespace?.trim();
  const authError = requireAuthorizedPersonalNamespace(
    resolved.db,
    resolved.userId,
    resolved.userId,
    namespace,
  );
  if (authError !== null) return authError;

  return handleMemoriesSearch(req, resolved.access);
}
