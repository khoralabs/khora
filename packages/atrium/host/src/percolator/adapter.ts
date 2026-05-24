import type { AtriumStandingSearchRequest } from "@khoralabs/atrium-contracts";
import type { StandingSearchRequest } from "@khoralabs/percolator";
import { zStandingSearchRequest } from "@khoralabs/percolator";

export function toPercolatorSearch(search: AtriumStandingSearchRequest): StandingSearchRequest {
  return zStandingSearchRequest.parse(JSON.parse(JSON.stringify(search)));
}
