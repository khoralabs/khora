/**
 * Address-encoded Atrium post ids (`atp1:` prefix).
 * See packages/atrium/host/id-conventions.md
 */

export type PostAddress = {
  authorPrincipalId: string;
  authorCellId: string;
  recordKey: string;
};

const PREFIX = "atp1:";

export function encodePostId(address: PostAddress): string {
  const payload = JSON.stringify({
    p: address.authorPrincipalId,
    c: address.authorCellId,
    r: address.recordKey,
  });
  return PREFIX + Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePostId(id: string): PostAddress | undefined {
  if (!id.startsWith(PREFIX)) {
    return undefined;
  }
  try {
    const json = Buffer.from(id.slice(PREFIX.length), "base64url").toString("utf8");
    const o = JSON.parse(json) as { p?: string; c?: string; r?: string };
    if (typeof o.p !== "string" || typeof o.c !== "string" || typeof o.r !== "string") {
      return undefined;
    }
    if (o.p.length === 0 || o.c.length === 0 || o.r.length === 0) {
      return undefined;
    }
    return { authorPrincipalId: o.p, authorCellId: o.c, recordKey: o.r };
  } catch {
    return undefined;
  }
}

export function authorPrincipalIdFromPostId(id: string): string | undefined {
  return decodePostId(id)?.authorPrincipalId;
}
