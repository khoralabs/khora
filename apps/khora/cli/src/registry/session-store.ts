import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const SESSION_BASENAME = "registry-session";

function khoraHomeDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error("HOME / USERPROFILE not set");
  return path.join(home, ".khora");
}

/** Override for tests (`KHORA_REGISTRY_SESSION_FILE=/tmp/...`). */
export function registrySessionFilePath(): string {
  const override = process.env.KHORA_REGISTRY_SESSION_FILE?.trim();
  if (override) return override;
  return path.join(khoraHomeDir(), SESSION_BASENAME);
}

export function loadRegistrySessionCookie(): string | null {
  const file = registrySessionFilePath();
  if (!existsSync(file)) return null;
  try {
    const value = readFileSync(file, "utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveRegistrySessionCookie(cookie: string): void {
  const file = registrySessionFilePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, cookie, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* ignore on platforms that ignore mode */
  }
}

export function clearRegistrySessionCookie(): void {
  const file = registrySessionFilePath();
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
}
