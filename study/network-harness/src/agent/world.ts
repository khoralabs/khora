import path from "node:path";

import { getWorld } from "workflow/runtime";

import { resolveAgentDataDir } from "./paths";

let started = false;

export function configureTursoWorldEnv(): void {
  const dataDir = resolveAgentDataDir();
  process.env.WORKFLOW_TARGET_WORLD ??= "@workflow-worlds/turso";
  process.env.WORKFLOW_TURSO_DATABASE_URL ??= `file:${path.join(dataDir, "workflow.db")}`;
  process.env.WORKFLOW_SERVICE_URL ??= `http://localhost:${process.env.PORT ?? "3000"}`;
}

export async function startTursoWorldWorker(): Promise<void> {
  if (started) return;
  configureTursoWorldEnv();
  const world = getWorld();
  if (typeof world.start === "function") {
    await world.start();
  }
  started = true;
}
