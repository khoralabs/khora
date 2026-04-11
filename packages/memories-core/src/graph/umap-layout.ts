import { UMAP } from "umap-js";

export type Point3 = { x: number; y: number; z: number };

/** Per-axis min–max to [-1, 1]; degenerate axis → 0 for all points. */
export function minMaxNormalize3D(points: Point3[]): Point3[] {
  if (points.length === 0) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);

  const normAxis = (vals: number[]): number[] => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) return vals.map(() => 0);
    return vals.map((v) => ((v - min) / (max - min)) * 2 - 1);
  };

  const nx = normAxis(xs);
  const ny = normAxis(ys);
  const nz = normAxis(zs);
  return nx.map((x, i) => ({
    x,
    y: ny[i] ?? 0,
    z: nz[i] ?? 0,
  }));
}

/** Evenly distributed points on a sphere, then {@link minMaxNormalize3D}. */
export function fibonacciSphereLayout3D(n: number): Point3[] {
  if (n <= 0) return [];
  const raw: Point3[] = [];
  const inc = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / Math.max(n, 1);
    const y = 1 - t * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * inc;
    raw.push({
      x: Math.cos(phi) * r,
      y,
      z: Math.sin(phi) * r,
    });
  }
  return minMaxNormalize3D(raw);
}

/**
 * UMAP 3D embedding, then min–max normalize. Uses a Fibonacci fallback when `n` is too small or fit throws.
 */
export function umap3DLayout(embeddings: number[][]): Point3[] {
  const n = embeddings.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0, z: 0 }];

  const dim = embeddings[0]?.length ?? 0;
  if (dim === 0) return fibonacciSphereLayout3D(n);

  for (const row of embeddings) {
    if (row.length !== dim) {
      return fibonacciSphereLayout3D(n);
    }
  }

  if (n < 4) {
    return fibonacciSphereLayout3D(n);
  }

  const nNeighbors = Math.min(15, Math.max(2, n - 1));
  try {
    const umap = new UMAP({
      nComponents: 3,
      nNeighbors,
      random: Math.random,
    });
    const fitted = umap.fit(embeddings);
    const raw: Point3[] = fitted.map((row) => ({
      x: row[0] ?? 0,
      y: row[1] ?? 0,
      z: row[2] ?? 0,
    }));
    return minMaxNormalize3D(raw);
  } catch {
    return fibonacciSphereLayout3D(n);
  }
}
