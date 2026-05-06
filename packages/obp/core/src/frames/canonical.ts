/** UTF-8 bytes of stable JSON (sorted object keys) — mirrors `@cfd/obp-session-sync` without importing it (avoids cycles). */
export function canonicalJsonUtf8(value: unknown): Uint8Array {
  return new TextEncoder().encode(stableStringify(value));
}

export function canonicalJsonString(value: unknown): string {
  return stableStringify(value);
}

function stableStringify(v: unknown): string {
  if (v === undefined) {
    return "null";
  }
  if (v === null || typeof v !== "object") {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(stableStringify).join(",")}]`;
  }
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}
