import { authorizeRegistryInternal } from "../registry-internal.ts";
import { lookupAccountResponse, lookupEmailResponse } from "./lookup.ts";
import { adminStatsSummaryResponse } from "./stats.ts";

export function handleInternalAdminStatsSummary(req: Request): Response {
  if (!authorizeRegistryInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return adminStatsSummaryResponse();
}

export function handleInternalLookupEmail(req: Request, url: URL): Response {
  if (!authorizeRegistryInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return lookupEmailResponse(url.searchParams.get("email") ?? "");
}

export function handleInternalLookupAccount(req: Request, url: URL): Response {
  if (!authorizeRegistryInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return lookupAccountResponse(url.searchParams.get("id") ?? "");
}
