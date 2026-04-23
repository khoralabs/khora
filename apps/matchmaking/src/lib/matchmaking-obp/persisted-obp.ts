import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";

function envTruthy(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, OBP uses in-memory SQLite only (no `runId` / `.obp` files). */
export function isObpMemoryMode(): boolean {
  return envTruthy("OBP_MEMORY") || envTruthy("MATCHMAKING_OBP_MEMORY");
}

/** Append OBP mutation lines to `obp-steps.jsonl` when dev UI or this flag is on. */
export function obpStepLogFromEnv(): boolean {
  return envTruthy("OBP_STEP_LOG");
}

/** Root directory for file-backed OBP runs (each `runId` is a subfolder). */
export function resolveObpDir(): string {
  const fromEnv = process.env.OBP_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), ".obp");
}

/** SQLite filename inside each run directory (not a full path). */
export function resolveObpSqliteFilename(): string {
  const fromEnv = process.env.OBP_SQLITE?.trim();
  if (!fromEnv) return "obp.sqlite";
  return basename(fromEnv.replace(/\\/g, "/"));
}

/** SQLite path for one negotiation run. */
export function resolveObpDatabasePath(runId: string): string {
  return join(resolveObpDir(), runId, resolveObpSqliteFilename());
}

/** JSONL append log for OBP mutations (same run folder as SQLite). */
export function resolveObpStepsJsonlPath(runId: string): string {
  return join(resolveObpDir(), runId, "obp-steps.jsonl");
}

export function ensureObpRunDir(runId: string): void {
  mkdirSync(join(resolveObpDir(), runId), { recursive: true });
}
