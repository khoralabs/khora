import { envHostSlug, envPort, envPublicBaseUrl, envRegistryUrl } from "../env.ts";

export type KhoraWellKnownDocument = {
  version: 1;
  slug?: string;
  baseUrl: string;
  registryUrl?: string;
  endpoints: {
    health: string;
    ready: string;
    register: string;
  };
};

export function buildKhoraWellKnownDocument(): KhoraWellKnownDocument {
  const port = envPort();
  const doc: KhoraWellKnownDocument = {
    version: 1,
    baseUrl: envPublicBaseUrl(port),
    endpoints: {
      health: "/health",
      ready: "/ready",
      register: "/v1/register",
    },
  };
  const slug = envHostSlug();
  if (slug !== undefined) {
    doc.slug = slug;
  }
  const registryUrl = envRegistryUrl();
  if (registryUrl !== undefined) {
    doc.registryUrl = registryUrl;
  }
  return doc;
}

export function handleWellKnownKhora(): Response {
  return Response.json(buildKhoraWellKnownDocument(), {
    headers: { "Content-Type": "application/json" },
  });
}
