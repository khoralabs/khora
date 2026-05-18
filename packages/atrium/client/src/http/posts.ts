import {
  type AtriumPost,
  type AtriumPostCreate,
  type AtriumPostPatch,
  zAtriumPost,
} from "@khoralabs/at2-contracts";
import type { At2UnaryTransport } from "@khoralabs/at2-transport";

export function createPost(t: At2UnaryTransport, body: AtriumPostCreate): Promise<AtriumPost> {
  return t.requestJson("POST", "/v1/posts", { body, parse: zAtriumPost });
}

export function getPost(t: At2UnaryTransport, id: string): Promise<AtriumPost> {
  return t.requestJson("GET", `/v1/posts/${encodeURIComponent(id)}`, { parse: zAtriumPost });
}

export function updatePost(
  t: At2UnaryTransport,
  id: string,
  patch: AtriumPostPatch,
): Promise<AtriumPost> {
  return t.requestJson("PATCH", `/v1/posts/${encodeURIComponent(id)}`, {
    body: patch,
    parse: zAtriumPost,
  });
}

export function deletePost(t: At2UnaryTransport, id: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/posts/${encodeURIComponent(id)}`);
}
