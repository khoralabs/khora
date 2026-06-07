import type { PrincipalId } from "@khoralabs/host-runtime";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import type { SocialRelationshipPersistence } from "@khoralabs/relay-colonnade";
import { decodePostId } from "./post-address-id";

export function authorPrincipalIdFromPost(post: KhoraPost): string | undefined {
  const address = decodePostId(post.id);
  return address?.authorPrincipalId;
}

export function connectedPeerPrincipalIds(
  social: SocialRelationshipPersistence,
  authorPrincipalId: PrincipalId,
): Set<PrincipalId> {
  const peers = new Set<PrincipalId>();
  for (const row of social.listRelationshipsForPrincipal(authorPrincipalId)) {
    if (row.peerPrincipalId !== null && row.peerPrincipalId !== authorPrincipalId) {
      peers.add(row.peerPrincipalId);
    }
    if (row.creatorPrincipalId !== authorPrincipalId) {
      peers.add(row.creatorPrincipalId);
    }
  }
  return peers;
}

export function canReadPost(params: {
  post: KhoraPost;
  readerPrincipalId?: PrincipalId;
  social: SocialRelationshipPersistence;
}): boolean {
  const { post, readerPrincipalId, social } = params;
  const authorPrincipalId = authorPrincipalIdFromPost(post);
  if (authorPrincipalId === undefined) return false;
  if (readerPrincipalId !== undefined && readerPrincipalId === authorPrincipalId) return true;
  const visibility = post.visibility ?? "public";
  if (visibility === "public") return true;
  if (readerPrincipalId === undefined) return false;
  if (visibility === "network") {
    return connectedPeerPrincipalIds(social, authorPrincipalId).has(readerPrincipalId);
  }
  return false;
}

export function canDeliverPostToRecipient(params: {
  post: KhoraPost;
  recipientPrincipalId: PrincipalId;
  social: SocialRelationshipPersistence;
}): boolean {
  return canReadPost({
    post: params.post,
    readerPrincipalId: params.recipientPrincipalId,
    social: params.social,
  });
}
