import {
  type AtriumRelationshipListResponse,
  zAtriumRelationshipListResponse,
} from "@khoralabs/at2-contracts";
import type { At2UnaryTransport } from "@khoralabs/at2-transport";

export function listRelationships(t: At2UnaryTransport): Promise<AtriumRelationshipListResponse> {
  return t.requestJson("GET", "/v1/relationships", { parse: zAtriumRelationshipListResponse });
}
