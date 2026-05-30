import { logger } from "../logger";
import type { HostRouteDeps } from "./deps";

export function handleHealth(): Response {
  return new Response("ok", { status: 200 });
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
