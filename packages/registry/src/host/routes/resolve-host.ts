import {
  findActiveHostBySlug,
  findHostByBaseUrl,
  type KhoraHost,
} from "@khoralabs/khora-registry/catalog";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import { registryHostRuntime } from "../runtime";

export async function resolveRegistryHost(
  db: RegistryDatabase,
  params: { hostBaseUrl?: string; hostSlug?: string },
): Promise<KhoraHost | null> {
  const slug = params.hostSlug?.trim();
  if (slug !== undefined && slug.length > 0) {
    const bySlug = await findActiveHostBySlug(db, slug);
    if (bySlug !== null) return bySlug;
  }
  const baseUrl = params.hostBaseUrl?.trim();
  if (baseUrl !== undefined && baseUrl.length > 0) {
    return await findHostByBaseUrl(db, baseUrl);
  }
  return null;
}

export function registryPublicUrl(): string {
  return registryHostRuntime().publicUrl();
}

export const HOST_NOT_FOUND_HINT =
  "Host not found or not active. List hosts with GET /v1/hosts or run khora host list.";
