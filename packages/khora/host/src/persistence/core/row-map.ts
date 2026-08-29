import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { HostEntityRow, SocialRelationshipRow } from "./port";

export function parseEntityRow(projection: unknown, id: string): HostEntityRow | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const o = projection as Record<string, unknown>;
  if (o.deleted === true) {
    return undefined;
  }
  const rowId = typeof o.id === "string" ? o.id : id;
  const memoryId =
    o.memoryId === null || o.memoryId === undefined
      ? null
      : typeof o.memoryId === "string"
        ? o.memoryId
        : null;
  const bodyJson = typeof o.bodyJson === "string" ? o.bodyJson : "";
  const updatedAtMs = typeof o.updatedAtMs === "number" ? o.updatedAtMs : 0;
  return { id: rowId, memoryId, bodyJson, updatedAtMs };
}

export function parseRelationshipRow(
  projection: unknown,
  channelId: string,
): SocialRelationshipRow | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const o = projection as Record<string, unknown>;
  const cid = typeof o.channelId === "string" ? o.channelId : channelId;
  const creatorPrincipalId =
    typeof o.creatorPrincipalId === "string" ? (o.creatorPrincipalId as PrincipalId) : undefined;
  if (creatorPrincipalId === undefined) return undefined;
  const peer =
    o.peerPrincipalId === null || o.peerPrincipalId === undefined
      ? null
      : typeof o.peerPrincipalId === "string"
        ? (o.peerPrincipalId as PrincipalId)
        : null;
  const createdAtMs = typeof o.createdAtMs === "number" ? o.createdAtMs : 0;
  const expiresAtMs = typeof o.expiresAtMs === "number" ? o.expiresAtMs : undefined;
  const metadata = "metadata" in o ? o.metadata : undefined;
  return {
    channelId: cid,
    creatorPrincipalId,
    peerPrincipalId: peer,
    createdAtMs,
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
