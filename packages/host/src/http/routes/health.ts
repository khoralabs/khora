import { logger } from "../logger";
import type { HostRouteDeps } from "./deps";

export function handleHealth(): Response {
  return Response.json({ ok: true as const });
}

export function handleReady(deps: HostRouteDeps): Response {
  try {
    deps.ctx.health.ping();
    return new Response("ready", { status: 200 });
  } catch (err) {
    logger.error({ err }, "readiness check failed");
    return new Response("not ready", { status: 503 });
  }
}
