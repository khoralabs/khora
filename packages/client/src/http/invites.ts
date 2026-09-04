import {
  type KhoraInviteListResponse,
  type KhoraInvitePreviewResponse,
  zKhoraInviteListResponse,
  zKhoraInvitePreviewResponse,
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
