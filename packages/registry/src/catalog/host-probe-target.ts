import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeHostProbeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeHostProbeTargetError";
  }
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** True for RFC1918, link-local (incl. cloud metadata), and unspecified — not loopback. */
export function isBlockedProbeAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = parseIpv4(ip);
    if (n === null) return true;
    const [a, b] = n;
    if (a === 127) return false; // loopback allowed for local reference hosts
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return false;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower === "::" || lower.startsWith("::ffff:")) {
      const mapped = lower.startsWith("::ffff:") ? lower.slice("::ffff:".length) : null;
      if (mapped !== null && isIP(mapped) === 4) return isBlockedProbeAddress(mapped);
      return true;
    }
    return false;
  }
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

/**
 * Reject probe destinations that resolve to private/link-local/metadata addresses.
 * Loopback is allowed so local SQLite reference hosts can register.
 */
export async function assertSafeHostProbeTarget(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeHostProbeTargetError(`invalid probe URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeHostProbeTargetError("probe URL must be http or https");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".internal")) {
    throw new UnsafeHostProbeTargetError("probe hostname is not allowed");
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedProbeAddress(hostname)) {
      throw new UnsafeHostProbeTargetError("probe target address is not allowed");
    }
    return;
  }

  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new UnsafeHostProbeTargetError(`probe hostname could not be resolved: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new UnsafeHostProbeTargetError(`probe hostname could not be resolved: ${hostname}`);
  }
  for (const address of addresses) {
    if (isBlockedProbeAddress(address)) {
      throw new UnsafeHostProbeTargetError("probe target resolves to a disallowed address");
    }
  }
}
