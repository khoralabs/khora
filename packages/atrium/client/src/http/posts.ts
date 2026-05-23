import {
  atriumPostSigningPayloadFromCreate,
  signAtriumPostPayload,
  signingPayloadForPatch,
} from "@khoralabs/atrium-auth";
import {
  type AtriumPost,
  type AtriumPostCreateContent,
  type AtriumPostPatch,
  type AtriumProbeCreate,
  mergeAtriumPostPatch,
  zAtriumPost,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export type AtriumProbeCreateInput = Omit<AtriumProbeCreate, "kind" | "authorSignature">;

export async function createPost(
  t: AtriumUnaryTransport,
  content: AtriumPostCreateContent,
): Promise<AtriumPost> {
  const payload = atriumPostSigningPayloadFromCreate(t.did, content);
  const authorSignature = await signAtriumPostPayload(t.signer, payload);
  return t.requestJson("POST", "/v1/posts", {
    body: { ...content, authorSignature },
    parse: zAtriumPost,
  });
}

export async function createProbe(
  t: AtriumUnaryTransport,
  body: AtriumProbeCreateInput,
): Promise<AtriumPost> {
  return createPost(t, { ...body, kind: "probe" });
}

export function getPost(t: AtriumUnaryTransport, id: string): Promise<AtriumPost> {
  return t.requestJson("GET", `/v1/posts/${encodeURIComponent(id)}`, {
    parse: zAtriumPost,
  });
}

export async function updatePost(
  t: AtriumUnaryTransport,
  id: string,
  patch: Omit<AtriumPostPatch, "authorSignature">,
  previous: AtriumPost,
): Promise<AtriumPost> {
  const payload = signingPayloadForPatch(t.did, previous, patch);
  const authorSignature = await signAtriumPostPayload(t.signer, payload);
  return t.requestJson("PATCH", `/v1/posts/${encodeURIComponent(id)}`, {
    body: { ...patch, authorSignature },
    parse: zAtriumPost,
  });
}

export function deletePost(t: AtriumUnaryTransport, id: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/posts/${encodeURIComponent(id)}`);
}

export { mergeAtriumPostPatch };
