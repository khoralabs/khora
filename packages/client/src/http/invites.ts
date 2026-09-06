import {
  type KhoraInviteListResponse,
  type KhoraInvitePreviewResponse,
  type KhoraInviteTreeResponse,
  zKhoraInviteListResponse,
  zKhoraInvitePreviewResponse,
  zKhoraInviteTreeResponse,
} from "@khoralabs/khora-contracts";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { KhoraUnaryTransport } from "../transport";

export function listInvites(t: KhoraUnaryTransport): Promise<KhoraInviteListResponse> {
  return t.requestJson("GET", KHORA_HTTP_PATH.invites, {
    parse: zKhoraInviteListResponse,
  });
}

export function previewInvite(
  t: KhoraUnaryTransport,
  token: string,
): Promise<KhoraInvitePreviewResponse> {
  return t.requestJson("POST", KHORA_HTTP_PATH.invitePreview, {
    body: { token },
    parse: zKhoraInvitePreviewResponse,
  });
}

export type InviteTreeOptions = {
  depth?: number;
};

export function inviteTree(
  t: KhoraUnaryTransport,
  opts: InviteTreeOptions = {},
): Promise<KhoraInviteTreeResponse> {
  const query = opts.depth !== undefined ? { depth: String(opts.depth) } : undefined;
  return t.requestJson("GET", KHORA_HTTP_PATH.inviteTree, {
    ...(query !== undefined ? { query, signedQueryKeys: ["depth"] as const } : {}),
    parse: zKhoraInviteTreeResponse,
  });
}
