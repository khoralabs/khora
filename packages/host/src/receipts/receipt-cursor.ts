export type ReceiptListCursor = {
  manifestDigest: string;
  fragmentIndex: number;
  lastOrdinal: number;
};

export function encodeReceiptListCursor(cursor: ReceiptListCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      d: cursor.manifestDigest,
      i: cursor.fragmentIndex,
      o: cursor.lastOrdinal,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeReceiptListCursor(raw: string): ReceiptListCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      v?: unknown;
      d?: unknown;
      i?: unknown;
      o?: unknown;
    };
    if (
      parsed.v !== 1 ||
      typeof parsed.d !== "string" ||
      !/^[0-9a-f]{64}$/.test(parsed.d) ||
      !Number.isInteger(parsed.i) ||
      (parsed.i as number) < 0 ||
      !Number.isInteger(parsed.o) ||
      (parsed.o as number) < 0 ||
      (parsed.o as number) > 0xffff_ffff
    ) {
      return undefined;
    }
    return {
      manifestDigest: parsed.d,
      fragmentIndex: parsed.i as number,
      lastOrdinal: parsed.o as number,
    };
  } catch {
    return undefined;
  }
}
