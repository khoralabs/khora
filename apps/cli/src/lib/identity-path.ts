import { homedir } from "node:os";
import path from "node:path";

/** Khora operator identity path: `KHORA_AGENT_KEY_PATH`, else `~/.khora/identity.json`. */
export function defaultIdentityPath(): string {
  const override = process.env.KHORA_AGENT_KEY_PATH?.trim();
  if (override !== undefined && override.length > 0) return override;
  return path.join(homedir(), ".khora", "identity.json");
}
