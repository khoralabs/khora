import z from "zod";

/** Canonical segment separator for hierarchical memory namespaces. */
export const NAMESPACE_SEPARATOR = "/" as const;

/** Max path depth (segments); matches Convex/SQLite `ns_l0`..`ns_l5`. */
export const NAMESPACE_MAX_DEPTH = 6;

/** Allowed characters per segment (`[a-z0-9_-]+`). */
export const NAMESPACE_SEGMENT_REGEX = /^[a-z0-9_-]+$/;

/** Full path pattern for Zod/Smithy (1..6 segments); use in row schemas without Zod `pipe` types. */
export const MEMORY_NAMESPACE_PATH_REGEX = /^[a-z0-9_-]+(\/[a-z0-9_-]+){0,5}$/;

/**
 * Validated hierarchical namespace (`/` segments, `[a-z0-9_-]+`, depth 1..6).
 * Use {@link namespacePath} or {@link zNamespacePath} to assert at boundaries; plain `string` is accepted for ergonomics.
 */
export type NamespacePath = string;

/**
 * Compile-time checks for string literals: non-empty, no leading/trailing/double slashes.
 * Runtime validation is still required via {@link zNamespacePath} or {@link namespacePath}.
 */
export type NamespacePathLiteral<S extends string> = S extends ""
  ? never
  : S extends `/${string}`
    ? never
    : S extends `${string}/`
      ? never
      : S extends `${string}//${string}`
        ? never
        : S;

function parseSegments(s: string): string[] {
  if (s.length === 0) {
    throw new Error("namespace path must be non-empty");
  }
  if (s.startsWith("/") || s.endsWith("/") || s.includes("//")) {
    throw new Error("invalid namespace path: no leading, trailing, or double slashes");
  }
  const parts = s.split(NAMESPACE_SEPARATOR);
  if (parts.length === 0 || parts.length > NAMESPACE_MAX_DEPTH) {
    throw new Error(`namespace path must have 1..${NAMESPACE_MAX_DEPTH} segments`);
  }
  for (const p of parts) {
    if (p.length === 0 || !NAMESPACE_SEGMENT_REGEX.test(p)) {
      throw new Error(`invalid namespace segment (use [a-z0-9_-]+ only): ${JSON.stringify(p)}`);
    }
  }
  return parts;
}

/** Zod schema for {@link NamespacePath} (strict segments, depth 1..6). */
export const zNamespacePath = z
  .string()
  .min(1)
  .max(128)
  .superRefine((s, ctx) => {
    try {
      parseSegments(s);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  })
  .transform((s): NamespacePath => s);

/** Validate at runtime and return a branded path. */
export function namespacePath(s: string): NamespacePath;
export function namespacePath<S extends string>(s: NamespacePathLiteral<S>): NamespacePath;
export function namespacePath(s: string): NamespacePath {
  parseSegments(s);
  return s;
}

export function namespaceSegments(p: NamespacePath): readonly string[] {
  return parseSegments(p);
}

export function namespaceFromSegments(segs: readonly string[]): NamespacePath {
  if (segs.length === 0 || segs.length > NAMESPACE_MAX_DEPTH) {
    throw new Error(`namespace must have 1..${NAMESPACE_MAX_DEPTH} segments`);
  }
  for (const seg of segs) {
    if (seg.length === 0 || !NAMESPACE_SEGMENT_REGEX.test(seg)) {
      throw new Error(`invalid namespace segment: ${JSON.stringify(seg)}`);
    }
  }
  return namespacePath(segs.join(NAMESPACE_SEPARATOR));
}

/** True if `ancestor` is a prefix path of `descendant` (including equality). */
export function isPrefixOf(ancestor: NamespacePath, descendant: NamespacePath): boolean {
  const a = namespaceSegments(ancestor);
  const d = namespaceSegments(descendant);
  if (a.length > d.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== d[i]) return false;
  }
  return true;
}

/**
 * Drop paths that are strict descendants of another path in the set (subtree roots only).
 * Order is not preserved; result is sorted by ascending depth.
 */
export function canonicalizeNamespacePrefixes(
  paths: readonly NamespacePath[],
): readonly NamespacePath[] {
  const unique = [...new Set(paths)];
  unique.sort((a, b) => namespaceSegments(a).length - namespaceSegments(b).length);
  const out: NamespacePath[] = [];
  for (const p of unique) {
    const covered = out.some(
      (r) =>
        r !== p && isPrefixOf(r, p) && namespaceSegments(r).length < namespaceSegments(p).length,
    );
    if (covered) continue;
    out.push(p);
  }
  return out;
}

/**
 * First `cap` segment values; unused trailing slots are `null` (length always `cap`).
 */
export function namespaceLevels(
  p: NamespacePath,
  cap: number = NAMESPACE_MAX_DEPTH,
): readonly (string | null)[] {
  const segs = namespaceSegments(p);
  const out: (string | null)[] = [];
  for (let i = 0; i < cap; i++) {
    const seg = segs[i];
    out.push(i < segs.length && seg !== undefined ? seg : null);
  }
  return out;
}

const NS_LEVEL_KEYS = ["ns_l0", "ns_l1", "ns_l2", "ns_l3", "ns_l4", "ns_l5"] as const;

export type NamespaceLevelKey = (typeof NS_LEVEL_KEYS)[number];

/** Spread into Convex `text_features` / SQLite `memories` rows (only defined levels are set). */
export function namespaceLevelFields(
  p: NamespacePath,
  cap: number = NAMESPACE_MAX_DEPTH,
): Partial<Record<NamespaceLevelKey, string>> {
  const segs = namespaceSegments(p);
  const n = Math.min(segs.length, cap);
  const out: Partial<Record<NamespaceLevelKey, string>> = {};
  for (let i = 0; i < n; i++) {
    const key = NS_LEVEL_KEYS[i];
    const seg = segs[i];
    if (key !== undefined && seg !== undefined) {
      out[key] = seg;
    }
  }
  return out;
}
