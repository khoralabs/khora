import { createHash } from "node:crypto";

import { VELLUM_WS_UPGRADE_NONCE_PROTOCOL_PREFIX } from "@khoralabs/vellum-contracts";

import { VELLUM_HTTP_HEADER } from "./http-headers";

export const DEFAULT_WS_UPGRADE_NONCE_TTL_MS = 60_000;

export function randomWsUpgradeNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function hashWsUpgradeNonce(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

export function wsUpgradeNonceFromProtocolHeader(header: string | null): string | undefined {
  if (header === null || header.length === 0) return undefined;
  for (const part of header.split(",")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(VELLUM_WS_UPGRADE_NONCE_PROTOCOL_PREFIX)) {
      const nonce = trimmed.slice(VELLUM_WS_UPGRADE_NONCE_PROTOCOL_PREFIX.length);
      if (nonce.length > 0) return nonce;
    }
  }
  return undefined;
}

export function wsUpgradeNonceFromRequest(req: Request): string | undefined {
  const fromHeader = req.headers.get(VELLUM_HTTP_HEADER.upgradeNonce)?.trim();
  if (fromHeader !== undefined && fromHeader.length > 0) return fromHeader;
  return wsUpgradeNonceFromProtocolHeader(req.headers.get(VELLUM_HTTP_HEADER.secWebSocketProtocol));
}
