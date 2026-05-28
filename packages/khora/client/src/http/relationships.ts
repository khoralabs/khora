import {
  type KhoraRelationshipListResponse,
  zKhoraRelationshipListResponse,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export function listRelationships(t: KhoraUnaryTransport): Promise<KhoraRelationshipListResponse> {
  return t.requestJson("GET", "/v1/relationships", {
    parse: zKhoraRelationshipListResponse,
  });
}
