import type { KhoraHost } from "@khoralabs/users";

export function hostToPublicJson(host: KhoraHost): Record<string, unknown> {
  return {
    id: host.id,
    slug: host.slug,
    baseUrl: host.baseUrl,
    ...(host.displayName !== null ? { displayName: host.displayName } : {}),
    ...(host.description !== null ? { description: host.description } : {}),
    ...(host.capabilities !== null ? { capabilities: host.capabilities } : {}),
    optedInAtMs: host.optedInAtMs,
  };
}

export function hostToFullJson(host: KhoraHost): Record<string, unknown> {
  return {
    ...hostToPublicJson(host),
    status: host.status,
  };
}
