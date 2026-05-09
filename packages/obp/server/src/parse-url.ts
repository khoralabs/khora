const PAT = /^(obps?):\/\/([^/:?#]+):(\d+)\/([0-9a-f]+)$/i;

export type ParsedObpUrl = {
  scheme: "obp" | "obps";
  host: string;
  port: number;
  actor_pubkey_hex: string;
};

/** Parse `obp://host:port/<hex>` or `obps://host:port/<hex>` (lowercase hex, no 0x). */
export function parseObpUrl(url: string): ParsedObpUrl {
  const m = PAT.exec(url.trim());
  if (!m) {
    throw new Error(`invalid OBP URL: ${url}`);
  }
  const scheme = m[1]?.toLowerCase() as "obp" | "obps";
  const host = m[2]!;
  const port = Number(m[3]!);
  const actor_pubkey_hex = m[4]?.toLowerCase();
  return { scheme, host, port, actor_pubkey_hex };
}
