import type { ConsoleAuth } from "@khoralabs/atrium-console";
import type { HostRouteDeps } from "./deps.ts";
import { jsonError } from "./responses.ts";

export async function withConsoleAuth(
  req: Request,
  deps: HostRouteDeps,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  if (deps.consoleAuth === null) {
    return jsonError("Admin console is not configured", 503);
  }
  const principal = await deps.consoleAuth.authenticate(req);
  if (principal === null) {
    return jsonError("Unauthorized", 401);
  }
  return handler();
}

export async function routeConsoleAuth(
  req: Request,
  url: URL,
  consoleAuth: ConsoleAuth | null,
): Promise<Response | undefined> {
  if (consoleAuth?.route === undefined) return undefined;
  return consoleAuth.route(req, url);
}
