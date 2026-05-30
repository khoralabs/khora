import { authorizeRegistryInternal } from "../registry-internal";
import { lookupAccountResponse, lookupEmailResponse } from "./lookup";
import { adminStatsSummaryResponse } from "./stats";

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
