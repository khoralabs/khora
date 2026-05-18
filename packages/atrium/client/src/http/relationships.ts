import {
  type AtriumRelationshipListResponse,
  zAtriumRelationshipListResponse,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export function listRelationships(
  t: AtriumUnaryTransport,
): Promise<AtriumRelationshipListResponse> {
  return t.requestJson("GET", "/v1/relationships", {
    parse: zAtriumRelationshipListResponse,
  });
}
