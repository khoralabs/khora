import { Entry } from "@napi-rs/keyring";

const SERVICE = "khora";
const ACCOUNT = "registry-session";

export function loadRegistrySessionCookie(): string | null {
  const fromEnv = process.env.KHORA_REGISTRY_SESSION_COOKIE?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  try {
    const value = new Entry(SERVICE, ACCOUNT).getPassword() ?? null;
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveRegistrySessionCookie(cookie: string): void {
  const fromEnv = process.env.KHORA_REGISTRY_SESSION_COOKIE?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return;
  }
  new Entry(SERVICE, ACCOUNT).setPassword(cookie);
}

export function clearRegistrySessionCookie(): void {
  try {
    new Entry(SERVICE, ACCOUNT).deletePassword();
  } catch {
    /* ignore */
  }
}
