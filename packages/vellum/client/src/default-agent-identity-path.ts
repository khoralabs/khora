import { homedir } from "node:os";
import path from "node:path";

/**
 * Final fallback identity file when env/config `agentKeyPath` is unset.
 * Preserves the historical Vellum/Khora shared default (`~/.khora/identity.json`).
 */
export function defaultAgentIdentityPath(): string {
  return path.join(homedir(), ".khora", "identity.json");
}
