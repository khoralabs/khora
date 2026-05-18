import {
  type AtriumInviteListResponse,
  type AtriumInvitePreviewResponse,
  zAtriumInviteListResponse,
  zAtriumInvitePreviewResponse,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

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
