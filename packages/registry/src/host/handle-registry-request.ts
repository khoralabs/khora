import type { RegistryHostContext } from "./context";
import { handleOptions, withCors } from "./cors";
import type { RegistryIdentityRoutes } from "./ports/identity";

export type HandleRegistryRequestDeps = {
  host: RegistryHostContext;
  identityRoutes: RegistryIdentityRoutes;
};

/**
 * OPTIONS/CORS → identity routes → federation/ops host fetch.
 * Callers keep peer-IP ALS, health/ready, and HTML routes outside this helper.
 */
export async function handleRegistryRequest(
  req: Request,
  deps: HandleRegistryRequestDeps,
): Promise<Response> {
  const options = handleOptions(req);
  if (options !== null) return options;

  const path = new URL(req.url).pathname;
  const identityRes = await deps.identityRoutes.handle(req, path);
  if (identityRes !== null) {
    return withCors(req, identityRes);
  }

  return deps.host.fetch(req);
}
