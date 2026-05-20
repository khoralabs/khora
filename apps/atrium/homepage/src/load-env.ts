import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Apply KEY=VALUE lines from a dotenv file into process.env. */
function applyEnvFile(path: string, override: boolean): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key.length === 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

const appRoot = resolve(import.meta.dir, "..");
const monorepoRoot = resolve(appRoot, "../../..");

// Monorepo root first, then app .env (app wins on conflicts).
applyEnvFile(resolve(monorepoRoot, ".env"), false);
applyEnvFile(resolve(monorepoRoot, ".env.local"), true);
applyEnvFile(resolve(appRoot, ".env"), true);
applyEnvFile(resolve(appRoot, ".env.local"), true);
