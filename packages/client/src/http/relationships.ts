import {
  type KhoraRelationshipCreate,
  type KhoraRelationshipListResponse,
  type KhoraRelationshipResponse,
  zKhoraRelationshipListResponse,
  zKhoraRelationshipResponse,
} from "@khoralabs/khora-contracts";
import {
  KHORA_HTTP_PATH,
  khoraRelationshipAcceptPath,
  khoraRelationshipByIdPath,
  khoraRelationshipDeclinePath,
  khoraRelationshipRevokePath,
} from "@khoralabs/khora-contracts/http";
import type { KhoraUnaryTransport } from "../transport";

export function createRelationship(
  t: KhoraUnaryTransport,
  body: KhoraRelationshipCreate,
): Promise<KhoraRelationshipResponse> {
  return t.requestJson("POST", KHORA_HTTP_PATH.relationships, {
    body,
    parse: zKhoraRelationshipResponse,
  });
}

export function listRelationships(t: KhoraUnaryTransport): Promise<KhoraRelationshipListResponse> {
  return t.requestJson("GET", KHORA_HTTP_PATH.relationships, {
    parse: zKhoraRelationshipListResponse,
  });
}

export function acceptRelationship(
  t: KhoraUnaryTransport,
  channelId: string,
): Promise<KhoraRelationshipResponse> {
  return t.requestJson("POST", khoraRelationshipAcceptPath(channelId), {
    parse: zKhoraRelationshipResponse,
  });
}

export function declineRelationship(t: KhoraUnaryTransport, channelId: string): Promise<void> {
  return t.requestVoid("POST", khoraRelationshipDeclinePath(channelId));
}

export function revokeRelationship(t: KhoraUnaryTransport, channelId: string): Promise<void> {
  return t.requestVoid("POST", khoraRelationshipRevokePath(channelId));
}

export function deleteRelationship(t: KhoraUnaryTransport, channelId: string): Promise<void> {
  return t.requestVoid("DELETE", khoraRelationshipByIdPath(channelId));
}
