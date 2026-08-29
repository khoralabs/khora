import type { KhoraStandingSearchRequest } from "@khoralabs/khora-contracts";
import { parseStandingSearchRequest, type StandingSearchRequest } from "@khoralabs/percolator";

export function toPercolatorSearch(search: KhoraStandingSearchRequest): StandingSearchRequest {
  return parseStandingSearchRequest(structuredClone(search));
}
