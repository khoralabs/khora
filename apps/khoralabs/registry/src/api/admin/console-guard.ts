import type { ConsoleAuth } from "@khoralabs/atrium-console";

export async function withConsoleAuth(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  if (consoleAuth === null) {
    return Response.json({ error: "Admin console is not configured" }, { status: 503 });
  }
  const principal = await consoleAuth.authenticate(req);
  if (principal === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
