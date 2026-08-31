import { runWithRequestPeerIp } from "./client-ip";
import type { RegistryHostContext } from "./context";
import { handleOptions, withCors } from "./cors";
import type { RegistryIdentityRoutes } from "./ports/identity";

export type HandleRegistryRequestDeps = {
  host: RegistryHostContext;
  identityRoutes: RegistryIdentityRoutes;
  /** Optional Bun/socket peer IP; when set, wraps the handler in peer-IP ALS. */
  peerIp?: string | null;
  /** Override default liveness `{ ok: true }` for `/health`. */
  onHealth?: () => Response | Promise<Response>;
  /** When set, short-circuits `/ready` before identity/host dispatch. */
  onReady?: () => Response | Promise<Response>;
};

/**
 * OPTIONS/CORS → optional /health|/ready → identity routes → federation/ops host fetch.
 * HTML routes stay outside this helper (Bun `serve({ routes })`).
 */
export async function handleRegistryRequest(
  req: Request,
  deps: HandleRegistryRequestDeps,
): Promise<Response> {
  if (deps.peerIp !== undefined) {
    return runWithRequestPeerIp(deps.peerIp, () => handleRegistryRequestInner(req, deps));
  }
  return handleRegistryRequestInner(req, deps);
}

async function handleRegistryRequestInner(
  req: Request,
  deps: HandleRegistryRequestDeps,
): Promise<Response> {
  const options = handleOptions(req);
  if (options !== null) return options;

  const path = new URL(req.url).pathname;

  if (path === "/health") {
    const res = deps.onHealth !== undefined ? await deps.onHealth() : Response.json({ ok: true });
    return withCors(req, res);
  }

  if (path === "/ready" && deps.onReady !== undefined) {
    return withCors(req, await deps.onReady());
  }

  const identityRes = await deps.identityRoutes.handle(req, path);
  if (identityRes !== null) {
    return withCors(req, identityRes);
  }

  return deps.host.fetch(req);
}
