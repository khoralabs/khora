import { requireRegistrySessionResponse } from "../auth/require-session";
import { enforce, ResourceType } from "../authz/policy";
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
import { openOrgMemories } from "./store.js";

async function resolveOrgMemoriesAccess(
  req: Request,
  orgId: string,
): Promise<{ access: ReturnType<typeof openMemoriesAccess> } | { response: Response }> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { response: auth.response };

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!enforce(db, user.id, "org:member", { type: ResourceType.Organization, id: orgId })) {
    return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  try {
    const persistence = openOrgMemories(orgId);
    return { access: openMemoriesAccess(persistence) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Memories unavailable";
    return { response: memoriesUnavailableResponse(message) };
  }
}

export async function handleOrgMemoriesNamespaces(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesAccess(req, orgId);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesNamespaces(resolved.access);
}

export async function handleOrgMemoriesGraph(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesAccess(req, orgId);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesGraph(req, resolved.access);
}

export async function handleOrgMemoriesEdgePreview(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesAccess(req, orgId);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesEdgePreview(req, resolved.access);
}

export async function handleOrgMemoriesSearch(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesAccess(req, orgId);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesSearch(req, resolved.access);
}

export async function handleOrgMemoriesInvestigate(req: Request, orgId: string): Promise<Response> {
  const resolved = await resolveOrgMemoriesAccess(req, orgId);
  if ("response" in resolved) return resolved.response;
  return handleMemoriesInvestigate(req, resolved.access);
}
