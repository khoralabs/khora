import type { Database } from "bun:sqlite";
import {
  findActiveHostBySlug,
  findHostByBaseUrl,
  type KhoraHost,
} from "@khoralabs/registry-catalog";

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

import { registryHostRuntime } from "../runtime";

export function registryPublicUrl(): string {
  return registryHostRuntime().publicUrl();
}

export const HOST_NOT_FOUND_HINT =
  "Host not found or not active. List hosts with GET /v1/hosts or run khora host list.";
