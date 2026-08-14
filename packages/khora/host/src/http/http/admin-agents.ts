import { withAdminTokenAuth } from "./admin-token-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

function parseDidFromPath(
  pathname: string,
): { did: string; action: string | undefined } | undefined {
  if (!pathname.startsWith("/admin/api/agents/")) return undefined;
  const suffix = pathname.slice("/admin/api/agents/".length);
  const parts = suffix.split("/").filter((part) => part.length > 0);
  const rawDid = parts[0];
  if (rawDid === undefined || rawDid.length === 0) return undefined;
  return {
    did: decodeURIComponent(rawDid).trim(),
    action: parts[1],
  };
}

export async function handleAdminAgentsRoute(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  const parsed = parseDidFromPath(url.pathname);
  if (parsed === undefined || parsed.did.length === 0) {
    return jsonError("agent did required", 400);
  }
  const { did, action } = parsed;

  if (req.method === "POST" && action === "suspend") {
    return withAdminTokenAuth(req, deps, async () => {
      deps.ctx.agentAccountStatus.setStatus(did, "suspended");
      return Response.json({ did, status: "suspended" });
    });
  }

  if (req.method === "POST" && action === "reactivate") {
    return withAdminTokenAuth(req, deps, async () => {
      deps.ctx.agentAccountStatus.clearStatus(did);
      return Response.json({ did, status: null });
    });
  }

  if (req.method === "DELETE" && action === undefined) {
    return withAdminTokenAuth(req, deps, async () => {
      deps.ctx.agentAccountStatus.setStatus(did, "deleted");
      if (deps.ctx.host.persistenceClient.registrationExists(did)) {
        await deps.ctx.phase1UnregisterPrincipal(did);
      }
      return Response.json({ did, status: "deleted" });
    });
  }

  return undefined;
}
