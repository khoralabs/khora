/**
 * Address-encoded Khora post ids (`atp0:` prefix).
 * See packages/khora/host/id-conventions.md
 */

import { principalHomeCellId } from "@khoralabs/colonnade";

export type PostAddressInput = {
  readonly authorPrincipalId: string;
  readonly recordKey: string;
  /** Topology pin for pointer wire format (always `1` under placement isolation). */
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

/** Decode post id; author home is always the encoded `{ kind, ownerKey }` principal cell. */
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
      authorCellId: principalHomeCellId(o.p),
    };
  } catch {
    return undefined;
  }
}

export function authorPrincipalIdFromPostId(id: string): string | undefined {
  return decodePostId(id)?.authorPrincipalId;
}
