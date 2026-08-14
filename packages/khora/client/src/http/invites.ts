import {
  type KhoraInviteListResponse,
  type KhoraInvitePreviewResponse,
  zKhoraInviteListResponse,
  zKhoraInvitePreviewResponse,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "../transport";

export function listInvites(t: KhoraUnaryTransport): Promise<KhoraInviteListResponse> {
  return t.requestJson("GET", "/v1/invites", {
    parse: zKhoraInviteListResponse,
  });
}

export function previewInvite(
  t: KhoraUnaryTransport,
  token: string,
): Promise<KhoraInvitePreviewResponse> {
  return t.requestJson("POST", "/v1/invite/preview", {
    body: { token },
    parse: zKhoraInvitePreviewResponse,
  });
}
