/** Supported embedding widths for `vector_features_*` tables (must match schema). */
export const CONVEX_VECTOR_DIMENSIONS = [768, 1024, 1536, 3072] as const;

export type ConvexVectorDimension = (typeof CONVEX_VECTOR_DIMENSIONS)[number];

export function isConvexVectorDimension(n: number): n is ConvexVectorDimension {
  return (CONVEX_VECTOR_DIMENSIONS as readonly number[]).includes(n);
}

export function vectorTableNameForDim(
  dim: ConvexVectorDimension,
): `vector_features_${ConvexVectorDimension}` {
  return `vector_features_${dim}`;
}
