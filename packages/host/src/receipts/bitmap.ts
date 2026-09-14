import { RoaringBitmap32 } from "roaring-wasm";

/** Internal codec for stable portable Roaring bitmaps. */
export const ReceiptBitmapCodec = {
  encode(values: Iterable<number>): Uint8Array {
    const bitmap = new RoaringBitmap32(values);
    try {
      return bitmap.serialize("portable");
    } finally {
      bitmap.dispose();
    }
  },
  decode(bytes: Uint8Array): number[] {
    const bitmap = RoaringBitmap32.deserialize(bytes, "portable");
    try {
      return bitmap.toArray();
    } finally {
      bitmap.dispose();
    }
  },
};

export type ReceiptBitmapFragment = { high16: number; ordinals: number[] };

export function fragmentReceiptOrdinals(ordinals: Iterable<number>): ReceiptBitmapFragment[] {
  const buckets = new Map<number, number[]>();
  for (const ordinal of ordinals) {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > 0xffff_ffff) {
      throw new Error("receipt ordinal must be an unsigned 32-bit integer");
    }
    const high16 = ordinal >>> 16;
    const values = buckets.get(high16) ?? [];
    values.push(ordinal & 0xffff);
    buckets.set(high16, values);
  }
  return [...buckets]
    .sort(([a], [b]) => a - b)
    .map(([high16, values]) => ({ high16, ordinals: [...new Set(values)].sort((a, b) => a - b) }));
}

/** Fragment a nondecreasing ordinal stream while retaining at most one uint16 bucket. */
export function* fragmentSortedReceiptOrdinals(
  ordinals: Iterable<number>,
): IterableIterator<ReceiptBitmapFragment> {
  let high16: number | undefined;
  let values: number[] = [];
  let previous = -1;
  for (const ordinal of ordinals) {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > 0xffff_ffff) {
      throw new Error("receipt ordinal must be an unsigned 32-bit integer");
    }
    if (ordinal < previous) throw new Error("sorted receipt ordinals must be nondecreasing");
    previous = ordinal;
    const nextHigh16 = ordinal >>> 16;
    if (high16 !== undefined && nextHigh16 !== high16) {
      yield { high16, ordinals: values };
      values = [];
    }
    high16 = nextHigh16;
    const low16 = ordinal & 0xffff;
    if (values.at(-1) !== low16) values.push(low16);
  }
  if (high16 !== undefined) yield { high16, ordinals: values };
}

export function restoreReceiptOrdinals(fragments: Iterable<ReceiptBitmapFragment>): number[] {
  return [...fragments]
    .flatMap(({ high16, ordinals }) => ordinals.map((low16) => high16 * 0x1_0000 + low16))
    .sort((a, b) => a - b);
}
