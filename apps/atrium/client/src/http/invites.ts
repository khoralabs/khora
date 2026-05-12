import {
  type AtriumInviteListResponse,
  type AtriumInvitePreviewResponse,
  zAtriumInviteListResponse,
  zAtriumInvitePreviewResponse,
} from "@khoralabs/atrium-contracts";
import type { HttpTransport } from "./transport.ts";

export function listInvites(t: HttpTransport): Promise<AtriumInviteListResponse> {
  return t.requestJson("GET", "/v1/invites", { parse: zAtriumInviteListResponse });
}

export function previewInvite(
  t: HttpTransport,
  token: string,
): Promise<AtriumInvitePreviewResponse> {
  return t.requestJson("POST", "/v1/invite/preview", {
    body: { token },
    parse: zAtriumInvitePreviewResponse,
  });
}
