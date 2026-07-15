import type { KhoraHostSpecPort } from "@khoralabs/khora-host";
import { buildKhoraHostDiscovery as buildDiscovery } from "@khoralabs/khora-server-http";

import { envRegistryUrl } from "../env";

export function buildKhoraHostDiscovery(params: {
  hostSpec: KhoraHostSpecPort;
  populationCurrent: number;
}) {
  return buildDiscovery({
    ...params,
    ...(envRegistryUrl() !== undefined ? { registryUrl: envRegistryUrl() } : {}),
  });
}
