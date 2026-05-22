import { timingSafeEqual } from "node:crypto";
import { adminStatsSummaryResponse } from "./stats.ts";
import { lookupAccountResponse, lookupEmailResponse } from "./lookup.ts";

function authorizeInternal(req: Request): boolean {
  const secret = process.env.REGISTRY_INTERNAL_SECRET?.trim();
  if (secret === undefined || secret.length === 0) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return false;
  const token = auth.slice(prefix.length);
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function handleInternalAdminStatsSummary(req: Request): Response {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return adminStatsSummaryResponse();
}

export function handleInternalLookupEmail(req: Request, url: URL): Response {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return lookupEmailResponse(url.searchParams.get("email") ?? "");
}

export function handleInternalLookupAccount(req: Request, url: URL): Response {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return lookupAccountResponse(url.searchParams.get("id") ?? "");
}
