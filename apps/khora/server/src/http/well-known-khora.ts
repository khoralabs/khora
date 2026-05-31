import type { KhoraHostSpecPort } from "@khoralabs/khora-host";
import { envRegistryUrl } from "../env";

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

export function buildKhoraWellKnownDocument(hostSpec: KhoraHostSpecPort): KhoraWellKnownDocument {
  const effective = hostSpec.readEffective();
  const doc: KhoraWellKnownDocument = {
    version: 1,
    baseUrl: effective.publicBaseUrl,
    endpoints: {
      health: "/health",
      ready: "/ready",
      register: "/v1/register",
    },
  };
  if (effective.slug !== undefined) {
    doc.slug = effective.slug;
  }
  const registryUrl = envRegistryUrl() ?? hostSpec.read()?.registryUrl;
  if (registryUrl !== undefined) {
    doc.registryUrl = registryUrl.replace(/\/$/, "");
  }
  return doc;
}

export function handleWellKnownKhora(hostSpec: KhoraHostSpecPort): Response {
  return Response.json(buildKhoraWellKnownDocument(hostSpec), {
    headers: { "Content-Type": "application/json" },
  });
}
