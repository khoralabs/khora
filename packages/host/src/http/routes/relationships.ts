import {
  formatThrownError,
  type KhoraRelationship,
  type PrincipalId,
  zKhoraRelationshipCreate,
  zKhoraRelationshipListResponse,
  zKhoraRelationshipResponse,
} from "@khoralabs/khora-contracts";
import { KHORA_ERROR_CODE } from "@khoralabs/khora-contracts/http";
import z from "zod";
import { deliverNotification } from "../../inbox/deliver";
import {
  intendedPeerPrincipalIdFromMetadata,
  relationshipCounterpartyPrincipalId,
  type SocialRelationshipRow,
} from "../../persistence/core";
import { logger } from "../logger";
import type { HostRouteDeps } from "./deps";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses";

function handlerError(e: unknown): Response {
  const status = e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 500;
  const msg = formatThrownError(e);
  if (status >= 500) {
    logger.error({ err: e }, "relationships handler error");
  }
  return jsonError(
    msg,
    status,
    status >= 500 ? KHORA_ERROR_CODE.internal_error : KHORA_ERROR_CODE.invalid_request,
  );
}

function rowToDto(row: SocialRelationshipRow, viewer: PrincipalId): KhoraRelationship | undefined {
  const peerDid = relationshipCounterpartyPrincipalId(row, viewer);
  if (peerDid === undefined) return undefined;
  return {
    channelId: row.channelId,
    peerDid,
    role: row.creatorPrincipalId === viewer ? "creator" : "peer",
    status: row.peerPrincipalId === null ? "pending" : "accepted",
    createdAtMs: row.createdAtMs,
  };
}

function hasExistingEdge(
  rows: SocialRelationshipRow[],
  viewer: PrincipalId,
  peerDid: PrincipalId,
): boolean {
  for (const row of rows) {
    if (relationshipCounterpartyPrincipalId(row, viewer) === peerDid) return true;
  }
  return false;
}

function isParticipant(row: SocialRelationshipRow, did: PrincipalId): boolean {
  if (row.creatorPrincipalId === did) return true;
  if (row.peerPrincipalId === did) return true;
  return intendedPeerPrincipalIdFromMetadata(row.metadata) === did;
}

export async function handleCreateRelationship(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const rl = rateLimiters.postsDid(`did:${did}`);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
    const parsed = zKhoraRelationshipCreate.parse(JSON.parse(bodyText || "{}"));
    const peerDid = parsed.peerDid as PrincipalId;
    if (peerDid === did) {
      return jsonError("Cannot invite yourself", 400, KHORA_ERROR_CODE.invalid_request);
    }
    if (!ctx.host.persistenceClient.registrationExists(peerDid)) {
      return jsonError("Peer not registered", 404, KHORA_ERROR_CODE.not_found);
    }
    if (
      hasExistingEdge(
        ctx.social.listRelationshipsForPrincipal(did as PrincipalId),
        did as PrincipalId,
        peerDid,
      )
    ) {
      return jsonError("Relationship already exists", 409, KHORA_ERROR_CODE.conflict);
    }
    const channelId = crypto.randomUUID();
    ctx.social.createRelationship({
      channelId,
      creatorPrincipalId: did as PrincipalId,
      intendedPeerPrincipalId: peerDid,
    });
    const row = ctx.social.getRelationship(channelId);
    if (row === undefined) {
      return jsonError("Failed to create relationship", 500, KHORA_ERROR_CODE.internal_error);
    }
    const buffer = ctx.host.notificationBuffer;
    const inbox = ctx.host.inboxHub;
    if (buffer !== undefined && inbox !== undefined) {
      await deliverNotification(buffer, inbox, peerDid, {
        kind: "connection_request",
        payload: {
          channelId,
          fromPrincipalId: did,
          createdAtMs: row.createdAtMs,
        },
      });
    }
    const relationship = rowToDto(row, did as PrincipalId);
    if (relationship === undefined) {
      return jsonError("Failed to create relationship", 500, KHORA_ERROR_CODE.internal_error);
    }
    return Response.json(zKhoraRelationshipResponse.parse({ relationship }), { status: 201 });
  } catch (e) {
    return handlerError(e);
  }
}

export async function handleListRelationships(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const rl = rateLimiters.postsDid(`did:${did}`);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
    const relationships: KhoraRelationship[] = [];
    for (const row of ctx.social.listRelationshipsForPrincipal(did as PrincipalId)) {
      const dto = rowToDto(row, did as PrincipalId);
      if (dto !== undefined) relationships.push(dto);
    }
    return Response.json(zKhoraRelationshipListResponse.parse({ relationships }));
  } catch (e) {
    return handlerError(e);
  }
}

export async function handleAcceptRelationship(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  channelId: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const rl = rateLimiters.postsDid(`did:${did}`);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
    const row = ctx.social.getRelationship(channelId);
    if (row === undefined || row.peerPrincipalId !== null) {
      return jsonError("Relationship invite not found", 404, KHORA_ERROR_CODE.not_found);
    }
    const intended = intendedPeerPrincipalIdFromMetadata(row.metadata);
    if (intended !== did) {
      return jsonError("Forbidden", 403, KHORA_ERROR_CODE.forbidden);
    }
    ctx.social.bindPeer({ channelId, peerPrincipalId: did as PrincipalId });
    const updated = ctx.social.getRelationship(channelId);
    if (updated === undefined) {
      return jsonError("Relationship not found", 404, KHORA_ERROR_CODE.not_found);
    }
    const relationship = rowToDto(updated, did as PrincipalId);
    if (relationship === undefined) {
      return jsonError("Relationship not found", 404, KHORA_ERROR_CODE.not_found);
    }
    return Response.json(zKhoraRelationshipResponse.parse({ relationship }));
  } catch (e) {
    return handlerError(e);
  }
}

export async function handleDeclineRelationship(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  channelId: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const rl = rateLimiters.postsDid(`did:${did}`);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
    const row = ctx.social.getRelationship(channelId);
    if (row === undefined || row.peerPrincipalId !== null) {
      return jsonError("Relationship invite not found", 404, KHORA_ERROR_CODE.not_found);
    }
    const intended = intendedPeerPrincipalIdFromMetadata(row.metadata);
    if (intended !== did) {
      return jsonError("Forbidden", 403, KHORA_ERROR_CODE.forbidden);
    }
    ctx.social.deleteRelationship(channelId);
    return new Response(null, { status: 204 });
  } catch (e) {
    return handlerError(e);
  }
}

export async function handleRevokeRelationship(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  channelId: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const rl = rateLimiters.postsDid(`did:${did}`);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
    const row = ctx.social.getRelationship(channelId);
    if (row === undefined || row.peerPrincipalId !== null) {
      return jsonError("Relationship invite not found", 404, KHORA_ERROR_CODE.not_found);
    }
    if (row.creatorPrincipalId !== did) {
      return jsonError("Forbidden", 403, KHORA_ERROR_CODE.forbidden);
    }
    // Deletes the pending graph edge only — does not purge inbox notifications.
    ctx.social.deleteRelationship(channelId);
    return new Response(null, { status: 204 });
  } catch (e) {
    return handlerError(e);
  }
}

export async function handleDeleteRelationship(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  channelId: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const rl = rateLimiters.postsDid(`did:${did}`);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
    const row = ctx.social.getRelationship(channelId);
    if (row === undefined) {
      return jsonError("Relationship not found", 404, KHORA_ERROR_CODE.not_found);
    }
    if (!isParticipant(row, did as PrincipalId)) {
      return jsonError("Forbidden", 403, KHORA_ERROR_CODE.forbidden);
    }
    ctx.social.deleteRelationship(channelId);
    return new Response(null, { status: 204 });
  } catch (e) {
    return handlerError(e);
  }
}
