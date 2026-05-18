import type { HostRouteDeps } from "./deps.ts";

export function handleHealth(): Response {
  return new Response("ok", { status: 200 });
}

export function handleReady(deps: HostRouteDeps): Response {
  try {
    deps.ctx.catalogDb.query("SELECT 1").run();
    deps.ctx.framesDb.query("SELECT 1").run();
    return new Response("ready", { status: 200 });
  } catch (err) {
    console.error("[atrium-server] readiness check failed", err);
    return new Response("not ready", { status: 503 });
  }
}
