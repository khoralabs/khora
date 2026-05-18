import {
  type AtriumRelationshipListResponse,
  zAtriumRelationshipListResponse,
} from "@khoralabs/at2-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/at2-transport";

export function listRelationships(
  t: AtriumUnaryTransport,
): Promise<AtriumRelationshipListResponse> {
  return t.requestJson("GET", "/v1/relationships", {
    parse: zAtriumRelationshipListResponse,
  });
}
