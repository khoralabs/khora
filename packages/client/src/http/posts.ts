import {
  type KhoraPost,
  type KhoraPostCreateContent,
  type KhoraPostPatch,
  type KhoraSubscriptionCreate,
  mergeKhoraPostPatch,
  zKhoraPost,
} from "@khoralabs/khora-contracts";
import {
  khoraPostSigningPayloadFromCreate,
  signingPayloadForPatch,
  signKhoraPostPayload,
} from "../posts/signing";
import type { KhoraUnaryTransport } from "../transport";

export type KhoraSubscriptionCreateInput = Omit<
  KhoraSubscriptionCreate,
  "kind" | "authorSignature"
>;

export async function createPost(
  t: KhoraUnaryTransport,
  content: KhoraPostCreateContent,
): Promise<KhoraPost> {
  const payload = khoraPostSigningPayloadFromCreate(t.did, content);
  const authorSignature = await signKhoraPostPayload(t.signer, payload);
  return t.requestJson("POST", "/v1/posts", {
    body: { ...content, authorSignature },
    parse: zKhoraPost,
  });
}

export async function createSubscription(
  t: KhoraUnaryTransport,
  body: KhoraSubscriptionCreateInput,
): Promise<KhoraPost> {
  return createPost(t, { ...body, kind: "subscription" });
}

export function getPost(t: KhoraUnaryTransport, id: string): Promise<KhoraPost> {
  return t.requestJson("GET", `/v1/posts/${encodeURIComponent(id)}`, {
    parse: zKhoraPost,
  });
}

export async function updatePost(
  t: KhoraUnaryTransport,
  id: string,
  patch: Omit<KhoraPostPatch, "authorSignature">,
  previous: KhoraPost,
): Promise<KhoraPost> {
  const payload = signingPayloadForPatch(t.did, previous, patch);
  const authorSignature = await signKhoraPostPayload(t.signer, payload);
  return t.requestJson("PATCH", `/v1/posts/${encodeURIComponent(id)}`, {
    body: { ...patch, authorSignature },
    parse: zKhoraPost,
  });
}

export function deletePost(t: KhoraUnaryTransport, id: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/posts/${encodeURIComponent(id)}`);
}

export { mergeKhoraPostPatch };
