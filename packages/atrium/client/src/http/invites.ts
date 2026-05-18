import {
  type AtriumInviteListResponse,
  type AtriumInvitePreviewResponse,
  zAtriumInviteListResponse,
  zAtriumInvitePreviewResponse,
} from "@khoralabs/at2-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/at2-transport";

export function listInvites(t: AtriumUnaryTransport): Promise<AtriumInviteListResponse> {
  return t.requestJson("GET", "/v1/invites", {
    parse: zAtriumInviteListResponse,
  });
}

export function previewInvite(
  t: AtriumUnaryTransport,
  token: string,
): Promise<AtriumInvitePreviewResponse> {
  return t.requestJson("POST", "/v1/invite/preview", {
    body: { token },
    parse: zAtriumInvitePreviewResponse,
  });
}
