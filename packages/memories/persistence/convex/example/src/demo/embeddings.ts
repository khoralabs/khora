import { DEMO_VECTOR_DIM } from "./constants.js";

/**
 * Deterministic fake embedding for demos (no external model). L2-normalized length
 * {@link DEMO_VECTOR_DIM}.
 */
export function demoVector768(seed: string): number[] {
  const out = new Array<number>(DEMO_VECTOR_DIM);
  const s = seed.length > 0 ? seed : "seed";
  for (let i = 0; i < DEMO_VECTOR_DIM; i++) {
    const c = s.codePointAt(i % s.length) ?? 1;
    out[i] = ((c * (i + 17)) % 1000) / 1000 - 0.5;
  }
  let sumSq = 0;
  for (const v of out) sumSq += v * v;
  const n = Math.sqrt(sumSq) || 1;
  return out.map((v) => v / n);
}
