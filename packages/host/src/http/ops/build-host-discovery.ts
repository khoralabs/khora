import { type KhoraHostDiscovery, zKhoraHostDiscovery } from "@khoralabs/khora-contracts";
import { KHORA_DISCOVERY_ENDPOINTS } from "@khoralabs/khora-contracts/http";
import type { KhoraHostSpecPort } from "../..";

export function buildKhoraHostDiscovery(params: {
  hostSpec: KhoraHostSpecPort;
  populationCurrent: number;
  /** Prefer host-spec registry URL when omitted. */
  registryUrl?: string;
}): KhoraHostDiscovery {
  const effective = params.hostSpec.readEffective();
  const stored = params.hostSpec.read();
  const population: KhoraHostDiscovery["population"] = {
    current: params.populationCurrent,
  };
  if (effective.populationLimit !== undefined) {
    population.limit = effective.populationLimit;
  }

  const doc: KhoraHostDiscovery = {
    version: 1,
    baseUrl: effective.publicBaseUrl,
    endpoints: { ...KHORA_DISCOVERY_ENDPOINTS },
    population,
  };
  if (effective.slug !== undefined) {
    doc.slug = effective.slug;
  }
  const registryUrl = params.registryUrl ?? stored?.registryUrl;
  if (registryUrl !== undefined) {
    doc.registryUrl = registryUrl.replace(/\/$/, "");
  }
  return zKhoraHostDiscovery.parse(doc);
}
