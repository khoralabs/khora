import type { AtriumPost } from "@khoralabs/atrium-contracts";
import type { PercolatorCandidate } from "@khoralabs/percolator";
import { postsMemoryNamespace } from "../memories/atrium-namespace.ts";
import { topicSlugsToLabelKinds } from "./topic-labels.ts";

export function buildPercolatorCandidateFromPost(params: {
  post: AtriumPost;
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
    post.kind === "subscription" ? "atrium_subscription" : "atrium_post",
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
