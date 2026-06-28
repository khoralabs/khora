import type { KhoraHost } from "@khoralabs/registry-catalog-contracts";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import { listActiveHosts } from "./khora-hosts";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export class InvalidKhoraHostBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKhoraHostBaseUrlError";
  }
}

function canonicalLoopbackHost(hostname: string): string {
  const h = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(h)) return "loopback";
  return h;
}

/**
 * Normalize a Khora host base URL for comparison: origin only, lowercase hostname,
 * loopback aliases unified.
 */
export function normalizeKhoraHostBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidKhoraHostBaseUrlError("base URL is empty");
  }
  let url: URL;
  try {
    url = new URL(trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed);
  } catch {
    throw new InvalidKhoraHostBaseUrlError(`invalid base URL: ${raw}`);
  }
  if (url.pathname !== "/" && url.pathname.length > 0) {
    throw new InvalidKhoraHostBaseUrlError("base URL must not include a path");
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new InvalidKhoraHostBaseUrlError("base URL must not include query or hash");
  }
  const hostKey = canonicalLoopbackHost(url.hostname);
  const port = url.port.length > 0 ? url.port : url.protocol === "https:" ? "443" : "80";
  return `${url.protocol}//${hostKey}:${port}`;
}

function hostsMatchNormalized(stored: string, input: string): boolean {
  try {
    return normalizeKhoraHostBaseUrl(stored) === normalizeKhoraHostBaseUrl(input);
  } catch {
    return false;
  }
}

/** Find an active host whose base_url matches after normalization (primary CLI lookup). */
export async function findHostByBaseUrl(
  db: RegistryDatabase,
  baseUrl: string,
): Promise<KhoraHost | null> {
  const hosts = await listActiveHosts(db);
  for (const host of hosts) {
    if (hostsMatchNormalized(host.baseUrl, baseUrl)) {
      return host;
    }
  }
  return null;
}
