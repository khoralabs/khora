import type { HTMLBundle, Serve } from "bun";
import type { WebUiMount } from "./config";

/** `Bun.serve({ routes })` — any string path to HTML manifest or handler */
export type BunServeRoutes = Serve.Routes<undefined, string>;

/**
 * Map each mount's route keys to the same HTML manifest (SPA aliases).
 * Pass imports keyed by mount `name` from web-ui.config.ts.
 */
export function buildRoutesFromMounts(
  mounts: WebUiMount[],
  imports: Record<string, HTMLBundle>,
): BunServeRoutes {
  const routes = {} as BunServeRoutes;
  for (const mount of mounts) {
    const handler = imports[mount.name];
    if (handler === undefined) {
      throw new Error(`bun-web: missing import for mount "${mount.name}"`);
    }
    for (const route of mount.routes) {
      (routes as Record<string, HTMLBundle>)[route] = handler;
    }
  }
  return routes;
}
