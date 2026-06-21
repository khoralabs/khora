import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { getOrCreateUser } from "../identity/users";
import {
  handleMemoriesEdgePreview,
  handleMemoriesGraph,
  handleMemoriesInvestigate,
  handleMemoriesNamespaces,
  handleMemoriesSearch,
  memoriesUnavailableResponse,
  openMemoriesAccess,
} from "./api-handlers.js";
import { openUserMemories } from "./store.js";

async function resolveMeMemoriesAccess(
  req: Request,
): Promise<{ access: ReturnType<typeof openMemoriesAccess> } | { response: Response }> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { response: auth.response };

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  try {
    const persistence = openUserMemories(user.id);
    return { access: openMemoriesAccess(persistence) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Memories unavailable";
    return { response: memoriesUnavailableResponse(message) };
  }
}

export async function handleMeMemoriesNamespaces(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesAccess(req);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesNamespaces(resolved.access);
}

export async function handleMeMemoriesGraph(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesAccess(req);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesGraph(req, resolved.access);
}

export async function handleMeMemoriesEdgePreview(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesAccess(req);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesEdgePreview(req, resolved.access);
}

export async function handleMeMemoriesSearch(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesAccess(req);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesSearch(req, resolved.access);
}

export async function handleMeMemoriesInvestigate(req: Request): Promise<Response> {
  const resolved = await resolveMeMemoriesAccess(req);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesInvestigate(req, resolved.access);
}
