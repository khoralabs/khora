import type { Database } from "bun:sqlite";
import { findHostById, listActiveHosts } from "./khora-hosts";
import type { KhoraHost } from "./types";

export class InvalidClientOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClientOriginError";
  }
}

/** Normalize and validate a browser origin (scheme + host + port, no path). */
export function normalizeClientOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidClientOriginError("client origin is empty");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidClientOriginError(`invalid client origin: ${raw}`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new InvalidClientOriginError("client origin must not include a path");
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new InvalidClientOriginError("client origin must not include query or hash");
  }
  return url.origin;
}

export function resolveHostTrustedOrigin(host: KhoraHost): string {
  if (host.clientOrigin !== null && host.clientOrigin.length > 0) {
    return host.clientOrigin;
  }
  return new URL(host.baseUrl).origin;
}

export function listCorsTrustedOrigins(db: Database): string[] {
  const origins: string[] = [];
  for (const host of listActiveHosts(db)) {
    if (!host.corsTrusted) {
      continue;
    }
    try {
      origins.push(resolveHostTrustedOrigin(host));
    } catch {
      /* skip invalid base URL */
    }
  }
  return [...new Set(origins)];
}

export function setHostCorsTrusted(db: Database, hostId: string, trusted: boolean): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (trusted && existing.status !== "active") {
    throw new Error("only active hosts can be CORS-trusted");
  }
  db.prepare(`UPDATE khora_hosts SET cors_trusted = ? WHERE id = ?`).run(trusted ? 1 : 0, hostId);
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host cors trust update failed");
  }
  return host;
}

export function setHostClientOrigin(
  db: Database,
  hostId: string,
  origin: string | null,
): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  const stored =
    origin === null || origin.trim().length === 0 ? null : normalizeClientOrigin(origin);
  db.prepare(`UPDATE khora_hosts SET client_origin = ? WHERE id = ?`).run(stored, hostId);
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host client origin update failed");
  }
  return host;
}

export function updateHostCorsSettings(
  db: Database,
  hostId: string,
  params: { corsTrusted?: boolean; clientOrigin?: string | null },
): KhoraHost {
  if (params.clientOrigin !== undefined) {
    setHostClientOrigin(db, hostId, params.clientOrigin);
  }
  if (params.corsTrusted !== undefined) {
    return setHostCorsTrusted(db, hostId, params.corsTrusted);
  }
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  return host;
}
