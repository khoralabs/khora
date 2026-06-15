type RouteHandler = (
  req: Request & { params: Record<string, string> },
) => Response | Promise<Response>;

type RouteTable = Record<string, Partial<Record<string, RouteHandler>>>;

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const segment = patternParts[i];
    const value = pathParts[i];
    if (segment === undefined || value === undefined) return null;
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodeURIComponent(value);
      continue;
    }
    if (segment !== value) return null;
  }
  return params;
}

/** Fallback dispatch for /api/* when Bun.serve's startup route table is stale under --hot. */
export async function dispatchApiRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const { apiRoutes } = await import("./routes.js");
  const routes = apiRoutes as unknown as RouteTable;

  for (const [pattern, methods] of Object.entries(routes)) {
    const params = matchPath(pattern, url.pathname);
    if (params === null) continue;

    const handler = methods[req.method];
    if (handler === undefined) continue;

    return handler(Object.assign(req, { params }));
  }

  return null;
}
