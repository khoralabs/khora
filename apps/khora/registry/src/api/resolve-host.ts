import type { Database } from "bun:sqlite";
import { findActiveHostBySlug, findHostByBaseUrl, type KhoraHost } from "@khoralabs/users";

export function resolveRegistryHost(
  db: Database,
  params: { hostBaseUrl?: string; hostSlug?: string },
): KhoraHost | null {
  const slug = params.hostSlug?.trim();
  if (slug !== undefined && slug.length > 0) {
    const bySlug = findActiveHostBySlug(db, slug);
    if (bySlug !== null) return bySlug;
  }
  const baseUrl = params.hostBaseUrl?.trim();
  if (baseUrl !== undefined && baseUrl.length > 0) {
    return findHostByBaseUrl(db, baseUrl);
  }
  return null;
}

export function registryPublicUrl(): string {
  const port = process.env.PORT?.trim() ?? "4000";
  const configured =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ??
    process.env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "");
  return configured ?? `http://localhost:${port}`;
}

export const HOST_NOT_FOUND_HINT =
  "Host not found or not active. List hosts with GET /v1/hosts or run khora host list.";
