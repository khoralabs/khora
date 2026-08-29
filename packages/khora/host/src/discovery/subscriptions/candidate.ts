import type { KhoraPost } from "@khoralabs/khora-contracts";
import type { PercolatorCandidate } from "@khoralabs/percolator";
import { postsMemoryNamespace } from "../search/namespace";
import { topicSlugsToLabelKinds } from "./topic-labels";

export function buildPercolatorCandidateFromPost(params: {
  post: KhoraPost;
  authorPrincipalId: string;
  authorProfileId: string;
  namespaceRoot: string;
  lexicalText: string;
  vector?: number[];
  now?: number;
}): PercolatorCandidate {
  const { post, authorPrincipalId, authorProfileId, namespaceRoot, lexicalText, vector, now } =
    params;
  const labelKinds = [
    post.kind === "subscription" ? "khora_subscription" : "khora_post",
    ...topicSlugsToLabelKinds(post.topics),
  ];
  return {
    candidateId: post.id,
    authorId: authorPrincipalId,
    namespace: postsMemoryNamespace(namespaceRoot, authorProfileId),
    labelKinds,
    content: {
      text: lexicalText,
      ...(vector !== undefined && vector.length > 0 ? { vector } : {}),
    },
    createdAtMs: now ?? Date.now(),
  };
}
