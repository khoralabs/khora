import type { Database } from "bun:sqlite";

import { canReadPersonalKg } from "../authz/policy.js";
import { encodePrincipalIdForMemories } from "./encode-principal-id.js";

export async function assertInternalPersonalMemorySearchAllowed(
  _db: Database,
  params: { userId: string; namespace: string; orgId?: string },
): Promise<Response | null> {
  const namespace = params.namespace.trim();
  if (namespace.length === 0 || namespace.startsWith("org/")) {
    return null;
  }

  const encodedUser = encodePrincipalIdForMemories(params.userId);
  if (!namespace.startsWith(encodedUser)) {
    return null;
  }

  const segments = namespace.split("/").filter((segment) => segment.length > 0);
  const isSessionPersonalNamespace =
    segments.length >= 6 && segments[1] === "org" && segments[3] === "team";
  if (!isSessionPersonalNamespace) {
    return null;
  }

  const orgId = params.orgId?.trim() ?? "";
  if (orgId.length === 0) {
    return Response.json(
      { error: "orgId is required for session personal memory search" },
      { status: 403 },
    );
  }

  if (await canReadPersonalKg(params.userId, params.userId)) {
    return null;
  }

  if (!(await canReadPersonalKg(orgId, params.userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
