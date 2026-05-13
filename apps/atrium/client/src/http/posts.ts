import {
  type AtriumPost,
  type AtriumPostCreate,
  type AtriumPostPatch,
  zAtriumPost,
} from "@khoralabs/atrium-contracts";
import type { HttpTransport } from "./transport.ts";

export function createPost(t: HttpTransport, body: AtriumPostCreate): Promise<AtriumPost> {
  return t.requestJson("POST", "/v1/posts", { body, parse: zAtriumPost });
}

export function getPost(t: HttpTransport, id: string): Promise<AtriumPost> {
  return t.requestJson("GET", `/v1/posts/${encodeURIComponent(id)}`, { parse: zAtriumPost });
}

export function updatePost(
  t: HttpTransport,
  id: string,
  patch: AtriumPostPatch,
): Promise<AtriumPost> {
  return t.requestJson("PATCH", `/v1/posts/${encodeURIComponent(id)}`, {
    body: patch,
    parse: zAtriumPost,
  });
}

export function deletePost(t: HttpTransport, id: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/posts/${encodeURIComponent(id)}`);
}
