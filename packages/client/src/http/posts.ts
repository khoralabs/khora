import {
  type KhoraPost,
  type KhoraPostCreateContent,
  type KhoraPostPatch,
  type KhoraSubscriptionCreate,
  mergeKhoraPostPatch,
  zKhoraPost,
} from "@khoralabs/khora-contracts";
import { KHORA_HTTP_PATH, khoraPostByIdPath } from "@khoralabs/khora-contracts/http";
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
  return t.requestJson("POST", KHORA_HTTP_PATH.posts, {
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
  return t.requestJson("GET", khoraPostByIdPath(id), {
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
  return t.requestJson("PATCH", khoraPostByIdPath(id), {
    body: { ...patch, authorSignature },
    parse: zKhoraPost,
  });
}

export function deletePost(t: KhoraUnaryTransport, id: string): Promise<void> {
  return t.requestVoid("DELETE", khoraPostByIdPath(id));
}

export { mergeKhoraPostPatch };
