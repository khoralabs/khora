import {
  type KhoraInviteTreeNode,
  zKhoraInviteListResponse,
  zKhoraInvitePreviewResponse,
  zKhoraInviteTreeResponse,
} from "@khoralabs/khora-contracts";
import z from "zod";
import type { KhoraInvitesRepo } from "../../persistence/core/port";
import { clientIpFromRequest } from "../rate-limit";
import type { HostRouteDeps } from "./deps";
import { authErrorResponse, inviteOpaqueNotFound, rateLimitedResponse } from "./responses";

const zInvitePreviewBody = z.object({
  token: z.string().trim().min(1),
});

export const INVITE_TREE_DEFAULT_DEPTH = 3;
export const INVITE_TREE_MAX_DEPTH = 10;
export const INVITE_TREE_MAX_NODES = 500;

function loadPublicProfileForDid(deps: HostRouteDeps, did: string): unknown | null {
  const pid = deps.ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (pid === undefined) return null;
  const row = deps.ctx.host.persistenceClient.getProfileById(pid);
  if (row === undefined) return null;
  try {
    return JSON.parse(row.bodyJson);
  } catch {
    return null;
  }
}

function parseTreeDepth(url: URL): number {
  const raw = url.searchParams.get("depth");
  if (raw === null || raw === "") return INVITE_TREE_DEFAULT_DEPTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return INVITE_TREE_DEFAULT_DEPTH;
  return Math.min(INVITE_TREE_MAX_DEPTH, Math.max(1, n));
}

function withActive(
  deps: HostRouteDeps,
  nodes: Array<{
    did: string;
    depth: number;
    inviterDid: string | null;
    invitedAtMs: number;
    kind: string;
  }>,
): KhoraInviteTreeNode[] {
  return nodes.map((n) => ({
    ...n,
    active: deps.ctx.host.persistenceClient.registrationExists(n.did),
  }));
}

/** Build tree from a principal DID (agent or ops-with-did). */
export function buildInviteTreeForDid(
  deps: HostRouteDeps,
  invitesRepo: KhoraInvitesRepo,
  rootDid: string,
  maxDepth: number,
): ReturnType<typeof zKhoraInviteTreeResponse.parse> {
  const descendants = invitesRepo.inviteDescendants(rootDid, {
    maxDepth,
    maxNodes: INVITE_TREE_MAX_NODES,
  });
  const truncated = descendants.length >= INVITE_TREE_MAX_NODES;
  const ancestors = invitesRepo.inviteAncestors(rootDid, { maxDepth });
  return zKhoraInviteTreeResponse.parse({
    rootDid,
    descendants: withActive(deps, descendants),
    ancestors: withActive(deps, ancestors),
    truncated,
  });
}

/** Ops walk from root/seed frontier when no DID is given. */
export function buildInviteTreeFromRoots(
  deps: HostRouteDeps,
  invitesRepo: KhoraInvitesRepo,
  maxDepth: number,
): ReturnType<typeof zKhoraInviteTreeResponse.parse> {
  const frontier = invitesRepo.inviteRootFrontier(INVITE_TREE_MAX_NODES);
  const seen = new Set(frontier.map((n) => n.did));
  const descendants = [...frontier];
  let truncated = frontier.length >= INVITE_TREE_MAX_NODES;
  for (const root of frontier) {
    if (descendants.length >= INVITE_TREE_MAX_NODES) {
      truncated = true;
      break;
    }
    const remaining = INVITE_TREE_MAX_NODES - descendants.length;
    const kids = invitesRepo.inviteDescendants(root.did, {
      maxDepth: Math.max(0, maxDepth - 1),
      maxNodes: remaining,
    });
    for (const k of kids) {
      if (seen.has(k.did)) continue;
      seen.add(k.did);
      descendants.push({
        ...k,
        depth: k.depth + 1,
      });
      if (descendants.length >= INVITE_TREE_MAX_NODES) {
        truncated = true;
        break;
      }
    }
  }
  return zKhoraInviteTreeResponse.parse({
    rootDid: "",
    descendants: withActive(deps, descendants),
    ancestors: [],
    truncated,
  });
}

export async function handleInvitePreview(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { invitesRepo } = deps.ctx;
  const ip = clientIpFromRequest(req);
  const prevRl = deps.rateLimiters.invitePreviewIp(`ip:${ip}`);
  if (!prevRl.ok) return rateLimitedResponse(prevRl.retryAfterSec);
  if (invitesRepo === undefined) {
    return inviteOpaqueNotFound();
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return inviteOpaqueNotFound();
  }
  const parsed = zInvitePreviewBody.safeParse(raw);
  if (!parsed.success) {
    return inviteOpaqueNotFound();
  }
  const pr = invitesRepo.previewInviteToken(parsed.data.token, (did) =>
    loadPublicProfileForDid(deps, did),
  );
  if (!pr.ok) {
    return inviteOpaqueNotFound();
  }
  const out = zKhoraInvitePreviewResponse.parse({
    inviter: pr.inviter,
    source: pr.source,
  });
  return Response.json(out);
}

export async function handleListInvites(
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
  const listRl = rateLimiters.invitesListDid(`did:${did}`);
  if (!listRl.ok) return rateLimitedResponse(listRl.retryAfterSec);
  const invites = ctx.invitesRepo === undefined ? [] : ctx.invitesRepo.listInvitesMintedForDid(did);
  const payload = zKhoraInviteListResponse.parse({ invites });
  return Response.json(payload);
}

export async function handleInviteTree(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", ["depth"]));
  } catch (e) {
    return authErrorResponse(e);
  }
  const listRl = rateLimiters.invitesListDid(`did:${did}`);
  if (!listRl.ok) return rateLimitedResponse(listRl.retryAfterSec);
  if (ctx.invitesRepo === undefined) {
    return Response.json(
      zKhoraInviteTreeResponse.parse({
        rootDid: did,
        descendants: [],
        ancestors: [],
        truncated: false,
      }),
    );
  }
  const depth = parseTreeDepth(url);
  return Response.json(buildInviteTreeForDid(deps, ctx.invitesRepo, did, depth));
}
