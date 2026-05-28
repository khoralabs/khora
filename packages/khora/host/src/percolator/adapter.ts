import type { KhoraStandingSearchRequest } from "@khoralabs/khora-contracts";
import type { StandingSearchRequest } from "@khoralabs/percolator";
import { zStandingSearchRequest } from "@khoralabs/percolator";

export function toPercolatorSearch(search: KhoraStandingSearchRequest): StandingSearchRequest {
  return zStandingSearchRequest.parse(JSON.parse(JSON.stringify(search)));
}
