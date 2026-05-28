/**
 * Address-encoded Khora post ids (`atp0:` prefix).
 * See packages/khora/host/id-conventions.md
 */

import { derivePoolHomeCell } from "@khoralabs/colonnade-persistence";

export type PostAddressInput = {
  readonly authorPrincipalId: string;
  readonly recordKey: string;
  readonly cellPoolCount: number;
};

export type DecodedPostAddress = PostAddressInput & {
  readonly authorCellId: string;
};

const PREFIX = "atp0:";

export function encodePostId(address: PostAddressInput): string {
  const payload = JSON.stringify({
    p: address.authorPrincipalId,
    r: address.recordKey,
    n: address.cellPoolCount,
  });
  return PREFIX + Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePostId(id: string): DecodedPostAddress | undefined {
  if (!id.startsWith(PREFIX)) {
    return undefined;
  }
  try {
    const json = Buffer.from(id.slice(PREFIX.length), "base64url").toString("utf8");
    const o = JSON.parse(json) as { p?: string; r?: string; n?: number };
    if (typeof o.p !== "string" || typeof o.r !== "string" || typeof o.n !== "number") {
      return undefined;
    }
    if (o.p.length === 0 || o.r.length === 0 || !Number.isInteger(o.n) || o.n < 1) {
      return undefined;
    }
    return {
      authorPrincipalId: o.p,
      recordKey: o.r,
      cellPoolCount: o.n,
      authorCellId: derivePoolHomeCell(o.p, o.n),
    };
  } catch {
    return undefined;
  }
}

export function authorPrincipalIdFromPostId(id: string): string | undefined {
  return decodePostId(id)?.authorPrincipalId;
}
